#!/usr/bin/env node

/**
 * GSD-T Task Counter — Real, deterministic context-burn gate.
 *
 * Replaces the broken CLAUDE_CONTEXT_TOKENS_USED self-check (which never
 * worked because Claude Code does not export those env vars). Instead of
 * trying to read the orchestrator's own token usage, we count completed
 * task subagent spawns. After N tasks the orchestrator MUST checkpoint
 * progress and STOP so the user can /clear and resume cleanly.
 *
 * State lives at .gsd-t/.task-counter (single JSON file). A counter
 * persists across orchestrator runs until a /clear-then-resume cycle
 * resets it via the `reset` command.
 *
 * Threshold defaults are conservative — five tasks per session before
 * stop. Override via:
 *   - .gsd-t/task-counter-config.json  { "limit": 8 }
 *   - env GSD_T_TASK_LIMIT=8
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * CLI usage (called from command markdown via `node bin/task-counter.cjs`):
 *   increment <kind>          → bump counter, print JSON status
 *   status                    → print JSON status without bumping
 *   reset                     → clear counter (called after /clear resume)
 *   should-stop               → exit 0 if okay to spawn, exit 10 if must stop
 *
 * JSON status shape:
 *   { count, limit, remaining, should_stop, started_at, last_kind }
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_LIMIT = 5;
const STATE_FILE = ".gsd-t/.task-counter";
const CONFIG_FILE = ".gsd-t/task-counter-config.json";

function projectDir() {
  return process.cwd();
}

function statePath() {
  return path.join(projectDir(), STATE_FILE);
}

function configPath() {
  return path.join(projectDir(), CONFIG_FILE);
}

function readLimit() {
  if (process.env.GSD_T_TASK_LIMIT) {
    const n = parseInt(process.env.GSD_T_TASK_LIMIT, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg.limit === "number" && cfg.limit > 0) return cfg.limit;
  } catch (_) {}
  return DEFAULT_LIMIT;
}

function readState() {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const s = JSON.parse(raw);
    return {
      count: typeof s.count === "number" ? s.count : 0,
      started_at: s.started_at || null,
      last_kind: s.last_kind || null,
      stopped: !!s.stopped,
    };
  } catch (_) {
    return { count: 0, started_at: null, last_kind: null, stopped: false };
  }
}

function writeState(s) {
  const dir = path.dirname(statePath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(s, null, 2));
}

function buildStatus(state, limit) {
  const remaining = Math.max(0, limit - state.count);
  return {
    count: state.count,
    limit,
    remaining,
    should_stop: state.count >= limit || state.stopped,
    started_at: state.started_at,
    last_kind: state.last_kind,
  };
}

function cmdIncrement(kind) {
  const s = readState();
  s.count += 1;
  s.last_kind = kind || "task";
  if (!s.started_at) s.started_at = new Date().toISOString();
  const limit = readLimit();
  if (s.count >= limit) s.stopped = true;
  writeState(s);
  return buildStatus(s, limit);
}

function cmdStatus() {
  return buildStatus(readState(), readLimit());
}

function cmdReset() {
  writeState({ count: 0, started_at: null, last_kind: null, stopped: false });
  return buildStatus(readState(), readLimit());
}

function cmdShouldStop() {
  return buildStatus(readState(), readLimit()).should_stop;
}

function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  switch (cmd) {
    case "increment": {
      const status = cmdIncrement(arg);
      process.stdout.write(JSON.stringify(status));
      process.exit(status.should_stop ? 10 : 0);
    }
    case "status": {
      process.stdout.write(JSON.stringify(cmdStatus()));
      process.exit(0);
    }
    case "reset": {
      process.stdout.write(JSON.stringify(cmdReset()));
      process.exit(0);
    }
    case "should-stop": {
      process.exit(cmdShouldStop() ? 10 : 0);
    }
    default: {
      process.stderr.write(
        "Usage: task-counter.cjs <increment|status|reset|should-stop> [kind]\n"
      );
      process.exit(2);
    }
  }
}

if (require.main === module) main();

module.exports = {
  cmdIncrement,
  cmdStatus,
  cmdReset,
  cmdShouldStop,
  readLimit,
  readState,
  DEFAULT_LIMIT,
};
