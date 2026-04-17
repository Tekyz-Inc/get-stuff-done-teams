#!/usr/bin/env node

/**
 * GSD-T Event Writer — Structured JSONL Event Appender
 *
 * Writes structured events to .gsd-t/events/YYYY-MM-DD.jsonl (UTC date rotation).
 * CLI for use from hooks and command files.
 *
 * Usage:
 *   node gsd-t-event-writer.js --type phase_transition --command gsd-t-wave \
 *     --phase execute --reasoning "Execute complete" --outcome success \
 *     --agent-id "$SESSION" --parent-id null --trace-id "$TRACE"
 *
 * Exit codes: 0 = success, 1 = validation error, 2 = filesystem error
 */

const fs = require("fs");
const path = require("path");

// ─── Schema ──────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  "command_invoked",
  "phase_transition",
  "subagent_spawn",
  "subagent_complete",
  "session_start",
  "session_end",
  "tool_call",
  "experience_retrieval",
  "outcome_tagged",
  "distillation",
  "task_complete",
]);

const VALID_OUTCOMES = new Set(["success", "failure", "learning", "deferred", null]);

// ─── Exports (for testing) ────────────────────────────────────────────────────
module.exports = { validateEvent, resolveEventsFile, appendEvent };

// ─── CLI Entry ───────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const event = buildEvent(args);
  const validationError = validateEvent(event);
  if (validationError) {
    process.stderr.write(validationError + "\n");
    process.exit(1);
  }
  const projectDir = process.env.GSD_T_PROJECT_DIR || process.cwd();
  const eventsFile = resolveEventsFile(projectDir);
  const exitCode = appendEvent(eventsFile, event);
  process.exit(exitCode);
}

// ─── Arg Parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const map = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith("--")) {
      map[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return map;
}

function nullify(val) {
  return val === undefined || val === "null" ? null : val;
}

function buildEvent(args) {
  // Env-var fallbacks: workers spawned by supervisor/headless-auto-spawn inherit
  // GSD_T_COMMAND and GSD_T_PHASE so tool_call events are tagged even when the
  // worker doesn't pass --command/--phase explicitly (Fix 2, v3.12.12).
  const envCommand = process.env.GSD_T_COMMAND || null;
  const envPhase = process.env.GSD_T_PHASE || null;

  return {
    ts: new Date().toISOString(),
    event_type: nullify(args["type"]),
    command: nullify(args["command"]) || envCommand,
    phase: nullify(args["phase"]) || envPhase,
    agent_id: nullify(args["agent-id"]),
    parent_agent_id: nullify(args["parent-id"]),
    trace_id: nullify(args["trace-id"]),
    reasoning: nullify(args["reasoning"]),
    outcome: nullify(args["outcome"]),
    model: nullify(args["model"]),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEvent(event) {
  if (!event || typeof event !== "object") return "Event must be an object";
  if (!event.event_type) return "Missing required field: --type";
  if (!VALID_EVENT_TYPES.has(event.event_type)) {
    return `Invalid event_type: "${event.event_type}". Must be one of: ${[...VALID_EVENT_TYPES].join(", ")}`;
  }
  if (!VALID_OUTCOMES.has(event.outcome)) {
    return `Invalid outcome: "${event.outcome}". Must be one of: success, failure, learning, deferred, null`;
  }
  return null;
}

// ─── File Resolution ──────────────────────────────────────────────────────────

function resolveEventsFile(projectDir) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return path.join(projectDir, ".gsd-t", "events", `${date}.jsonl`);
}

// ─── Append ───────────────────────────────────────────────────────────────────

function appendEvent(filePath, event) {
  try {
    const eventsDir = path.dirname(filePath);
    if (!fs.existsSync(eventsDir)) {
      fs.mkdirSync(eventsDir, { recursive: true });
    }
    // Symlink check — prevent writing to redirected files
    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) return 2;
    } catch {
      // File doesn't exist yet — safe to create
    }
    fs.appendFileSync(filePath, JSON.stringify(event) + "\n");
    return 0;
  } catch {
    return 2;
  }
}
