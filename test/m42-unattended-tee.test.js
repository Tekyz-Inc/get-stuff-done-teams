'use strict';
/**
 * M42 D1 — unattended worker tee integration
 *
 * Verifies that when `_spawnWorker` runs, it:
 *   1. Allocates a spawn-id (hierarchical if GSD_T_SPAWN_ID env is set)
 *   2. Opens a transcript entry in `.gsd-t/transcripts/.index.json`
 *   3. Tees captured stdout lines to `{spawn-id}.ndjson`
 *   4. Propagates the spawn-id into the worker's env (GSD_T_SPAWN_ID)
 *   5. Closes the transcript with the right status on exit
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tee = require('../bin/gsd-t-transcript-tee.cjs');

// We load the unattended module once; `_spawnWorker` is exported via
// module.exports in the file.
const unattended = require('../bin/gsd-t-unattended.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m42-unattended-tee-'));
}

function makeFakePlatformSpawn(stdout, status) {
  return function fakeSpawn(_cwd, _timeout, opts) {
    // Capture env so assertions can verify GSD_T_SPAWN_ID propagation.
    fakeSpawn.lastEnv = opts && opts.env ? opts.env : {};
    return {
      status: status != null ? status : 0,
      stdout: stdout || '',
      stderr: '',
      signal: null,
      timedOut: false,
      error: null,
    };
  };
}

test('unattended tee — opens transcript, tees lines, closes on success', () => {
  const dir = mkTmp();
  const fakeSpawn = makeFakePlatformSpawn(
    '{"type":"system","session_id":"abc"}\n{"type":"assistant","content":"hi"}\n',
    0,
  );

  const state = {
    claudeBin: '/usr/local/bin/claude',
    phase: 'execute',
    projectDir: dir,
    iter: 1,
    milestone: 'M42',
  };

  // Inject the fake spawn by monkey-patching the imported module. The
  // unattended file calls `platformSpawnWorker` imported from
  // `./gsd-t-unattended-platform.cjs`; we override the export.
  const platform = require('../bin/gsd-t-unattended-platform.cjs');
  const originalSpawn = platform.spawnWorker;
  platform.spawnWorker = fakeSpawn;

  // `_spawnWorker` is not exported from the module (it's internal). We
  // exercise the code path by requiring the internal function via the
  // module cache — pull it out of the module source.
  // Fallback: call the exported dispatcher that routes to `_spawnWorker`.
  // Since `_spawnWorker` is private, we re-require fresh to pick up the
  // patched platform module.
  let res;
  try {
    // Clear the unattended module from cache so it picks up patched platform
    delete require.cache[require.resolve('../bin/gsd-t-unattended.cjs')];
    const freshUnattended = require('../bin/gsd-t-unattended.cjs');
    // Access internal via the exported surface
    assert.ok(typeof freshUnattended._spawnWorker === 'function', '_spawnWorker must be exported for testing');
    res = freshUnattended._spawnWorker(state, { cwd: dir, timeout: 60000 });
  } finally {
    platform.spawnWorker = originalSpawn;
  }

  assert.ok(res.spawnId, 'result includes spawnId');
  assert.equal(res.status, 0);

  const list = tee.listTranscripts(dir);
  assert.equal(list.length, 1, 'one transcript registered');
  assert.equal(list[0].spawnId, res.spawnId);
  assert.equal(list[0].command, 'gsd-t-unattended-worker');
  assert.equal(list[0].status, 'done', 'status=done when exit=0');

  // Env propagation: the fake spawn captured env, should include GSD_T_SPAWN_ID
  assert.equal(fakeSpawn.lastEnv.GSD_T_SPAWN_ID, res.spawnId);

  // ndjson content: two lines
  const nd = fs.readFileSync(
    path.join(dir, '.gsd-t', 'transcripts', `${res.spawnId}.ndjson`),
    'utf8',
  );
  const lines = nd.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).type, 'system');
  assert.equal(JSON.parse(lines[1]).type, 'assistant');
});

test('unattended tee — non-zero exit closes transcript as failed', () => {
  const dir = mkTmp();
  const fakeSpawn = makeFakePlatformSpawn('{"type":"system"}\n', 1);

  const state = { claudeBin: '/usr/local/bin/claude', projectDir: dir, iter: 2 };
  const platform = require('../bin/gsd-t-unattended-platform.cjs');
  const originalSpawn = platform.spawnWorker;
  platform.spawnWorker = fakeSpawn;

  let res;
  try {
    delete require.cache[require.resolve('../bin/gsd-t-unattended.cjs')];
    const freshUnattended = require('../bin/gsd-t-unattended.cjs');
    res = freshUnattended._spawnWorker(state, { cwd: dir, timeout: 60000 });
  } finally {
    platform.spawnWorker = originalSpawn;
  }

  const list = tee.listTranscripts(dir);
  assert.equal(list[0].status, 'failed');
  assert.equal(res.status, 1);
});

test('unattended tee — parent spawn-id propagates to child via GSD_T_SPAWN_ID', () => {
  const dir = mkTmp();
  const parentId = 's-aabbccdd';
  process.env.GSD_T_SPAWN_ID = parentId;

  const fakeSpawn = makeFakePlatformSpawn('', 0);
  const state = { claudeBin: '/usr/local/bin/claude', projectDir: dir, iter: 1 };
  const platform = require('../bin/gsd-t-unattended-platform.cjs');
  const originalSpawn = platform.spawnWorker;
  platform.spawnWorker = fakeSpawn;

  let res;
  try {
    delete require.cache[require.resolve('../bin/gsd-t-unattended.cjs')];
    const freshUnattended = require('../bin/gsd-t-unattended.cjs');
    res = freshUnattended._spawnWorker(state, { cwd: dir, timeout: 60000 });
  } finally {
    platform.spawnWorker = originalSpawn;
    delete process.env.GSD_T_SPAWN_ID;
  }

  // Hierarchical id: starts with parent prefix
  assert.ok(res.spawnId.startsWith(parentId + '.'), `child id should start with ${parentId}.  got ${res.spawnId}`);
  // Registry records parent link
  const entry = tee.readTranscriptMeta(dir, res.spawnId);
  assert.equal(entry.parentId, parentId);
});
