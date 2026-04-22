#!/usr/bin/env node

/**
 * GSD-T Headless Auto-Spawn — Detached headless continuation
 *
 * Every GSD-T command spawn routes through `autoSpawnHeadless()` to a
 * detached child process running `gsd-t headless {command} --log`. The
 * interactive session never blocks on the child (`child.unref()`), so the
 * user retains their terminal and can work on unrelated tasks. On child
 * completion, a macOS notification fires (T2). The interactive session
 * surfaces the result via a read-back banner on the next `gsd-t-resume`
 * or `gsd-t-status` call (T4).
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/headless-default-contract.md v2.0.0
 *   - v2.0.0 (M43 D4): channel-separation invariant. Every command spawns.
 *     No opt-out flag, no context-meter threshold gating, no `--in-session`
 *     escape hatch. `shouldSpawnHeadless` is a constant `() => true`. The
 *     `watch` parameter is accepted for caller backward-compat for one
 *     version but ignored (deprecation warning emitted once per process).
 * Consumers: every command file that spawns subagents (execute, wave, quick,
 *            integrate, debug, scan, verify, complete-milestone, test-sync,
 *            scan, gap-analysis, populate, feature, project, partition);
 *            the `/gsd` router (Step 2 action-turn handoff).
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  acquireHandoffLock,
  releaseHandoffLock,
  // waitForLockRelease — NOT consumed here. The child-side wait is
  // performed by `commands/gsd-t-resume.md` Step 0 (wired in m36
  // watch-loop Task 4); it calls waitForLockRelease(projectDir,
  // sessionId) before reading the continue-here file.
} = require("./handoff-lock.cjs");

// ── Constants ────────────────────────────────────────────────────────────────

const SESSIONS_DIR_REL = path.join(".gsd-t", "headless-sessions");
const LOG_DIR_REL = ".gsd-t"; // headless-{id}.log lives directly in .gsd-t

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  autoSpawnHeadless,
  makeSessionId,
  writeSessionFile,
  writeContinueHereFile,
  markSessionCompleted,
  // M43 D4 — channel-separation invariant. The helper is retained for
  // backward-compat with any caller that imported it from a v1.x consumer;
  // it now unconditionally returns true. See headless-default-contract
  // v2.0.0 §Invariants.
  shouldSpawnHeadless: () => true,
};

// M43 D4 — one-shot deprecation banner when a caller still passes `watch`
// (or the never-shipped `inSession`). Module-level flag avoids log spam.
let _deprecatedWatchWarned = false;

// ── autoSpawnHeadless ────────────────────────────────────────────────────────

/**
 * @param {{
 *   command: string,
 *   args?: string[],
 *   continue_from?: string,
 *   projectDir?: string,
 *   context?: object,
 *   sessionContext?: object,
 *   sessionId?: string,
 *   watch?: boolean,
 *   spawnType?: 'primary' | 'validation'
 * }} opts
 * @returns {{ id: string | null, pid: number | null, logPath: string | null, timestamp: string, mode: 'headless' | 'in-context' }}
 */
function autoSpawnHeadless(opts) {
  const command = opts.command;
  const args = opts.args || [];
  const continue_from = opts.continue_from || ".";
  const projectDir = opts.projectDir || process.cwd();
  const context = opts.context || opts.sessionContext || null;
  // M43 D4 — `watch` is accepted for caller backward-compat but IGNORED.
  // `inSession` was never shipped; accept+ignore for the same reason.
  // Under headless-default-contract v2.0.0 every spawn goes headless; the
  // only in-session surface is the `/gsd` router dialog channel, which is
  // upstream of this function. One-shot deprecation warning on stderr.
  const legacyWatch = opts.watch === true;
  const legacyInSession = opts.inSession === true;
  if ((legacyWatch || legacyInSession) && !_deprecatedWatchWarned) {
    _deprecatedWatchWarned = true;
    try {
      process.stderr.write(
        "[headless-default] `watch`/`inSession` flag is deprecated under headless-default-contract v2.0.0 — every spawn is headless; caller hint ignored.\n",
      );
    } catch (_) {
      /* best-effort */
    }
  }
  const spawnType = opts.spawnType || "primary";

  if (!command || typeof command !== "string") {
    throw new Error("autoSpawnHeadless: `command` is required");
  }
  if (spawnType !== "primary" && spawnType !== "validation") {
    throw new Error(
      `autoSpawnHeadless: \`spawnType\` must be 'primary' or 'validation' (got ${JSON.stringify(spawnType)})`,
    );
  }

  const timestamp = new Date().toISOString();
  const id = makeSessionId(command, new Date());
  const logPath = path.join(projectDir, LOG_DIR_REL, `headless-${id}.log`);

  ensureDir(path.join(projectDir, LOG_DIR_REL));
  ensureDir(path.join(projectDir, SESSIONS_DIR_REL));

  // M43 D6-T4 — Ensure dashboard is running (idempotent; no-op if already up).
  // Must happen BEFORE the URL banner print (D6-T3) so the link is live.
  // Never throws — autostart is best-effort.
  let autostartInfo = null;
  try {
    const { ensureDashboardRunning } = require("../scripts/gsd-t-dashboard-autostart.cjs");
    autostartInfo = ensureDashboardRunning({ projectDir });
  } catch (_) {
    /* best-effort; fall through without banner port info */
  }

  // M43 D6-T3 — Live transcript URL banner. Printed for every spawn so the
  // viewer at :PORT is "the" primary watching surface. Never throws.
  // Text is coordinated with D4 — exact line shape is part of
  // dashboard-server-contract.md §Banner Format.
  try {
    let port = autostartInfo && autostartInfo.port;
    if (!port) {
      const { projectScopedDefaultPort } = require("../scripts/gsd-t-dashboard-server.js");
      port = projectScopedDefaultPort(projectDir);
    }
    process.stdout.write(`▶ Live transcript: http://127.0.0.1:${port}/transcript/${id}\n`);
  } catch (_) {
    /* best-effort — never crash the spawn on banner failure */
  }

  // Handoff-lock gate (m36 gap-fix T2). Only engaged when the caller
  // supplies a `sessionId` — existing callers that do not pass one keep
  // the pre-m36 behavior unchanged. When engaged, the lock is held
  // across writeContinueHereFile + spawn so a child that is already
  // waiting via `waitForLockRelease()` (see commands/gsd-t-resume.md
  // Step 0, wired by m36 watch-loop T4) cannot read a half-written
  // continue-here file. See .gsd-t/contracts/headless-auto-spawn-contract.md
  // v1.0.0 (implementation-detail primitive; no contract bump).
  const lockSessionId = typeof opts.sessionId === "string" && opts.sessionId
    ? opts.sessionId
    : null;
  let lockHandle = null;
  if (lockSessionId) {
    lockHandle = acquireHandoffLock(projectDir, lockSessionId);
  }

  let pid = 0;
  try {
    // Open log file descriptor before spawning — child writes directly.
    const logFd = fs.openSync(logPath, "a");

    // Headless invocation: `node bin/gsd-t.js headless <command> [args] --log`
    // The `gsd-t` CLI entry point is bin/gsd-t.js relative to projectDir.
    const gsdtCli = path.join(projectDir, "bin", "gsd-t.js");
    const childArgs = [gsdtCli, "headless", stripGsdtPrefix(command), ...args, "--log"];

    // Inject command/phase/trace/model into worker env so event-stream entries
    // (both the writer CLI and the heartbeat PostToolUse hook) are tagged in
    // the child's context (Fix 2, v3.12.12; trace/model/project-dir added
    // v3.12.14 to close the null-telemetry regression).
    //
    // GSD_T_PHASE defaults to "execute" for primary spawns.
    // GSD_T_TRACE_ID / GSD_T_MODEL are inherited from parent env if set;
    // parents (orchestrator, command files) should set them before spawning.
    // GSD_T_PROJECT_DIR gives the writer a stable target when the child cwd
    // drifts (e.g., temp dirs in subagents).
    const workerEnv = Object.assign({}, process.env, {
      GSD_T_COMMAND: command,
      GSD_T_PHASE: process.env.GSD_T_PHASE || "execute",
      GSD_T_PROJECT_DIR: process.env.GSD_T_PROJECT_DIR || projectDir,
    });
    if (process.env.GSD_T_TRACE_ID) {
      workerEnv.GSD_T_TRACE_ID = process.env.GSD_T_TRACE_ID;
    }
    if (process.env.GSD_T_MODEL) {
      workerEnv.GSD_T_MODEL = process.env.GSD_T_MODEL;
    }
    workerEnv.GSD_T_AGENT_ID = "headless-" + id;
    if (process.env.GSD_T_AGENT_ID) {
      workerEnv.GSD_T_PARENT_AGENT_ID = process.env.GSD_T_AGENT_ID;
    }

    const child = spawn("node", childArgs, {
      cwd: projectDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: workerEnv,
    });

    child.unref();
    fs.closeSync(logFd);

    pid = child.pid || 0;

    writeSessionFile(projectDir, {
      id,
      pid,
      logPath: path.relative(projectDir, logPath),
      startTimestamp: timestamp,
      command,
      args,
      status: "running",
      continueFromPath: continue_from,
      surfaced: false,
    });

    writeContinueHereFile(projectDir, id, context);
  } finally {
    // Release the lock AFTER the child is confirmed started and
    // handoff artifacts are on disk. The finally ensures a spawn
    // failure still frees the slot for a retry.
    if (lockHandle) {
      try {
        releaseHandoffLock(lockHandle);
      } catch (_) {
        /* idempotent best-effort */
      }
    }
  }

  // T2 — install completion watcher. Non-blocking (setImmediate) so the
  // caller's return is not delayed. The watcher uses `child.on('exit')` on
  // a separately-spawned bridge process; here we defer to fs.watchFile for
  // a detached approach that survives even after the parent's `unref()`.
  installCompletionWatcher({ projectDir, id, logPath, pid, startTimestamp: timestamp });

  return {
    id,
    pid,
    logPath: path.relative(projectDir, logPath),
    timestamp,
    mode: "headless",
  };
}

// ── makeSessionId ────────────────────────────────────────────────────────────

/**
 * @param {string} command
 * @param {Date} [now]
 * @returns {string} e.g., "gsd-t-execute-2026-04-15-01-23-45"
 */
function makeSessionId(command, now) {
  const d = now || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const base = stripGsdtPrefix(command) || command;
  return `gsd-t-${base}-${date}-${time}`;
}

// ── writeSessionFile ─────────────────────────────────────────────────────────

function writeSessionFile(projectDir, session) {
  const fp = path.join(projectDir, SESSIONS_DIR_REL, `${session.id}.json`);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(session, null, 2) + "\n");
  return fp;
}

// ── writeContinueHereFile ────────────────────────────────────────────────────

function writeContinueHereFile(projectDir, id, context) {
  const fp = path.join(projectDir, SESSIONS_DIR_REL, `${id}-context.json`);
  const payload = context || buildContextSnapshot(projectDir);
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2) + "\n");
  return fp;
}

function buildContextSnapshot(projectDir) {
  // Best-effort snapshot of current GSD-T state at handoff time.
  const snap = {
    capturedAt: new Date().toISOString(),
    progress: null,
    currentDomain: null,
    pendingTasks: [],
    lastDecisionLogEntry: null,
    currentWave: null,
  };
  try {
    const progressFp = path.join(projectDir, ".gsd-t", "progress.md");
    if (fs.existsSync(progressFp)) {
      const raw = fs.readFileSync(progressFp, "utf8");
      snap.progress = firstNLines(raw, 20);
      // Pull the last Decision Log entry (last non-empty bullet line).
      const lines = raw.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const ln = lines[i].trim();
        if (ln.startsWith("- ")) {
          snap.lastDecisionLogEntry = ln;
          break;
        }
      }
    }
  } catch (_) {
    /* best-effort */
  }
  return snap;
}

function firstNLines(s, n) {
  return s.split("\n").slice(0, n).join("\n");
}

// ── markSessionCompleted ─────────────────────────────────────────────────────

/**
 * T2 completion hook — updates the session file in place.
 * @param {string} projectDir
 * @param {string} id
 * @param {{ exitCode: number, endTimestamp?: string }} result
 */
function markSessionCompleted(projectDir, id, result) {
  const fp = path.join(projectDir, SESSIONS_DIR_REL, `${id}.json`);
  if (!fs.existsSync(fp)) return;
  try {
    const s = JSON.parse(fs.readFileSync(fp, "utf8"));
    s.status = "completed";
    s.exitCode = result.exitCode;
    s.endTimestamp = result.endTimestamp || new Date().toISOString();
    fs.writeFileSync(fp, JSON.stringify(s, null, 2) + "\n");
  } catch (_) {
    /* ignore */
  }
}

// ── Completion watcher (T2) — macOS notification on exit ─────────────────────

function installCompletionWatcher(opts) {
  const { projectDir, id, pid, startTimestamp } = opts;
  if (!pid || pid <= 0) return;

  // Poll-based watcher. We can't hold a reference to the child (it's unref'd
  // and detached), so we poll `process.kill(pid, 0)` which throws if the
  // process is gone. This is cheap and survives across detachment.
  const POLL_MS = 2000;
  const MAX_WAIT_MS = 60 * 60 * 1000; // 1 hour safety cap
  const startMs = Date.now();
  const dtStart = new Date(startTimestamp).toLocaleString("sv-SE", { hour12: false }).slice(0, 16);

  const timer = setInterval(() => {
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (_) {
      alive = false;
    }
    if (!alive) {
      clearInterval(timer);
      // Exit code is unknown from a signal-based probe. Best-effort: read
      // the log's last lines to guess, otherwise default to 0.
      const exitCode = guessExitCodeFromLog(projectDir, id);
      const endTimestamp = new Date().toISOString();
      markSessionCompleted(projectDir, id, {
        exitCode,
        endTimestamp,
      });
      // Append token-log row (Fix 1, v3.12.12)
      const dtEnd = new Date(endTimestamp).toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
      const durationS = Math.round((Date.now() - startMs) / 1000);
      appendTokenLog(projectDir, {
        dtStart,
        dtEnd,
        command: extractCommand(id),
        durationS,
        exitCode,
      });
      fireMacNotification({ id, command: extractCommand(id), startTimestamp });
    } else if (Date.now() - startMs > MAX_WAIT_MS) {
      clearInterval(timer);
    }
  }, POLL_MS);

  // Let the timer not block the parent's exit.
  if (typeof timer.unref === "function") timer.unref();
}

function guessExitCodeFromLog(projectDir, id) {
  try {
    const fp = path.join(projectDir, LOG_DIR_REL, `headless-${id}.log`);
    if (!fs.existsSync(fp)) return 0;
    const raw = fs.readFileSync(fp, "utf8");
    if (/exit code[: ]+(\d+)/i.test(raw)) {
      const m = raw.match(/exit code[: ]+(\d+)/i);
      return parseInt(m[1], 10);
    }
    return 0;
  } catch (_) {
    return 0;
  }
}

function extractCommand(id) {
  // id format: gsd-t-{command}-{date}-{time}
  const m = id.match(/^gsd-t-(.+?)-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  return m ? m[1] : id;
}

function fireMacNotification({ id, command }) {
  if (process.platform !== "darwin") return;
  try {
    const { spawn } = require("child_process");
    const msg = `GSD-T headless run complete: ${id}`;
    const script = `display notification "${msg}" with title "GSD-T" subtitle "${command}"`;
    const child = spawn("osascript", ["-e", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (_) {
    /* graceful degradation */
  }
}

// ── Token-Log Writer (Fix 1, v3.12.12) ───────────────────────────────────────

const TOKEN_LOG_HEADER =
  "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |\n" +
  "|---|---|---|---|---|---|---|---|---|---|\n";

/**
 * Append one row to {projectDir}/.gsd-t/token-log.md matching the schema used
 * by interactive command-file observability blocks.
 *
 * @param {string} projectDir
 * @param {{ dtStart: string, dtEnd: string, command: string, durationS: number, exitCode: number }} entry
 */
function appendTokenLog(projectDir, entry) {
  try {
    const logPath = path.join(projectDir, ".gsd-t", "token-log.md");
    const note = entry.exitCode === 0 ? "headless spawn: ok" : `headless spawn: exit ${entry.exitCode}`;
    // v3.12.14: prefer env-var model over the old hardcoded "unknown". The
    // parent session should have set GSD_T_MODEL before invoking spawn; fall
    // back to "unknown" if not (graceful).
    const model = process.env.GSD_T_MODEL || "unknown";
    const row =
      `| ${entry.dtStart} | ${entry.dtEnd} | ${entry.command} | headless | ${model} | ${entry.durationS}s | ${note} | - | - | unknown |\n`;
    if (!fs.existsSync(logPath)) {
      // Create with header
      ensureDir(path.dirname(logPath));
      fs.writeFileSync(logPath, `# GSD-T Token Log\n\n${TOKEN_LOG_HEADER}${row}`);
    } else {
      // Check if header row exists; if not prepend it (migration for files created before this fix)
      const existing = fs.readFileSync(logPath, "utf8");
      if (!existing.includes("| Datetime-start |")) {
        fs.writeFileSync(logPath, `# GSD-T Token Log\n\n${TOKEN_LOG_HEADER}${existing}${row}`);
      } else {
        fs.appendFileSync(logPath, row);
      }
    }
  } catch (_) {
    /* best-effort — never halt the completion watcher */
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function stripGsdtPrefix(command) {
  if (typeof command !== "string") return "";
  return command.replace(/^gsd-t-/, "");
}
