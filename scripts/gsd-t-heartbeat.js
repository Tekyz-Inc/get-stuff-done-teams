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

// ─── Exports (for testing) ───────────────────────────────────────────────────
module.exports = { scrubSecrets, scrubUrl, buildEvent, summarize, shortPath };

// ─── Main (stdin processing) ─────────────────────────────────────────────────
if (require.main === module) {

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
      if (hook.hook_event_name === "SessionStart") cleanupOldHeartbeats(gsdtDir);
      // Symlink check — prevent redirection of event data to arbitrary files
      try { if (fs.lstatSync(file).isSymbolicLink()) return; } catch { /* file doesn't exist yet — safe */ }
      fs.appendFileSync(file, JSON.stringify(event) + "\n");
    }
  } catch (e) {
    // Silent failure — never interfere with Claude Code
  }
});

} // end require.main

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

const EVENT_HANDLERS = {
  SessionStart: (h) => ({ evt: "session_start", data: { source: h.source, model: h.model } }),
  PostToolUse: (h) => ({ evt: "tool", tool: h.tool_name, agent_id: h.agent_id || null, data: summarize(h.tool_name, h.tool_input) }),
  SubagentStart: (h) => ({ evt: "agent_spawn", data: { agent_id: h.agent_id, agent_type: h.agent_type, parent_id: h.parent_agent_id || h.session_id, tokens: process.env.CLAUDE_CONTEXT_TOKENS_USED ? parseInt(process.env.CLAUDE_CONTEXT_TOKENS_USED, 10) : null } }),
  SubagentStop: (h) => ({ evt: "agent_stop", data: { agent_id: h.agent_id, agent_type: h.agent_type, parent_id: h.parent_agent_id || h.session_id, tokens: process.env.CLAUDE_CONTEXT_TOKENS_USED ? parseInt(process.env.CLAUDE_CONTEXT_TOKENS_USED, 10) : null } }),
  TaskCompleted: (h) => ({ evt: "task_done", data: { task: h.task_subject, agent: h.teammate_name } }),
  TeammateIdle: (h) => ({ evt: "agent_idle", data: { agent: h.teammate_name, team: h.team_name } }),
  Notification: (h) => ({ evt: "notification", data: { message: scrubSecrets(h.message), title: scrubSecrets(h.title) } }),
  Stop: () => ({ evt: "session_stop" }),
  SessionEnd: (h) => ({ evt: "session_end", data: { reason: h.reason } }),
};

function buildEvent(hook) {
  const handler = EVENT_HANDLERS[hook.hook_event_name];
  if (!handler) return null;
  return { ts: new Date().toISOString(), sid: hook.session_id, ...handler(hook) };
}

// Patterns that indicate sensitive values in CLI commands
const SECRET_FLAGS = /(--(password|token|secret|api[-_]?key|auth|credential|private[-_]?key)[\s=])\S+/gi;
const SECRET_SHORT = /(\s-p\s)\S+/gi;
const SECRET_ENV = /((API_KEY|SECRET|TOKEN|PASSWORD|BEARER|AUTH_TOKEN|PRIVATE_KEY|ACCESS_KEY|SECRET_KEY)=)\S+/gi;
const BEARER_HEADER = /(bearer\s+)\S+/gi;

function scrubSecrets(cmd) {
  if (!cmd) return cmd;
  return cmd
    .replace(SECRET_FLAGS, "$1***")
    .replace(SECRET_SHORT, "$1***")
    .replace(SECRET_ENV, "$1***")
    .replace(BEARER_HEADER, "$1***");
}

function scrubUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.search) return url;
    for (const key of u.searchParams.keys()) {
      u.searchParams.set(key, "***");
    }
    return u.toString();
  } catch { return url; }
}

function summarize(tool, input) {
  if (!tool || !input) return {};
  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
      return { file: shortPath(input.file_path) };
    case "Bash":
      return {
        cmd: scrubSecrets((input.command || "").slice(0, 150)),
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
      return { url: scrubUrl(input.url) };
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
