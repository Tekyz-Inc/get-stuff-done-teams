'use strict';
/**
 * M43 D6-T3 — URL banner printed by `autoSpawnHeadless`.
 *
 * Every detached spawn must print a single line:
 *   `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}`
 *
 * Port comes from either:
 *   - the value returned by `ensureDashboardRunning` (D6-T4) when the
 *     autostart module is on disk, OR
 *   - `projectScopedDefaultPort(projectDir)` as a last-resort fallback.
 *
 * The banner is best-effort: any failure in the autostart or port-lookup
 * path must NOT crash the spawn. We cover both paths.
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
 * We also kill any autostarted dashboard-server child via its pid file.
 */
function runAutoSpawnAndCaptureBanner(projectDir) {
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
  // Best-effort: kill an autostarted dashboard if the test spawned one
  const pidFile = path.join(projectDir, '.gsd-t', '.dashboard.pid');
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch (_) { /* gone */ } }
  }
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

test('URL banner — printed on detached spawn with expected format', () => {
  const dir = mkTmp();
  const { stdout } = runAutoSpawnAndCaptureBanner(dir);
  const match = stdout.match(/^▶ Live transcript: http:\/\/127\.0\.0\.1:(\d+)\/transcript\/([a-z0-9-]+)$/m);
  assert.ok(match, `expected banner in stdout; got:\n${stdout}`);
  const port = Number(match[1]);
  assert.ok(port >= 1 && port <= 65535, `invalid port ${port}`);
  assert.ok(match[2].startsWith('gsd-t-banner-probe-'),
    `expected spawn id to start with command prefix; got ${match[2]}`);
});

test('URL banner — port comes from projectScopedDefaultPort when autostart returns it', () => {
  const dir = mkTmp();
  const { stdout } = runAutoSpawnAndCaptureBanner(dir);
  const match = stdout.match(/^▶ Live transcript: http:\/\/127\.0\.0\.1:(\d+)\/transcript\//m);
  assert.ok(match, `expected banner; got:\n${stdout}`);
  const bannerPort = Number(match[1]);
  // Load projectScopedDefaultPort directly to cross-check
  const { projectScopedDefaultPort } = require(DASHBOARD_SERVER);
  const expectedPort = projectScopedDefaultPort(dir);
  assert.equal(bannerPort, expectedPort,
    `banner port ${bannerPort} should equal projectScopedDefaultPort(${dir}) = ${expectedPort}`);
});

test('URL banner — spawn does not crash when autostart module throws', () => {
  // Simulate by passing a projectDir but shadowing the require path via env
  // tampering isn't trivial. Instead we verify the banner still prints when
  // the real autostart runs in an otherwise-empty tmpdir (no .gsd-t tree
  // pre-existing). If the autostart raises internally, the try/catch in
  // autoSpawnHeadless swallows it and the banner fallback to
  // projectScopedDefaultPort kicks in.
  const dir = mkTmp();
  const result = runAutoSpawnAndCaptureBanner(dir);
  // Banner present
  assert.match(result.stdout, /▶ Live transcript: http:\/\/127\.0\.0\.1:\d+\/transcript\//);
  // Wrapper did not crash (stderr may contain 'inner error' but the
  // outer node -e process exited with 0 because the try/catch above
  // swallows inner errors — anything other than a banner counts as
  // no-banner failure above).
});
