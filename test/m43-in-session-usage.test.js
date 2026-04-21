'use strict';
/**
 * M43 D1 — in-session usage capture (Branch B: transcript-sourced).
 *
 * Covers:
 *   - One-turn: fabricated transcript with 1 assistant usage line → 1 v2 row
 *   - Multi-turn: 3 assistant usage lines → 3 v2 rows, distinct turn_id
 *   - Dedup: repeated hook fire over the same transcript emits zero new rows
 *   - Appended turns: a new turn after a cursor → exactly the delta emitted
 *   - Missing usage: assistant line without `usage` is ignored (no row)
 *   - Non-assistant lines: user lines are skipped
 *   - Missing transcript: processHookPayload returns reason=missing-*
 *   - captureInSessionUsage: direct call with null usage writes an `—` row
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const inSession = require('../bin/gsd-t-in-session-usage.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d1-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function writeTranscript(dir, name, lines) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return p;
}

function readJsonlLines(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

function assistantLine(id, usage, tsIso) {
  return {
    type: 'assistant',
    uuid: `uuid-${id}`,
    timestamp: tsIso || '2026-04-21T23:00:00.000Z',
    message: {
      id: `msg_${id}`,
      model: 'claude-opus-4-7',
      role: 'assistant',
      usage,
    },
  };
}

const USAGE_A = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0, total_cost_usd: 0.01 };
const USAGE_B = { input_tokens: 12, output_tokens: 7, cache_read_input_tokens: 110, cache_creation_input_tokens: 3, total_cost_usd: 0.02 };
const USAGE_C = { input_tokens: 8,  output_tokens: 4, cache_read_input_tokens: 120, cache_creation_input_tokens: 1, total_cost_usd: 0.015 };

// ── One-turn ──────────────────────────────────────────────────────────────

test('D1: one assistant turn → one in-session v2 row', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      assistantLine('a', USAGE_A),
    ]);
    const r = inSession.processHookPayload({
      projectDir: dir,
      payload: {
        session_id: 'session-1',
        transcript_path: tp,
        cwd: dir,
        hook_event_name: 'Stop',
      },
    });
    assert.equal(r.emitted, 1);
    assert.equal(r.sessionId, 'session-1');

    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].schemaVersion, 2);
    assert.equal(rows[0].sessionType, 'in-session');
    assert.equal(rows[0].session_id, 'session-1');
    assert.equal(rows[0].turn_id, 'msg_a');
    assert.equal(rows[0].inputTokens, 10);
    assert.equal(rows[0].outputTokens, 5);
    assert.equal(rows[0].cacheReadInputTokens, 100);
    assert.equal(rows[0].costUSD, 0.01);
    assert.equal(rows[0].model, 'claude-opus-4-7');
  } finally { cleanup(dir); }
});

// ── Multi-turn ────────────────────────────────────────────────────────────

test('D1: three assistant turns → three rows with distinct turn_id', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      assistantLine('a', USAGE_A, '2026-04-21T23:00:00.000Z'),
      assistantLine('b', USAGE_B, '2026-04-21T23:01:00.000Z'),
      assistantLine('c', USAGE_C, '2026-04-21T23:02:00.000Z'),
    ]);
    const r = inSession.processHookPayload({
      projectDir: dir,
      payload: { session_id: 'session-multi', transcript_path: tp, cwd: dir, hook_event_name: 'Stop' },
    });
    assert.equal(r.emitted, 3);

    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 3);
    const turnIds = rows.map(r => r.turn_id);
    assert.deepEqual(turnIds, ['msg_a', 'msg_b', 'msg_c']);
    assert.ok(rows.every(r => r.session_id === 'session-multi'));
    assert.ok(rows.every(r => r.sessionType === 'in-session'));
  } finally { cleanup(dir); }
});

// ── Dedup: repeated hook fire ─────────────────────────────────────────────

test('D1: repeated hook fire over same transcript emits zero new rows', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      assistantLine('a', USAGE_A),
      assistantLine('b', USAGE_B),
    ]);
    const payload = { session_id: 'session-dedup', transcript_path: tp, cwd: dir, hook_event_name: 'Stop' };

    const r1 = inSession.processHookPayload({ projectDir: dir, payload });
    assert.equal(r1.emitted, 2);

    const r2 = inSession.processHookPayload({ projectDir: dir, payload });
    assert.equal(r2.emitted, 0);
    assert.equal(r2.skipped, 2);

    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 2);
  } finally { cleanup(dir); }
});

// ── Appended-turn delta ───────────────────────────────────────────────────

test('D1: a turn appended after first fire emits exactly one new row', () => {
  const dir = makeTmpProject();
  try {
    const tp = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(tp, JSON.stringify(assistantLine('a', USAGE_A)) + '\n');
    const payload = { session_id: 'session-delta', transcript_path: tp, cwd: dir, hook_event_name: 'Stop' };

    const r1 = inSession.processHookPayload({ projectDir: dir, payload });
    assert.equal(r1.emitted, 1);

    fs.appendFileSync(tp, JSON.stringify(assistantLine('b', USAGE_B)) + '\n');
    const r2 = inSession.processHookPayload({ projectDir: dir, payload });
    assert.equal(r2.emitted, 1);
    assert.equal(r2.skipped, 1);

    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => r.turn_id), ['msg_a', 'msg_b']);
  } finally { cleanup(dir); }
});

// ── Missing usage / non-assistant lines ───────────────────────────────────

test('D1: assistant line without usage is ignored; user lines are skipped', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      { type: 'user', uuid: 'u-1', timestamp: '2026-04-21T23:00:00Z', message: { role: 'user', content: 'hi' } },
      { type: 'assistant', uuid: 'a-no-usage', timestamp: '2026-04-21T23:00:01Z', message: { id: 'msg_noup', model: 'claude-opus-4-7', role: 'assistant' } },
      assistantLine('good', USAGE_A, '2026-04-21T23:00:02Z'),
    ]);
    const r = inSession.processHookPayload({
      projectDir: dir,
      payload: { session_id: 'session-filter', transcript_path: tp, cwd: dir, hook_event_name: 'Stop' },
    });
    assert.equal(r.emitted, 1);
    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].turn_id, 'msg_good');
  } finally { cleanup(dir); }
});

// ── Missing transcript / missing session ──────────────────────────────────

test('D1: missing transcript_path returns reason=missing-session-or-transcript', () => {
  const dir = makeTmpProject();
  try {
    const r = inSession.processHookPayload({
      projectDir: dir,
      payload: { session_id: 'session-x', cwd: dir, hook_event_name: 'Stop' },
    });
    assert.equal(r.emitted, 0);
    assert.equal(r.reason, 'missing-session-or-transcript');
  } finally { cleanup(dir); }
});

test('D1: non-existent transcript returns reason=no-turns (graceful)', () => {
  const dir = makeTmpProject();
  try {
    const r = inSession.processHookPayload({
      projectDir: dir,
      payload: {
        session_id: 'session-x',
        transcript_path: path.join(dir, 'does-not-exist.jsonl'),
        cwd: dir,
        hook_event_name: 'Stop',
      },
    });
    assert.equal(r.emitted, 0);
    assert.equal(r.reason, 'no-turns');
  } finally { cleanup(dir); }
});

// ── Direct captureInSessionUsage — null usage emits `—` row ───────────────

test('D1: captureInSessionUsage with null usage writes a row with hasUsage=false', () => {
  const dir = makeTmpProject();
  try {
    inSession.captureInSessionUsage({
      projectDir: dir,
      sessionId: 'session-direct',
      turnId: 'msg_direct',
      usage: null,
    });
    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasUsage, false);
    assert.equal(rows[0].sessionType, 'in-session');
    assert.equal(rows[0].session_id, 'session-direct');
    assert.equal(rows[0].turn_id, 'msg_direct');
    // In-session path writes JSONL only (skipMarkdownLog=true). The markdown
    // log is regenerated on demand via `gsd-t tokens --regenerate-log`.
    assert.equal(
      fs.existsSync(path.join(dir, '.gsd-t', 'token-log.md')),
      false,
      'token-log.md should NOT be written by per-turn in-session capture',
    );
  } finally { cleanup(dir); }
});

test('D1: multi-turn emission does NOT append to token-log.md (JSONL-only)', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      assistantLine('a', USAGE_A),
      assistantLine('b', USAGE_B),
      assistantLine('c', USAGE_C),
    ]);
    inSession.processHookPayload({
      projectDir: dir,
      payload: { session_id: 'session-md', transcript_path: tp, cwd: dir, hook_event_name: 'Stop' },
    });
    assert.equal(
      fs.existsSync(path.join(dir, '.gsd-t', 'token-log.md')),
      false,
      'token-log.md should stay untouched by in-session captures',
    );
    const rows = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 3);
  } finally { cleanup(dir); }
});

// ── Real probe payload shape (golden-style) ───────────────────────────────

test('D1: real-probe-shaped payload (session_id + transcript_path + cwd) processes without error', () => {
  const dir = makeTmpProject();
  try {
    const tp = writeTranscript(dir, 'transcript.jsonl', [
      assistantLine('real', USAGE_A),
    ]);
    const payload = {
      session_id: 'a5ee3b8e-1a77-4950-ab8d-f108af026c1d',
      transcript_path: tp,
      cwd: dir,
      permission_mode: 'bypassPermissions',
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'truncated...',
    };
    const r = inSession.processHookPayload({ projectDir: dir, payload });
    assert.equal(r.emitted, 1);
    assert.equal(r.sessionId, 'a5ee3b8e-1a77-4950-ab8d-f108af026c1d');
  } finally { cleanup(dir); }
});
