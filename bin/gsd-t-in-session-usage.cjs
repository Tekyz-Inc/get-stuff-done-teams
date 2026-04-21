'use strict';
/**
 * GSD-T In-Session Usage Capture (M43 D1)
 *
 * Writes one schema-v2 row per **assistant turn** of an interactive Claude Code
 * session to `.gsd-t/metrics/token-usage.jsonl`, so the dialog channel is
 * observable alongside the headless spawns M41 already covers.
 *
 * Branch B (transcript-sourced). Claude Code hook payloads (Stop / SessionEnd /
 * PostToolUse) do not carry `usage`, but every payload contains
 * `transcript_path` — the on-disk jsonl Claude Code appends assistant turns to.
 * This module reads the transcript, extracts `message.usage` envelopes per
 * assistant turn (keyed by `message.id` for dedup), and hands each new envelope
 * to `recordSpawnRow` from `bin/gsd-t-token-capture.cjs` with
 * `sessionType: 'in-session'`.
 *
 * Dedup state lives per `session_id` in `.gsd-t/.in-session-cursor.json` —
 * tracks the last-seen `message.id` so repeated Stop fires within the same
 * session only append new rows.
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 */

const fs = require('fs');
const path = require('path');

const capture = require('./gsd-t-token-capture.cjs');

const CURSOR_REL = path.join('.gsd-t', '.in-session-cursor.json');

// ── Cursor state ─────────────────────────────────────────────────────

function _loadCursor(projectDir) {
  const p = path.join(projectDir, CURSOR_REL);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

function _saveCursor(projectDir, state) {
  const p = path.join(projectDir, CURSOR_REL);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

// ── Transcript parsing ───────────────────────────────────────────────

function _parseJsonLineSafe(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '{') return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

/**
 * Walk a Claude Code transcript jsonl and return assistant-turn usage entries.
 *
 * Each returned entry: { messageId, model, usage, timestamp, turnIndex }
 * - `messageId` from `message.id` (stable per assistant turn)
 * - `model` from `message.model`
 * - `usage` from `message.usage` (the full envelope — schema lines up with
 *   Anthropic API usage + Claude Code's additions like `cache_creation`,
 *   `service_tier`, `iterations[]`).
 * - `timestamp` from the transcript line's `timestamp` field (ISO-8601)
 * - `turnIndex` 0-based position among usage-bearing lines in the transcript
 */
function extractTurns(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  const text = fs.readFileSync(transcriptPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const out = [];
  let turnIndex = 0;
  for (const line of lines) {
    const j = _parseJsonLineSafe(line);
    if (!j) continue;
    const msg = j.message;
    if (!msg || typeof msg !== 'object') continue;
    if (msg.role && msg.role !== 'assistant') continue;
    const usage = msg.usage;
    if (!usage || typeof usage !== 'object') continue;
    out.push({
      messageId: msg.id || j.uuid || null,
      model: msg.model || null,
      usage,
      timestamp: j.timestamp || null,
      turnIndex: turnIndex++,
    });
  }
  return out;
}

// ── Row emission ─────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }
function _fmtDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return _fmtDateTime(new Date().toISOString());
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Capture usage for one in-session turn.
 *
 * Low-level entry point: caller supplies the usage envelope directly. Used by
 * unit tests and by the hook handler after extracting a turn from the
 * transcript.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string} opts.sessionId
 * @param {string|number} opts.turnId    unique-per-session identifier
 * @param {object|null} opts.usage       Claude usage envelope (may be null)
 * @param {string} [opts.model]
 * @param {string} [opts.command]        e.g. 'in-session' or 'dialog'
 * @param {string} [opts.ts]             ISO-8601; defaults to now
 * @returns {{jsonlPath: string, tokenLogPath: string}}
 */
function captureInSessionUsage(opts) {
  if (!opts || !opts.projectDir) throw new Error('captureInSessionUsage: projectDir required');
  if (opts.sessionId == null) throw new Error('captureInSessionUsage: sessionId required');
  if (opts.turnId == null) throw new Error('captureInSessionUsage: turnId required');

  const stamp = _fmtDateTime(opts.ts);
  return capture.recordSpawnRow({
    projectDir: opts.projectDir,
    command: opts.command || 'in-session',
    step: 'turn',
    model: opts.model || 'claude',
    startedAt: stamp,
    endedAt: stamp,
    usage: opts.usage || undefined,
    notes: 'in-session turn',
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    sessionType: 'in-session',
    // Canonical sink is JSONL; token-log.md is regenerated via
    // `gsd-t tokens --regenerate-log` (D3). Avoid polluting the markdown
    // log with per-turn rows (one session can have hundreds of turns).
    skipMarkdownLog: true,
  });
}

/**
 * Process a hook payload (Stop / SessionEnd) — read the transcript it points
 * at, emit rows for every assistant turn we haven't seen yet.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {object} opts.payload  raw hook payload as written by Claude Code
 * @returns {{sessionId: string|null, emitted: number, skipped: number, reason?: string}}
 */
function processHookPayload(opts) {
  const projectDir = (opts && opts.projectDir) || '.';
  const payload = opts && opts.payload;
  if (!payload || typeof payload !== 'object') {
    return { sessionId: null, emitted: 0, skipped: 0, reason: 'no-payload' };
  }
  const sessionId = payload.session_id || payload.sessionId || null;
  const transcriptPath = payload.transcript_path || payload.transcriptPath || null;
  if (!sessionId || !transcriptPath) {
    return { sessionId, emitted: 0, skipped: 0, reason: 'missing-session-or-transcript' };
  }

  const turns = extractTurns(transcriptPath);
  if (!turns.length) {
    return { sessionId, emitted: 0, skipped: 0, reason: 'no-turns' };
  }

  const cursor = _loadCursor(projectDir);
  const lastSeen = cursor[sessionId] && cursor[sessionId].lastMessageId;

  let startAt = 0;
  if (lastSeen) {
    const idx = turns.findIndex(t => t.messageId === lastSeen);
    if (idx >= 0) startAt = idx + 1;
  }

  let emitted = 0;
  let skipped = startAt;
  for (let i = startAt; i < turns.length; i++) {
    const turn = turns[i];
    const turnId = turn.messageId || `idx-${turn.turnIndex}`;
    captureInSessionUsage({
      projectDir,
      sessionId,
      turnId,
      usage: turn.usage,
      model: turn.model,
      command: 'in-session',
      ts: turn.timestamp,
    });
    emitted++;
  }

  const newLast = turns[turns.length - 1];
  cursor[sessionId] = {
    lastMessageId: newLast ? newLast.messageId : null,
    lastTurnIndex: newLast ? newLast.turnIndex : -1,
    lastUpdatedAt: new Date().toISOString(),
  };
  _saveCursor(projectDir, cursor);

  return { sessionId, emitted, skipped };
}

module.exports = {
  captureInSessionUsage,
  processHookPayload,
  extractTurns,
  _internal: { _loadCursor, _saveCursor },
};
