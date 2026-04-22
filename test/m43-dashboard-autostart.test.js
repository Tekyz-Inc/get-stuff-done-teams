'use strict';
/**
 * M43 D6-T4 — dashboard autostart: port probe → fork-detach → pid file.
 *
 * Tests:
 *   1. Port already bound → no-op, returns alreadyRunning:true, pid:null.
 *   2. Port free → spawns detached server, writes pid file, returns pid.
 *   3. Idempotent — back-to-back calls don't double-spawn.
 *
 * We use ephemeral ports (net.createServer then read `.address().port`)
 * to avoid collisions with other tests or a live project dashboard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const autostart = require('../scripts/gsd-t-dashboard-autostart.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-autostart-'));
}

function reserveEphemeralPort() {
  // Bind with no host — matches the dashboard server's `listen(port)` (IPv6
  // wildcard). Tests that use this helper should reflect real-world wildcard
  // behavior, not an artificial 127.0.0.1-only bind.
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      resolve({ srv, port });
    });
  });
}

test('_isPortBusySync — returns false for unbound port', () => {
  // Port well above ephemeral range — highly unlikely to be in use.
  // Host-less probe (matches ensureDashboardRunning's real usage).
  const busy = autostart._isPortBusySync(48211);
  assert.equal(busy, false);
});

test('_isPortBusySync — returns true when the port is already bound', async () => {
  const { srv, port } = await reserveEphemeralPort();
  try {
    // Host-less probe detects wildcard binds (the dashboard server's model).
    const busy = autostart._isPortBusySync(port);
    assert.equal(busy, true, `expected port ${port} to register as busy`);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('ensureDashboardRunning — port already bound returns alreadyRunning:true', async () => {
  const { srv, port } = await reserveEphemeralPort();
  const dir = mkTmp();
  try {
    const result = autostart.ensureDashboardRunning({ projectDir: dir, port });
    assert.equal(result.port, port);
    assert.equal(result.alreadyRunning, true);
    assert.equal(result.pid, null);
    // No pid file written when we didn't spawn
    const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
    assert.equal(fs.existsSync(pidFile), false);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

async function waitForPortBound(port, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  while (Date.now() < deadline) {
    // Probe with no host so we match wildcard binds (dashboard uses listen(port)).
    if (autostart._isPortBusySync(port)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// Pick a port in an isolated range unlikely to collide with parallel test
// suites (which tend to cluster in 19000-19999 and ephemeral 30000+).
function pickFreePort(base, span) {
  for (let i = 0; i < 10; i++) {
    const p = base + Math.floor(Math.random() * span);
    if (!autostart._isPortBusySync(p)) return p;
  }
  return base;
}

test('ensureDashboardRunning — port free, spawns and writes pid file', async () => {
  const dir = mkTmp();
  const port = pickFreePort(45200, 300);
  const result = autostart.ensureDashboardRunning({ projectDir: dir, port });
  try {
    assert.equal(result.port, port);
    assert.equal(result.alreadyRunning, false);
    assert.ok(result.pid && typeof result.pid === 'number', `expected numeric pid, got ${result.pid}`);

    // Pid file landed
    const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
    assert.equal(fs.existsSync(pidFile), true, 'pid file should exist');
    assert.equal(fs.readFileSync(pidFile, 'utf8').trim(), String(result.pid));

    // Wait for child to bind, then second call should detect busy. Timeout
    // is generous to tolerate parallel test-suite load spiking the event loop.
    const bound = await waitForPortBound(port, 8000);
    assert.equal(bound, true, `port ${port} should be bound after spawn`);

    const again = autostart.ensureDashboardRunning({ projectDir: dir, port });
    assert.equal(again.alreadyRunning, true, 'second call should see busy port');
    assert.equal(again.pid, null);
  } finally {
    if (result.pid) { try { process.kill(result.pid, 'SIGTERM'); } catch (_) { /* gone */ } }
  }
});

test('ensureDashboardRunning — idempotent back-to-back (second call skips spawn)', async () => {
  const dir = mkTmp();
  const port = pickFreePort(45600, 200);
  const first = autostart.ensureDashboardRunning({ projectDir: dir, port });
  try {
    assert.equal(first.alreadyRunning, false);
    // Wait for child to bind. Generous timeout for parallel-suite load.
    await waitForPortBound(port, 8000);
    const second = autostart.ensureDashboardRunning({ projectDir: dir, port });
    assert.equal(second.alreadyRunning, true);
    assert.equal(second.pid, null);
  } finally {
    if (first.pid) { try { process.kill(first.pid, 'SIGTERM'); } catch (_) { /* gone */ } }
  }
});

test('ensureDashboardRunning — _pidPath uses .gsd-t/.dashboard.pid', () => {
  const p = autostart._pidPath('/tmp/foo');
  assert.equal(p, path.join('/tmp/foo', '.gsd-t', '.dashboard.pid'));
});
