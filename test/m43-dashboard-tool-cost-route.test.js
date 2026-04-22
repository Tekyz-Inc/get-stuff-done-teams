'use strict';
/**
 * M43 D6-T1 — dashboard server routes for per-spawn tool cost + usage
 *
 * Two routes:
 *   GET /transcript/:id/tool-cost — proxies to D2's aggregateByTool; 503 if
 *                                   the library isn't on disk yet.
 *   GET /transcript/:id/usage     — returns per-turn rows from
 *                                   .gsd-t/metrics/token-usage.jsonl for
 *                                   this spawn (matches spawn_id or
 *                                   session_id).
 *
 * The tests cover both the library-present and library-absent paths, plus
 * bad-input guards.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const server = require('../scripts/gsd-t-dashboard-server.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d6-route-'));
}

function freePort() {
  return 18000 + Math.floor(Math.random() * 500);
}

async function fetchJson(port, url) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${url}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) { /* keep null */ }
        resolve({ status: res.statusCode, body, json: parsed, headers: res.headers });
      });
    }).on('error', reject);
  });
}

async function startTestServer(projectDir) {
  const dashHtml = path.join(projectDir, 'dashboard.html');
  fs.writeFileSync(dashHtml, '<!DOCTYPE html><html><body>dash</body></html>');
  const transcriptHtml = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'events'), { recursive: true });
  const port = freePort();
  const { server: srv } = server.startServer(
    port,
    path.join(projectDir, '.gsd-t', 'events'),
    dashHtml,
    projectDir,
    transcriptHtml,
  );
  await new Promise((r) => setTimeout(r, 20));
  return { port, srv };
}

function writeUsageJsonl(projectDir, rows) {
  const dir = path.join(projectDir, '.gsd-t', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'token-usage.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// ── readSpawnUsageRows (pure function) ──────────────────────────────────────

test('readSpawnUsageRows — returns empty array when file missing', () => {
  const dir = mkTmp();
  const rows = server.readSpawnUsageRows(dir, 's-abcd1234');
  assert.deepEqual(rows, []);
});

test('readSpawnUsageRows — filters by spawn_id', () => {
  const dir = mkTmp();
  writeUsageJsonl(dir, [
    { spawn_id: 's-a', turn_id: 't1', inputTokens: 10 },
    { spawn_id: 's-b', turn_id: 't2', inputTokens: 20 },
    { spawn_id: 's-a', turn_id: 't3', inputTokens: 30 },
  ]);
  const rows = server.readSpawnUsageRows(dir, 's-a');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].turn_id, 't1');
  assert.equal(rows[1].turn_id, 't3');
});

test('readSpawnUsageRows — also matches session_id for in-session rows', () => {
  const dir = mkTmp();
  writeUsageJsonl(dir, [
    { session_id: 'sess-1', turn_id: 't1', inputTokens: 1 },
    { session_id: 'sess-2', turn_id: 't2', inputTokens: 2 },
  ]);
  const rows = server.readSpawnUsageRows(dir, 'sess-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].turn_id, 't1');
});

// ── GET /transcript/:id/usage ───────────────────────────────────────────────

test('GET /transcript/:id/usage — returns filtered rows', async () => {
  const dir = mkTmp();
  writeUsageJsonl(dir, [
    { spawn_id: 's-x', turn_id: 't1', inputTokens: 5, outputTokens: 50 },
    { spawn_id: 's-y', turn_id: 't2', inputTokens: 7, outputTokens: 70 },
  ]);
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchJson(port, '/transcript/s-x/usage');
    assert.equal(resp.status, 200);
    assert.match(resp.headers['content-type'] || '', /application\/json/);
    assert.equal(resp.json.spawn_id, 's-x');
    assert.equal(resp.json.rows.length, 1);
    assert.equal(resp.json.rows[0].turn_id, 't1');
    assert.ok(resp.json.generated_at);
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id/usage — 400 on invalid spawn-id', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchJson(port, '/transcript/..%2Fpasswd/usage');
    assert.equal(resp.status, 400);
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id/usage — empty rows when no matches', async () => {
  const dir = mkTmp();
  writeUsageJsonl(dir, [
    { spawn_id: 's-other', turn_id: 't1', inputTokens: 1 },
  ]);
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchJson(port, '/transcript/s-nothere/usage');
    assert.equal(resp.status, 200);
    assert.deepEqual(resp.json.rows, []);
  } finally {
    srv.close();
  }
});

// ── GET /transcript/:id/tool-cost — library absent (503) ────────────────────

test('GET /transcript/:id/tool-cost — 503 when D2 library not on disk', async () => {
  // This test assumes bin/gsd-t-tool-attribution.cjs is NOT yet on disk.
  // If D2 has landed and the file is present, the test is skipped.
  const libPath = path.join(__dirname, '..', 'bin', 'gsd-t-tool-attribution.cjs');
  if (fs.existsSync(libPath)) {
    // Graceful skip — the library exists, the 503 branch is no longer
    // reachable from this process.
    return;
  }
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchJson(port, '/transcript/s-abc/tool-cost');
    assert.equal(resp.status, 503);
    assert.match(resp.body, /tool-attribution/);
  } finally {
    srv.close();
  }
});

// ── GET /transcript/:id/tool-cost — library present (200) ───────────────────

test('GET /transcript/:id/tool-cost — 200 with mocked D2 library on disk', async () => {
  // Drop a temporary stub at bin/gsd-t-tool-attribution.cjs so the route's
  // `require(...)` resolves. Clean up on teardown only if we created it.
  const libPath = path.join(__dirname, '..', 'bin', 'gsd-t-tool-attribution.cjs');
  const preExisting = fs.existsSync(libPath);
  if (preExisting) {
    // D2 has landed — real library present; skip the stub-based test since
    // we don't want to clobber the real file.
    return;
  }
  const stubSrc = "'use strict';\nmodule.exports = {\n" +
    "  aggregateByTool: (rows) => rows.map((r, i) => ({ tool: 'T' + i, tokens: r.inputTokens + r.outputTokens })),\n" +
    "};\n";
  fs.writeFileSync(libPath, stubSrc);
  // Clear any cached require result (harmless if not cached)
  try {
    const key = require.resolve(libPath);
    delete require.cache[key];
  } catch (_) { /* ok */ }

  try {
    const dir = mkTmp();
    writeUsageJsonl(dir, [
      { spawn_id: 's-x', turn_id: 't1', inputTokens: 10, outputTokens: 100 },
      { spawn_id: 's-x', turn_id: 't2', inputTokens: 20, outputTokens: 200 },
    ]);
    const { port, srv } = await startTestServer(dir);
    try {
      const resp = await fetchJson(port, '/transcript/s-x/tool-cost');
      assert.equal(resp.status, 200);
      assert.equal(resp.json.spawn_id, 's-x');
      assert.ok(Array.isArray(resp.json.tools));
      assert.equal(resp.json.tools.length, 2);
      assert.equal(resp.json.tools[0].tokens, 110);
      assert.equal(resp.json.tools[1].tokens, 220);
      assert.ok(resp.json.generated_at);
    } finally {
      srv.close();
    }
  } finally {
    // Only clean up if we wrote the stub
    if (!preExisting) {
      try { fs.unlinkSync(libPath); } catch (_) { /* ok */ }
      try {
        const key = require.resolve(libPath);
        delete require.cache[key];
      } catch (_) { /* ok */ }
    }
  }
});

test('GET /transcript/:id/tool-cost — 400 on invalid spawn-id', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchJson(port, '/transcript/..%2Fpasswd/tool-cost');
    assert.equal(resp.status, 400);
  } finally {
    srv.close();
  }
});
