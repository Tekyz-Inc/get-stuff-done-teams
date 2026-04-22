'use strict';
/**
 * M44 — Token-Usage Optimization Report Generator.
 *
 * Tests the pure grouping/rollup primitives AND the end-to-end
 * `generateReport` entry-point on a deterministic tmp fixture.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rep = require('../bin/gsd-t-report-tokens.cjs');

// ── helpers ──────────────────────────────────────────────────────────

function _mkdir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
function _writeJsonl(p, rows) {
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function _turn(overrides) {
  return {
    schemaVersion: 2,
    ts: '2026-04-21T10:00:00.000Z',
    source: 'live',
    command: 'gsd-t-quick',
    step: 'turn',
    model: 'sonnet',
    startedAt: '2026-04-21 10:00',
    endedAt: '2026-04-21 10:00',
    durationMs: 0,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: null,
    domain: 'd1',
    task: 'T-1',
    milestone: 'M44',
    ctxPct: null,
    notes: null,
    hasUsage: true,
    session_id: 'sess-A',
    turn_id: 't-0',
    sessionType: 'in-session',
    ...overrides,
  };
}

function _comp(overrides) {
  return {
    ts: '2026-04-21T11:00:00.000Z',
    schemaVersion: 1,
    session_id: 'sess-B',
    prior_session_id: 'sess-A',
    source: 'compact-backfill',
    cwd: '/test',
    hook: 'SessionStart',
    trigger: 'auto',
    preTokens: 180000,
    ...overrides,
  };
}

// ── groupIntoCWs ─────────────────────────────────────────────────────

test('groupIntoCWs with 0 compactions → 1 CW per session_id', () => {
  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: '1' }),
    _turn({ ts: '2026-04-21T10:01:00.000Z', session_id: 'A', turn_id: '2' }),
    _turn({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', turn_id: '1' }),
  ];
  const cws = rep.groupIntoCWs({ turnRows: turns, compactionRows: [] });
  assert.equal(cws.length, 2);
  assert.equal(cws[0].sid, 'A');
  assert.equal(cws[0].turns.length, 2);
  assert.equal(cws[0].endedBy, 'iter end');  // earlier session, another follows
  assert.equal(cws[1].endedBy, 'run end');   // last session in the data
});

test('groupIntoCWs with 2 compactions within one iter → 3 CWs with correct endedBy', () => {
  // Chain: A → (compact auto) → B → (compact manual) → C.
  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: 'a1' }),
    _turn({ ts: '2026-04-21T11:30:00.000Z', session_id: 'B', turn_id: 'b1' }),
    _turn({ ts: '2026-04-21T13:30:00.000Z', session_id: 'C', turn_id: 'c1' }),
  ];
  const comps = [
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', prior_session_id: 'A', trigger: 'auto' }),
    _comp({ ts: '2026-04-21T13:00:00.000Z', session_id: 'C', prior_session_id: 'B', trigger: 'manual' }),
  ];
  const cws = rep.groupIntoCWs({ turnRows: turns, compactionRows: comps });
  assert.equal(cws.length, 3);
  assert.equal(cws[0].sid, 'A');
  assert.equal(cws[0].endedBy, 'compaction (auto)');
  assert.equal(cws[1].sid, 'B');
  assert.equal(cws[1].endedBy, 'compaction (manual)');
  assert.equal(cws[2].sid, 'C');
  assert.equal(cws[2].endedBy, 'run end');
});

test('groupIntoCWs dedups overlapping live + backfill compactions for same event', () => {
  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: 'a1' }),
    _turn({ ts: '2026-04-21T12:00:00.000Z', session_id: 'B', turn_id: 'b1' }),
  ];
  // Same (ts, session_id, prior_session_id) appears twice — once as live `compact`,
  // once as historical `compact-backfill`. Dedup must collapse to one event, and
  // live should win for trigger/source precedence.
  const comps = [
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', prior_session_id: 'A',
            source: 'compact-backfill', trigger: 'auto' }),
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', prior_session_id: 'A',
            source: 'compact',          trigger: 'manual' }),
  ];
  const cws = rep.groupIntoCWs({ turnRows: turns, compactionRows: comps });
  assert.equal(cws.length, 2);
  assert.equal(cws[0].endedBy, 'compaction (manual)'); // live variant wins
  assert.equal(cws[0].endedByCompaction.source, 'compact');
});

test('groupIntoCWs handles missing trigger by defaulting to auto (flagged)', () => {
  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: 'a1' }),
    _turn({ ts: '2026-04-21T12:00:00.000Z', session_id: 'B', turn_id: 'b1' }),
  ];
  const comps = [
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', prior_session_id: 'A', trigger: undefined }),
  ];
  delete comps[0].trigger;
  const cws = rep.groupIntoCWs({ turnRows: turns, compactionRows: comps });
  assert.equal(cws[0].endedBy, 'compaction (auto)');
  assert.equal(cws[0].missingTrigger, true);
});

// ── rollupCW ─────────────────────────────────────────────────────────

test('rollupCW sums tokens correctly, computes avgOutPerTurn + peakCtxPct', () => {
  const cw = {
    sid: 'X',
    turns: [
      { inputTokens: 100, outputTokens: 50,  cacheReadInputTokens: 10, cacheCreationInputTokens: 5,  ctxPct: 42 },
      { inputTokens: 200, outputTokens: 150, cacheReadInputTokens: 20, cacheCreationInputTokens: 10, ctxPct: 71 },
      { inputTokens:  50, outputTokens: 100, cacheReadInputTokens: 30, cacheCreationInputTokens: 15, ctxPct: 58 },
    ],
    endedBy: 'run end',
    start: 1000, end: 5000,
  };
  const r = rep.rollupCW(cw);
  assert.equal(r.input, 350);
  assert.equal(r.output, 300);
  assert.equal(r.cacheRead, 60);
  assert.equal(r.cacheCreation, 30);
  assert.equal(r.turns, 3);
  assert.equal(r.avgOutPerTurn, 100);
  assert.equal(r.peakCtxPct, 71);
  assert.equal(r.endedBy, 'run end');
});

test('rollupCW handles ctxPct nulls gracefully', () => {
  const cw = {
    sid: 'X',
    turns: [{ inputTokens: 1, outputTokens: 1, ctxPct: null }, { inputTokens: 1, outputTokens: 1 }],
    endedBy: 'run end',
  };
  const r = rep.rollupCW(cw);
  assert.equal(r.peakCtxPct, null);
});

// ── topNExpensiveTurns ───────────────────────────────────────────────

test('topNExpensiveTurns returns n=20 sorted descending', () => {
  const turns = [];
  for (let i = 0; i < 30; i++) {
    turns.push(_turn({ inputTokens: i * 10, outputTokens: i * 5, turn_id: `t${i}` }));
  }
  const top = rep.topNExpensiveTurns(turns, 20);
  assert.equal(top.length, 20);
  assert.equal(top[0].total, 29 * 10 + 29 * 5); // largest input+output
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i-1].total >= top[i].total, 'not descending');
  }
});

test('topNExpensiveTurns handles fewer than N rows', () => {
  const turns = [
    _turn({ inputTokens: 1, outputTokens: 1 }),
    _turn({ inputTokens: 5, outputTokens: 5 }),
  ];
  const top = rep.topNExpensiveTurns(turns, 20);
  assert.equal(top.length, 2);
  assert.equal(top[0].total, 10);
});

// ── groupCompactionEvents ────────────────────────────────────────────

test('groupCompactionEvents enriches with last-turn-before-ts activity', () => {
  const turns = [
    _turn({ ts: '2026-04-21T09:00:00.000Z', command: 'gsd-t-execute', domain: 'auth', task: 'T-1' }),
    _turn({ ts: '2026-04-21T10:30:00.000Z', command: 'gsd-t-verify',  domain: 'pay',  task: 'T-2' }),
    _turn({ ts: '2026-04-21T12:00:00.000Z', command: 'gsd-t-quick',   domain: 'ui',   task: 'T-3' }),
  ];
  const comps = [
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'sess-B', prior_session_id: 'sess-A' }),
  ];
  const out = rep.groupCompactionEvents(comps, turns);
  assert.equal(out.length, 1);
  assert.equal(out[0].activeCommand, 'gsd-t-verify'); // last turn before 11:00
  assert.equal(out[0].activeDomain, 'pay');
  assert.equal(out[0].activeTask, 'T-2');
});

// ── generateReport (end-to-end) ──────────────────────────────────────

test('generateReport end-to-end writes markdown with all 4 sections + correct CW count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-report-'));
  _mkdir(path.join(dir, '.gsd-t', 'metrics'));
  _mkdir(path.join(dir, '.gsd-t', 'events'));

  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: 'a1', outputTokens: 500, ctxPct: 40 }),
    _turn({ ts: '2026-04-21T10:30:00.000Z', session_id: 'A', turn_id: 'a2', outputTokens: 700, ctxPct: 65 }),
    _turn({ ts: '2026-04-21T12:00:00.000Z', session_id: 'B', turn_id: 'b1', outputTokens: 300, ctxPct: 25 }),
  ];
  const comps = [
    _comp({ ts: '2026-04-21T11:00:00.000Z', session_id: 'B', prior_session_id: 'A' }),
  ];
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), turns);
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl'), comps);

  const events = [
    { ts: '2026-04-21T10:00:15.000Z', event_type: 'tool_call', agent_id: 'A', turn_id: 'a1',
      reasoning: 'Bash', command: null, phase: null, trace_id: null, parent_agent_id: null, outcome: null },
    { ts: '2026-04-21T10:30:15.000Z', event_type: 'tool_call', agent_id: 'A', turn_id: 'a2',
      reasoning: 'Read', command: null, phase: null, trace_id: null, parent_agent_id: null, outcome: null },
  ];
  _writeJsonl(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'), events);

  const res = rep.generateReport({ projectDir: dir, date: '2026-04-21' });
  assert.ok(fs.existsSync(res.path));
  const md = fs.readFileSync(res.path, 'utf8');
  assert.match(md, /# Token Usage Optimization Report — 2026-04-21/);
  assert.match(md, /## A — Per-CW Rollup/);
  assert.match(md, /## B — Tool-Tokens Rollup/);
  assert.match(md, /## C — Top 20 Expensive Turns/);
  assert.match(md, /## D — Compaction Events/);
  assert.match(md, /CW-1/);
  assert.match(md, /CW-2/);
  assert.equal(res.summary.cws, 2);
  assert.equal(res.summary.compactionEndedCWs, 1);
  assert.equal(res.summary.sessions, 2);
});

test('generateReport renders endedBy=run end for last CW without a following compaction', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-report-rune-'));
  _mkdir(path.join(dir, '.gsd-t', 'metrics'));
  _mkdir(path.join(dir, '.gsd-t', 'events'));

  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'only-sess', turn_id: 't1' }),
  ];
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), turns);
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl'), []);

  const res = rep.generateReport({ projectDir: dir, date: '2026-04-21' });
  const md = fs.readFileSync(res.path, 'utf8');
  assert.match(md, /run end/);
  assert.equal(res.summary.cws, 1);
  assert.equal(res.summary.compactionEndedCWs, 0);
});

test('generateReport survives missing compactions.jsonl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-report-nocomp-'));
  _mkdir(path.join(dir, '.gsd-t', 'metrics'));
  const turns = [_turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: 't1' })];
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), turns);
  // NB: no compactions.jsonl, no events dir either.
  const res = rep.generateReport({ projectDir: dir, date: '2026-04-21' });
  const md = fs.readFileSync(res.path, 'utf8');
  assert.match(md, /No compaction events recorded|compactions.jsonl/);
});

test('generateReport is idempotent — same inputs → same output path + deterministic Section A rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-report-idem-'));
  _mkdir(path.join(dir, '.gsd-t', 'metrics'));
  const turns = [
    _turn({ ts: '2026-04-21T10:00:00.000Z', session_id: 'A', turn_id: '1' }),
    _turn({ ts: '2026-04-21T10:01:00.000Z', session_id: 'A', turn_id: '2' }),
  ];
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), turns);
  _writeJsonl(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl'), []);

  const r1 = rep.generateReport({ projectDir: dir, date: '2026-04-21' });
  const md1 = fs.readFileSync(r1.path, 'utf8');
  // Small sleep-free idempotence check: strip the `Generated:` line (contains
  // a fresh ISO timestamp each call) and compare the rest.
  const strip = (s) => s.replace(/Generated: [^\n]+\n/, 'Generated: X\n');

  const r2 = rep.generateReport({ projectDir: dir, date: '2026-04-21' });
  const md2 = fs.readFileSync(r2.path, 'utf8');

  assert.equal(r1.path, r2.path);             // same output path
  assert.equal(strip(md1), strip(md2));       // deterministic body
});
