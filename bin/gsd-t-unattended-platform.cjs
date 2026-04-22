/**
 * gsd-t-unattended-platform.js
 *
 * Cross-platform helpers for the unattended supervisor (M36).
 *
 * This module is the SINGLE place where `process.platform` branches live.
 * Supervisor-core, watch-loop, and safety-rails import from here so that
 * the rest of the supervisor can stay platform-agnostic.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.0.0
 *   §5  Exit Code Table (timeout = 3, OS process-timeout = 124)
 *   §7  Launch Handshake (spawn semantics)
 *
 * Task 1 of m36-cross-platform delivers:
 *   - resolveClaudePath()
 *   - isAlive(pid)
 *   - spawnWorker(projectDir, timeoutMs, opts)
 *       opts.onHeartbeatCheck? — async liveness watchdog (M43 D?)
 *
 * Cross-platform notes:
 *   - darwin / linux paths are runtime-tested.
 *   - win32 paths are implementation-complete but NOT runtime-tested on the
 *     dev host (macOS). Spike C and the full Windows caveats matrix ship in
 *     Task 3 (`docs/unattended-windows-caveats.md`).
 *
 * Zero external dependencies — Node built-ins only.
 */

"use strict";

const { spawnSync, spawn } = require("node:child_process");

// ─── resolveClaudePath ───────────────────────────────────────────────────────

/**
 * Resolve the executable name for the `claude` CLI on the current platform.
 *
 * Returns `'claude.cmd'` on win32 and `'claude'` everywhere else.
 *
 * This is intentionally a simple platform branch — it does NOT shell out to
 * `which` / `where`. The resolver assumes `claude` is on PATH; PATH lookup is
 * delegated to `spawnSync`, which is cross-platform and quoting-safe.
 *
 * Cross-platform:
 *   - darwin / linux: returns `'claude'`. The macOS / Linux installer puts
 *     `claude` on PATH via `/usr/local/bin` or `/opt/homebrew/bin`.
 *   - win32: returns `'claude.cmd'`. The Anthropic Windows installer ships a
 *     `.cmd` shim. Using the `.cmd` filename explicitly (instead of bare
 *     `claude`) avoids `spawnSync` falling through to `cmd.exe /c claude`,
 *     which would re-introduce the Spike C PowerShell quoting hazard.
 *
 * @returns {string} `'claude'` or `'claude.cmd'`
 */
function resolveClaudePath() {
  return process.platform === "win32" ? "claude.cmd" : "claude";
}

// ─── isAlive ─────────────────────────────────────────────────────────────────

/**
 * Cross-platform liveness check for a PID.
 *
 * Uses the POSIX trick `kill(pid, 0)` — sends signal 0, which performs all
 * permission and existence checks but delivers no signal. Node's
 * `process.kill` implements the same semantics on Windows.
 *
 * Errors:
 *   - `ESRCH`  → no such process. Returns `false`.
 *   - `EPERM`  → process exists but we don't own it. Returns `true` (we got
 *                permission feedback, which proves the PID is live).
 *   - other    → unexpected; rethrown.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isAlive(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === "ESRCH") return false;
    if (err && err.code === "EPERM") return true; // exists, not ours
    throw err;
  }
}

// ─── spawnWorker ─────────────────────────────────────────────────────────────

/**
 * Spawn a `claude -p '/gsd-t-resume'` worker iteration for the unattended
 * supervisor.
 *
 * Returns a normalized result object: `{ status, stdout, stderr, signal,
 * timedOut, staleHeartbeat, error }`. Never throws — spawn errors are
 * returned in `error`.
 *
 * Two kill paths:
 *   1. Heartbeat watchdog (M43 primary) — when `opts.onHeartbeatCheck` is
 *      provided, the function polls every `opts.heartbeatPollMs` (default
 *      60_000). If the callback returns `{stale: true, ...}`, the child is
 *      SIGTERM'd and `staleHeartbeat: true` is set on the result.
 *   2. Wall-clock timeout (absolute backstop) — `timeoutMs` is the hard cap
 *      regardless of heartbeat. On expiry the child is SIGTERM'd and
 *      `timedOut: true`. Default raised to 1 h in supervisor-core so a
 *      healthy long-running worker is not cut.
 *
 * Exactly one path is used per iteration:
 *   - opts.onHeartbeatCheck present → heartbeat path (async event loop)
 *   - opts.onHeartbeatCheck absent  → legacy spawnSync path (blocking)
 * The legacy path is preserved so callers that have no meaningful liveness
 * signal (test stubs, dry-run) keep the original semantics.
 *
 * Cross-platform:
 *   - darwin / linux: runtime-tested.
 *   - win32: implementation-complete; documented in
 *     `docs/unattended-windows-caveats.md` (Task 3).
 *
 * @param {string} projectDir   Absolute path to the project directory (cwd).
 * @param {number} timeoutMs    Wall-clock backstop per worker iteration in ms.
 * @param {object} [opts]       Optional overrides (test-mode hooks).
 * @param {string} [opts.bin]   Override the resolved binary (test-mode only).
 * @param {string[]} [opts.args] Override args (defaults to `['-p', '/gsd-t-resume']`).
 * @param {object} [opts.env]   Override env (defaults to `process.env`).
 * @param {Function} [opts.onHeartbeatCheck]  Called every heartbeatPollMs
 *   with no args; must return `{stale: boolean, reason?: string}` or a
 *   Promise thereof. When stale, the child is SIGTERM'd.
 * @param {number} [opts.heartbeatPollMs]  Poll cadence in ms. Default 60_000.
 * @param {Function} [opts.onHeartbeatSample]  Optional observer; receives the
 *   raw callback result each poll for logging.
 * @param {Function} [opts.onStdoutLine]  Optional live stdout line callback.
 *   When provided (heartbeat path only), invoked once per `\n`-terminated line
 *   as stdout streams in. Trailing partial line is flushed on close. Errors
 *   are swallowed (best-effort tee). Used by the supervisor to write each
 *   worker line into the M42 transcript file in real time, instead of
 *   appending the entire stdout buffer post-hoc at child exit.
 * @returns {{
 *   status: number|null,
 *   stdout: string,
 *   stderr: string,
 *   signal: string|null,
 *   timedOut: boolean,
 *   staleHeartbeat: boolean,
 *   heartbeatReason: string|null,
 *   error: Error|null
 * }|Promise<...>}
 *   Returns a Promise when `opts.onHeartbeatCheck` is provided; otherwise a
 *   synchronous result (legacy path).
 */
function spawnWorker(projectDir, timeoutMs, opts = {}) {
  const bin = opts.bin || resolveClaudePath();
  const args = opts.args || [
    "-p",
    "/gsd-t-resume",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  const env = opts.env || process.env;

  if (typeof opts.onHeartbeatCheck === "function") {
    return _spawnWorkerAsyncHeartbeat({
      bin,
      args,
      env,
      cwd: projectDir,
      timeoutMs,
      onHeartbeatCheck: opts.onHeartbeatCheck,
      heartbeatPollMs: opts.heartbeatPollMs || 60 * 1000,
      onHeartbeatSample: opts.onHeartbeatSample,
      onStdoutLine: opts.onStdoutLine,
      spawnImpl: opts._spawnImpl || spawn,
    });
  }

  const result = spawnSync(bin, args, {
    cwd: projectDir,
    encoding: "utf8",
    timeout: timeoutMs,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const signal = result.signal || null;
  const status = typeof result.status === "number" ? result.status : null;

  const errCode = result.error && result.error.code;
  const timedOut =
    errCode === "ETIMEDOUT" || (status === null && signal !== null && !result.error);

  return {
    status,
    stdout,
    stderr,
    signal,
    timedOut,
    staleHeartbeat: false,
    heartbeatReason: null,
    error: errCode === "ETIMEDOUT" ? null : result.error || null,
  };
}

/**
 * Async spawn path used when a heartbeat callback is provided.
 *
 * Returns a Promise resolving to the same result shape as spawnWorker's
 * legacy path, plus `staleHeartbeat` and `heartbeatReason`.
 *
 * Kill precedence when both fire in the same tick: heartbeat wins (it is
 * the more specific signal). The loser is suppressed on the result.
 *
 * @private
 */
function _spawnWorkerAsyncHeartbeat({
  bin,
  args,
  env,
  cwd,
  timeoutMs,
  onHeartbeatCheck,
  heartbeatPollMs,
  onHeartbeatSample,
  onStdoutLine,
  spawnImpl,
}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(bin, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        status: null,
        stdout: "",
        stderr: "",
        signal: null,
        timedOut: false,
        staleHeartbeat: false,
        heartbeatReason: null,
        error: err,
      });
      return;
    }

    const chunksOut = [];
    const chunksErr = [];
    let lineBuf = "";
    const emitLine = (line) => {
      if (typeof onStdoutLine !== "function" || line.length === 0) return;
      try { onStdoutLine(line); } catch (_) { /* tee is best-effort */ }
    };
    if (child.stdout) child.stdout.on("data", (d) => {
      chunksOut.push(d);
      if (typeof onStdoutLine !== "function") return;
      lineBuf += d.toString("utf8");
      let nl;
      while ((nl = lineBuf.indexOf("\n")) >= 0) {
        emitLine(lineBuf.slice(0, nl));
        lineBuf = lineBuf.slice(nl + 1);
      }
    });
    if (child.stderr) child.stderr.on("data", (d) => chunksErr.push(d));

    let resolved = false;
    let timedOut = false;
    let staleHeartbeat = false;
    let heartbeatReason = null;
    let spawnErr = null;

    const heartbeatTimer = setInterval(async () => {
      if (resolved) return;
      let sample;
      try {
        sample = await onHeartbeatCheck();
      } catch (err) {
        // Heartbeat check must not kill the worker on its own failures.
        // Surface via sample observer when provided and continue.
        sample = { stale: false, reason: `heartbeat check threw: ${err.message}` };
      }
      if (typeof onHeartbeatSample === "function") {
        try { onHeartbeatSample(sample); } catch (_) { /* observer best-effort */ }
      }
      if (sample && sample.stale) {
        staleHeartbeat = true;
        heartbeatReason = sample.reason || "stale heartbeat";
        try { child.kill("SIGTERM"); } catch (_) { /* child may already be gone */ }
      }
    }, heartbeatPollMs);
    if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();

    const absoluteTimer = setTimeout(() => {
      if (resolved || staleHeartbeat) return;
      timedOut = true;
      try { child.kill("SIGTERM"); } catch (_) { /* child may already be gone */ }
    }, timeoutMs);
    if (typeof absoluteTimer.unref === "function") absoluteTimer.unref();

    child.on("error", (err) => {
      spawnErr = err;
    });

    child.on("close", (status, signal) => {
      if (resolved) return;
      resolved = true;
      clearInterval(heartbeatTimer);
      clearTimeout(absoluteTimer);

      if (lineBuf.length > 0) {
        emitLine(lineBuf);
        lineBuf = "";
      }

      const stdout = Buffer.concat(chunksOut).toString("utf8");
      const stderr = Buffer.concat(chunksErr).toString("utf8");

      resolve({
        status: typeof status === "number" ? status : null,
        stdout,
        stderr,
        signal: signal || null,
        timedOut,
        staleHeartbeat,
        heartbeatReason,
        error: spawnErr,
      });
    });
  });
}

// ─── spawnSupervisor ─────────────────────────────────────────────────────────

/**
 * Spawn a detached unattended supervisor process.
 *
 * Implements the Launch Handshake from contract §7: the interactive launch
 * command forks a long-lived supervisor that outlives the parent, reads the
 * state file, and relays `claude -p` workers until the milestone terminates.
 *
 * Spawn recipe:
 *   - `node {binPath} unattended {...args}` — the `unattended` subcommand is
 *     prepended automatically so callers pass only user-facing args.
 *   - `detached: true` — the child becomes a process-group leader on POSIX
 *     (darwin/linux) so it survives the parent closing its terminal. On win32
 *     the equivalent flag produces a separate process tree.
 *   - `stdio: 'ignore'` — no pipes held open that would block the parent
 *     from exiting.
 *   - `windowsHide: true` (win32 only) — no flashed console window.
 *   - `child.unref()` — the parent event loop will not wait on the child.
 *
 * Cross-platform notes:
 *   - darwin / linux: runtime-tested.
 *   - win32: implementation-complete; documented in
 *     `docs/unattended-windows-caveats.md` (Task 3).
 *
 * @param {object} params
 * @param {string} params.binPath  Absolute path to `bin/gsd-t.js`.
 * @param {string[]} params.args   Extra args appended after `unattended`.
 * @param {string} params.cwd      Project directory (supervisor's cwd).
 * @returns {{ pid: number }}      The detached child's PID.
 */
function spawnSupervisor({ binPath, args, cwd }) {
  const spawnArgs = [binPath, "unattended", ...(args || [])];
  const opts = {
    cwd,
    detached: true,
    stdio: "ignore",
  };
  if (process.platform === "win32") {
    opts.windowsHide = true;
  }
  const child = spawn("node", spawnArgs, opts);
  child.unref();
  return { pid: child.pid };
}

// ─── preventSleep ────────────────────────────────────────────────────────────

/**
 * Prevent the OS from going to sleep while the supervisor is running.
 *
 * Returns a handle that must be passed to `releaseSleep` when the supervisor
 * terminates.
 *
 * Cross-platform:
 *   - darwin: `caffeinate -i -w <supervisor-pid>` — the `-w` flag ties the
 *     caffeinate lifetime to the supervisor's PID. Even if the supervisor
 *     forgets to call `releaseSleep`, caffeinate will self-exit when the
 *     supervisor dies. Returns the caffeinate child PID as the handle.
 *   - linux: returns `null`. Reliable sleep prevention requires
 *     `systemd-inhibit`, which only works under a user session bus and is
 *     not universally available. v1 documents the gap; v2 may add opt-in
 *     systemd-inhibit. Prints a one-line notice to stderr.
 *   - win32: returns `null`. `SetThreadExecutionState` is the native API but
 *     requires a C binding. v1 documents the gap; see
 *     `docs/unattended-windows-caveats.md` (Task 3).
 *
 * @param {string} [reason]  Informational label (reserved; not currently used
 *                           — darwin's caffeinate has no reason field, and
 *                           linux/win32 don't have sleep prevention yet).
 * @returns {number|null}    PID handle on darwin, `null` elsewhere.
 */
function preventSleep(reason) {
  void reason; // reserved for future implementations
  if (process.platform === "darwin") {
    try {
      const child = spawn("caffeinate", ["-i", "-w", String(process.pid)], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return typeof child.pid === "number" ? child.pid : null;
    } catch (err) {
      process.stderr.write(
        `[platform] caffeinate failed to spawn: ${err && err.message}\n`,
      );
      return null;
    }
  }
  if (process.platform === "linux") {
    process.stderr.write(
      "[platform] sleep prevention not implemented on linux\n",
    );
    return null;
  }
  process.stderr.write(
    "[platform] sleep prevention not implemented on win32 (see docs/unattended-windows-caveats.md)\n",
  );
  return null;
}

// ─── releaseSleep ────────────────────────────────────────────────────────────

/**
 * Release a sleep-prevention handle obtained from `preventSleep`.
 *
 * Idempotent and tolerant:
 *   - `null` / non-number handle → no-op.
 *   - handle is a dead PID → no-op (ESRCH is swallowed).
 *   - handle is a live PID → `SIGTERM` is delivered (EPERM and other unusual
 *     errors are swallowed — caller cannot reasonably act on them).
 *
 * @param {number|null} handle
 * @returns {void}
 */
function releaseSleep(handle) {
  if (handle == null) return;
  if (typeof handle !== "number" || !Number.isInteger(handle) || handle <= 0) {
    return;
  }
  if (!isAlive(handle)) return;
  try {
    process.kill(handle, "SIGTERM");
  } catch (_err) {
    // Swallow — releaseSleep must never throw. A dead/gone process is fine;
    // an EPERM on an adopted PID is also fine (not ours to reap).
  }
}

// ─── notify ──────────────────────────────────────────────────────────────────

/**
 * Emit an OS-level desktop notification. Fire-and-forget — never throws.
 *
 * Cross-platform:
 *   - darwin: `osascript -e 'display notification "msg" with title "title"'`.
 *   - linux: `notify-send "title" "message"` (requires libnotify).
 *   - win32: `msg.exe * "title: message"` (console msg; ships with Windows).
 *
 * All platform helpers are fire-and-forget `spawn` calls. Errors are caught
 * and logged to stderr so a missing binary (e.g., no libnotify installed on a
 * headless Linux box) does NOT break the supervisor.
 *
 * @param {string} title
 * @param {string} message
 * @param {string} [level]   `info` | `warn` | `done` | `failed` — accepted but
 *                           currently unused. Reserved for future formatting.
 * @returns {void}
 */
function notify(title, message, level) {
  void level; // reserved for future formatting
  const safeTitle = String(title || "");
  const safeMessage = String(message || "");
  try {
    if (process.platform === "darwin") {
      // Escape double-quotes and backslashes for the AppleScript string
      // literal. osascript uses double-quoted string syntax.
      const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script =
        `display notification "${esc(safeMessage)}" ` +
        `with title "${esc(safeTitle)}"`;
      const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
      child.on("error", (err) => {
        process.stderr.write(
          `[platform] notify(osascript) failed: ${err && err.message}\n`,
        );
      });
      child.unref && child.unref();
      return;
    }
    if (process.platform === "linux") {
      const child = spawn("notify-send", [safeTitle, safeMessage], {
        stdio: "ignore",
      });
      child.on("error", (err) => {
        process.stderr.write(
          `[platform] notify(notify-send) failed: ${err && err.message}\n`,
        );
      });
      child.unref && child.unref();
      return;
    }
    // win32
    const child = spawn("msg.exe", ["*", `${safeTitle}: ${safeMessage}`], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (err) => {
      process.stderr.write(
        `[platform] notify(msg.exe) failed: ${err && err.message}\n`,
      );
    });
    child.unref && child.unref();
  } catch (err) {
    // Defense in depth — spawn() itself can throw synchronously on certain
    // argument errors. Never propagate.
    process.stderr.write(
      `[platform] notify synchronous error: ${err && err.message}\n`,
    );
  }
}

module.exports = {
  resolveClaudePath,
  isAlive,
  spawnWorker,
  spawnSupervisor,
  preventSleep,
  releaseSleep,
  notify,
};
