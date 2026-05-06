'use strict';
/**
 * M49 — Dashboard idle-TTL self-shutdown.
 *
 * "Idle" = zero HTTP requests AND zero active SSE connections for the full
 * TTL window. The dashboard must self-exit after that window. SSE
 * connections must reset the idle clock and prevent shutdown while open.
 *
 * Tests run with a SHORT TTL (≤ 1s) and a SHORT check interval (50ms) so
 * the suite doesn't take forever.
 *
 * Note: end-to-end "spawn the server, walk away, wait for self-exit" tests
 * are flaky in CI (process timing), so the unit-level approach exercises
 * the activity tracker + interval handler directly. The module exports
 * `_activityTracker` + `_startIdleTtlTimer` for exactly this.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dashServer = require('../scripts/gsd-t-dashboard-server.js');

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m49-ttl-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

// ── 1. tracker.bump resets lastActivity ─────────────────────────────────────
test('M49: tracker.bump updates lastActivity', async () => {
  const t = dashServer._activityTracker();
  const before = t.snapshot().lastActivity;
  await new Promise((r) => setTimeout(r, 10));
  t.bump();
  const after = t.snapshot().lastActivity;
  assert.ok(after > before, `expected after (${after}) > before (${before})`);
});

// ── 2. SSE connect/disconnect counts ────────────────────────────────────────
test('M49: tracker counts SSE connect/disconnect', () => {
  const t = dashServer._activityTracker();
  assert.equal(t.snapshot().activeSseConnections, 0);
  t.sseConnect();
  t.sseConnect();
  assert.equal(t.snapshot().activeSseConnections, 2);
  t.sseDisconnect();
  assert.equal(t.snapshot().activeSseConnections, 1);
  t.sseDisconnect();
  t.sseDisconnect(); // floor at 0
  assert.equal(t.snapshot().activeSseConnections, 0);
});

// ── 3. Idle-TTL fires when idle long enough + no SSE ────────────────────────
test('M49: idle-TTL fires when window elapses with no SSE', async () => {
  const t = dashServer._activityTracker();
  let shutdownCalled = false;
  const dir = mkTmp();
  // Write a pidfile to verify cleanup.
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  fs.writeFileSync(pidFile, '12345');

  // Stub server.close so we don't actually close anything.
  let serverCloseCalled = false;
  const fakeServer = { close: (cb) => { serverCloseCalled = true; if (cb) cb(); } };

  // Stub process.exit so the test runner doesn't die. Don't throw —
  // the implementation rescues the throw and falls through to a hard exit.
  const origExit = process.exit;
  let exitCode = null;
  process.exit = (code) => { exitCode = code; /* swallow — must not throw */ };

  try {
    const timer = dashServer._startIdleTtlTimer({
      ttlMs: 1,
      intervalMs: 30,
      projectDir: dir,
      server: fakeServer,
      tracker: t,
      onShutdown: () => { shutdownCalled = true; },
    });

    // Wait long enough for at least 2 ticks.
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(exitCode, 0, 'process.exit(0) should have been called');
    assert.equal(shutdownCalled, true, 'onShutdown should have been called');
    assert.equal(serverCloseCalled, true, 'server.close should have been called');
    assert.equal(fs.existsSync(pidFile), false, '.dashboard.pid should be removed');

    clearInterval(timer);
  } finally {
    process.exit = origExit;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
});

// ── 4. Idle-TTL does NOT fire when SSE is active ────────────────────────────
test('M49: idle-TTL does NOT fire while activeSseConnections > 0', async () => {
  const t = dashServer._activityTracker();
  t.sseConnect(); // hold a connection open

  const dir = mkTmp();
  const fakeServer = { close: (cb) => { if (cb) cb(); } };
  const origExit = process.exit;
  let exitCalled = false;
  process.exit = () => { exitCalled = true; throw new Error('__exit__'); };

  try {
    const timer = dashServer._startIdleTtlTimer({
      ttlMs: 1,            // would otherwise fire instantly
      intervalMs: 30,
      projectDir: dir,
      server: fakeServer,
      tracker: t,
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(exitCalled, false, 'process.exit must NOT be called while SSE is active');
    clearInterval(timer);
  } finally {
    process.exit = origExit;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
});

// ── 5. tracker.bump resets the idle clock — TTL doesn't fire if recently bumped
test('M49: tracker.bump within window prevents TTL fire', async () => {
  const t = dashServer._activityTracker();
  const dir = mkTmp();
  const fakeServer = { close: (cb) => { if (cb) cb(); } };
  const origExit = process.exit;
  let exitCalled = false;
  process.exit = () => { exitCalled = true; throw new Error('__exit__'); };

  try {
    const timer = dashServer._startIdleTtlTimer({
      ttlMs: 200,        // 200ms window
      intervalMs: 30,
      projectDir: dir,
      server: fakeServer,
      tracker: t,
    });

    // Bump every 50ms for 250ms — keeps idle below 200ms throughout.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 50));
      t.bump();
    }
    assert.equal(exitCalled, false, 'TTL must not fire while bumps keep activity fresh');

    clearInterval(timer);
  } finally {
    process.exit = origExit;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
});

// ── 6. _wrapSseHandler increments + decrements on close ─────────────────────
test('M49: _wrapSseHandler tracks connect on entry, disconnect on req.close', () => {
  const t = dashServer._activityTracker();

  // Mock req/res with EventEmitter-like .on shim.
  const listeners = {};
  const req = { on: (ev, cb) => { listeners[ev] = listeners[ev] || []; listeners[ev].push(cb); } };
  const res = { on: (ev, cb) => { listeners['res:' + ev] = listeners['res:' + ev] || []; listeners['res:' + ev].push(cb); } };

  let inner = false;
  const wrapped = dashServer._wrapSseHandler((rq, rs) => { inner = true; }, t);
  wrapped(req, res);

  assert.equal(inner, true, 'inner handler should run');
  assert.equal(t.snapshot().activeSseConnections, 1, 'connect should bump counter');

  // Fire req.close → should disconnect.
  for (const cb of (listeners['close'] || [])) cb();
  assert.equal(t.snapshot().activeSseConnections, 0, 'req.close should drop counter');

  // Fire it again — must be idempotent.
  for (const cb of (listeners['close'] || [])) cb();
  assert.equal(t.snapshot().activeSseConnections, 0, 'idempotent on repeated close');
});

// ── 7. startServer accepts idleTtlMs option (smoke) ─────────────────────────
test('M49: startServer accepts idleTtlMs option without crashing', () => {
  const dir = mkTmp();
  // Pick a free-ish high port for this test.
  const port = 49000 + Math.floor(Math.random() * 500);
  const eventsDir = path.join(dir, '.gsd-t', 'events');
  fs.mkdirSync(eventsDir, { recursive: true });
  const htmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');

  // ttl=0 disables the TTL timer entirely (test-friendly mode).
  const result = dashServer.startServer(port, eventsDir, htmlPath, dir, transcriptHtmlPath, {
    idleTtlMs: 0,
  });

  try {
    assert.ok(result.server);
    assert.ok(result.tracker);
    assert.equal(result.idleTimer, null, 'idleTtlMs:0 should disable the timer');
  } finally {
    result.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
