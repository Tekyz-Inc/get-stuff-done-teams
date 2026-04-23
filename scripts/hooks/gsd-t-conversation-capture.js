#!/usr/bin/env node
'use strict';
/**
 * GSD-T Conversation Capture Hook (M45 D2)
 *
 * Captures the orchestrator session's conversational turns into
 * `.gsd-t/transcripts/in-session-{sessionId}.ndjson` so the visualizer
 * left rail can list the in-session conversation alongside spawn entries.
 *
 * Installed into `~/.claude/settings.json` (SessionStart, UserPromptSubmit,
 * Stop, optional PostToolUse). Reads the hook payload from stdin, dispatches
 * on `hook_event_name`, appends a typed NDJSON frame. Writes content-level
 * data (not just tokens — that's the job of `gsd-t-in-session-usage-hook.js`).
 *
 * Safety:
 * - Never throws to the caller — catches all errors, logs to stderr, exits 0.
 * - `content` is capped at 16 KB per frame; over-cap writes `truncated: true`.
 * - Append-only; never overwrites an existing in-session NDJSON file.
 * - Project-dir discovery: prefers `GSD_T_PROJECT_DIR`, then `payload.cwd`,
 *   then walks up from `process.cwd()` looking for `.gsd-t/progress.md`.
 *   Silent no-op if no project dir found.
 *
 * Contract: .gsd-t/contracts/conversation-capture-contract.md v1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SCRIPT_GUARD_MS = 5000;
const CONTENT_CAP_BYTES = 16 * 1024; // 16 KB
const MAX_STDIN = 1024 * 1024; // 1 MiB defense-in-depth
const started = Date.now();

function _readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    let aborted = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      if (aborted) return;
      buf += chunk;
      if (buf.length > MAX_STDIN) {
        aborted = true;
        try { process.stdin.destroy(); } catch (_) { /* noop */ }
        resolve('');
      }
    });
    process.stdin.on('end', () => { if (!aborted) resolve(buf); });
    process.stdin.on('error', () => resolve(buf));
    setTimeout(() => resolve(buf), DEFAULT_SCRIPT_GUARD_MS).unref();
  });
}

function _parsePayload(raw) {
  try { return JSON.parse(raw || '{}'); } catch (_) { return null; }
}

function _walkUpForProject(startDir) {
  try {
    let dir = path.resolve(startDir || '.');
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, '.gsd-t', 'progress.md'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (_) { /* swallow */ }
  return null;
}

function _resolveProjectDir(payload) {
  const env = process.env.GSD_T_PROJECT_DIR;
  if (env && fs.existsSync(path.join(env, '.gsd-t'))) return env;
  if (payload && typeof payload.cwd === 'string' && path.isAbsolute(payload.cwd)
      && fs.existsSync(path.join(payload.cwd, '.gsd-t'))) {
    return payload.cwd;
  }
  const walked = _walkUpForProject(process.cwd());
  if (walked) return walked;
  return null;
}

function _resolveSessionId(payload) {
  if (payload && typeof payload.session_id === 'string' && payload.session_id.length > 0) {
    return payload.session_id;
  }
  // Fallback: deterministic-ish per-process hash. Stable within one process,
  // different across processes. Keeps the filename non-empty when Claude Code
  // omits session_id (shouldn't happen in practice but we must not explode).
  const seed = String(process.pid) + ':' + String(started);
  return 'pid-' + crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);
}

function _capContent(raw) {
  if (raw == null) return { content: null, truncated: false };
  let str;
  if (typeof raw === 'string') str = raw;
  else {
    try { str = JSON.stringify(raw); } catch (_) { str = String(raw); }
  }
  const byteLen = Buffer.byteLength(str, 'utf8');
  if (byteLen <= CONTENT_CAP_BYTES) return { content: str, truncated: false };
  // Truncate by bytes; slice then re-decode to avoid breaking a multi-byte char.
  const buf = Buffer.from(str, 'utf8').subarray(0, CONTENT_CAP_BYTES);
  return { content: buf.toString('utf8'), truncated: true };
}

function _appendFrame(projectDir, sessionId, frame) {
  const transcriptsDir = path.join(projectDir, '.gsd-t', 'transcripts');
  try { fs.mkdirSync(transcriptsDir, { recursive: true }); } catch (_) { /* noop */ }
  const outPath = path.join(transcriptsDir, 'in-session-' + sessionId + '.ndjson');
  // Path-traversal guard: resolved path must stay under transcriptsDir.
  const resolvedOut = path.resolve(outPath);
  const resolvedDir = path.resolve(transcriptsDir) + path.sep;
  if (!resolvedOut.startsWith(resolvedDir)) return;
  fs.appendFileSync(outPath, JSON.stringify(frame) + '\n', 'utf8');
}

function _extractUserContent(payload) {
  // Claude Code UserPromptSubmit payload carries the prompt text.
  if (payload && typeof payload.prompt === 'string') return payload.prompt;
  if (payload && payload.message && typeof payload.message.content === 'string') {
    return payload.message.content;
  }
  if (payload && payload.user_message && typeof payload.user_message === 'string') {
    return payload.user_message;
  }
  return null;
}

function _extractAssistantContent(payload) {
  // Stop hook payloads vary. Try the common shapes; fall back to null so we
  // still emit a stub frame (ts + session_id only).
  if (payload && typeof payload.assistant_message === 'string') return payload.assistant_message;
  if (payload && payload.message && typeof payload.message.content === 'string') {
    return payload.message.content;
  }
  if (payload && typeof payload.content === 'string') return payload.content;
  return null;
}

function _buildUserFrame(payload, sessionId, ts) {
  const { content, truncated } = _capContent(_extractUserContent(payload));
  const frame = {
    type: 'user_turn',
    ts,
    session_id: sessionId,
  };
  if (content != null) frame.content = content;
  if (truncated) frame.truncated = true;
  if (payload && typeof payload.message_id === 'string') frame.message_id = payload.message_id;
  return frame;
}

function _buildAssistantFrame(payload, sessionId, ts) {
  const { content, truncated } = _capContent(_extractAssistantContent(payload));
  const frame = {
    type: 'assistant_turn',
    ts,
    session_id: sessionId,
  };
  if (content != null) frame.content = content;
  if (truncated) frame.truncated = true;
  if (payload && typeof payload.message_id === 'string') frame.message_id = payload.message_id;
  return frame;
}

function _buildSessionStartFrame(sessionId, ts) {
  return { type: 'session_start', ts, session_id: sessionId };
}

function _buildToolUseFrame(payload, sessionId, ts) {
  const frame = {
    type: 'tool_use',
    ts,
    session_id: sessionId,
  };
  if (payload && typeof payload.tool_name === 'string') frame.name = payload.tool_name;
  else if (payload && payload.tool && typeof payload.tool.name === 'string') frame.name = payload.tool.name;
  if (payload && typeof payload.tool_use_id === 'string') frame.tool_use_id = payload.tool_use_id;
  if (payload && typeof payload.duration_ms === 'number') frame.duration_ms = payload.duration_ms;
  return frame;
}

function _handle(payload) {
  if (!payload || typeof payload !== 'object') return;
  const event = payload.hook_event_name;
  if (!event) return;

  const projectDir = _resolveProjectDir(payload);
  if (!projectDir) return; // not a GSD-T project — silent no-op

  const sessionId = _resolveSessionId(payload);
  const ts = new Date().toISOString();

  switch (event) {
    case 'SessionStart': {
      _appendFrame(projectDir, sessionId, _buildSessionStartFrame(sessionId, ts));
      return;
    }
    case 'UserPromptSubmit': {
      _appendFrame(projectDir, sessionId, _buildUserFrame(payload, sessionId, ts));
      return;
    }
    case 'Stop': {
      _appendFrame(projectDir, sessionId, _buildAssistantFrame(payload, sessionId, ts));
      return;
    }
    case 'PostToolUse': {
      // Opt-in: guarded to keep default writes small.
      if (process.env.GSD_T_CAPTURE_TOOL_USES !== '1') return;
      _appendFrame(projectDir, sessionId, _buildToolUseFrame(payload, sessionId, ts));
      return;
    }
    default:
      return;
  }
}

async function main() {
  try {
    const raw = await _readStdin();
    const payload = _parsePayload(raw);
    if (!payload) return;
    _handle(payload);
  } catch (err) {
    try { process.stderr.write('gsd-t-conversation-capture: ' + (err && err.message || err) + '\n'); } catch (_) { /* noop */ }
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed > DEFAULT_SCRIPT_GUARD_MS) process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internal: {
    _parsePayload,
    _resolveProjectDir,
    _resolveSessionId,
    _capContent,
    _buildUserFrame,
    _buildAssistantFrame,
    _buildSessionStartFrame,
    _buildToolUseFrame,
    _appendFrame,
    _handle,
    CONTENT_CAP_BYTES,
  },
};
