'use strict';
/**
 * M43 D6-T3 — URL banner printed by `autoSpawnHeadless` (M49 update).
 *
 * Pre-M49 behavior: every spawn auto-started a dashboard and printed a
 * `▶ Live transcript: http://...` URL banner. That accumulated 88+ orphan
 * dashboard processes because 99% of those URLs are never opened.
 *
 * Post-M49 behavior (lazy banner):
 *   - If a dashboard is already listening on the project's scoped port:
 *     `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}`
 *   - If NO dashboard is running:
 *     `▶ Transcript file: {logPath}\n  (to view live: gsd-t-visualize)`
 *
 * In a tmpdir with no pre-existing dashboard, we expect the file-path
 * banner. The URL banner format is exercised by `m49-lazy-dashboard.test.js`
 * (when a live pid is on file).
 *
 * We run `autoSpawnHeadless` in a child process so we can capture stdout
 * cleanly. The spawned gsd-t.js child will fail fast in the tmpdir (no
 * bin/gsd-t.js), but that happens AFTER the banner print — so the banner
 * is still on stdout.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HEADLESS_MODULE = path.join(REPO, 'bin', 'headless-auto-spawn.cjs');
const DASHBOARD_SERVER = path.join(REPO, 'scripts', 'gsd-t-dashboard-server.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-banner-'));
}

/**
 * Invoke autoSpawnHeadless in a child node process with a temporary
 * projectDir. Capture stdout — the banner must appear there. The spawn
 * the function attempts (node bin/gsd-t.js headless …) may fail in the
 * tmpdir; that's fine, the banner prints first.
 *
 * Optional `killPidfile` (default true) controls whether we clean up an
 * autostarted dashboard pid afterwards. Tests that PRE-WRITE the pidfile
 * with their own test-runner pid (M49 — to assert the URL banner shape)
 * MUST disable this cleanup, otherwise we'd SIGTERM the test runner.
 */
function runAutoSpawnAndCaptureBanner(projectDir, opts) {
  const killPidfile = !(opts && opts.killPidfile === false);
  const runner = `
    process.chdir(${JSON.stringify(projectDir)});
    const mod = require(${JSON.stringify(HEADLESS_MODULE)});
    try {
      mod.autoSpawnHeadless({
        command: 'gsd-t-banner-probe',
        args: [],
        projectDir: ${JSON.stringify(projectDir)},
        watch: false,
        spawnType: 'primary',
      });
    } catch (e) {
      // Spawn failure is expected in a tmpdir; we only care about the banner.
      process.stderr.write('[banner-test] inner error: ' + e.message + '\\n');
    }
  `;
  const r = spawnSync(process.execPath, ['-e', runner], {
    cwd: projectDir,
    timeout: 10000,
    encoding: 'utf8',
  });
  // Best-effort: kill an autostarted dashboard if the test spawned one.
  // M49 — `autoSpawnHeadless` no longer autostarts, so this is a no-op
  // unless a test wrote its own pidfile (in which case the test must
  // pass `killPidfile: false` so we don't kill the test runner).
  if (killPidfile) {
    const pidFile = path.join(projectDir, '.gsd-t', '.dashboard.pid');
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (pid && pid !== process.pid) {
        try { process.kill(pid, 'SIGTERM'); } catch (_) { /* gone */ }
      }
    }
  }
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

test('M49 banner — file-path form when no dashboard pidfile is present', () => {
  const dir = mkTmp();
  const { stdout } = runAutoSpawnAndCaptureBanner(dir);
  // No pidfile → fallback banner.
  const match = stdout.match(/▶ Transcript file: (.+)\n {2}\(to view live: gsd-t-visualize\)/);
  assert.ok(match, `expected file-path banner in stdout; got:\n${stdout}`);
  // Path should be the relative log path under .gsd-t/.
  assert.ok(match[1].startsWith('.gsd-t/headless-gsd-t-banner-probe-'),
    `expected log path under .gsd-t/; got ${match[1]}`);
  // And critically — must NOT print the live URL.
  assert.equal(/▶ Live transcript: http/.test(stdout), false,
    'must not print URL when dashboard is not running');
});

test('M49 banner — URL form when a dashboard pid is registered (own pid as live proxy)', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  // Use the test-runner's own pid as a live process the probe will see.
  fs.writeFileSync(path.join(dir, '.gsd-t', '.dashboard.pid'), String(process.pid));

  const { stdout } = runAutoSpawnAndCaptureBanner(dir, { killPidfile: false });
  const match = stdout.match(/▶ Live transcript: http:\/\/127\.0\.0\.1:(\d+)\/transcript\//);
  assert.ok(match, `expected URL banner; got:\n${stdout}`);
  const bannerPort = Number(match[1]);
  // Cross-check the port resolution.
  const { projectScopedDefaultPort } = require(DASHBOARD_SERVER);
  const expectedPort = projectScopedDefaultPort(dir);
  assert.equal(bannerPort, expectedPort,
    `banner port ${bannerPort} should equal projectScopedDefaultPort(${dir}) = ${expectedPort}`);
});

test('M49 banner — spawn does not crash when autostart module is unreachable', () => {
  // The lazy probe doesn't even import the autostart module anymore — it just
  // reads the pidfile. So this test now just verifies that the spawn returns
  // cleanly in a tmpdir without a .gsd-t tree.
  const dir = mkTmp();
  const result = runAutoSpawnAndCaptureBanner(dir);
  // Banner present (file-path form, since no pidfile).
  assert.match(result.stdout, /▶ Transcript file: \.gsd-t\//);
  // Wrapper did not crash.
  assert.equal(/inner error/.test(result.stderr), false,
    `expected no inner error in stderr; got: ${result.stderr}`);
});
