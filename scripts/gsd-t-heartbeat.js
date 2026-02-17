#!/usr/bin/env node

/**
 * GSD-T Heartbeat — Claude Code Hook Event Writer
 *
 * Writes structured events to .gsd-t/heartbeat-{session_id}.jsonl
 * Installed as an async hook for multiple Claude Code events.
 *
 * Events captured:
 *   SessionStart, PostToolUse, SubagentStart, SubagentStop,
 *   TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd
 */

const fs = require("fs");
const path = require("path");

const MAX_STDIN = 1024 * 1024; // 1MB — prevent OOM from unbounded input
const SAFE_SID = /^[a-zA-Z0-9_-]+$/; // Allowlist for session_id — blocks path traversal
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — auto-cleanup threshold

let input = "";
let aborted = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  input += d;
  if (input.length > MAX_STDIN) {
    aborted = true;
    process.stdin.destroy();
  }
});
process.stdin.on("end", () => {
  if (aborted) return; // Silently discard oversized input
  try {
    const hook = JSON.parse(input);
    const dir = hook.cwd || process.cwd();

    // Validate cwd is absolute path
    if (!path.isAbsolute(dir)) return;

    const gsdtDir = path.join(dir, ".gsd-t");
    if (!fs.existsSync(gsdtDir)) return;

    const sid = hook.session_id || "unknown";

    // Validate session_id — block path traversal (e.g., "../../etc/evil")
    if (!SAFE_SID.test(sid)) return;

    const file = path.join(gsdtDir, `heartbeat-${sid}.jsonl`);

    // Verify resolved path is still within .gsd-t/ directory
    const resolvedFile = path.resolve(file);
    const resolvedDir = path.resolve(gsdtDir);
    if (!resolvedFile.startsWith(resolvedDir + path.sep)) return;

    const event = buildEvent(hook);
    if (event) {
      cleanupOldHeartbeats(gsdtDir);
      // Symlink check — prevent redirection of event data to arbitrary files
      try { if (fs.lstatSync(file).isSymbolicLink()) return; } catch { /* file doesn't exist yet — safe */ }
      fs.appendFileSync(file, JSON.stringify(event) + "\n");
    }
  } catch (e) {
    // Silent failure — never interfere with Claude Code
  }
});

function cleanupOldHeartbeats(gsdtDir) {
  try {
    const files = fs.readdirSync(gsdtDir);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith("heartbeat-") || !f.endsWith(".jsonl")) continue;
      const fp = path.join(gsdtDir, f);
      const stat = fs.lstatSync(fp);
      if (stat.isSymbolicLink()) continue; // Don't follow symlinks
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(fp);
      }
    }
  } catch {
    // Silent failure — never interfere with Claude Code
  }
}

function buildEvent(hook) {
  const base = {
    ts: new Date().toISOString(),
    sid: hook.session_id,
  };

  switch (hook.hook_event_name) {
    case "SessionStart":
      return {
        ...base,
        evt: "session_start",
        data: { source: hook.source, model: hook.model },
      };

    case "PostToolUse":
      return {
        ...base,
        evt: "tool",
        tool: hook.tool_name,
        data: summarize(hook.tool_name, hook.tool_input),
      };

    case "SubagentStart":
      return {
        ...base,
        evt: "agent_spawn",
        data: { agent_id: hook.agent_id, agent_type: hook.agent_type },
      };

    case "SubagentStop":
      return {
        ...base,
        evt: "agent_stop",
        data: { agent_id: hook.agent_id, agent_type: hook.agent_type },
      };

    case "TaskCompleted":
      return {
        ...base,
        evt: "task_done",
        data: { task: hook.task_subject, agent: hook.teammate_name },
      };

    case "TeammateIdle":
      return {
        ...base,
        evt: "agent_idle",
        data: { agent: hook.teammate_name, team: hook.team_name },
      };

    case "Notification":
      return {
        ...base,
        evt: "notification",
        data: { message: hook.message, title: hook.title },
      };

    case "Stop":
      return { ...base, evt: "session_stop" };

    case "SessionEnd":
      return {
        ...base,
        evt: "session_end",
        data: { reason: hook.reason },
      };

    default:
      return null;
  }
}

function summarize(tool, input) {
  if (!tool || !input) return {};
  switch (tool) {
    case "Read":
      return { file: shortPath(input.file_path) };
    case "Edit":
      return { file: shortPath(input.file_path) };
    case "Write":
      return { file: shortPath(input.file_path) };
    case "Bash":
      return {
        cmd: (input.command || "").slice(0, 150),
        desc: input.description,
      };
    case "Grep":
      return { pattern: input.pattern, path: shortPath(input.path) };
    case "Glob":
      return { pattern: input.pattern };
    case "Task":
      return { desc: input.description, type: input.subagent_type };
    case "WebSearch":
      return { query: input.query };
    case "WebFetch":
      return { url: input.url };
    case "NotebookEdit":
      return { file: shortPath(input.notebook_path) };
    default:
      return {};
  }
}

function shortPath(p) {
  if (!p) return null;
  // Convert absolute paths to relative for readability
  const cwd = process.cwd();
  if (p.startsWith(cwd)) {
    return p.slice(cwd.length + 1).replace(/\\/g, "/");
  }
  // For home-dir paths, abbreviate
  const home = require("os").homedir();
  if (p.startsWith(home)) {
    return "~" + p.slice(home.length).replace(/\\/g, "/");
  }
  return p.replace(/\\/g, "/");
}
