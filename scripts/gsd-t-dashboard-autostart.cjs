'use strict';
/**
 * GSD-T Dashboard Autostart (M43 D6-T4)
 *
 * Idempotent, silent starter for the transcript/dashboard server. Called at
 * every spawn start path in `bin/headless-auto-spawn.cjs` so the URL banner
 * printed next to it (D6-T3) always resolves to a live listener.
 *
 * Design notes:
 *   - The port is resolved via `projectScopedDefaultPort(projectDir)` from
 *     the multi-project isolation quick (df34eb2) — each project has its
 *     own deterministic default port.
 *   - We probe the port with `net.createServer().listen(...)` — if it binds
 *     the port was free and we fork-detach the dashboard server. If the
 *     probe fails with EADDRINUSE, we assume the server is already running
 *     (or some other process grabbed the port; we defer to the user in that
 *     case and return alreadyRunning:true — the banner link still points
 *     there, and if it's foreign the user sees a friendlier failure than
 *     a stacktrace).
 *   - PID file lives at `.gsd-t/.dashboard.pid` relative to projectDir.
 *     Distinct from M38's `.gsd-t/dashboard.pid` (hyphen vs. dot) so the
 *     two lifecycles don't collide.
 *
 * Zero deps.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PID_REL = path.join('.gsd-t', '.dashboard.pid');

function _pidPath(projectDir) {
  return path.join(projectDir || '.', PID_REL);
}

/**
 * Check if a port is already bound by someone. Resolves `{ busy: bool, reason? }`.
 *
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @returns {Promise<{busy: boolean, reason?: string}>}
 */
function _probePort(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { srv.close(); } catch (_) { /* ok */ }
      resolve(result);
    };
    srv.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') finish({ busy: true, reason: 'EADDRINUSE' });
      else finish({ busy: true, reason: String(err && err.code ? err.code : err) });
    });
    srv.once('listening', () => {
      finish({ busy: false });
    });
    try {
      srv.listen(port, host || '127.0.0.1');
    } catch (err) {
      finish({ busy: true, reason: String(err && err.code ? err.code : err) });
    }
  });
}

/**
 * Synchronous port-busy probe. Forks a tiny node child that attempts to
 * `net.createServer().listen(port)` and exits 1 if EADDRINUSE, else
 * closes the server and exits 0. This gives us a definitive answer
 * in O(50ms) from a synchronous caller — Node's `net.Server#listen` is
 * async, which makes a purely in-process synchronous probe impossible
 * without busy-looping the event loop (which doesn't advance during JS
 * execution).
 *
 * Important: we probe with **no host** to match the dashboard server's
 * `server.listen(port)` (which binds to the IPv6 wildcard `::`). On macOS
 * dual-stack, binding to `127.0.0.1` alongside a wildcard on `::` is
 * permitted and would make a host-specific probe falsely report "free".
 * The `host` parameter is accepted for backward compatibility but, when
 * omitted, we use the host-less form. Passing an explicit host preserves
 * legacy semantics for callers that rely on it.
 *
 * Returns `true` if the port is in use (EADDRINUSE), `false` otherwise.
 * On spawn failure we conservatively return `false` so the caller tries
 * to start the server — it will then fail fast and the caller falls back
 * to the "assume running" path via its own handling.
 */
function _isPortBusySync(port, host) {
  const listenArgs = host
    ? `${JSON.stringify(port)}, ${JSON.stringify(host)}`
    : `${JSON.stringify(port)}`;
  const script = `
    const net = require('net');
    const srv = net.createServer();
    srv.once('error', (e) => { if (e && e.code === 'EADDRINUSE') process.exit(1); process.exit(2); });
    srv.once('listening', () => { srv.close(() => process.exit(0)); });
    srv.listen(${listenArgs});
  `;
  try {
    const r = spawnSync(process.execPath, ['-e', script], { timeout: 10000, stdio: 'ignore' });
    return r.status === 1;
  } catch (_) {
    return false;
  }
}

/**
 * Ensure the dashboard server is running on the project's scoped port.
 *
 * Idempotent: safe to call on every spawn. Silent: no stdout/stderr writes
 * on the happy path; the detached child's stdio is ignored.
 *
 * **Synchronous contract**: returns immediately with `{port, pid, alreadyRunning}`.
 *  - If the port is already bound, returns `alreadyRunning: true`.
 *  - Otherwise fork-detaches the dashboard server and records its pid.
 *
 * @param {object} opts
 * @param {string} [opts.projectDir='.']
 * @param {number} [opts.port]
 * @param {string} [opts.host='127.0.0.1']
 * @returns {{port: number, pid: number|null, alreadyRunning: boolean}}
 */
function ensureDashboardRunning(opts) {
  const projectDir = (opts && opts.projectDir) || '.';
  const host = (opts && opts.host) || '127.0.0.1';
  let port = opts && opts.port;
  if (!port) {
    const srv = require('./gsd-t-dashboard-server.js');
    port = srv.projectScopedDefaultPort(projectDir);
  }

  // Probe with no host to match the dashboard server's listen(port) — which
  // binds to the IPv6 wildcard. Probing a specific host would falsely report
  // "free" on macOS dual-stack. `host` is retained only for the spawn env.
  const busy = _isPortBusySync(port);
  if (busy) {
    return { port, pid: null, alreadyRunning: true };
  }

  // Port was free — fork-detach the dashboard server.
  const serverScript = path.join(__dirname, 'gsd-t-dashboard-server.js');
  const child = spawn(process.execPath, [serverScript, '--port', String(port)], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    env: Object.assign({}, process.env, {
      GSD_T_PROJECT_DIR: path.resolve(projectDir),
    }),
  });
  child.unref();

  // Record pid. Best-effort; does not throw on filesystem failure.
  const pidFile = _pidPath(projectDir);
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(child.pid));
  } catch (_) { /* pid-file writing is best-effort */ }

  return { port, pid: child.pid || null, alreadyRunning: false };
}

module.exports = {
  ensureDashboardRunning,
  _probePort,
  _isPortBusySync,
  _pidPath,
  PID_REL,
};
