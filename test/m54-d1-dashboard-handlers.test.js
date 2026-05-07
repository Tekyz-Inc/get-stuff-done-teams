'use strict';
/**
 * M54 D1 T5 — Unit tests for live-activity dashboard handlers
 * Contract: .gsd-t/contracts/live-activity-contract.md v1.0.0 §11
 *
 * Test catalogue (≥5 cases):
 *   api-live-activity-200-empty
 *   api-live-activity-populated
 *   api-live-activity-5s-cache
 *   tail-rejects-path-traversal
 *   stream-sse-content-type
 *   500-only-on-contract-regression
 *   tail-200-valid-id
 *   tail-404-unknown-id
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Load handlers under test
const {
  handleLiveActivity,
  handleLiveActivityTail,
  handleLiveActivityStream,
  isValidActivityId,
  _liveActivityCache,
} = require('../scripts/gsd-t-dashboard-server.js');

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Create a mock req/res pair for synchronous handler testing */
function makeMockRes() {
  const chunks = [];
  let statusCode = null;
  let headers = {};
  let ended = false;

  const res = {
    writeHead(code, hdrs) { statusCode = code; headers = Object.assign({}, hdrs); },
    write(chunk) { chunks.push(chunk); },
    end(chunk) {
      if (chunk) chunks.push(chunk);
      ended = true;
    },
    get statusCode() { return statusCode; },
    get headers() { return headers; },
    get body() { return chunks.join(''); },
    get ended() { return ended; },
    writableEnded: false,
    on(_event, _fn) { return this; },
  };
  Object.defineProperty(res, 'writableEnded', {
    get() { return ended; },
  });
  return res;
}

function makeMockReq(url, method) {
  return {
    url: url || '/',
    method: method || 'GET',
    on(_event, _fn) { return this; },
  };
}

function makeTmpProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm54-handler-test-'));
  return tmpDir;
}

function cleanupTmpProject(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('api-live-activity-200-empty', () => {
  test('handleLiveActivity returns 200 + schemaVersion:1 with empty activities', () => {
    // Reset cache before test
    _liveActivityCache.list.at = 0;
    _liveActivityCache.list.body = null;

    const tmpDir = makeTmpProject();
    try {
      const req = makeMockReq('/api/live-activity');
      const res = makeMockRes();

      handleLiveActivity(req, res, tmpDir);

      assert.equal(res.statusCode, 200, 'Should return 200');
      const body = JSON.parse(res.body);
      assert.equal(body.schemaVersion, 1, 'schemaVersion must be 1');
      assert.ok(Array.isArray(body.activities), 'activities must be array');
      assert.ok(Array.isArray(body.notes), 'notes must be array');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('api-live-activity-populated', () => {
  test('handleLiveActivity returns activities array from live events', () => {
    _liveActivityCache.list.at = 0;
    _liveActivityCache.list.body = null;

    const tmpDir = makeTmpProject();
    try {
      // Inject a bash event so the detector finds an activity
      const today = new Date().toISOString().slice(0, 10);
      fs.mkdirSync(path.join(tmpDir, '.gsd-t', 'events'), { recursive: true });
      const eventsFile = path.join(tmpDir, '.gsd-t', 'events', today + '.jsonl');
      fs.writeFileSync(eventsFile, JSON.stringify({
        type: 'tool_use',
        name: 'Bash',
        tool_use_id: 'handler-bash-001',
        run_in_background: true,
        command: 'sleep 30',
        startedAt: new Date(Date.now() - 5000).toISOString(),
      }) + '\n');

      const req = makeMockReq('/api/live-activity');
      const res = makeMockRes();

      handleLiveActivity(req, res, tmpDir);

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.activities.length >= 1, 'Should have at least 1 activity');
      assert.equal(body.activities[0].kind, 'bash');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('api-live-activity-5s-cache', () => {
  test('two requests within 5s → second returns X-Cache: hit', () => {
    _liveActivityCache.list.at = 0;
    _liveActivityCache.list.body = null;

    const tmpDir = makeTmpProject();
    try {
      const req1 = makeMockReq('/api/live-activity');
      const res1 = makeMockRes();
      handleLiveActivity(req1, res1, tmpDir);

      // Immediately make second request — should hit cache
      const req2 = makeMockReq('/api/live-activity');
      const res2 = makeMockRes();
      handleLiveActivity(req2, res2, tmpDir);

      assert.equal(res1.headers['X-Cache'], 'miss', 'First request must be cache miss');
      assert.equal(res2.headers['X-Cache'], 'hit', 'Second request within 5s must be cache hit');

      // Both should return same body
      assert.equal(res1.body, res2.body, 'Cached body must match original');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('tail-rejects-path-traversal', () => {
  test('id with .. → 400 + invalid_id', () => {
    const req = makeMockReq('/api/live-activity/../../etc/passwd/tail');
    const res = makeMockRes();
    const tmpDir = makeTmpProject();
    try {
      handleLiveActivityTail(req, res, tmpDir, '../../etc/passwd');
      assert.equal(res.statusCode, 400, 'Path traversal id must return 400');
      const body = JSON.parse(res.body);
      assert.equal(body.error, 'invalid_id', 'Error must be invalid_id');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });

  test('id with null byte → 400 + invalid_id', () => {
    const req = makeMockReq('/api/live-activity/foo\0bar/tail');
    const res = makeMockRes();
    const tmpDir = makeTmpProject();
    try {
      handleLiveActivityTail(req, res, tmpDir, 'foo\0bar');
      assert.equal(res.statusCode, 400);
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });

  test('id with forward slash → 400 + invalid_id', () => {
    const req = makeMockReq('/api/live-activity/foo/bar/tail');
    const res = makeMockRes();
    const tmpDir = makeTmpProject();
    try {
      handleLiveActivityTail(req, res, tmpDir, 'foo/bar');
      assert.equal(res.statusCode, 400);
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('stream-sse-content-type', () => {
  test('GET /api/live-activity/<id>/stream → Content-Type: text/event-stream', () => {
    const req = makeMockReq('/api/live-activity/test-id-001/stream');
    // Simulate a request that closes immediately
    let closeHandler = null;
    req.on = (event, fn) => { if (event === 'close') closeHandler = fn; return req; };
    const res = makeMockRes();

    handleLiveActivityStream(req, res, '/tmp/fake', 'test-id-001');

    assert.ok(
      res.headers['Content-Type'] && res.headers['Content-Type'].includes('text/event-stream'),
      'Content-Type must include text/event-stream'
    );
    assert.equal(res.statusCode, 200);

    // Cleanup: trigger close
    if (closeHandler) closeHandler();
  });
});

describe('500-only-on-contract-regression', () => {
  test('computeLiveActivities returning valid data → 200 (no 500)', () => {
    _liveActivityCache.list.at = 0;
    _liveActivityCache.list.body = null;

    const tmpDir = makeTmpProject();
    try {
      const req = makeMockReq('/api/live-activity');
      const res = makeMockRes();
      handleLiveActivity(req, res, tmpDir);
      // Should be 200 (empty activities), not 500
      assert.equal(res.statusCode, 200, 'Valid detector must not produce 500');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('tail-404-unknown-id', () => {
  test('valid format id not in activities → 404', () => {
    _liveActivityCache.tail.clear ? _liveActivityCache.tail.clear() : null;
    if (_liveActivityCache.tail instanceof Map) _liveActivityCache.tail.clear();

    const tmpDir = makeTmpProject();
    try {
      const req = makeMockReq('/api/live-activity/unknown-valid-id-xyz/tail');
      const res = makeMockRes();
      handleLiveActivityTail(req, res, tmpDir, 'unknown-valid-id-xyz');
      assert.equal(res.statusCode, 404, 'Unknown id must return 404');
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

describe('tail-200-valid-id', () => {
  test('known active id → 200 + non-empty text/plain body', () => {
    if (_liveActivityCache.tail instanceof Map) _liveActivityCache.tail.clear();
    _liveActivityCache.list.at = 0;
    _liveActivityCache.list.body = null;

    const tmpDir = makeTmpProject();
    try {
      // Inject a bash event so there is a known id
      const today = new Date().toISOString().slice(0, 10);
      fs.mkdirSync(path.join(tmpDir, '.gsd-t', 'events'), { recursive: true });
      const eventsFile = path.join(tmpDir, '.gsd-t', 'events', today + '.jsonl');
      const toolUseId = 'tail-test-bash-001';
      fs.writeFileSync(eventsFile, JSON.stringify({
        type: 'tool_use',
        name: 'Bash',
        tool_use_id: toolUseId,
        run_in_background: true,
        command: 'sleep 30',
        startedAt: new Date(Date.now() - 5000).toISOString(),
      }) + '\n');

      const req = makeMockReq('/api/live-activity/' + toolUseId + '/tail');
      const res = makeMockRes();
      handleLiveActivityTail(req, res, tmpDir, toolUseId);

      assert.equal(res.statusCode, 200, 'Valid known id must return 200');
      assert.ok(res.body.length > 0, 'Body must not be empty');
      assert.ok(
        res.headers['Content-Type'] && res.headers['Content-Type'].includes('text/plain'),
        'Content-Type must be text/plain'
      );
    } finally {
      cleanupTmpProject(tmpDir);
    }
  });
});

// isValidActivityId unit coverage
describe('isValidActivityId', () => {
  test('valid IDs pass', () => {
    assert.ok(isValidActivityId('toolu_01ABC'));
    assert.ok(isValidActivityId('bash:abc123def456'));
    assert.ok(isValidActivityId('spawn-001'));
    assert.ok(isValidActivityId('valid-id_with.chars'));
  });

  test('invalid IDs fail', () => {
    assert.ok(!isValidActivityId(''));
    assert.ok(!isValidActivityId('has/../traversal'));
    assert.ok(!isValidActivityId('has/slash'));
    assert.ok(!isValidActivityId('has\\backslash'));
    assert.ok(!isValidActivityId('has\0null'));
    assert.ok(!isValidActivityId(null));
    assert.ok(!isValidActivityId(123));
  });
});
