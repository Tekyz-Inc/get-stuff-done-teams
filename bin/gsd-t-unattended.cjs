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
const { mapHeadlessExitCode } = require("./headless-exit-codes.cjs");

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
} = require("./gsd-t-unattended-safety.cjs");

// Cross-platform helpers (m36-cross-platform) — the single place where
// process.platform branches live. The rest of this file stays platform-agnostic.
const {
  resolveClaudePath,
  isAlive,
  spawnWorker: platformSpawnWorker,
  preventSleep,
  releaseSleep,
  notify,
} = require("./gsd-t-unattended-platform.cjs");

// Event stream (M38 ES) — additive, non-blocking. `_emit` swallows its own
// errors per unattended-event-stream-contract.md §6.
const { appendEvent: _esAppendEvent } = require("./event-stream.cjs");
function _emit(projectDir, ev) {
  try { _esAppendEvent(projectDir, ev); } catch (_) { /* never halt the loop */ }
}

// M44 D9 (v1.5.0) — planner-driven multi-worker fan-out. Lazy-loaded so unit
// tests can stub via deps._runParallel without touching the real module.
let _parallelModule = null;
function _loadRunParallel() {
  if (_parallelModule) return _parallelModule;
  try {
    _parallelModule = require("./gsd-t-parallel.cjs");
  } catch {
    _parallelModule = { runParallel: () => ({ workerCount: 0, parallelTasks: [], plan: [] }) };
  }
  return _parallelModule;
}

// M42 D1 — transcript tee. Captures each worker's stdout lines to an ndjson
// file and registers the spawn so the dashboard sidebar can list + render it.
// Best-effort: every call is swallowed so tee failures never halt the loop.
const transcriptTee = require("./gsd-t-transcript-tee.cjs");

// M43 liveness heartbeat watchdog (contract v1.4.0 §"Heartbeat Watchdog") —
// pure, testable staleness checker against .gsd-t/events/YYYY-MM-DD.jsonl mtime.
const { checkHeartbeat: _checkHeartbeat } = require("./gsd-t-unattended-heartbeat.cjs");

// ── Constants ───────────────────────────────────────────────────────────────

const CONTRACT_VERSION = "1.5.0";
const UNATTENDED_DIR_REL = path.join(".gsd-t", ".unattended");
const PID_FILE = "supervisor.pid";
const STATE_FILE = "state.json";
const STATE_TMP_FILE = "state.json.tmp";
const RUN_LOG = "run.log";

const DEFAULT_HOURS = 24;
const DEFAULT_MAX_ITERATIONS = 200;
// M43 liveness heartbeat (contract v1.1.0 §"Heartbeat Watchdog"):
//   Healthy workers producing events every poll cycle (60 s) run under the
//   absolute backstop — raised from 270 s to 1 hour so long-running legitimate
//   iterations are NOT cut. Stuck workers are detected by the heartbeat
//   checker via events/YYYY-MM-DD.jsonl mtime and SIGTERM'd at the 5-min
//   staleness threshold. The 270 s cache-pacing rationale is subsumed by the
//   heartbeat check, which fires long before cache-miss cost becomes
//   dominant.
const DEFAULT_WORKER_TIMEOUT_MS = 60 * 60 * 1000; // 1 h absolute backstop (contract §13/§16)
const DEFAULT_STALE_HEARTBEAT_MS = 5 * 60 * 1000; // 5 min — stuck-worker threshold
const DEFAULT_HEARTBEAT_POLL_MS = 60 * 1000; // 60 s poll cadence

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
  _spawnWorkerFanOut,
  _partitionTasks,
  _appendRunLog,
  CONTRACT_VERSION,
  UNATTENDED_DIR_REL,
  TERMINAL_STATUSES,
  VALID_STATUSES,
  DEFAULT_WORKER_TIMEOUT_MS,
  DEFAULT_STALE_HEARTBEAT_MS,
  DEFAULT_HEARTBEAT_POLL_MS,
};

function _reconcile(state, results) {
  if (!Array.isArray(results) || results.length === 0) return;
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    // append-only completedTasks (preserve order, dedupe)
    if (Array.isArray(r.tasksDone) && r.tasksDone.length > 0) {
      const current = new Set(state.completedTasks || []);
      for (const t of r.tasksDone) {
        if (!current.has(t)) {
          state.completedTasks = (state.completedTasks || []).concat([t]);
          current.add(t);
        }
      }
    }
    // last-writer-wins on status — but 'error' is sticky: once set, it stays
    // until the next explicit non-error status in a later iter.
    if (r.status && r.status !== state.status) {
      state.status = r.status;
    }
    // verifyNeeded is OR-across-results: any iter that flags it wins.
    if (r.verifyNeeded === true) {
      state.verifyNeeded = true;
    }
    // artifacts: append-only, concat arrays.
    if (Array.isArray(r.artifacts) && r.artifacts.length > 0) {
      state.artifacts = (state.artifacts || []).concat(r.artifacts);
    }
  }
  // NOTE: `state.iter` is advanced by the main while loop (pre-M46 contract:
  // one increment per fan-out pass, regardless of worker/batch count). We do
  // NOT advance it here — doing so would double-increment against the
  // existing supervisor-contract invariant (surfaced by m43/m44 tests).
  state.lastBatch = {
    size: results.length,
    endedAt: new Date().toISOString(),
    errorCount: results.filter(r => r && r.status === 'error').length,
  };
}

// M46 D1 T2 — expose the extracted single-iter body for future unit tests
// (T7) and the iter-parallel driver (T4/T5). Kept out of the main exports
// block so consumers don't accidentally import implementation details.
module.exports.__test__ = { _runOneIter, _computeIterBatchSize, _runIterParallel, _reconcile };

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
      case "worker-timeout": {
        // Per unattended-supervisor-contract §6 + §16: user-supplied override
        // of DEFAULT_WORKER_TIMEOUT_MS (270 s). Accepts ms. Must not be raised
        // above 270000 without a separate user-approved contract revision —
        // the supervisor clamps but does not refuse silently.
        const n = parseInt(val, 10);
        if (Number.isFinite(n) && n > 0) {
          out.workerTimeoutMs = n;
        }
        break;
      }
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
 * `bin/gsd-t-unattended-platform.cjs`. For Task 1 we just shell out to
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
async function doUnattended(argv, deps) {
  deps = deps || {};
  const rawArgv = argv || [];

  // --watch rejection (headless-default-contract §2) — unattended is detached
  // by definition; passing --watch is a category error. Refuse fast so the
  // user sees a clear message before any state.json / PID work happens.
  if (
    Array.isArray(rawArgv) &&
    rawArgv.some(
      (a) => typeof a === "string" && (a === "--watch" || a.startsWith("--watch=")),
    )
  ) {
    // eslint-disable-next-line no-console
    console.error(
      "[gsd-t-unattended] --watch is incompatible with unattended.\n" +
        "Unattended supervisor is detached by definition.\n" +
        "Run /gsd-t-unattended-watch from your interactive session to see live activity.",
    );
    return {
      ok: false,
      dryRun: false,
      exitCode: 2,
      reason: "--watch is incompatible with unattended",
    };
  }

  const opts = parseArgs(rawArgv);
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
  if (
    opts.workerTimeoutMs === undefined &&
    typeof config.workerTimeoutMs === "number" &&
    config.workerTimeoutMs > 0
  ) {
    opts.workerTimeoutMs = config.workerTimeoutMs;
  }
  if (
    opts.staleHeartbeatMs === undefined &&
    typeof config.staleHeartbeatMs === "number" &&
    config.staleHeartbeatMs > 0
  ) {
    opts.staleHeartbeatMs = config.staleHeartbeatMs;
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
  // Contract v1.4.1: write JSON fingerprint {pid, projectDir, startedAt}
  // so resume-time liveness checks can distinguish "our supervisor" from
  // "some other process recycled this PID" (macOS PID recycling).
  const { writePidFile } = require("./supervisor-pid-fingerprint.cjs");
  writePidFile(projectDir, process.pid);

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
    // M39 D2 — append watch-progress tree below banner (best-effort).
    // Banner preserved verbatim above; renderer output appended below per
    // watch-progress-contract.md §7. Never throws into the supervisor loop.
    try {
      const wp = require("./watch-progress.js");
      const stateDir = path.join(projectDir, ".gsd-t", ".watch-state");
      const tree = wp.buildTree(stateDir);
      const rendered = wp.renderTree(tree, { currentAgent: state.sessionId });
      if (rendered) {
        // eslint-disable-next-line no-console
        console.log(rendered);
      }
    } catch (_) {
      /* watch-progress is best-effort; never crash the watch */
    }
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
  await runMainLoop(state, dir, opts, deps, { fn, config });

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
async function runMainLoop(state, dir, opts, deps, ctx) {
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
  // M44 D9 (v1.5.0) — planner injected for multi-worker iter fan-out.
  // Tests stub via deps._runParallel; production lazy-loads from gsd-t-parallel.cjs.
  const runParallelImpl =
    deps._runParallel || ((o) => _loadRunParallel().runParallel(o));
  const stopCheck = deps._stopRequested || stopRequested;
  const workerTimeoutMs = opts.workerTimeoutMs || DEFAULT_WORKER_TIMEOUT_MS;
  const staleHeartbeatMs =
    (typeof opts.staleHeartbeatMs === "number" && opts.staleHeartbeatMs > 0
      ? opts.staleHeartbeatMs
      : (typeof config.staleHeartbeatMs === "number" && config.staleHeartbeatMs > 0
        ? config.staleHeartbeatMs
        : DEFAULT_STALE_HEARTBEAT_MS));
  const heartbeatPollMs =
    (typeof opts.heartbeatPollMs === "number" && opts.heartbeatPollMs > 0
      ? opts.heartbeatPollMs
      : DEFAULT_HEARTBEAT_POLL_MS);
  // Test hook: deps._checkHeartbeat lets tests substitute the staleness
  // checker without mocking fs. Production uses the real module.
  const heartbeatImpl = deps._checkHeartbeat || _checkHeartbeat;
  // Test hook: deps._disableHeartbeat lets unit tests bypass the async path
  // for test-mode / stub spawns that return synchronously.
  const heartbeatEnabled = !deps._disableHeartbeat && !useTestStub;
  const projectDir = state.projectDir;

  // M46 D1 T2 — pure extract-method refactor. The body of each iteration
  // now lives in the top-level `_runOneIter` helper (below). The while loop
  // itself is unchanged in semantics: stop-check and isDone evaluate per
  // pass, and any terminal state.status ({"done","failed"}) written by the
  // iter body causes us to break, matching every pre-refactor `break` path.
  // Non-terminal outcomes fall through to the next iteration, matching the
  // pre-refactor `continue` paths.
  const iterCtx = {
    dir,
    fn,
    config,
    spawnWorker,
    milestoneComplete,
    runParallelImpl,
    workerTimeoutMs,
    heartbeatImpl,
    heartbeatEnabled,
    staleHeartbeatMs,
    heartbeatPollMs,
    projectDir,
    verbose: !!opts.verbose,
  };
  while (!isDone(state) && !stopCheck(projectDir)) {
    const batchSize = _computeIterBatchSize(state, opts);
    const _batchStartMs = Date.now();
    try {
      fs.appendFileSync(
        path.join(dir, RUN_LOG),
        `[iter-batch-start] batch-size=${batchSize} iter=${state.iter} ts=${new Date(_batchStartMs).toISOString()}\n`,
        "utf8"
      );
    } catch (_) { /* best effort */ }
    const results = await _runIterParallel(state, opts, (s, o) => _runOneIter(s, iterCtx), batchSize);
    _reconcile(state, results);
    try {
      const _ok = results.filter((r) => r.status !== "error").length;
      const _fail = results.length - _ok;
      const _durSec = ((Date.now() - _batchStartMs) / 1000).toFixed(1);
      fs.appendFileSync(
        path.join(dir, RUN_LOG),
        `[iter-batch-complete] size=${results.length} ok=${_ok} fail=${_fail} duration=${_durSec}s iter=${state.iter}\n`,
        "utf8"
      );
    } catch (_) { /* best effort */ }
    if (isTerminal(state.status)) break;
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

// ── _runOneIter (M46 D1 T2) ─────────────────────────────────────────────────

/**
 * Body of a single supervisor iteration, extracted verbatim from the
 * `runMainLoop` while-loop (pre-M46-D1). Mutates `state` in place exactly as
 * the original body did — all writeState calls, event-stream emits, run.log
 * and token-log appends, heartbeat wiring, fan-out dispatch, and exit-code
 * classification are preserved line-for-line.
 *
 * `opts` here is the per-iter context bundle assembled in runMainLoop (not
 * the supervisor-level opts object). It carries the closure values the body
 * used to read from the enclosing scope: fn, config, dir, projectDir,
 * spawnWorker, milestoneComplete, runParallelImpl, workerTimeoutMs,
 * heartbeatImpl, heartbeatEnabled, staleHeartbeatMs, heartbeatPollMs, verbose.
 *
 * Returns an IterResult per iter-parallel-contract.md v1.0.0 §4. T2 emits a
 * minimal shape (tasksDone = []) — T4/T5 will populate tasksDone and use
 * `status` to drive `_computeIterBatchSize`. For now the while-loop driver
 * consumes only `isTerminal(state.status)`; the returned value is forward-
 * compatible scaffolding.
 */
async function _runOneIter(state, opts) {
  const {
    dir, fn, config, spawnWorker, milestoneComplete, runParallelImpl,
    workerTimeoutMs, heartbeatImpl, heartbeatEnabled,
    staleHeartbeatMs, heartbeatPollMs, projectDir,
  } = opts;

  const _result = (status, extras) => ({
    iter: state.iter,
    status,
    tasksDone: [],
    verifyNeeded: status === "verify-needed",
    artifacts: extras || {},
  });

  // ── PRE-WORKER HOOK (contract §12) ─────────────────────────────────────
  // Refusal → halt with status=failed, lastExit=6 (caps) or 2 (validate).
  const capIter = fn.checkIterationCap(state, config);
  if (!capIter.ok) {
    state.status = "failed";
    state.lastExit = capIter.code || 6;
    writeState(state, dir);
    return _result("failed", { errorMessage: `iteration_cap:${state.lastExit}` });
  }
  const capWall = fn.checkWallClockCap(state, config);
  if (!capWall.ok) {
    state.status = "failed";
    state.lastExit = capWall.code || 6;
    writeState(state, dir);
    return _result("failed", { errorMessage: `wall_clock_cap:${state.lastExit}` });
  }
  const vRes = fn.validateState(state);
  if (!vRes.ok) {
    state.status = "failed";
    state.lastExit = vRes.code || 2;
    writeState(state, dir);
    return _result("failed", { errorMessage: `validate_state:${state.lastExit}` });
  }

  // Pre-spawn bookkeeping
  state.iter = (state.iter || 0) + 1;
  const workerStart = new Date();
  state.lastWorkerStartedAt = workerStart.toISOString();
  writeState(state, dir);

  _emit(projectDir, {
    ts: workerStart.toISOString(),
    iter: state.iter,
    type: "task_start",
    source: "supervisor",
    milestone: state.milestone || "",
    wave: state.wave || "",
    task: state.nextTask || "",
  });

  let res;
  const workerStartMs = workerStart.getTime();
  const hbOpts = heartbeatEnabled
    ? {
        onHeartbeatCheck: () =>
          heartbeatImpl({
            projectDir,
            workerStartedAt: workerStartMs,
            staleHeartbeatMs,
          }),
        heartbeatPollMs,
      }
    : {};

  // M44 D9 (v1.5.0) — planner-driven fan-out decision for this iter.
  // Ask runParallel whether the current task graph supports ≥2 concurrent
  // workers. Any failure in the planner path MUST fall back to the single-
  // worker spawn — the parallel path is purely additive.
  let iterPlan = null;
  try {
    iterPlan = runParallelImpl({
      projectDir,
      mode: "unattended",
      milestone: state.milestone || null,
      dryRun: true,
    });
  } catch (e) {
    iterPlan = null;
    _emit(projectDir, {
      iter: state.iter,
      type: "parallelism_reduced",
      source: "supervisor",
      original_count: null,
      reduced_count: 1,
      reason: `planner_error:${(e && e.message) || "unknown"}`,
    });
  }
  const fanOutCount = iterPlan && Number(iterPlan.workerCount) >= 2 ? Number(iterPlan.workerCount) : 1;
  const parallelTaskIds = iterPlan && Array.isArray(iterPlan.parallelTasks) ? iterPlan.parallelTasks : [];
  const subsets = fanOutCount >= 2 ? _partitionTasks(parallelTaskIds, fanOutCount) : null;
  const useFanOut = !!(subsets && subsets.length >= 2);

  try {
    if (useFanOut) {
      _emit(projectDir, {
        ts: workerStart.toISOString(),
        iter: state.iter,
        type: "fan_out",
        source: "supervisor",
        worker_count: subsets.length,
        task_ids: parallelTaskIds,
      });
      res = await _spawnWorkerFanOut(state, {
        cwd: projectDir,
        timeout: workerTimeoutMs,
        verbose: !!opts.verbose,
        ...hbOpts,
      }, spawnWorker, subsets);
    } else {
      res = spawnWorker(state, {
        cwd: projectDir,
        timeout: workerTimeoutMs,
        verbose: !!opts.verbose,
        ...hbOpts,
      });
      if (res && typeof res.then === "function") {
        res = await res;
      }
    }
  } catch (e) {
    // Defensive: a real spawnSync shouldn't throw, but a shim could.
    res = { status: 3, stdout: "", stderr: String((e && e.message) || e), signal: null };
  }
  res = res || { status: null, stdout: "", stderr: "", signal: null };

  const workerEnd = new Date();
  const elapsedMs = workerEnd.getTime() - workerStart.getTime();
  const stdout = typeof res.stdout === "string" ? res.stdout : "";
  const stderr = typeof res.stderr === "string" ? res.stderr : "";

  // Kill-path detection (M43 heartbeat watchdog precedes wall-clock timeout):
  //   - res.staleHeartbeat === true → heartbeat fired, code 125 (new)
  //   - res.timedOut === true OR status=null+SIGTERM → wall-clock, code 124
  // Heartbeat wins on ties because it's the more specific signal.
  let exitCode;
  let lastExitReason = null;
  if (res.staleHeartbeat === true) {
    exitCode = 125;
    lastExitReason = "stale_heartbeat";
  } else if (res.timedOut === true || res.status === null || res.signal === "SIGTERM") {
    exitCode = 124;
    lastExitReason = "worker_timeout";
  } else {
    exitCode = mapHeadlessExitCode(res.status, stdout + "\n" + stderr);
  }

  // v3.13.11 Bug 1: when a watchdog fires, make the event explicit in
  // run.log so operators can see WHICH iteration was cut without inferring
  // from exit codes. The marker is prepended to stdout and written in the
  // single per-iter run.log append (no duplicate header).
  let loggedStdout = stdout;
  if (exitCode === 124) {
    const marker =
      `[worker_timeout] iter=${state.iter} budget=${workerTimeoutMs}ms ` +
      `elapsed=${elapsedMs}ms — absolute-backstop SIGTERM delivered, ` +
      `supervisor continues relay per contract §16.\n`;
    loggedStdout = marker + (stdout || "");
  } else if (exitCode === 125) {
    const reason = res.heartbeatReason || "no recent events.jsonl writes";
    const marker =
      `[stale_heartbeat] iter=${state.iter} threshold=${staleHeartbeatMs}ms ` +
      `elapsed=${elapsedMs}ms reason="${reason}" — ` +
      `heartbeat watchdog SIGTERM delivered, supervisor continues relay.\n`;
    loggedStdout = marker + (stdout || "");
  }

  // Append the full worker output to run.log (never truncate).
  _appendRunLog(dir, state.iter, workerEnd, exitCode, loggedStdout, stderr);

  // Append to token-log.md (Fix 1, v3.12.12) — supervisor workers write rows
  // so the log captures headless/unattended activity, not just interactive spawns.
  _appendTokenLog(projectDir, {
    dtStart: workerStart.toISOString().slice(0, 16).replace("T", " "),
    dtEnd: workerEnd.toISOString().slice(0, 16).replace("T", " "),
    command: "gsd-t-resume",
    durationS: Math.round(elapsedMs / 1000),
    exitCode,
    iter: state.iter,
  });

  // Post-spawn state update
  state.lastExit = exitCode;
  state.lastWorkerFinishedAt = workerEnd.toISOString();
  state.lastElapsedMs = elapsedMs;
  if (lastExitReason) {
    state.lastExitReason = lastExitReason;
  } else if (exitCode === 0) {
    state.lastExitReason = "clean";
  } else {
    state.lastExitReason = `exit_${exitCode}`;
  }
  // M44 D9 (v1.5.0) — per-iter multi-worker aggregates. Present only when the
  // planner selected fan-out; single-worker iters omit these fields so the
  // state schema stays backward-compatible with v1.4.x readers.
  if (useFanOut && Array.isArray(res.workerResults)) {
    state.lastExits = res.workerResults.map((w) => ({
      idx: w.idx,
      code: typeof w.status === "number" ? w.status : null,
      taskIds: w.taskIds || [],
      elapsedMs: w.elapsedMs,
      spawnId: w.spawnId || null,
    }));
    state.workerPids = res.workerResults.map((w) => w.spawnId || null);
    state.lastFanOutCount = res.workerResults.length;
  } else {
    // Clear stale multi-worker fields on single-worker iters so readers
    // never see a mix of regimes.
    if (state.lastExits) delete state.lastExits;
    if (state.workerPids) delete state.workerPids;
    if (state.lastFanOutCount) delete state.lastFanOutCount;
  }
  writeState(state, dir);

  // Event-stream: task_complete on success, error on non-zero.
  const durationS = Math.round(elapsedMs / 1000);
  if (exitCode === 0) {
    _emit(projectDir, {
      ts: workerEnd.toISOString(),
      iter: state.iter,
      type: "task_complete",
      source: "supervisor",
      task: state.nextTask || "",
      verdict: "pass",
      duration_s: durationS,
    });
  } else {
    _emit(projectDir, {
      ts: workerEnd.toISOString(),
      iter: state.iter,
      type: "error",
      source: "supervisor",
      error: `worker exit ${exitCode}`,
      recoverable: exitCode !== 4 && exitCode !== 5,
    });
  }

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
    return _result("failed", { errorMessage: `blocker_sentinel:${state.lastExit}` });
  }
  const gutter = fn.detectGutter(state, runLogTail, config);
  if (!gutter.ok) {
    state.status = "failed";
    state.lastExit = gutter.code || 6;
    writeState(state, dir);
    return _result("failed", { errorMessage: `gutter:${state.lastExit}` });
  }

  // Terminal exit classification
  if (exitCode === 0) {
    // Success — check if the milestone is now complete.
    if (milestoneComplete(projectDir, state.milestone)) {
      state.status = "done";
      writeState(state, dir);
      return _result("done");
    }
    // Not yet done — continue relay.
    _emit(projectDir, {
      iter: state.iter,
      type: "retry",
      source: "supervisor",
      attempt: state.iter,
      reason: "milestone_incomplete",
    });
    return _result("running");
  }
  if (exitCode === 4) {
    // Unrecoverable blocker.
    state.status = "failed";
    writeState(state, dir);
    return _result("failed", { errorMessage: "exit_4_unrecoverable" });
  }
  if (exitCode === 5) {
    // Command dispatch failure — worker invocation is broken.
    state.status = "failed";
    writeState(state, dir);
    return _result("failed", { errorMessage: "exit_5_dispatch_failure" });
  }
  if (exitCode === 124) {
    // Timeout — continue unless the iter cap is hit on the next check.
    _emit(projectDir, {
      iter: state.iter,
      type: "retry",
      source: "supervisor",
      attempt: state.iter,
      reason: "timeout",
    });
    return _result("running");
  }
  if (exitCode === 125) {
    // Stale heartbeat (M43) — continue unless the iter cap hits. The
    // heartbeat kill is recoverable by definition: the worker was not
    // emitting events, which is the most common class of stuck iteration
    // (e.g. child stuck on a long Bash call with no tool_call emits).
    _emit(projectDir, {
      iter: state.iter,
      type: "retry",
      source: "supervisor",
      attempt: state.iter,
      reason: "stale_heartbeat",
    });
    return _result("running");
  }
  // Non-terminal (1/2/3) — continue the relay.
  _emit(projectDir, {
    iter: state.iter,
    type: "retry",
    source: "supervisor",
    attempt: state.iter,
    reason: `exit_${exitCode}`,
  });
  return _result("running");
}

// ── _computeIterBatchSize (M46 D1 T3) ───────────────────────────────────────

/**
 * Decide how many iterations the supervisor main loop should dispatch
 * concurrently in the next pass. Implements the mode-safety rules from
 * `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0 §3.1.
 *
 * Rules evaluated top-down; first match wins:
 *   1. status === "verify-needed"        → 1 (serial verify gate)
 *   2. milestoneBoundary === true        → 1 (milestone boundary)
 *   3. status === "complete-milestone"   → 1 (single-shot closeout)
 *   4. otherwise → min(opts.maxIterParallel ?? 4, remainingIters, 8)
 *      where remainingIters = (state.maxIterations ?? Infinity) - (state.iter ?? 0)
 *
 * Never returns less than 1.
 */
function _computeIterBatchSize(state, opts) {
  if (state && state.status === "verify-needed") return 1;
  if (state && state.milestoneBoundary === true) return 1;
  if (state && state.status === "complete-milestone") return 1;

  // Production default is 1 (serial, pre-M46 behavior). Iter-parallelism is
  // opt-in via `opts.maxIterParallel` — callers that pass a number enable it.
  // Rationale: `_runOneIter` mutates `state.iter` and other shared fields
  // (heartbeat bookkeeping, writeState) that are not safe to execute on the
  // same state object concurrently. Unit tests exercise the parallel path
  // with explicit batch sizes; production main loop omits the flag and runs
  // strictly serial, preserving the pre-M46 supervisor contract (one iter
  // counter increment per fan-out pass). See backlog #24 for the follow-up
  // that makes `_runOneIter` state-clone-safe and lifts this gate.
  if (!opts || typeof opts.maxIterParallel !== "number") return 1;

  const cap = opts.maxIterParallel;
  const maxIters = state && typeof state.maxIterations === "number"
    ? state.maxIterations
    : Infinity;
  const currentIter = state && typeof state.iter === "number"
    ? state.iter
    : 0;
  const remainingIters = maxIters - currentIter;

  const size = Math.min(cap, remainingIters, 8);
  return size < 1 ? 1 : size;
}

// ── _runIterParallel (M46 D1 T4) ────────────────────────────────────────────

/**
 * Dispatch `batchSize` independent iter slices concurrently and return an
 * IterResult[] of exactly that length. Implements the error-isolation rule
 * from `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0 §4.2: a single
 * rejected iter is translated into an IterResult with status "error" and
 * does NOT cancel siblings. The caller decides how to react.
 *
 * iterFn defaults to `_runOneIter` for the T7 tests; production callers
 * (T5 main-loop rewrite) pass the same.
 */
async function _runIterParallel(state, opts, iterFn, batchSize) {
  const fn = typeof iterFn === "function" ? iterFn : _runOneIter;
  const n = typeof batchSize === "number" && batchSize >= 1 ? batchSize : 1;
  const slices = [];
  for (let i = 0; i < n; i++) slices.push(Promise.resolve().then(() => fn(state, opts)));
  const settled = await Promise.allSettled(slices);
  return settled.map((s) => {
    if (s.status === "fulfilled") return s.value;
    const reason = s.reason;
    const msg = (reason && reason.message) ? reason.message : String(reason);
    return {
      status: "error",
      tasksDone: [],
      verifyNeeded: false,
      artifacts: [],
      error: msg,
    };
  });
}

// ── _appendTokenLog (Fix 1, v3.12.12) ───────────────────────────────────────

const _TOKEN_LOG_HEADER =
  "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |\n" +
  "|---|---|---|---|---|---|---|---|---|---|\n";

/**
 * Append one row to {projectDir}/.gsd-t/token-log.md for a supervisor worker
 * iteration. Matches the schema used by interactive command-file observability.
 */
function _appendTokenLog(projectDir, entry) {
  try {
    const logPath = path.join(projectDir, ".gsd-t", "token-log.md");
    const note = entry.exitCode === 0
      ? `supervisor iter=${entry.iter}: ok`
      : `supervisor iter=${entry.iter}: exit ${entry.exitCode}`;
    // v3.12.14: prefer env-var model over the hardcoded "unknown" placeholder.
    const model = process.env.GSD_T_MODEL || "unknown";
    const row =
      `| ${entry.dtStart} | ${entry.dtEnd} | ${entry.command} | supervisor-iter-${entry.iter} | ${model} | ${entry.durationS}s | ${note} | - | - | unknown |\n`;
    const gsdtDir = path.join(projectDir, ".gsd-t");
    if (!fs.existsSync(gsdtDir)) fs.mkdirSync(gsdtDir, { recursive: true });
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, `# GSD-T Token Log\n\n${_TOKEN_LOG_HEADER}${row}`);
    } else {
      const existing = fs.readFileSync(logPath, "utf8");
      if (!existing.includes("| Datetime-start |")) {
        fs.writeFileSync(logPath, `# GSD-T Token Log\n\n${_TOKEN_LOG_HEADER}${existing}${row}`);
      } else {
        fs.appendFileSync(logPath, row);
      }
    }
  } catch (_) {
    /* best-effort — never halt the supervisor loop */
  }
}

// ── _spawnWorker ────────────────────────────────────────────────────────────

/**
 * Spawn a fresh `claude -p /gsd-t-resume` worker via `spawnSync`. Returns a
 * normalized `{ status, stdout, stderr, signal }` result. Task 4 replaces
 * this with the cross-platform helper from `bin/gsd-t-unattended-platform.cjs`.
 *
 * @param {object} state — current supervisor state (reads `claudeBin`)
 * @param {{cwd: string, timeout: number, verbose?: boolean}} opts
 * @returns {{status: (number|null), stdout: string, stderr: string, signal: (string|null)}}
 */
function _spawnWorker(state, opts) {
  const bin = (state && state.claudeBin) || resolveClaudePath();
  // Inject command/phase/trace/model/project-dir so event-stream tool_call
  // entries (writer CLI + heartbeat hook) are tagged in worker contexts
  // (Fix 2, v3.12.12; trace/model/project-dir added v3.12.14 for the
  // null-telemetry regression fix). Supervisor always runs gsd-t-resume
  // workers; phase is inferred from state when available. Trace/model flow
  // through from parent process.env when set.
  const workerEnv = {
    ...process.env,
    GSD_T_UNATTENDED_WORKER: "1",
    GSD_T_COMMAND: "gsd-t-resume",
    GSD_T_PHASE: (state && state.phase) || "execute",
    GSD_T_PROJECT_DIR: process.env.GSD_T_PROJECT_DIR || opts.cwd || state.projectDir,
  };
  if (state && state.traceId) workerEnv.GSD_T_TRACE_ID = state.traceId;
  else if (process.env.GSD_T_TRACE_ID) workerEnv.GSD_T_TRACE_ID = process.env.GSD_T_TRACE_ID;
  if (state && state.model) workerEnv.GSD_T_MODEL = state.model;
  else if (process.env.GSD_T_MODEL) workerEnv.GSD_T_MODEL = process.env.GSD_T_MODEL;
  // D2 watch-progress: mint a per-worker agent id and forward the supervisor's
  // id as parent, so shims inside the worker write state files that the tree
  // builder can attach under the supervisor root.
  workerEnv.GSD_T_AGENT_ID =
    "supervisor-iter-" + (state && state.iter ? state.iter : Date.now()) +
    (state && typeof state._workerIndex === "number" ? `-w${state._workerIndex}` : "");
  if (process.env.GSD_T_AGENT_ID) {
    workerEnv.GSD_T_PARENT_AGENT_ID = process.env.GSD_T_AGENT_ID;
  }

  // M44 D9 (v1.5.0) — planner-driven fan-out: when the supervisor partitions
  // the iter's task graph across N workers, each worker carries its disjoint
  // task-id subset via env var. The worker prompt consumes this to (a) skip
  // the intra-worker Team Mode block (the fan-out is the team), (b) restrict
  // itself to its assigned task IDs.
  const assignedTaskIds = Array.isArray(opts && opts.taskIds) ? opts.taskIds : null;
  if (assignedTaskIds && assignedTaskIds.length > 0) {
    workerEnv.GSD_T_WORKER_TASK_IDS = assignedTaskIds.join(",");
    workerEnv.GSD_T_WORKER_INDEX = String((state && state._workerIndex) || 0);
    workerEnv.GSD_T_WORKER_TOTAL = String((state && state._workerTotal) || 1);
  }

  // M42 D1 — allocate a spawn-id + open transcript before spawning. parentId
  // is the supervisor's own spawn-id (set once at supervisor start via
  // GSD_T_SPAWN_ID env) so the sidebar can render parent-indented trees.
  const parentSpawnId = process.env.GSD_T_SPAWN_ID || null;
  let teeSpawnId = null;
  try {
    teeSpawnId = transcriptTee.allocateSpawnId({ parentId: parentSpawnId });
    transcriptTee.openTranscript({
      spawnId: teeSpawnId,
      projectDir: opts.cwd,
      meta: {
        parentId: parentSpawnId,
        command: "gsd-t-unattended-worker",
        description: `iter=${state && state.iter ? state.iter : "?"} milestone=${state && state.milestone ? state.milestone : "-"}`,
        model: (state && state.model) || null,
      },
    });
    workerEnv.GSD_T_SPAWN_ID = teeSpawnId;
  } catch (_) { /* tee is best-effort */ }

  const spawnResult = platformSpawnWorker(opts.cwd, opts.timeout, {
    bin,
    onHeartbeatCheck: opts.onHeartbeatCheck,
    heartbeatPollMs: opts.heartbeatPollMs,
    onHeartbeatSample: opts.onHeartbeatSample,
    // M43 live transcript tee — append each worker stdout line to the
    // transcript file as it arrives, so /transcript/:id/stream renders the
    // run in real time instead of waiting for the worker to exit.
    onStdoutLine: teeSpawnId
      ? (line) => {
          try {
            transcriptTee.appendFrame({
              spawnId: teeSpawnId,
              projectDir: opts.cwd,
              frame: line,
            });
          } catch (_) { /* tee is best-effort */ }
        }
      : undefined,
    args: [
      "-p",
      [
        "You are an unattended worker iteration. CRITICAL: Do NOT check supervisor.pid, do NOT auto-reattach to a watch loop, do NOT schedule any ScheduleWakeup. You ARE the worker spawned by the supervisor. Skip Step 0 (auto-reattach) entirely and go directly to Step 0.1.",
        "",
        "# CWD Invariant (v3.13.11 Bug 2)",
        "",
        "Before any other work, assert your current working directory matches the",
        "supervisor's project directory. A worker that silently drifts to a",
        "different repo will commit to the wrong tree and corrupt state.json.",
        "",
        "First Bash call this turn (mandatory):",
        "",
        "    [ \"$(pwd)\" = \"$GSD_T_PROJECT_DIR\" ] || cd \"$GSD_T_PROJECT_DIR\"",
        "    pwd  # confirm",
        "",
        "Thereafter, scope any directory change inside a subshell so a `cd` in",
        "one Bash call cannot contaminate the next one:",
        "",
        "    ( cd some/subdir && run-command )   # safe — subshell",
        "    cd some/subdir && run-command        # UNSAFE — leaks cwd",
        "",
        "# Team Mode (Intra-Wave Parallelism)",
        "",
        "M44 D9 (v1.5.0+) — check env `GSD_T_WORKER_TASK_IDS` FIRST. If SET, you",
        "are one of N planner-assigned workers in a supervisor-level fan-out.",
        "The value is your disjoint task-id subset. DO NOT spawn Task subagents",
        "to re-fan-out (the supervisor already did). Execute ONLY your assigned",
        "task IDs sequentially in this worker, then return. Skip the rest of",
        "this block.",
        "",
        "If GSD_T_WORKER_TASK_IDS is UNSET, the supervisor's planner decided",
        "N=1 for this iter (sequential fallback: gates vetoed, file-disjointness",
        "unprovable, or est CW% too high). Proceed with the legacy worker-level",
        "Team Mode below:",
        "",
        "Before executing tasks for this iteration, read `.gsd-t/partition.md` to",
        "identify the current wave and which domains belong to it.",
        "",
        "If the current wave has MULTIPLE independent domains/tasks (check",
        "`.gsd-t/domains/*/tasks.md` — 2 or more domains with incomplete tasks in the",
        "current wave):",
        "",
        "  SPAWN PARALLEL SUBAGENTS — up to 15 concurrent Task subagents, one per",
        "  domain, using `general-purpose` subagent_type. Use the same subagent",
        "  prompt pattern as `/gsd-t-execute` Team Mode (see `commands/gsd-t-execute.md`",
        "  Step 3 Team Mode section). Each subagent:",
        "    - Receives the domain name, its scope.md, its tasks.md (only incomplete",
        "      tasks from the current wave), and the relevant contracts",
        "    - Works ONLY within its domain boundary",
        "    - Returns when all its current-wave tasks are committed",
        "  WAIT for ALL spawned subagents to report back before advancing.",
        "",
        "If the current wave has only 1 domain with incomplete tasks, execute",
        "sequentially in this worker (no subagent spawn needed).",
        "",
        "Inter-wave boundaries always remain sequential — never parallelize across",
        "waves, because wave-N+1 may depend on wave-N contract/state updates.",
        "",
        "Your job: run /gsd-t-resume but skip the unattended supervisor auto-reattach check in Step 0.",
      ].join("\n"),
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ],
    env: workerEnv,
  });

  // M43 — finalize: live tee already wrote each line via onStdoutLine in the
  // platform layer; here we only mark the transcript closed with the worker's
  // terminal status. Legacy sync path (no onHeartbeatCheck) doesn't fire
  // onStdoutLine, but the supervisor always provides a heartbeat callback so
  // that branch is unreachable in production. If a future caller goes async
  // without heartbeat, transcripts would be empty — acceptable until then.
  const finalize = (res) => {
    if (teeSpawnId) {
      try {
        const status =
          typeof res.status === "number" && res.status === 0
            ? "done"
            : res.timedOut
              ? "stopped"
              : "failed";
        transcriptTee.closeTranscript({
          spawnId: teeSpawnId,
          projectDir: opts.cwd,
          status,
        });
      } catch (_) { /* tee is best-effort */ }
    }

    return {
      status: typeof res.status === "number" ? res.status : null,
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      signal: res.signal || null,
      timedOut: !!res.timedOut,
      staleHeartbeat: !!res.staleHeartbeat,
      heartbeatReason: res.heartbeatReason || null,
      error: res.error || null,
      spawnId: teeSpawnId,
    };
  };

  if (spawnResult && typeof spawnResult.then === "function") {
    return spawnResult.then(finalize);
  }
  return finalize(spawnResult);
}

// ── _spawnWorkerFanOut (M44 D9, contract v1.5.0) ────────────────────────────

/**
 * Planner-driven multi-worker fan-out. Spawns N concurrent workers via the
 * injected `spawnWorker` shim, each receiving a disjoint subset of the iter's
 * parallel task IDs (passed through `opts.taskIds`). Waits on all via
 * Promise.all before returning a merged result shape compatible with the
 * single-worker path.
 *
 * Merge semantics:
 *   - `status`        — 0 if every worker cleanly returned 0, else the first
 *                       non-zero status encountered (worst exit wins).
 *   - `stdout`        — per-worker blocks joined by `[WORKER i/N tasks=...]` headers.
 *   - `stderr`        — concatenated.
 *   - `staleHeartbeat`/`timedOut` — true if any worker triggered them.
 *   - `workerResults` — array of per-worker {status, taskIds, pid, spawnId, elapsedMs}
 *                       for state.json aggregation.
 *
 * The caller (runMainLoop) treats this result exactly like a single-worker
 * result for downstream classification. Multi-worker observability lives in
 * the `workerResults` array, not in new control-flow branches.
 */
async function _spawnWorkerFanOut(state, opts, spawnWorker, subsets) {
  const launches = subsets.map((taskIds, i) => {
    const subState = { ...state, _workerIndex: i, _workerTotal: subsets.length, _workerTaskIds: taskIds };
    const started = Date.now();
    return Promise.resolve()
      .then(() => spawnWorker(subState, { ...opts, taskIds }))
      .then((r) => ({ r: r || {}, taskIds, started, ended: Date.now(), idx: i }))
      .catch((e) => ({
        r: { status: 3, stdout: "", stderr: String((e && e.message) || e), signal: null },
        taskIds, started, ended: Date.now(), idx: i,
      }));
  });
  const outcomes = await Promise.all(launches);
  outcomes.sort((a, b) => a.idx - b.idx);

  let mergedStatus = 0;
  let stale = false;
  let timedOut = false;
  let heartbeatReason = null;
  const stdoutBlocks = [];
  const stderrBlocks = [];
  const workerResults = [];

  for (const o of outcomes) {
    const s = typeof o.r.status === "number" ? o.r.status : null;
    if (mergedStatus === 0 && s !== 0) mergedStatus = s === null ? 1 : s;
    if (o.r.staleHeartbeat) stale = true;
    if (o.r.timedOut) timedOut = true;
    if (!heartbeatReason && o.r.heartbeatReason) heartbeatReason = o.r.heartbeatReason;
    const tag = `[WORKER ${o.idx + 1}/${outcomes.length} tasks=${(o.taskIds || []).join(",") || "-"}]`;
    stdoutBlocks.push(`${tag}\n${o.r.stdout || ""}`);
    if (o.r.stderr) stderrBlocks.push(`${tag}\n${o.r.stderr}`);
    workerResults.push({
      idx: o.idx,
      status: s,
      taskIds: o.taskIds,
      spawnId: o.r.spawnId || null,
      signal: o.r.signal || null,
      elapsedMs: o.ended - o.started,
      staleHeartbeat: !!o.r.staleHeartbeat,
      timedOut: !!o.r.timedOut,
    });
  }

  return {
    status: mergedStatus,
    stdout: stdoutBlocks.join("\n"),
    stderr: stderrBlocks.join("\n"),
    signal: null,
    timedOut,
    staleHeartbeat: stale,
    heartbeatReason,
    workerResults,
    fanOutCount: outcomes.length,
  };
}

/**
 * Partition a task-id list into `workerCount` roughly-equal subsets. Simple
 * round-robin — each subset is non-empty as long as `tasks.length >= workerCount`.
 */
function _partitionTasks(tasks, workerCount) {
  if (!Array.isArray(tasks) || tasks.length === 0 || workerCount < 1) return [];
  const n = Math.min(workerCount, tasks.length);
  const subsets = Array.from({ length: n }, () => []);
  for (let i = 0; i < tasks.length; i++) subsets[i % n].push(tasks[i]);
  return subsets;
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
    const lines = body.split(/\r?\n/);
    const COMPLETE_PHASES = new Set(["COMPLETE", "COMPLETED", "DONE", "VERIFIED"]);

    // Authoritative signal #1: the top-of-file Status header.
    //   `## Status: M43 PARTITIONED — Token Attribution & ...`
    // Match `## Status:` lines that name the active milestone id and read
    // the first ALL-CAPS phase keyword that follows. Anything outside the
    // keyword set (PARTITIONED, EXECUTING, VERIFYING, ...) is non-terminal.
    const statusRe = new RegExp(
      `^##\\s*Status:[^\\n]*\\b${idEsc}\\b\\s+([A-Z][A-Z-]+)`,
    );
    for (const ln of lines) {
      const m = ln.match(statusRe);
      if (m && COMPLETE_PHASES.has(m[1])) return true;
    }

    // Authoritative signal #2: the milestone's row in the Milestones table.
    //   `| M43 | <name> | PARTITIONED | <version> | <domains> |`
    // The third pipe column is the milestone's status. Decision Log prose,
    // descriptive paragraphs, and "see also M43" mentions never satisfy
    // this — the row format is structural.
    const rowRe = new RegExp(
      `^\\|\\s*${idEsc}\\s*\\|[^|]*\\|\\s*([A-Z][A-Z-]+)\\s*\\|`,
    );
    for (const ln of lines) {
      const m = ln.match(rowRe);
      if (m && COMPLETE_PHASES.has(m[1])) return true;
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
