'use strict';
/**
 * M43 D2 — per-tool attribution library tests.
 *
 * Covers joinTurnsAndEvents, attributeTurn (all tie-breakers), and the three
 * aggregators against the tool-attribution-contract v1.0.0.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  joinTurnsAndEvents,
  attributeTurn,
  aggregateByTool,
  aggregateByCommand,
  aggregateByDomain,
} = require('../bin/gsd-t-tool-attribution.cjs');

// ── Fixtures ─────────────────────────────────────────────────────────

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d2-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function turnRow(partial) {
  return Object.assign({
    schemaVersion: 2,
    ts: '2026-04-21T10:00:00.000Z',
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
    turn_id: 'turn-1',
    sessionType: 'in-session',
  }, partial);
}

function evt(partial) {
  return Object.assign({
    ts: '2026-04-21T10:00:01.000Z',
    event_type: 'tool_call',
    command: null,
    phase: null,
    trace_id: null,
    agent_id: 'sess-1',
    parent_agent_id: null,
    reasoning: 'Bash',
    outcome: null,
  }, partial);
}

function writeJsonl(p, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// ── attributeTurn: core cases ────────────────────────────────────────

test('attributeTurn — single-tool turn: 100% share to the one call', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: 'cmd', domain: null, milestone: null,
    usage: { input_tokens: 10, output_tokens: 100, cache_read: 0, cache_creation: 0, cost_usd: 0.10 },
    tool_calls: [{ tool_name: 'Bash', ts: 't', bytes: 500 }],
  });
  assert.equal(r.attributions.length, 1);
  const a = r.attributions[0];
  assert.equal(a.tool_name, 'Bash');
  assert.equal(a.share, 1);
  assert.equal(a.output_tokens_share, 100);
  assert.equal(a.cost_usd_share, 0.10);
  assert.equal(a.missing_tool_result, false);
});

test('attributeTurn — multi-tool proportional split by bytes', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: null, domain: null, milestone: null,
    usage: { input_tokens: 0, output_tokens: 1000, cache_read: 0, cache_creation: 0, cost_usd: 1.0 },
    tool_calls: [
      { tool_name: 'Bash', ts: 't', bytes: 300 },
      { tool_name: 'Read', ts: 't', bytes: 700 },
    ],
  });
  const [bash, read] = r.attributions;
  assert.equal(bash.tool_name, 'Bash');
  assert.equal(bash.share, 0.3);
  assert.equal(bash.output_tokens_share, 300);
  assert.equal(read.share, 0.7);
  assert.equal(read.output_tokens_share, 700);
  assert.equal(bash.cost_usd_share + read.cost_usd_share, 1.0);
});

test('attributeTurn — zero-output tool_result among others (byte=0) is flagged missing_tool_result', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: null, domain: null, milestone: null,
    usage: { input_tokens: 0, output_tokens: 100, cache_read: 0, cache_creation: 0, cost_usd: null },
    tool_calls: [
      { tool_name: 'Read', ts: 't', bytes: 100 },
      { tool_name: 'Bash', ts: 't', bytes: 0 },
    ],
  });
  const bash = r.attributions.find((a) => a.tool_name === 'Bash');
  const read = r.attributions.find((a) => a.tool_name === 'Read');
  assert.equal(bash.missing_tool_result, true);
  assert.equal(bash.share, 0);
  assert.equal(bash.output_tokens_share, 0);
  assert.equal(read.share, 1);
  assert.equal(read.output_tokens_share, 100);
  assert.equal(read.cost_usd_share, null);
});

test('attributeTurn — zero-byte turn (all bytes = 0) → equal split among N', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: null, domain: null, milestone: null,
    usage: { input_tokens: 0, output_tokens: 90, cache_read: 0, cache_creation: 0, cost_usd: 3.0 },
    tool_calls: [
      { tool_name: 'Bash', ts: 't', bytes: 0 },
      { tool_name: 'Grep', ts: 't', bytes: 0 },
      { tool_name: 'Read', ts: 't', bytes: 0 },
    ],
  });
  assert.equal(r.attributions.length, 3);
  for (const a of r.attributions) {
    assert.ok(Math.abs(a.share - 1/3) < 1e-9);
    assert.ok(Math.abs(a.output_tokens_share - 30) < 1e-9);
    assert.ok(Math.abs(a.cost_usd_share - 1.0) < 1e-9);
  }
});

test('attributeTurn — no tool calls → all tokens to "no-tool" bucket', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: null, domain: null, milestone: null,
    usage: { input_tokens: 42, output_tokens: 100, cache_read: 5, cache_creation: 7, cost_usd: 0.5 },
    tool_calls: [],
  });
  assert.equal(r.attributions.length, 1);
  const a = r.attributions[0];
  assert.equal(a.tool_name, 'no-tool');
  assert.equal(a.share, 1);
  assert.equal(a.input_tokens_share, 42);
  assert.equal(a.output_tokens_share, 100);
  assert.equal(a.cache_read_share, 5);
  assert.equal(a.cache_creation_share, 7);
  assert.equal(a.cost_usd_share, 0.5);
});

test('attributeTurn — null cost_usd propagates through every share as null', () => {
  const r = attributeTurn({
    turn_id: 't1', session_id: 's1', command: null, domain: null, milestone: null,
    usage: { input_tokens: 0, output_tokens: 10, cache_read: 0, cache_creation: 0, cost_usd: null },
    tool_calls: [
      { tool_name: 'Bash', ts: 't', bytes: 5 },
      { tool_name: 'Read', ts: 't', bytes: 5 },
    ],
  });
  for (const a of r.attributions) assert.equal(a.cost_usd_share, null);
});

// ── joinTurnsAndEvents ──────────────────────────────────────────────

test('joinTurnsAndEvents — unmatched turn_id (turn with no events) yields tool_calls=[]', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ session_id: 'sX', turn_id: 'tX', outputTokens: 42, startedAt: '2026-04-21 10:00' }),
    ]);
    // No events file for sX.
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    assert.equal(joined.length, 1);
    assert.equal(joined[0].tool_calls.length, 0);
    const attr = attributeTurn(joined[0]);
    assert.equal(attr.attributions[0].tool_name, 'no-tool');
    assert.equal(attr.attributions[0].output_tokens_share, 42);
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — tool calls between turns map to the preceding turn', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ session_id: 's1', turn_id: 'A', ts: '2026-04-21T10:00:00.000Z', startedAt: '2026-04-21 10:00', outputTokens: 10 }),
      turnRow({ session_id: 's1', turn_id: 'B', ts: '2026-04-21T10:05:00.000Z', startedAt: '2026-04-21 10:05', outputTokens: 20 }),
      turnRow({ session_id: 's1', turn_id: 'C', ts: '2026-04-21T10:10:00.000Z', startedAt: '2026-04-21 10:10', outputTokens: 30 }),
    ]);
    writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), [
      evt({ ts: '2026-04-21T10:00:30.000Z', agent_id: 's1', reasoning: 'Bash' }),
      evt({ ts: '2026-04-21T10:06:00.000Z', agent_id: 's1', reasoning: 'Read' }),
      evt({ ts: '2026-04-21T10:06:30.000Z', agent_id: 's1', reasoning: 'Read' }),
    ]);
    const joined = joinTurnsAndEvents({ turnsPath: turns, eventsGlob: path.join(dir, '.gsd-t', 'events') });
    const byId = new Map(joined.map((r) => [r.turn_id, r]));
    // Turns carry ISO UTC ts; events carry ISO UTC ts. 10:00:30 binds to A
    // (turn A @ 10:00:00 ≤ event ≤ turn B @ 10:05:00). 10:06:00 and 10:06:30
    // bind to B (between 10:05:00 and 10:10:00).
    assert.equal(byId.get('A').tool_calls.length, 1);
    assert.equal(byId.get('A').tool_calls[0].tool_name, 'Bash');
    assert.equal(byId.get('B').tool_calls.length, 2);
    assert.equal(byId.get('C').tool_calls.length, 0);
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — since filter drops older turns', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ session_id: 's1', turn_id: 'old', startedAt: '2026-04-15 10:00' }),
      turnRow({ session_id: 's1', turn_id: 'new', startedAt: '2026-04-21 10:00', outputTokens: 50 }),
    ]);
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
      since: '2026-04-20',
    });
    assert.equal(joined.length, 1);
    assert.equal(joined[0].turn_id, 'new');
  } finally { cleanup(dir); }
});

test('joinTurnsAndEvents — milestone filter keeps matching rows only', () => {
  const dir = makeTmp();
  try {
    const turns = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    writeJsonl(turns, [
      turnRow({ session_id: 's1', turn_id: 'a', milestone: 'M42' }),
      turnRow({ session_id: 's1', turn_id: 'b', milestone: 'M43', outputTokens: 100 }),
    ]);
    const joined = joinTurnsAndEvents({
      turnsPath: turns,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
      milestone: 'M43',
    });
    assert.equal(joined.length, 1);
    assert.equal(joined[0].turn_id, 'b');
  } finally { cleanup(dir); }
});

// ── Aggregators ──────────────────────────────────────────────────────

test('aggregateByTool — deterministic ordering (cost desc, output desc, key asc)', () => {
  const rows = [
    {
      turn_id: 't1', session_id: 's', command: 'cmd', domain: null, milestone: null,
      usage: { input_tokens: 0, output_tokens: 100, cache_read: 0, cache_creation: 0, cost_usd: 1 },
      tool_calls: [
        { tool_name: 'Bash', ts: 't', bytes: 50 },
        { tool_name: 'Read', ts: 't', bytes: 50 },
      ],
    },
    {
      turn_id: 't2', session_id: 's', command: 'cmd', domain: null, milestone: null,
      usage: { input_tokens: 0, output_tokens: 100, cache_read: 0, cache_creation: 0, cost_usd: 1 },
      tool_calls: [
        { tool_name: 'Bash', ts: 't', bytes: 90 },
        { tool_name: 'Read', ts: 't', bytes: 10 },
      ],
    },
  ];
  const agg = aggregateByTool(rows);
  // Bash should dominate: 50 + 90 = 140 bytes out of 200 total vs 50 + 10.
  assert.equal(agg[0].key, 'Bash');
  assert.equal(agg[1].key, 'Read');
  assert.ok(agg[0].total_cost_usd > agg[1].total_cost_usd);
  // Deterministic: repeat call, identical output.
  const agg2 = aggregateByTool(rows);
  assert.deepEqual(agg.map((r) => r.key), agg2.map((r) => r.key));
  // turn_count should be 2 (both turns contributed to Bash).
  assert.equal(agg[0].turn_count, 2);
});

test('aggregateByCommand / aggregateByDomain group on the correct source field', () => {
  const rows = [
    {
      turn_id: 't1', session_id: 's', command: 'gsd-t-execute', domain: 'auth', milestone: null,
      usage: { input_tokens: 0, output_tokens: 50, cache_read: 0, cache_creation: 0, cost_usd: 0.5 },
      tool_calls: [{ tool_name: 'Bash', ts: 't', bytes: 100 }],
    },
    {
      turn_id: 't2', session_id: 's', command: 'gsd-t-verify', domain: 'auth', milestone: null,
      usage: { input_tokens: 0, output_tokens: 50, cache_read: 0, cache_creation: 0, cost_usd: 0.5 },
      tool_calls: [{ tool_name: 'Read', ts: 't', bytes: 100 }],
    },
  ];
  const byCmd = aggregateByCommand(rows);
  assert.equal(byCmd.length, 2);
  assert.deepEqual(byCmd.map((r) => r.key).sort(), ['gsd-t-execute', 'gsd-t-verify']);
  const byDomain = aggregateByDomain(rows);
  assert.equal(byDomain.length, 1);
  assert.equal(byDomain[0].key, 'auth');
  assert.equal(byDomain[0].total_cost_usd, 1.0);
  assert.equal(byDomain[0].turn_count, 2);
});

test('aggregateByTool — empty input returns empty array', () => {
  assert.deepEqual(aggregateByTool([]), []);
  assert.deepEqual(aggregateByTool(null), []);
  assert.deepEqual(aggregateByTool(undefined), []);
});
