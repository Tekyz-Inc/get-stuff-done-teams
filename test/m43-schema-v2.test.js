'use strict';
/**
 * M43 D3 — schema v2 round-trip + regenerate-log determinism.
 *
 * Covers:
 *   - Backward compat: v1-shape caller produces a valid v2 row (schemaVersion=2, no new fields).
 *   - v2 pass-through: session_id / turn_id / sessionType preserved on write+read.
 *   - Regenerate-log: byte-identical output on repeated run over same JSONL.
 *   - Regenerate-log: deterministic sort (startedAt asc → session_id asc → turn_id asc with numeric turn_ids).
 *   - Regenerate-log: missing-usage row renders `—` in Tokens column.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const capture = require('../bin/gsd-t-token-capture.cjs');
const regen = require('../bin/gsd-t-token-regenerate-log.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d3-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function readJsonlLines(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

// ── Backward compat ────────────────────────────────────────────────────

test('schema v2: v1-shape caller produces schemaVersion=2 row without v2 fields set', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-test',
      step: 'Step 1',
      model: 'sonnet',
      startedAt: '2026-04-21 10:00',
      endedAt:   '2026-04-21 10:02',
      usage: { input_tokens: 100, output_tokens: 50 },
      notes: 'v1-caller',
    });
    const [row] = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(row.schemaVersion, 2);
    assert.equal(row.inputTokens, 100);
    assert.equal(row.outputTokens, 50);
    assert.equal(row.hasUsage, true);
    assert.equal('session_id' in row, false);
    assert.equal('turn_id' in row, false);
    assert.equal('sessionType' in row, false);
    assert.equal('tool_attribution' in row, false);
    assert.equal('compaction_pressure' in row, false);
  } finally { cleanup(dir); }
});

test('schema v2: v2 caller preserves session_id / turn_id / sessionType', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-test',
      step: 'Step 1',
      model: 'sonnet',
      startedAt: '2026-04-21 10:00',
      endedAt:   '2026-04-21 10:01',
      usage: { input_tokens: 10, output_tokens: 5 },
      sessionId: 'sess-abc',
      turnId: 7,
      sessionType: 'in-session',
    });
    const [row] = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(row.session_id, 'sess-abc');
    assert.equal(row.turn_id, '7');
    assert.equal(row.sessionType, 'in-session');
  } finally { cleanup(dir); }
});

test('schema v2: tool_attribution + compaction_pressure pass-through only when provided', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-test',
      step: 'Step 1',
      model: 'sonnet',
      startedAt: '2026-04-21 10:00',
      endedAt:   '2026-04-21 10:01',
      usage: { input_tokens: 10, output_tokens: 5 },
      toolAttribution: [{ tool_name: 'Bash', bytes_attributed: 200, tokens_attributed: 40, share: 0.8 }],
      compactionPressure: { predicted_turns_to_compact: 5, score: 0.4, tripped: false },
    });
    const [row] = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(Array.isArray(row.tool_attribution), true);
    assert.equal(row.tool_attribution[0].tool_name, 'Bash');
    assert.equal(row.compaction_pressure.score, 0.4);
    assert.equal(row.compaction_pressure.tripped, false);
  } finally { cleanup(dir); }
});

test('schema v2: empty tool_attribution array is omitted (not written as [])', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-test',
      step: 'Step 1',
      model: 'sonnet',
      startedAt: '2026-04-21 10:00',
      endedAt:   '2026-04-21 10:01',
      usage: { input_tokens: 10, output_tokens: 5 },
      toolAttribution: [],
    });
    const [row] = readJsonlLines(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal('tool_attribution' in row, false);
  } finally { cleanup(dir); }
});

// ── Regenerate-log ─────────────────────────────────────────────────────

test('regenerate-log: idempotent — running twice yields byte-identical output', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir, command: 'gsd-t-a', step: 'S1', model: 'sonnet',
      startedAt: '2026-04-21 10:00', endedAt: '2026-04-21 10:01',
      usage: { input_tokens: 10, output_tokens: 5, total_cost_usd: 0.01 },
      sessionId: 'sA', turnId: 1, sessionType: 'in-session',
    });
    capture.recordSpawnRow({
      projectDir: dir, command: 'gsd-t-b', step: 'S2', model: 'haiku',
      startedAt: '2026-04-21 10:05', endedAt: '2026-04-21 10:06',
      usage: { input_tokens: 3, output_tokens: 2 },
      sessionId: 'sA', turnId: 2, sessionType: 'in-session',
    });
    const r1 = regen.regenerateLog({ projectDir: dir });
    const firstPass = fs.readFileSync(r1.wrote, 'utf8');
    const r2 = regen.regenerateLog({ projectDir: dir });
    const secondPass = fs.readFileSync(r2.wrote, 'utf8');
    assert.equal(firstPass, secondPass);
    assert.equal(r1.rowCount, 2);
  } finally { cleanup(dir); }
});

test('regenerate-log: deterministic sort by startedAt → session_id → turn_id (numeric)', () => {
  const dir = makeTmpProject();
  const jsonlPath = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  try {
    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    const rows = [
      { schemaVersion: 2, command: 'c', step: 's', model: 'sonnet', startedAt: '2026-04-21 10:00', endedAt: '2026-04-21 10:01', durationMs: 60000, inputTokens: 1, outputTokens: 1, hasUsage: true, session_id: 'b', turn_id: '2' },
      { schemaVersion: 2, command: 'c', step: 's', model: 'sonnet', startedAt: '2026-04-21 10:00', endedAt: '2026-04-21 10:01', durationMs: 60000, inputTokens: 1, outputTokens: 1, hasUsage: true, session_id: 'a', turn_id: '10' },
      { schemaVersion: 2, command: 'c', step: 's', model: 'sonnet', startedAt: '2026-04-21 10:00', endedAt: '2026-04-21 10:01', durationMs: 60000, inputTokens: 1, outputTokens: 1, hasUsage: true, session_id: 'a', turn_id: '2' },
      { schemaVersion: 2, command: 'c', step: 's', model: 'sonnet', startedAt: '2026-04-21 09:00', endedAt: '2026-04-21 09:01', durationMs: 60000, inputTokens: 1, outputTokens: 1, hasUsage: true, session_id: 'z', turn_id: '1' },
    ];
    fs.writeFileSync(jsonlPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const res = regen.regenerateLog({ projectDir: dir });
    const text = fs.readFileSync(res.wrote, 'utf8');
    const bodyLines = text.split('\n').filter(l => l.startsWith('| 2026-04-21'));
    // Expected order: 09:00 first, then 10:00 with session_id a t=2, a t=10 (numeric), b t=2
    assert.match(bodyLines[0], /09:00.*09:01/);
    assert.match(bodyLines[1], /10:00/);
    assert.match(bodyLines[2], /10:00/);
    assert.match(bodyLines[3], /10:00/);
    // a/2 before a/10 before b/2 (verify by checking sort output against sortRows directly)
    const sorted = regen.sortRows(rows);
    assert.equal(sorted[0].session_id, 'z'); // earliest startedAt wins
    assert.equal(sorted[1].session_id, 'a'); assert.equal(sorted[1].turn_id, '2');
    assert.equal(sorted[2].session_id, 'a'); assert.equal(sorted[2].turn_id, '10');
    assert.equal(sorted[3].session_id, 'b');
  } finally { cleanup(dir); }
});

test('regenerate-log: missing-usage row renders `—` in Tokens column', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir, command: 'gsd-t-no-usage', step: 'S', model: 'sonnet',
      startedAt: '2026-04-21 11:00', endedAt: '2026-04-21 11:01',
      // no usage
    });
    const res = regen.regenerateLog({ projectDir: dir });
    const text = fs.readFileSync(res.wrote, 'utf8');
    const bodyLine = text.split('\n').find(l => l.includes('gsd-t-no-usage'));
    assert.ok(bodyLine, 'row must be present');
    // The Tokens cell should be `—`
    assert.match(bodyLine, /\| — \|/);
  } finally { cleanup(dir); }
});

test('regenerate-log: empty JSONL → writes header-only file, rowCount 0', () => {
  const dir = makeTmpProject();
  try {
    const res = regen.regenerateLog({ projectDir: dir });
    assert.equal(res.rowCount, 0);
    const text = fs.readFileSync(res.wrote, 'utf8');
    assert.ok(text.includes(capture.NEW_HEADER));
    assert.ok(text.includes(capture.NEW_SEP));
  } finally { cleanup(dir); }
});

test('regenerate-log: schemaVersion=1 rows render correctly (backward compat)', () => {
  const dir = makeTmpProject();
  const jsonlPath = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  try {
    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    const v1Row = {
      schemaVersion: 1,
      ts: '2026-04-20T10:00:00Z',
      source: 'live',
      command: 'gsd-t-old', step: 'Step 1', model: 'sonnet',
      startedAt: '2026-04-20 10:00', endedAt: '2026-04-20 10:02',
      durationMs: 120000,
      inputTokens: 500, outputTokens: 200,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      costUSD: 0.05, domain: null, task: null, milestone: 'M40',
      ctxPct: 42, notes: null, hasUsage: true,
    };
    fs.writeFileSync(jsonlPath, JSON.stringify(v1Row) + '\n');
    const res = regen.regenerateLog({ projectDir: dir });
    const text = fs.readFileSync(res.wrote, 'utf8');
    assert.ok(text.includes('gsd-t-old'));
    assert.ok(text.includes('in=500 out=200'));
  } finally { cleanup(dir); }
});
