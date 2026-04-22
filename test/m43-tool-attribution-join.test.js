'use strict';
/**
 * M43 D2-fix — tool attribution join tests.
 *
 * Verifies the (session_id, turn_id) direct-join path that replaces the
 * lossy timestamp-window heuristic for tool_call events emitted by the
 * heartbeat hook after the D2 fix (tool_call events now carry `turn_id`
 * resolved from the transcript via `tool_use_id`).
 *
 * Also covers `resolveTurnIdFromTranscript` end-to-end against a fake
 * transcript fixture so that future refactors of the heartbeat hook can't
 * silently drop the resolution step.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  joinTurnsAndEvents,
  aggregateByTool,
} = require('../bin/gsd-t-tool-attribution.cjs');
const {
  buildEventStreamEntry,
  resolveTurnIdFromTranscript,
} = require('../scripts/gsd-t-heartbeat.js');

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d2-join-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeJsonl(p, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function turnRow(partial) {
  return Object.assign({
    schemaVersion: 2,
    ts: '2026-04-21T23:33:51.667Z', // Hook write-time — every row looks simultaneous
    source: 'live',
    command: 'in-session',
    step: 'turn',
    model: 'claude-opus-4-7',
    startedAt: '2026-04-21 10:00',
    endedAt:   '2026-04-21 10:00',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: null,
    domain: null,
    task: null,
    milestone: 'M43',
    ctxPct: null,
    notes: null,
    hasUsage: true,
    session_id: 'sess-1',
    turn_id: 'msg_turn_default',
    sessionType: 'in-session',
  }, partial);
}

// ── Direct-join via turn_id ──────────────────────────────────────────

test('joinTurnsAndEvents — events with turn_id join directly, bypassing timestamps', () => {
  const dir = makeTmp();
  try {
    // Three turns, all written at the same hook-fire instant (real-world case
    // where 500+ rows land in the same millisecond and the timestamp-window
    // matcher collapses every event onto turn A).
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ turn_id: 'A', outputTokens: 10 }),
      turnRow({ turn_id: 'B', outputTokens: 20 }),
      turnRow({ turn_id: 'C', outputTokens: 30 }),
    ]);
    // Events carry turn_id — direct join should place each event on its
    // own turn regardless of timestamps.
    writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), [
      { ts: '2026-04-21T10:00:00.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Bash', turn_id: 'A', tool_use_id: 'tu_A1' },
      { ts: '2026-04-21T10:00:01.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Read', turn_id: 'B', tool_use_id: 'tu_B1' },
      { ts: '2026-04-21T10:00:02.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Read', turn_id: 'B', tool_use_id: 'tu_B2' },
      { ts: '2026-04-21T10:00:03.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Edit', turn_id: 'C', tool_use_id: 'tu_C1' },
    ]);

    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    const byId = new Map(joined.map((r) => [r.turn_id, r]));
    assert.equal(byId.get('A').tool_calls.length, 1);
    assert.equal(byId.get('A').tool_calls[0].tool_name, 'Bash');
    assert.equal(byId.get('B').tool_calls.length, 2);
    assert.equal(byId.get('C').tool_calls.length, 1);
    assert.equal(byId.get('C').tool_calls[0].tool_name, 'Edit');
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — aggregate-by-tool attributes events across many tools', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    // Three turns each spending equal output tokens.
    writeJsonl(turns, [
      turnRow({ turn_id: 'A', outputTokens: 100 }),
      turnRow({ turn_id: 'B', outputTokens: 100 }),
      turnRow({ turn_id: 'C', outputTokens: 100 }),
    ]);
    writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), [
      { ts: '2026-04-21T10:00:00.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Bash', turn_id: 'A', bytes: 100 },
      { ts: '2026-04-21T10:00:00.100Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Read', turn_id: 'B', bytes: 100 },
      { ts: '2026-04-21T10:00:00.200Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Edit', turn_id: 'C', bytes: 100 },
    ]);
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    const agg = aggregateByTool(joined);
    const keys = agg.map((r) => r.key).sort();
    assert.deepEqual(keys, ['Bash', 'Edit', 'Read']);
    // Nothing should bucket into no-tool now that every turn has a direct hit.
    assert.ok(!keys.includes('no-tool'));
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — events without turn_id still join via timestamp window (back-compat)', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ turn_id: 'A', ts: '2026-04-21T10:00:00.000Z', outputTokens: 10 }),
      turnRow({ turn_id: 'B', ts: '2026-04-21T10:05:00.000Z', outputTokens: 20 }),
    ]);
    // Legacy event — no turn_id. Must still bind via the timestamp-window
    // matcher (tool_calls between turns map to the preceding turn).
    writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), [
      { ts: '2026-04-21T10:02:00.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Bash' },
    ]);
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    const byId = new Map(joined.map((r) => [r.turn_id, r]));
    assert.equal(byId.get('A').tool_calls.length, 1);
    assert.equal(byId.get('A').tool_calls[0].tool_name, 'Bash');
    assert.equal(byId.get('B').tool_calls.length, 0);
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — event with turn_id that doesn\'t match any turn falls through to window matcher', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ turn_id: 'A', ts: '2026-04-21T10:00:00.000Z', outputTokens: 10 }),
    ]);
    writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), [
      // turn_id 'unknown' isn't in the dataset — must fall through and still
      // get attributed via timestamp (to turn A, the only preceding turn).
      { ts: '2026-04-21T10:02:00.000Z', event_type: 'tool_call', agent_id: 'sess-1',
        reasoning: 'Bash', turn_id: 'unknown' },
    ]);
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    const byId = new Map(joined.map((r) => [r.turn_id, r]));
    assert.equal(byId.get('A').tool_calls.length, 1);
  } finally { cleanup(dir); }
});

// ── resolveTurnIdFromTranscript ──────────────────────────────────────

test('resolveTurnIdFromTranscript — finds parent message.id by tool_use.id', () => {
  const dir = makeTmp();
  try {
    const tp = path.join(dir, 'transcript.jsonl');
    const lines = [
      { type: 'user', message: { content: 'hi' } },
      {
        type: 'assistant',
        message: {
          id: 'msg_01PARENT',
          content: [
            { type: 'text', text: 'running a tool' },
            { type: 'tool_use', id: 'tu_TARGET', name: 'Bash', input: {} },
          ],
        },
      },
      { type: 'user', message: { content: 'result' } },
    ];
    fs.writeFileSync(tp, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    assert.equal(resolveTurnIdFromTranscript(tp, 'tu_TARGET'), 'msg_01PARENT');
  } finally { cleanup(dir); }
});

test('resolveTurnIdFromTranscript — returns null on missing transcript / missing id', () => {
  assert.equal(resolveTurnIdFromTranscript(null, 'tu_X'), null);
  assert.equal(resolveTurnIdFromTranscript('/no/such/file.jsonl', 'tu_X'), null);
  assert.equal(resolveTurnIdFromTranscript('/no/such/file.jsonl', null), null);
});

test('resolveTurnIdFromTranscript — returns null when tool_use_id not found', () => {
  const dir = makeTmp();
  try {
    const tp = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(tp, JSON.stringify({
      type: 'assistant',
      message: { id: 'msg_x', content: [{ type: 'text', text: 'hi' }] },
    }) + '\n');
    assert.equal(resolveTurnIdFromTranscript(tp, 'tu_MISSING'), null);
  } finally { cleanup(dir); }
});

// ── buildEventStreamEntry PostToolUse emits turn_id ──────────────────

test('buildEventStreamEntry — PostToolUse event carries turn_id + tool_use_id', () => {
  const dir = makeTmp();
  try {
    const tp = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(tp, JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg_01HOOKTEST',
        content: [{ type: 'tool_use', id: 'tu_HOOKTEST', name: 'Read', input: {} }],
      },
    }) + '\n');

    const entry = buildEventStreamEntry({
      hook_event_name: 'PostToolUse',
      session_id: 'sess-xyz',
      tool_name: 'Read',
      tool_use_id: 'tu_HOOKTEST',
      transcript_path: tp,
    });
    assert.equal(entry.event_type, 'tool_call');
    assert.equal(entry.agent_id, 'sess-xyz');
    assert.equal(entry.reasoning, 'Read');
    assert.equal(entry.turn_id, 'msg_01HOOKTEST');
    assert.equal(entry.tool_use_id, 'tu_HOOKTEST');
  } finally { cleanup(dir); }
});

test('buildEventStreamEntry — PostToolUse without transcript still emits event, turn_id=null', () => {
  const entry = buildEventStreamEntry({
    hook_event_name: 'PostToolUse',
    session_id: 'sess-abc',
    tool_name: 'Bash',
    tool_use_id: 'tu_NOTRX',
    // no transcript_path — older hook payloads / dry tests
  });
  assert.equal(entry.event_type, 'tool_call');
  assert.equal(entry.agent_id, 'sess-abc');
  assert.equal(entry.turn_id, null);
  assert.equal(entry.tool_use_id, 'tu_NOTRX');
});
