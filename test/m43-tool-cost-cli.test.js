'use strict';
/**
 * M43 D2 — `gsd-t tool-cost` CLI smoke tests.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = require('../bin/gsd-t-tool-cost.cjs');

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d2-cli-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  // Minimal, deterministic synthetic fixture: one session, two turns, three tools.
  // ts is the ISO UTC join key; startedAt is the local display string.
  // For testing we set them equivalent (assume UTC locale equivalence).
  const turns = [
    {
      schemaVersion: 2, ts: '2026-04-21T10:00:00.000Z', source: 'live',
      command: 'gsd-t-execute', step: 'turn', model: 'sonnet',
      startedAt: '2026-04-21 10:00', endedAt: '2026-04-21 10:00',
      durationMs: 0, inputTokens: 0, outputTokens: 100,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      costUSD: 1.0, domain: 'auth', task: 'T-1', milestone: 'M43',
      ctxPct: null, notes: null, hasUsage: true,
      session_id: 's1', turn_id: 'A', sessionType: 'in-session',
    },
    {
      schemaVersion: 2, ts: '2026-04-21T10:05:00.000Z', source: 'live',
      command: 'gsd-t-verify', step: 'turn', model: 'sonnet',
      startedAt: '2026-04-21 10:05', endedAt: '2026-04-21 10:05',
      durationMs: 0, inputTokens: 0, outputTokens: 200,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      costUSD: 2.0, domain: 'payments', task: 'T-2', milestone: 'M43',
      ctxPct: null, notes: null, hasUsage: true,
      session_id: 's1', turn_id: 'B', sessionType: 'in-session',
    },
  ];
  fs.writeFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'),
    turns.map((t) => JSON.stringify(t)).join('\n') + '\n');
  const events = [
    { ts: '2026-04-21T10:00:30.000Z', event_type: 'tool_call', agent_id: 's1',
      reasoning: 'Bash', command: null, phase: null, trace_id: null,
      parent_agent_id: null, outcome: null },
    { ts: '2026-04-21T10:01:00.000Z', event_type: 'tool_call', agent_id: 's1',
      reasoning: 'Read', command: null, phase: null, trace_id: null,
      parent_agent_id: null, outcome: null },
    { ts: '2026-04-21T10:06:00.000Z', event_type: 'tool_call', agent_id: 's1',
      reasoning: 'Grep', command: null, phase: null, trace_id: null,
      parent_agent_id: null, outcome: null },
  ];
  fs.writeFileSync(path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return dir;
}

function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// ── parseArgs ────────────────────────────────────────────────────────

test('parseArgs — defaults', () => {
  const o = cli.parseArgs([]);
  assert.equal(o.groupBy, 'tool');
  assert.equal(o.format, 'table');
  assert.equal(o.since, null);
  assert.equal(o.milestone, null);
});

test('parseArgs — all flag forms (space and =)', () => {
  const o1 = cli.parseArgs(['--group-by', 'command', '--format', 'json', '--since', '2026-04-01', '--milestone', 'M43']);
  assert.equal(o1.groupBy, 'command');
  assert.equal(o1.format, 'json');
  assert.equal(o1.since, '2026-04-01');
  assert.equal(o1.milestone, 'M43');
  const o2 = cli.parseArgs(['--group-by=domain', '--format=table']);
  assert.equal(o2.groupBy, 'domain');
  assert.equal(o2.format, 'table');
});

test('parseArgs — rejects bad --group-by and --format', () => {
  assert.throws(() => cli.parseArgs(['--group-by', 'widget']), /tool\|command\|domain/);
  assert.throws(() => cli.parseArgs(['--format', 'yaml']),     /table\|json/);
});

// ── compute / render against fixture ─────────────────────────────────

test('compute — default group-by tool against synthetic fixture', () => {
  const dir = makeFixture();
  try {
    const opts = cli.parseArgs([
      '--project-dir', dir,
      '--group-by', 'tool',
    ]);
    const agg = cli.compute(opts);
    // Bash (turn A → 50), Read (turn A → 50), Grep (turn B → 200). Zero-byte
    // turn tie-breaker applies (all events have bytes=0 since event schema
    // doesn't carry bytes): equal split within each turn.
    const keys = agg.map((r) => r.key);
    assert.ok(keys.includes('Bash'));
    assert.ok(keys.includes('Read'));
    assert.ok(keys.includes('Grep'));
    // Total cost across all tools should equal the sum of turn costs.
    const totalCost = agg.reduce((s, r) => s + r.total_cost_usd, 0);
    assert.ok(Math.abs(totalCost - 3.0) < 1e-9, `expected total cost ≈ 3.0, got ${totalCost}`);
    // Grep should be #1 (captured full 200-token/2.0 cost turn B).
    assert.equal(agg[0].key, 'Grep');
    assert.ok(Math.abs(agg[0].total_cost_usd - 2.0) < 1e-9);
  } finally { cleanup(dir); }
});

test('compute — --group-by command', () => {
  const dir = makeFixture();
  try {
    const opts = cli.parseArgs([
      '--project-dir', dir,
      '--group-by', 'command',
    ]);
    const agg = cli.compute(opts);
    const cmds = agg.map((r) => r.key).sort();
    assert.deepEqual(cmds, ['gsd-t-execute', 'gsd-t-verify']);
    const verify = agg.find((r) => r.key === 'gsd-t-verify');
    assert.ok(Math.abs(verify.total_cost_usd - 2.0) < 1e-9);
  } finally { cleanup(dir); }
});

test('compute — --format json renders NDJSON', () => {
  const dir = makeFixture();
  try {
    const opts = cli.parseArgs([
      '--project-dir', dir,
      '--format', 'json',
    ]);
    const agg = cli.compute(opts);
    const out = cli.renderJson(agg);
    const lines = out.split('\n').filter(Boolean);
    assert.ok(lines.length >= 1);
    for (const line of lines) {
      const obj = JSON.parse(line);
      assert.ok('key' in obj && 'total_cost_usd' in obj && 'turn_count' in obj);
    }
  } finally { cleanup(dir); }
});

test('compute — empty sink (no token-usage.jsonl) returns empty array', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d2-empty-'));
  try {
    const opts = cli.parseArgs(['--project-dir', dir]);
    const agg = cli.compute(opts);
    assert.deepEqual(agg, []);
    const out = cli.renderTable(agg, opts);
    assert.ok(out.includes('(no data)'));
  } finally { cleanup(dir); }
});

test('compute — --since filters old turns out', () => {
  const dir = makeFixture();
  try {
    // since AFTER the fixture day → empty.
    const opts = cli.parseArgs([
      '--project-dir', dir,
      '--since', '2026-05-01',
    ]);
    const agg = cli.compute(opts);
    assert.deepEqual(agg, []);
  } finally { cleanup(dir); }
});
