'use strict';
/**
 * M49 — Lazy dashboard. autoSpawnHeadless() must NOT autostart a dashboard.
 * The transcript URL banner becomes conditional on whether a dashboard is
 * already listening on the project's scoped port. Probe is fast + sync.
 *
 * Contract: .gsd-t/contracts/headless-default-contract.md v2.0.0 §M49
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const has = require('../bin/headless-auto-spawn.cjs');

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m49-lazy-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  // Minimal shim so spawn() doesn't fail looking for bin/gsd-t.js.
  fs.writeFileSync(
    path.join(dir, 'bin', 'gsd-t.js'),
    "#!/usr/bin/env node\nconsole.log('shim');\nprocess.exit(0);\n",
  );
  return dir;
}

// ── 1. Probe — no pidfile → not running ─────────────────────────────────────
test('M49: _probeDashboardLazy returns running:false when no pidfile exists', () => {
  const dir = mkTmp();
  try {
    const r = has._probeDashboardLazy(dir);
    assert.equal(r.running, false);
    assert.equal(r.pid, null);
    assert.equal(r.port, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 2. Probe — stale pidfile (dead pid) → not running ──────────────────────
test('M49: _probeDashboardLazy returns running:false when pidfile points to dead pid', () => {
  const dir = mkTmp();
  try {
    // PID 1 might be alive on Unix, but we want a definitively dead one.
    // 999999 is virtually guaranteed to be unused.
    fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), '999999');
    const r = has._probeDashboardLazy(dir);
    assert.equal(r.running, false);
    assert.equal(r.port, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 3. Probe — live pidfile → running:true + port resolved ──────────────────
test('M49: _probeDashboardLazy returns running:true when pidfile points to live pid', () => {
  const dir = mkTmp();
  try {
    // Use our own pid — guaranteed alive for the duration of the test.
    fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), String(process.pid));
    const r = has._probeDashboardLazy(dir);
    assert.equal(r.running, true);
    assert.equal(r.pid, process.pid);
    assert.ok(typeof r.port === 'number' && r.port >= 7433 && r.port <= 7532);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 4. Probe — garbage pidfile → not running ───────────────────────────────
test('M49: _probeDashboardLazy returns running:false on garbage pidfile contents', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), 'not-a-number');
    const r = has._probeDashboardLazy(dir);
    assert.equal(r.running, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 5. Probe — empty pidfile → not running ─────────────────────────────────
test('M49: _probeDashboardLazy returns running:false on empty pidfile', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), '');
    const r = has._probeDashboardLazy(dir);
    assert.equal(r.running, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 6. Probe — speed (must be cheap, runs on every spawn) ───────────────────
test('M49: _probeDashboardLazy is fast (< 50ms even with 100 calls)', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), String(process.pid));
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      has._probeDashboardLazy(dir);
    }
    const elapsed = Date.now() - start;
    // Generous bound — local syscalls, no fork. Even on a loaded CI box this is < 50ms.
    assert.ok(elapsed < 50, `100 probes took ${elapsed}ms, expected < 50ms`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 7. autoSpawnHeadless does NOT call ensureDashboardRunning ───────────────
//
// Strategy: spy on `ensureDashboardRunning` by clearing the require cache and
// stubbing the autostart module before requiring autoSpawnHeadless. If the
// stub gets called, the test fails. The prior pre-M49 implementation called
// it on every spawn; the post-M49 implementation must not.
test('M49: autoSpawnHeadless does NOT invoke ensureDashboardRunning', () => {
  const dir = mkTmp();
  let callCount = 0;
  const autostartPath = path.resolve(__dirname, '..', 'scripts', 'gsd-t-dashboard-autostart.cjs');
  const dashboardServerPath = path.resolve(__dirname, '..', 'scripts', 'gsd-t-dashboard-server.js');

  // Wipe + stub the autostart module.
  delete require.cache[autostartPath];
  require.cache[autostartPath] = {
    id: autostartPath,
    filename: autostartPath,
    loaded: true,
    exports: {
      ensureDashboardRunning: () => {
        callCount++;
        return { port: 7433, pid: 0, alreadyRunning: false };
      },
      _isPortBusySync: () => false,
      _pidPath: (p) => path.join(p, '.gsd-t', '.dashboard.pid'),
      PID_REL: '.gsd-t/.dashboard.pid',
    },
  };

  // Wipe + reload the unit under test so it picks up the stub on require.
  const hasPath = path.resolve(__dirname, '..', 'bin', 'headless-auto-spawn.cjs');
  delete require.cache[hasPath];
  // Also reload the dashboard server so the projectScopedDefaultPort export resolves.
  delete require.cache[dashboardServerPath];
  const freshHas = require(hasPath);

  try {
    const r = freshHas.autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
    });
    assert.ok(r && r.id, 'autoSpawnHeadless should return a session');
    assert.equal(callCount, 0, 'ensureDashboardRunning must NOT be called');
  } finally {
    delete require.cache[autostartPath];
    delete require.cache[hasPath];
    delete require.cache[dashboardServerPath];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 8. Banner shape — dashboard running → URL banner ───────────────────────
test('M49: banner uses URL when dashboard is running', () => {
  const dir = mkTmp();
  // Live pid → probe says running.
  fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), String(process.pid));

  // Capture stdout.
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += String(chunk);
    return true;
  };

  try {
    const r = has.autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
    });
    assert.ok(r && r.id);
    assert.ok(
      /▶ Live transcript: http:\/\/127\.0\.0\.1:\d+\/transcript\//.test(captured),
      `expected URL banner, got: ${captured}`,
    );
  } finally {
    process.stdout.write = origWrite;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 9. Banner shape — no dashboard → file path + visualize hint ─────────────
test('M49: banner falls back to file path + visualize hint when no dashboard is running', () => {
  const dir = mkTmp();
  // No pidfile written → probe says not running.

  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += String(chunk);
    return true;
  };

  try {
    const r = has.autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
    });
    assert.ok(r && r.id);
    assert.ok(
      /▶ Transcript file: .+\n  \(to view live: gsd-t-visualize\)/.test(captured),
      `expected file-path banner with visualize hint, got: ${captured}`,
    );
    // And critically — no live URL banner.
    assert.equal(
      /▶ Live transcript: http/.test(captured),
      false,
      'must not print live URL when dashboard is not running',
    );
  } finally {
    process.stdout.write = origWrite;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
