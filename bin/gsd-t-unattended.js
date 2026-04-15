#!/usr/bin/env node

/**
 * GSD-T Unattended Supervisor — Cross-Platform Detached Worker Relay
 *
 * The detached OS-level process that spawns fresh `claude -p` workers in a
 * relay to drive the active GSD-T milestone to COMPLETED over hours or days
 * without human intervention. Owns state.json + PID lifecycle + run.log +
 * stop-sentinel handling.
 *
 * Wave 1 / Task 1 scope:
 *   - CLI flag parsing (8 flags from contract §6)
 *   - Runtime file layout (`.gsd-t/.unattended/`) initialization
 *   - state.json schema (21 fields from §3) with atomic writes
 *   - supervisor.pid lifecycle
 *   - process.on('exit') terminal-state finalization
 *   - Skeleton — main worker loop, safety rails, and platform helpers
 *     are wired in Tasks 2/4. This file currently transitions to `running`
 *     and returns cleanly so the launch handshake (§7) can complete.
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.0.0
 * Owner: m36-supervisor-core
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawnSync } = require("child_process");
const { mapHeadlessExitCode } = require("./gsd-t.js");

// Safety rails (m36-safety-rails) — pure-function checks for pre-launch,
// supervisor-init, pre-worker, and post-worker hook points per contract §12.
const {
  DEFAULTS: SAFETY_DEFAULTS,
  loadConfig,
  checkGitBranch,
  checkWorktreeCleanliness,
  checkIterationCap,
  checkWallClockCap,
  validateState,
  detectGutter,
  detectBlockerSentinel,
} = require("./gsd-t-unattended-safety.js");

// Cross-platform helpers (m36-cross-platform) — the single place where
// process.platform branches live. The rest of this file stays platform-agnostic.
const {
  resolveClaudePath,
  isAlive,
  spawnWorker: platformSpawnWorker,
  preventSleep,
  releaseSleep,
  notify,
} = require("./gsd-t-unattended-platform.js");

// ── Constants ───────────────────────────────────────────────────────────────

const CONTRACT_VERSION = "1.0.0";
const UNATTENDED_DIR_REL = path.join(".gsd-t", ".unattended");
const PID_FILE = "supervisor.pid";
const STATE_FILE = "state.json";
const STATE_TMP_FILE = "state.json.tmp";
const RUN_LOG = "run.log";

const DEFAULT_HOURS = 24;
const DEFAULT_MAX_ITERATIONS = 200;
const DEFAULT_WORKER_TIMEOUT_MS = 3600000; // 1 hour per contract §13

const TERMINAL_STATUSES = new Set(["done", "failed", "stopped", "crashed"]);
const VALID_STATUSES = new Set([
  "initializing",
  "running",
  "done",
  "failed",
  "stopped",
  "crashed",
]);

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  doUnattended,
  parseArgs,
  initState,
  writeState,
  finalizeState,
  makeSessionId,
  resolveClaudeBinSafe,
  isTerminal,
  isMilestoneComplete,
  isDone,
  stopRequested,
  cleanStaleStopSentinel,
  releaseSleepPrevention,
  runMainLoop,
  _spawnWorker,
  _appendRunLog,
  CONTRACT_VERSION,
  UNATTENDED_DIR_REL,
  TERMINAL_STATUSES,
  VALID_STATUSES,
  DEFAULT_WORKER_TIMEOUT_MS,
};

// ── parseArgs ───────────────────────────────────────────────────────────────

/**
 * Parse the CLI argv (without the leading `node` and script path).
 *
 * Supports both `--flag=value` and `--flag value` forms.
 *
 * @param {string[]} argv
 * @returns {{
 *   hours: number,
 *   maxIterations: number,
 *   project: string,
 *   branch: string,
 *   onDone: string,
 *   dryRun: boolean,
 *   verbose: boolean,
 *   testMode: boolean,
 * }}
 */
function parseArgs(argv) {
  const out = {
    hours: DEFAULT_HOURS,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    project: ".",
    branch: "AUTO",
    onDone: "print",
    dryRun: false,
    verbose: false,
    testMode: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (typeof tok !== "string") continue;

    // Boolean flags
    if (tok === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (tok === "--verbose") {
      out.verbose = true;
      continue;
    }
    if (tok === "--test-mode") {
      out.testMode = true;
      continue;
    }

    // Key/value flags — accept both `--k=v` and `--k v`
    const eq = tok.indexOf("=");
    let key, val;
    if (tok.startsWith("--") && eq !== -1) {
      key = tok.slice(2, eq);
      val = tok.slice(eq + 1);
    } else if (tok.startsWith("--")) {
      key = tok.slice(2);
      val = argv[i + 1];
      i++;
    } else {
      continue;
    }

    switch (key) {
      case "hours":
        out.hours = Number(val);
        if (!Number.isFinite(out.hours) || out.hours <= 0) {
          out.hours = DEFAULT_HOURS;
        }
        break;
      case "max-iterations":
        out.maxIterations = parseInt(val, 10);
        if (!Number.isFinite(out.maxIterations) || out.maxIterations <= 0) {
          out.maxIterations = DEFAULT_MAX_ITERATIONS;
        }
        break;
      case "project":
        out.project = val || ".";
        break;
      case "branch":
        out.branch = val || "AUTO";
        break;
      case "on-done":
        out.onDone = val || "print";
        break;
      case "dry-run":
        out.dryRun = true;
        break;
      case "verbose":
        out.verbose = true;
        break;
      case "test-mode":
        out.testMode = true;
        break;
      default:
        // Unknown flag — ignore for forward compatibility
        break;
    }
  }

  return out;
}

// ── makeSessionId ───────────────────────────────────────────────────────────

/**
 * Produce a session ID matching the contract format:
 *   `unattended-{YYYY-MM-DD-HHMM}-{random4}`
 *
 * @param {Date} [date]
 * @returns {string}
 */
function makeSessionId(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const slug =
    d.getUTCFullYear() +
    "-" +
    pad(d.getUTCMonth() + 1) +
    "-" +
    pad(d.getUTCDate()) +
    "-" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes());
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `unattended-${slug}-${rand}`;
}

// ── resolveClaudeBinSafe ────────────────────────────────────────────────────

/**
 * Best-effort resolution of the `claude` binary path. Task 4 will replace
 * this with a proper cross-platform helper from
 * `bin/gsd-t-unattended-platform.js`. For Task 1 we just shell out to
 * `which claude` (POSIX) or `where claude` (win32) with a safe fallback to
 * the literal string `"claude"` — enough to satisfy the schema.
 *
 * @returns {string}
 */
function resolveClaudeBinSafe() {
  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split(/\r?\n/)[0]
      .trim();
    if (out) return out;
  } catch (_) {
    // fall through to default
  }
  return "claude";
}

// ── isTerminal ──────────────────────────────────────────────────────────────

function isTerminal(status) {
  return TERMINAL_STATUSES.has(status);
}

// ── readMilestoneId ─────────────────────────────────────────────────────────

/**
 * Best-effort read of the active milestone ID from `.gsd-t/progress.md`.
 * Falls back to the literal string `"UNKNOWN"` if the file or marker is
 * absent. We look for an `M{NN}` token on the first 40 lines.
 *
 * @param {string} projectDir
 * @returns {string}
 */
function readMilestoneId(projectDir) {
  try {
    const p = path.join(projectDir, ".gsd-t", "progress.md");
    if (!fs.existsSync(p)) return "UNKNOWN";
    const head = fs.readFileSync(p, "utf8").split(/\r?\n/).slice(0, 60).join("\n");
    const m = head.match(/\bM(\d{1,3})\b/);
    return m ? `M${m[1]}` : "UNKNOWN";
  } catch (_) {
    return "UNKNOWN";
  }
}

// ── initState ───────────────────────────────────────────────────────────────

/**
 * Build the initial `state.json` object (status: 'initializing'). Does NOT
 * write to disk — pass the result to `writeState()`.
 *
 * @param {{
 *   projectDir: string,
 *   hours: number,
 *   maxIterations: number,
 *   sessionId?: string,
 *   milestone?: string,
 *   claudeBin?: string,
 *   logPath?: string,
 *   now?: Date,
 * }} opts
 * @returns {object}
 */
function initState(opts) {
  if (!opts || !opts.projectDir) {
    throw new Error("initState: opts.projectDir is required");
  }
  const now = opts.now instanceof Date ? opts.now : new Date();
  const startedAt = now.toISOString();
  const projectDir = path.resolve(opts.projectDir);
  const sessionId = opts.sessionId || makeSessionId(now);
  const milestone = opts.milestone || readMilestoneId(projectDir);
  const claudeBin = opts.claudeBin || resolveClaudeBinSafe();
  const logPath =
    opts.logPath ||
    path.join(UNATTENDED_DIR_REL, RUN_LOG); // project-relative per contract §3

  return {
    version: CONTRACT_VERSION,
    sessionId,
    projectDir,
    status: "initializing",
    milestone,
    // wave / task / lastWorker* / lastExit / lastElapsedMs are populated by
    // the main loop in Task 2. They are documented as optional in §3.
    iter: 0,
    maxIterations: opts.maxIterations || DEFAULT_MAX_ITERATIONS,
    startedAt,
    lastTick: startedAt,
    hours: opts.hours || DEFAULT_HOURS,
    wallClockElapsedMs: 0,
    supervisorPid: process.pid,
    logPath,
    sleepPreventionHandle: null,
    platform: process.platform,
    claudeBin,
  };
}

// ── writeState ──────────────────────────────────────────────────────────────

/**
 * Atomically write `state.json` into the supervisor runtime directory.
 * Updates `lastTick` and (if startedAt is set) `wallClockElapsedMs`.
 *
 * @param {object} state
 * @param {string} dir — absolute path to `.gsd-t/.unattended/`
 * @returns {object} the (mutated) state object actually written
 */
function writeState(state, dir) {
  if (!state || typeof state !== "object") {
    throw new Error("writeState: state must be an object");
  }
  if (!dir) throw new Error("writeState: dir is required");

  fs.mkdirSync(dir, { recursive: true });

  const now = new Date();
  state.lastTick = now.toISOString();
  if (state.startedAt) {
    const started = Date.parse(state.startedAt);
    if (!Number.isNaN(started)) {
      state.wallClockElapsedMs = Math.max(0, now.getTime() - started);
    }
  }

  const tmp = path.join(dir, STATE_TMP_FILE);
  const final = path.join(dir, STATE_FILE);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, final);
  return state;
}

// ── finalizeState ───────────────────────────────────────────────────────────

/**
 * Terminal finalization. If `state.status` is non-terminal, transition it
 * to `terminalStatus` (default `'crashed'`). Writes state, releases any
 * sleep-prevention handle, then removes the PID file.
 *
 * **Idempotent**: a state object is marked finalized via a non-enumerable
 * `_finalized` flag on first call. Subsequent calls are no-ops that return
 * the same (preserved) terminal state. This matters because terminal
 * handlers may fire from multiple paths (main-loop exit, SIGINT/SIGTERM,
 * process.on('exit')) and we must not corrupt the already-written terminal
 * state (e.g., by overwriting 'stopped' with 'crashed').
 *
 * @param {object} state
 * @param {string} dir — absolute path to `.gsd-t/.unattended/`
 * @param {string} [terminalStatus='crashed']
 * @returns {object} the finalized state
 */
function finalizeState(state, dir, terminalStatus) {
  if (!state || typeof state !== "object") return state;
  if (!dir) throw new Error("finalizeState: dir is required");

  // Idempotency: if already finalized, return the preserved terminal state
  // untouched. Do NOT re-write state, do NOT change status.
  if (state._finalized === true) return state;

  if (!isTerminal(state.status)) {
    const next = terminalStatus && VALID_STATUSES.has(terminalStatus)
      ? terminalStatus
      : "crashed";
    state.status = next;
  }

  // Release any sleep-prevention handle. Task 4 wires the real platform
  // helper; for now this just clears the field so it can't dangle.
  try {
    releaseSleepPrevention(state);
  } catch (_) {
    // best effort — never throw from a shutdown path
  }

  // Always re-write so lastTick reflects finalization time and any
  // last-second fields (lastExit, etc.) are flushed.
  try {
    writeState(state, dir);
  } catch (_) {
    // best effort — never throw from a shutdown path
  }
  // Remove PID file last so external readers (kill -0) see a live process
  // until the state file is on disk.
  try {
    const pidPath = path.join(dir, PID_FILE);
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch (_) {
    // best effort
  }

  // Mark finalized via a non-enumerable flag so it doesn't serialize into
  // state.json on the next (no-op) call.
  try {
    Object.defineProperty(state, "_finalized", {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } catch (_) {
    // If the property is already defined (shouldn't happen), fall back to
    // a plain assignment — subsequent calls will still see truthy.
    state._finalized = true;
  }

  return state;
}

// ── doUnattended ────────────────────────────────────────────────────────────

/**
 * CLI entry point. Parses args, runs preflight, sets up runtime state, and
 * runs the main worker relay loop. Task 1 built the skeleton; Task 2 added
 * the main loop.
 *
 * Dependency injection (for tests) via `deps`:
 *   - `_spawnWorker(state, opts)` → { status, stdout, stderr, signal }
 *   - `_isMilestoneComplete(projectDir, milestoneId)` → boolean
 *   - `_stopRequested(projectDir)` → boolean
 *
 * @param {string[]} argv — argv WITHOUT the leading `node` and script path
 * @param {object} [deps]
 * @returns {{
 *   ok: boolean,
 *   dryRun: boolean,
 *   state?: object,
 *   dir?: string,
 *   exitCode: number,
 *   reason?: string,
 * }}
 */
function doUnattended(argv, deps) {
  deps = deps || {};
  const opts = parseArgs(argv || []);
  const projectDir = path.resolve(opts.project || ".");

  // ── Resolve injection points (real impls by default) ─────────────────────
  const fn = {
    checkGitBranch: deps._checkGitBranch || checkGitBranch,
    checkWorktreeCleanliness: deps._checkWorktreeCleanliness || checkWorktreeCleanliness,
    checkIterationCap: deps._checkIterationCap || checkIterationCap,
    checkWallClockCap: deps._checkWallClockCap || checkWallClockCap,
    validateState: deps._validateState || validateState,
    detectGutter: deps._detectGutter || detectGutter,
    detectBlockerSentinel: deps._detectBlockerSentinel || detectBlockerSentinel,
    resolveClaudePath: deps._resolveClaudePath || resolveClaudePath,
    preventSleep: deps._preventSleep || preventSleep,
    releaseSleep: deps._releaseSleep || releaseSleep,
    notify: deps._notify || notify,
    loadConfig: deps._loadConfig || loadConfig,
  };

  // ── Load config (optional .gsd-t/.unattended/config.json) ────────────────
  // CLI flags take precedence over config.json values per standard CLI ergonomics.
  let config;
  try {
    config = fn.loadConfig(projectDir);
  } catch (e) {
    // Malformed config → preflight failure, no PID/state written.
    // eslint-disable-next-line no-console
    console.error(`[gsd-t-unattended] preflight-failure: ${e.message}`);
    return {
      ok: false,
      dryRun: !!opts.dryRun,
      exitCode: 2,
      reason: String(e.message || e),
    };
  }
  // CLI overrides win over config for hours / maxIterations (explicit user
  // intent beats on-disk defaults). Parsed defaults of 24/200 match config
  // defaults, so this only matters when the user explicitly passed a value —
  // but parseArgs doesn't track that. We accept the merge semantics as-is:
  // config.hours overrides parseArgs default 24 only if CLI didn't also pass.
  // Simple rule: if CLI value equals the hardcoded default, prefer config.
  if (opts.hours === DEFAULT_HOURS && typeof config.hours === "number") {
    opts.hours = config.hours;
  }
  if (
    opts.maxIterations === DEFAULT_MAX_ITERATIONS &&
    typeof config.maxIterations === "number"
  ) {
    opts.maxIterations = config.maxIterations;
  }
  // CLI values now win — mirror them back into config so the pre-worker
  // safety caps (checkIterationCap / checkWallClockCap) use the effective
  // supervisor-scoped limits rather than the on-disk file defaults.
  config.maxIterations = opts.maxIterations;
  config.hours = opts.hours;

  // ── PRE-LAUNCH HOOK (contract §12) ───────────────────────────────────────
  // Runs BEFORE any PID/state file is written. Refusal → exit with the
  // corresponding code and leave the runtime dir untouched.
  const branchRes = fn.checkGitBranch(projectDir, config);
  if (!branchRes.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[gsd-t-unattended] preflight-refusal: ${branchRes.reason || "protected branch"}`,
    );
    return {
      ok: false,
      dryRun: !!opts.dryRun,
      exitCode: branchRes.code || 7,
      reason: branchRes.reason,
    };
  }
  const treeRes = fn.checkWorktreeCleanliness(projectDir, config);
  if (!treeRes.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[gsd-t-unattended] preflight-refusal: ${treeRes.reason || "dirty worktree"}`,
    );
    return {
      ok: false,
      dryRun: !!opts.dryRun,
      exitCode: treeRes.code || 8,
      reason: treeRes.reason,
    };
  }

  // Dry-run: pre-flight summary only. Do not touch the runtime directory.
  // Pre-launch checks have already passed at this point, so dry-run reports OK.
  if (opts.dryRun) {
    // Resolve claudeBin best-effort for the dry-run summary. A failure here
    // is NOT fatal for dry-run — we only need the field for display.
    let dryClaudeBin = "claude";
    try {
      dryClaudeBin = fn.resolveClaudePath();
    } catch (_) {
      /* best effort */
    }
    const summary = {
      mode: "dry-run",
      projectDir,
      hours: opts.hours,
      maxIterations: opts.maxIterations,
      branch: opts.branch,
      onDone: opts.onDone,
      verbose: opts.verbose,
      testMode: opts.testMode,
      platform: process.platform,
      claudeBin: dryClaudeBin,
      milestone: readMilestoneId(projectDir),
    };
    if (opts.verbose) {
      // eslint-disable-next-line no-console
      console.log(
        "[gsd-t-unattended] dry-run preflight:\n" +
          JSON.stringify(summary, null, 2),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[gsd-t-unattended] dry-run OK — project=${projectDir} hours=${opts.hours} max-iter=${opts.maxIterations} platform=${process.platform}`,
      );
    }
    return { ok: true, dryRun: true, exitCode: 0 };
  }

  // ── Resolve claudeBin BEFORE writing any runtime state ───────────────────
  // A failure here is a preflight-failure (code 2). No PID/state written.
  let claudeBin;
  try {
    claudeBin = fn.resolveClaudePath();
    if (!claudeBin || typeof claudeBin !== "string") {
      throw new Error("resolveClaudePath returned empty result");
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[gsd-t-unattended] preflight-failure: claude binary not resolvable: ${e.message}`,
    );
    return {
      ok: false,
      dryRun: false,
      exitCode: 2,
      reason: `claude binary not resolvable: ${e.message}`,
    };
  }

  // Real run — establish runtime directory and PID file.
  const dir = path.join(projectDir, UNATTENDED_DIR_REL);
  fs.mkdirSync(dir, { recursive: true });

  // Stale stop-sentinel cleanup (contract §10). A previous run may have
  // left a `.gsd-t/.unattended/stop` file on disk — remove it now, before
  // the main loop's stop-sentinel check would see it and halt immediately.
  // The helper logs a reassuring message when it removes a file.
  cleanStaleStopSentinel(projectDir);

  // Build initial state and write `initializing`.
  const state = initState({
    projectDir,
    hours: opts.hours,
    maxIterations: opts.maxIterations,
    claudeBin,
  });
  writeState(state, dir);

  // Write the PID file. Singleton enforcement (refusing if another
  // supervisor is already alive) is owned by the launch handshake — see
  // contract §7. We trust the caller for now and just write our PID.
  const pidPath = path.join(dir, PID_FILE);
  fs.writeFileSync(pidPath, String(process.pid) + "\n", "utf8");

  // Install terminal handlers BEFORE transitioning to `running` so a crash
  // mid-transition is still finalized.
  installTerminalHandlers(state, dir);

  // Transition to `running`. From this point the launch handshake (§7) will
  // observe `status === 'running'` and complete its 5-second readiness poll.
  state.status = "running";

  // ── Sleep prevention — acquire at `running` transition ───────────────────
  // The handle (caffeinate PID on darwin, null elsewhere) is stored on state
  // so finalizeState can release it on shutdown.
  try {
    const sleepHandle = fn.preventSleep("unattended-supervisor");
    state.sleepPreventionHandle = sleepHandle == null ? null : sleepHandle;
  } catch (_) {
    // Sleep prevention failures are non-fatal — log and continue.
    state.sleepPreventionHandle = null;
  }

  writeState(state, dir);

  if (opts.verbose) {
    // eslint-disable-next-line no-console
    console.log(
      `[gsd-t-unattended] running — sessionId=${state.sessionId} pid=${process.pid} milestone=${state.milestone} platform=${state.platform}`,
    );
  }

  // ── SUPERVISOR-INIT HOOK (contract §12) ──────────────────────────────────
  // State is fully populated and on disk. Run validateState + re-verify the
  // branch (defensive — branch may have changed between pre-launch and now).
  const vRes = fn.validateState(state);
  if (!vRes.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[gsd-t-unattended] supervisor-init: validateState failed: ${
        (vRes.errors || []).join("; ") || vRes.reason
      }`,
    );
    state.status = "failed";
    state.lastExit = 2;
    writeState(state, dir);
    _notifyAndFinalize(state, dir, fn, "failed");
    return {
      ok: false,
      dryRun: false,
      state,
      dir,
      exitCode: 2,
      reason: vRes.reason,
    };
  }
  const branchReVerify = fn.checkGitBranch(projectDir, config);
  if (!branchReVerify.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[gsd-t-unattended] supervisor-init: branch check re-verify failed: ${branchReVerify.reason}`,
    );
    state.status = "failed";
    state.lastExit = branchReVerify.code || 7;
    writeState(state, dir);
    _notifyAndFinalize(state, dir, fn, "failed");
    return {
      ok: false,
      dryRun: false,
      state,
      dir,
      exitCode: branchReVerify.code || 7,
      reason: branchReVerify.reason,
    };
  }

  // Main relay loop. Workers spawn fresh each iteration until the milestone
  // completes, the iteration cap is hit, a terminal exit code is returned,
  // a stop sentinel is observed, or a safety rails halt fires.
  runMainLoop(state, dir, opts, deps, { fn, config });

  // Terminal notification + explicit finalize. finalizeState is idempotent —
  // the process.on('exit') handler will be a no-op after this.
  _notifyAndFinalize(state, dir, fn);

  return {
    ok: state.status !== "failed",
    dryRun: false,
    state,
    dir,
    exitCode: mapStatusToExitCode(state),
  };
}

// ── _notifyAndFinalize ──────────────────────────────────────────────────────
//
// Fire the terminal-transition notification, then call finalizeState. Both
// steps are best-effort and must never throw from a shutdown path.

function _notifyAndFinalize(state, dir, fn, terminalHint) {
  try {
    const status = terminalHint || state.status;
    const started = Date.parse(state.startedAt || "");
    let durStr = "";
    if (!Number.isNaN(started)) {
      const ms = Math.max(0, Date.now() - started);
      const totalMins = Math.round(ms / 60000);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      durStr = `${hrs}h ${mins}m`;
    }
    const logPath =
      state.logPath || path.join(UNATTENDED_DIR_REL, RUN_LOG);

    if (status === "done") {
      fn.notify(
        "GSD-T Unattended: Complete",
        `Milestone ${state.milestone || ""} reached COMPLETED in ${durStr}`,
        "success",
      );
    } else if (status === "failed") {
      fn.notify(
        "GSD-T Unattended: Failed",
        `Exit ${state.lastExit || 1} — see ${logPath}`,
        "error",
      );
    } else if (status === "stopped") {
      fn.notify(
        "GSD-T Unattended: Stopped",
        `User stop after iter ${state.iter || 0}`,
        "warn",
      );
    }
  } catch (_) {
    // best effort — never throw from a shutdown path
  }
  // Release sleep prevention via the wired (or injected) helper BEFORE
  // finalizeState runs so the internal releaseSleepPrevention call is a no-op.
  try {
    releaseSleepPrevention(state, fn && fn.releaseSleep);
  } catch (_) {
    // best effort
  }
  try {
    finalizeState(state, dir, terminalHint);
  } catch (_) {
    // best effort
  }
}

// ── runMainLoop ─────────────────────────────────────────────────────────────

/**
 * The core worker relay loop. Each iteration:
 *   1. Check terminal conditions (isDone / stopRequested)
 *   2. Increment iter, update lastWorkerStartedAt, write state
 *   3. Spawn a worker via `_spawnWorker` (real spawnSync or injected shim)
 *   4. Map the exit code via `mapHeadlessExitCode`
 *   5. Append worker output to run.log
 *   6. Update state with lastExit/lastWorkerFinishedAt/lastElapsedMs, write
 *   7. Classify terminal exit branches and transition status if needed
 *
 * Task 3 will add the stop-sentinel check at step 1 (stub exists via
 * `stopRequested`). Task 4 will replace `_spawnWorker` with the real
 * cross-platform helper.
 */
function runMainLoop(state, dir, opts, deps, ctx) {
  deps = deps || {};
  ctx = ctx || {};
  // Safety rails + platform helpers wired by doUnattended (fn) + loaded
  // config. When runMainLoop is called directly by tests, fall back to real
  // impls / defaults so the loop remains usable standalone.
  const fn = ctx.fn || {
    checkIterationCap: deps._checkIterationCap || checkIterationCap,
    checkWallClockCap: deps._checkWallClockCap || checkWallClockCap,
    validateState: deps._validateState || validateState,
    detectGutter: deps._detectGutter || detectGutter,
    detectBlockerSentinel: deps._detectBlockerSentinel || detectBlockerSentinel,
  };
  const config = ctx.config || SAFETY_DEFAULTS;

  // --test-mode uses a built-in stub that completes on the first iteration.
  // Explicit deps override test-mode.
  const useTestStub = !!opts.testMode && !deps._spawnWorker;
  const spawnWorker =
    deps._spawnWorker || (useTestStub ? _testModeSpawnWorker : _spawnWorker);
  const milestoneComplete =
    deps._isMilestoneComplete || (useTestStub ? () => true : isMilestoneComplete);
  const stopCheck = deps._stopRequested || stopRequested;
  const workerTimeoutMs = opts.workerTimeoutMs || DEFAULT_WORKER_TIMEOUT_MS;
  const projectDir = state.projectDir;

  while (!isDone(state) && !stopCheck(projectDir)) {
    // ── PRE-WORKER HOOK (contract §12) ─────────────────────────────────────
    // Refusal → halt with status=failed, lastExit=6 (caps) or 2 (validate).
    const capIter = fn.checkIterationCap(state, config);
    if (!capIter.ok) {
      state.status = "failed";
      state.lastExit = capIter.code || 6;
      writeState(state, dir);
      break;
    }
    const capWall = fn.checkWallClockCap(state, config);
    if (!capWall.ok) {
      state.status = "failed";
      state.lastExit = capWall.code || 6;
      writeState(state, dir);
      break;
    }
    const vRes = fn.validateState(state);
    if (!vRes.ok) {
      state.status = "failed";
      state.lastExit = vRes.code || 2;
      writeState(state, dir);
      break;
    }

    // Pre-spawn bookkeeping
    state.iter = (state.iter || 0) + 1;
    const workerStart = new Date();
    state.lastWorkerStartedAt = workerStart.toISOString();
    writeState(state, dir);

    let res;
    try {
      res = spawnWorker(state, {
        cwd: projectDir,
        timeout: workerTimeoutMs,
        verbose: !!opts.verbose,
      });
    } catch (e) {
      // Defensive: a real spawnSync shouldn't throw, but a shim could.
      res = { status: 3, stdout: "", stderr: String((e && e.message) || e), signal: null };
    }
    res = res || { status: null, stdout: "", stderr: "", signal: null };

    const workerEnd = new Date();
    const elapsedMs = workerEnd.getTime() - workerStart.getTime();
    const stdout = typeof res.stdout === "string" ? res.stdout : "";
    const stderr = typeof res.stderr === "string" ? res.stderr : "";

    // Timeout detection: spawnSync sets status=null and signal='SIGTERM' on
    // timeout (legacy shim), OR sets res.timedOut=true (platform.spawnWorker).
    // Map to contract code 124.
    let exitCode;
    if (res.timedOut === true || res.status === null || res.signal === "SIGTERM") {
      exitCode = 124;
    } else {
      exitCode = mapHeadlessExitCode(res.status, stdout + "\n" + stderr);
    }

    // Append the full worker output to run.log (never truncate).
    _appendRunLog(dir, state.iter, workerEnd, exitCode, stdout, stderr);

    // Post-spawn state update
    state.lastExit = exitCode;
    state.lastWorkerFinishedAt = workerEnd.toISOString();
    state.lastElapsedMs = elapsedMs;
    writeState(state, dir);

    // ── POST-WORKER HOOK (contract §12) ────────────────────────────────────
    // Read the tail of run.log for pattern detection. ~200 lines is enough
    // to span the last several iteration blocks for the gutter detector.
    let runLogTail = "";
    try {
      const logPath = path.join(dir, RUN_LOG);
      if (fs.existsSync(logPath)) {
        const all = fs.readFileSync(logPath, "utf8");
        const lines = all.split(/\r?\n/);
        runLogTail = lines.slice(-200).join("\n");
      }
    } catch (_) {
      // best effort — tail read failure does not halt the loop
    }
    const blocker = fn.detectBlockerSentinel(runLogTail);
    if (!blocker.ok) {
      state.status = "failed";
      state.lastExit = blocker.code || 6;
      writeState(state, dir);
      break;
    }
    const gutter = fn.detectGutter(state, runLogTail, config);
    if (!gutter.ok) {
      state.status = "failed";
      state.lastExit = gutter.code || 6;
      writeState(state, dir);
      break;
    }

    // Terminal exit classification
    if (exitCode === 0) {
      // Success — check if the milestone is now complete.
      if (milestoneComplete(projectDir, state.milestone)) {
        state.status = "done";
        writeState(state, dir);
        break;
      }
      // Not yet done — continue relay.
      continue;
    }
    if (exitCode === 4) {
      // Unrecoverable blocker.
      state.status = "failed";
      writeState(state, dir);
      break;
    }
    if (exitCode === 5) {
      // Command dispatch failure — worker invocation is broken.
      state.status = "failed";
      writeState(state, dir);
      break;
    }
    if (exitCode === 124) {
      // Timeout — continue unless the iter cap is hit on the next check.
      continue;
    }
    // Non-terminal (1/2/3) — continue the relay.
  }

  // If we exited because the user dropped a stop sentinel and no terminal
  // status has been assigned yet, transition to 'stopped' now (contract §10).
  // The sentinel file itself is NOT removed by the supervisor — it stays on
  // disk as evidence, to be cleaned by the next launch via
  // `cleanStaleStopSentinel`.
  if (!isTerminal(state.status) && stopCheck(projectDir)) {
    state.status = "stopped";
    writeState(state, dir);
  }
  return state;
}

// ── _spawnWorker ────────────────────────────────────────────────────────────

/**
 * Spawn a fresh `claude -p /gsd-t-resume` worker via `spawnSync`. Returns a
 * normalized `{ status, stdout, stderr, signal }` result. Task 4 replaces
 * this with the cross-platform helper from `bin/gsd-t-unattended-platform.js`.
 *
 * @param {object} state — current supervisor state (reads `claudeBin`)
 * @param {{cwd: string, timeout: number, verbose?: boolean}} opts
 * @returns {{status: (number|null), stdout: string, stderr: string, signal: (string|null)}}
 */
function _spawnWorker(state, opts) {
  const bin = (state && state.claudeBin) || resolveClaudePath();
  const res = platformSpawnWorker(opts.cwd, opts.timeout, {
    bin,
    args: ["-p", "/gsd-t-resume"],
  });
  return {
    status: typeof res.status === "number" ? res.status : null,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    signal: res.signal || null,
    timedOut: !!res.timedOut,
    error: res.error || null,
  };
}

// ── _testModeSpawnWorker ────────────────────────────────────────────────────

/**
 * Built-in stub worker for `--test-mode`. Returns a canned "milestone
 * complete" result so the loop terminates in one iteration without invoking
 * a real `claude` binary. Exists for CI/smoke tests and for the Task 1
 * "real run" test that must not hang on the real `claude` CLI.
 */
function _testModeSpawnWorker(state, _opts) {
  return {
    status: 0,
    stdout: `[test-mode] stub worker iter=${state.iter} milestone=${state.milestone} COMPLETE\n`,
    stderr: "",
    signal: null,
  };
}

// ── _appendRunLog ───────────────────────────────────────────────────────────

/**
 * Append a single worker iteration to `run.log`. Format:
 *   --- ITER {n} @ {ISO8601} exit={code} ---
 *   {stdout}
 *   {stderr}
 *
 * Never truncates. Creates the log file if it does not exist.
 */
function _appendRunLog(dir, iter, when, exitCode, stdout, stderr) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, RUN_LOG);
    const iso = when instanceof Date ? when.toISOString() : String(when);
    const header = `--- ITER ${iter} @ ${iso} exit=${exitCode} ---\n`;
    const body =
      (stdout || "") +
      (stdout && !stdout.endsWith("\n") ? "\n" : "") +
      (stderr ? "[stderr]\n" + stderr + (stderr.endsWith("\n") ? "" : "\n") : "");
    fs.appendFileSync(logPath, header + body, "utf8");
  } catch (_) {
    // best effort — never throw from the main loop
  }
}

// ── isMilestoneComplete ─────────────────────────────────────────────────────

/**
 * Returns true if `.gsd-t/progress.md` indicates the given milestone is
 * complete. Checks for either:
 *   - The string `{milestoneId} COMPLETE` (case-insensitive) anywhere in the
 *     file (matches the `Status: M36 COMPLETE` convention used in progress.md)
 *   - A row containing the milestone ID in a completed-milestones table,
 *     detected heuristically by a `| M36 ... | complete` row.
 *
 * @param {string} projectDir
 * @param {string} milestoneId
 * @returns {boolean}
 */
function isMilestoneComplete(projectDir, milestoneId) {
  if (!milestoneId || milestoneId === "UNKNOWN") return false;
  try {
    const p = path.join(projectDir, ".gsd-t", "progress.md");
    if (!fs.existsSync(p)) return false;
    const body = fs.readFileSync(p, "utf8");
    const idEsc = milestoneId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Form 1: "{id} COMPLETE" or "{id} COMPLETED"
    const directRe = new RegExp(`\\b${idEsc}\\b[^\\n]*\\bCOMPLETED?\\b`, "i");
    if (directRe.test(body)) return true;
    // Form 2: "Status: complete" on a line mentioning the milestone id
    const lines = body.split(/\r?\n/);
    for (const ln of lines) {
      if (new RegExp(`\\b${idEsc}\\b`).test(ln) && /\bcomplete(d)?\b/i.test(ln)) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ── isDone ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the supervisor should stop looping: a terminal status was
 * reached OR the iteration cap was hit.
 */
function isDone(state) {
  if (!state) return true;
  if (isTerminal(state.status)) return true;
  if (
    typeof state.iter === "number" &&
    typeof state.maxIterations === "number" &&
    state.iter >= state.maxIterations
  ) {
    return true;
  }
  return false;
}

// ── stopRequested ───────────────────────────────────────────────────────────

/**
 * Check for the stop sentinel file `.gsd-t/.unattended/stop`. Returns true
 * if the user has requested a halt (contract §10). The supervisor checks
 * this between workers; the file itself is NEVER removed by the supervisor
 * on detection — it stays on disk as evidence, and `cleanStaleStopSentinel`
 * wipes it on the next launch.
 */
function stopRequested(projectDir) {
  try {
    const p = path.join(projectDir, UNATTENDED_DIR_REL, "stop");
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

// ── cleanStaleStopSentinel ──────────────────────────────────────────────────

/**
 * Remove any pre-existing `.gsd-t/.unattended/stop` file left over from a
 * previous supervisor run. Called ONCE at launch, before the first worker
 * is spawned, so the new run is not immediately halted by a stale sentinel.
 *
 * If a stale file is found, the helper logs a reassuring message of the form
 * `"Removed stale stop sentinel from {timestamp}"` where `{timestamp}` is
 * the sentinel file's mtime (ISO8601). If no stale file exists, the helper
 * is a silent no-op.
 *
 * Contract §10: "Next launch detects the stale sentinel and removes it
 * before starting, after printing a reassuring message."
 *
 * @param {string} projectDir
 * @param {(msg: string) => void} [log] — optional logger (defaults to console.log)
 * @returns {boolean} true if a stale sentinel was removed
 */
function cleanStaleStopSentinel(projectDir, log) {
  const logger = typeof log === "function" ? log : (m) => {
    // eslint-disable-next-line no-console
    console.log(m);
  };
  try {
    const p = path.join(projectDir, UNATTENDED_DIR_REL, "stop");
    if (!fs.existsSync(p)) return false;
    let mtimeIso = "unknown";
    try {
      mtimeIso = fs.statSync(p).mtime.toISOString();
    } catch (_) {
      // best effort
    }
    fs.unlinkSync(p);
    logger(`[gsd-t-unattended] Removed stale stop sentinel from ${mtimeIso}`);
    return true;
  } catch (_) {
    return false;
  }
}

// ── releaseSleepPrevention ──────────────────────────────────────────────────

/**
 * Release any active sleep-prevention handle recorded in the supervisor
 * state. Task 4 (m36-cross-platform) will wire this into the real platform
 * helper (`caffeinate` on darwin, `powercfg`/`SetThreadExecutionState` on
 * win32, `systemd-inhibit` on linux). For Task 3 this is a stub that simply
 * clears the handle field so `finalizeState` can be idempotent and safe to
 * call on shutdown.
 *
 * @param {object} state
 * @returns {boolean} true if a handle was released, false if none was set
 */
function releaseSleepPrevention(state, releaseFn) {
  if (!state || typeof state !== "object") return false;
  if (state.sleepPreventionHandle == null) return false;
  const handle = state.sleepPreventionHandle;
  // Call the real platform helper (or injected fake). Never throw from a
  // shutdown path.
  try {
    const release = typeof releaseFn === "function" ? releaseFn : releaseSleep;
    release(handle);
  } catch (_) {
    // best effort
  }
  state.sleepPreventionHandle = null;
  return true;
}

// ── mapStatusToExitCode ─────────────────────────────────────────────────────

/**
 * Terminal status → CLI exit code. Used for the `gsd-t unattended` process
 * exit code.
 */
function mapStatusToExitCode(state) {
  if (!state) return 1;
  switch (state.status) {
    case "done":
      return 0;
    case "stopped":
      return 0;
    case "failed":
      return state.lastExit || 1;
    case "crashed":
      return 3;
    default:
      return 0; // still running / initializing — supervisor hasn't halted
  }
}

// ── installTerminalHandlers ─────────────────────────────────────────────────

/**
 * Wire `process.on('exit')` (and SIGINT/SIGTERM where possible) so an
 * unexpected termination still removes the PID file and writes a terminal
 * status. Safe to call multiple times — guarded by a closure flag.
 */
function installTerminalHandlers(state, dir) {
  let finalized = false;
  const finalizeOnce = (terminal) => {
    if (finalized) return;
    finalized = true;
    finalizeState(state, dir, terminal);
  };

  process.on("exit", () => {
    // 'exit' only allows synchronous work — finalizeState is sync.
    finalizeOnce(undefined); // default → 'crashed' if non-terminal
  });

  // Best-effort signal handlers. Don't override existing handlers; just
  // chain a finalization step. On SIGINT/SIGTERM we let process.exit() run
  // the 'exit' handler.
  const onSignal = (sig) => {
    if (state && !isTerminal(state.status)) {
      // SIGINT / SIGTERM are user-initiated halts → 'stopped'
      finalizeOnce("stopped");
    }
    // Re-raise default behavior
    process.exit(0);
  };
  try {
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  } catch (_) {
    // Some environments don't support these — ignore.
  }
}

// ── CLI dispatch ────────────────────────────────────────────────────────────

if (require.main === module) {
  const result = doUnattended(process.argv.slice(2));
  if (!result.ok) {
    process.exitCode = result.exitCode || 1;
  }
}
