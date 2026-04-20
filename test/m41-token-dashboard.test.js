'use strict';

// M41 D4: token-dashboard unit tests.
// Covers:
//   1. aggregate() with empty/missing JSONL
//   2. aggregate() with populated JSONL (byDay, byCommand, byModel)
//   3. --since filter (YYYY-MM-DD prefix)
//   4. --milestone filter (skips records without milestone field)
//   5. Top-10 spawns sorted by cost desc
//   6. Cache-hit rate math per model
//   7. Rolling 7-day cutoff from Date.now()
//   8. renderTable produces expected sections
//   9. renderJson produces valid JSON
//  10. renderStatusBlock empty path (3 lines)
//  11. renderStatusBlock populated path (3 lines exactly)
//  12. aggregateSync parity with aggregate (same input → same output)
//  13. Perf gate: aggregate() over 10k-line synthetic JSONL in <500ms

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dashboard = require('../bin/gsd-t-token-dashboard.cjs');

function mkTmpProject(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `m41-dash-${name}-`));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  return dir;
}

function writeJsonl(projectDir, records) {
  const p = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  fs.writeFileSync(p, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return p;
}

// ── Test 1: empty / missing JSONL ───────────────────────────────────
test('aggregate: returns zero-state when JSONL is missing', async () => {
  const dir = mkTmpProject('missing');
  const agg = await dashboard.aggregate({ projectDir: dir });
  assert.equal(agg.totalRecords, 0);
  assert.equal(agg.totalCostUSD, 0);
  assert.deepEqual(agg.byDay, {});
  assert.deepEqual(agg.topSpawns, []);
});

// ── Test 2: populated JSONL ──────────────────────────────────────────
test('aggregate: populates byDay, byCommand, byModel correctly', async () => {
  const dir = mkTmpProject('populated');
  writeJsonl(dir, [
    { startedAt: '2026-04-19 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10, inputTokens: 1000, outputTokens: 200, cacheReadInputTokens: 500, cacheCreationInputTokens: 100 },
    { startedAt: '2026-04-19 11:00', command: 'verify',  model: 'haiku',  costUSD: 0.02, inputTokens: 500,  outputTokens: 50,  cacheReadInputTokens: 100, cacheCreationInputTokens: 0 },
    { startedAt: '2026-04-20 09:00', command: 'execute', model: 'sonnet', costUSD: 0.15, inputTokens: 1500, outputTokens: 300, cacheReadInputTokens: 800, cacheCreationInputTokens: 50 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir });
  assert.equal(agg.totalRecords, 3);
  assert.equal(Math.round(agg.totalCostUSD * 100) / 100, 0.27);
  assert.equal(Object.keys(agg.byDay).length, 2);
  assert.ok(agg.byDay['2026-04-19']);
  assert.equal(agg.byDay['2026-04-19'].records, 2);
  assert.ok(agg.byCommand.execute);
  assert.equal(agg.byCommand.execute.records, 2);
  assert.ok(agg.byModel.sonnet);
  assert.equal(agg.byModel.sonnet.records, 2);
});

// ── Test 3: --since filter ───────────────────────────────────────────
test('aggregate: --since filter excludes earlier days', async () => {
  const dir = mkTmpProject('since');
  writeJsonl(dir, [
    { startedAt: '2026-04-18 10:00', command: 'execute', model: 'sonnet', costUSD: 0.05, inputTokens: 100, outputTokens: 10 },
    { startedAt: '2026-04-19 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10, inputTokens: 200, outputTokens: 20 },
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.15, inputTokens: 300, outputTokens: 30 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir, since: '2026-04-19' });
  assert.equal(agg.totalRecords, 2);
  assert.equal(Math.round(agg.totalCostUSD * 100) / 100, 0.25);
});

// ── Test 4: --milestone filter ───────────────────────────────────────
test('aggregate: --milestone filter skips records without milestone field', async () => {
  const dir = mkTmpProject('milestone');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10, milestone: 'M41' },
    { startedAt: '2026-04-20 11:00', command: 'verify',  model: 'haiku',  costUSD: 0.02, milestone: 'M40' },
    { startedAt: '2026-04-20 12:00', command: 'execute', model: 'sonnet', costUSD: 0.15 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir, milestone: 'M41' });
  assert.equal(agg.totalRecords, 1);
  assert.equal(Math.round(agg.totalCostUSD * 100) / 100, 0.10);
});

// ── Test 5: top-10 spawns by cost desc ───────────────────────────────
test('aggregate: topSpawns sorted by costUSD descending, capped at 10', async () => {
  const dir = mkTmpProject('top');
  const records = [];
  for (let i = 0; i < 15; i++) {
    records.push({
      startedAt: `2026-04-20 ${String(i).padStart(2, '0')}:00`,
      command: 'execute',
      step: `t${i}`,
      model: 'sonnet',
      costUSD: (i + 1) * 0.01,
      inputTokens: 100,
      outputTokens: 10,
    });
  }
  writeJsonl(dir, records);
  const agg = await dashboard.aggregate({ projectDir: dir });
  assert.equal(agg.topSpawns.length, 10);
  assert.ok(agg.topSpawns[0].costUSD >= agg.topSpawns[9].costUSD);
  assert.equal(agg.topSpawns[0].costUSD, 0.15);
  assert.equal(agg.topSpawns[9].costUSD, 0.06);
});

// ── Test 6: cache-hit rate per model ─────────────────────────────────
test('aggregate: cache-hit rate math per model', async () => {
  const dir = mkTmpProject('cache');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', inputTokens: 300, cacheReadInputTokens: 700 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir });
  // rate = 700 / (300 + 700) = 0.70
  assert.equal(Math.round(agg.byModel.sonnet.cacheHitRate * 100) / 100, 0.70);
});

// ── Test 7: rolling 7-day window ─────────────────────────────────────
test('aggregate: rolling 7-day window includes only recent records', async () => {
  const dir = mkTmpProject('rolling');
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 16).replace('T', ' ');
  writeJsonl(dir, [
    { startedAt: fmt(recent), command: 'execute', model: 'sonnet', costUSD: 0.20 },
    { startedAt: fmt(old),    command: 'execute', model: 'sonnet', costUSD: 5.00 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir });
  assert.equal(Math.round(agg.rolling7d.totalCostUSD * 100) / 100, 0.20);
  assert.equal(agg.rolling7d.days, 1);
  assert.equal(Math.round(agg.rolling7d.monthlyProjectionUSD * 100) / 100, Math.round((0.20 / 7) * 30 * 100) / 100);
});

// ── Test 8: renderTable sections ─────────────────────────────────────
test('renderTable: contains expected section headers', async () => {
  const dir = mkTmpProject('render-table');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10, inputTokens: 100, outputTokens: 10 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir });
  const out = dashboard.renderTable(agg);
  assert.match(out, /═══ Token Dashboard ═══/);
  assert.match(out, /── By Day ──/);
  assert.match(out, /── By Command ──/);
  assert.match(out, /── By Model ──/);
  assert.match(out, /── Top 10 Spawns by Cost ──/);
  assert.match(out, /── Rolling 7-Day Projection ──/);
});

// ── Test 9: renderJson produces valid JSON ──────────────────────────
test('renderJson: valid JSON round-trips', async () => {
  const dir = mkTmpProject('render-json');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir });
  const json = dashboard.renderJson(agg);
  const parsed = JSON.parse(json);
  assert.equal(parsed.totalRecords, 1);
});

// ── Test 10: renderStatusBlock — empty ───────────────────────────────
test('renderStatusBlock: empty path renders exactly 3 lines', () => {
  const out = dashboard.renderStatusBlock(null);
  const lines = out.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '───');
  assert.match(lines[1], /no data yet/);
});

// ── Test 11: renderStatusBlock — populated ───────────────────────────
test('renderStatusBlock: populated path renders exactly 3 lines', async () => {
  const dir = mkTmpProject('status-block');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10 },
  ]);
  const agg = await dashboard.aggregate({ projectDir: dir, milestone: null });
  const out = dashboard.renderStatusBlock(agg);
  const lines = out.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '───');
  assert.match(lines[1], /^Tokens:/);
  assert.match(lines[2], /^Rolling 7d:/);
});

// ── Test 12: aggregateSync parity with aggregate ────────────────────
test('aggregateSync: matches aggregate() output for same input', async () => {
  const dir = mkTmpProject('sync-parity');
  writeJsonl(dir, [
    { startedAt: '2026-04-20 10:00', command: 'execute', model: 'sonnet', costUSD: 0.10, inputTokens: 100, outputTokens: 10 },
    { startedAt: '2026-04-20 11:00', command: 'verify', model: 'haiku', costUSD: 0.02, inputTokens: 50, outputTokens: 5 },
  ]);
  const aSync = dashboard.aggregateSync({ projectDir: dir });
  const aAsync = await dashboard.aggregate({ projectDir: dir });
  assert.equal(aSync.totalRecords, aAsync.totalRecords);
  assert.equal(aSync.totalCostUSD, aAsync.totalCostUSD);
  assert.equal(aSync.totalInputTokens, aAsync.totalInputTokens);
  assert.equal(aSync.totalOutputTokens, aAsync.totalOutputTokens);
});

// ── Test 13: perf gate — 10k-line JSONL under 500ms ─────────────────
test('aggregate: 10k-line synthetic JSONL completes in <500ms', async () => {
  const dir = mkTmpProject('perf');
  const records = [];
  for (let i = 0; i < 10000; i++) {
    records.push({
      startedAt: `2026-04-${String(1 + (i % 28)).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:00`,
      command: i % 3 === 0 ? 'execute' : i % 3 === 1 ? 'verify' : 'plan',
      model: i % 2 === 0 ? 'sonnet' : 'haiku',
      costUSD: (i % 100) * 0.001,
      inputTokens: 100 + (i % 500),
      outputTokens: 10 + (i % 50),
      cacheReadInputTokens: 50 + (i % 200),
      cacheCreationInputTokens: 5 + (i % 20),
    });
  }
  writeJsonl(dir, records);

  const t0 = Date.now();
  const agg = await dashboard.aggregate({ projectDir: dir });
  const elapsed = Date.now() - t0;

  assert.equal(agg.totalRecords, 10000);
  assert.ok(elapsed < 500, `aggregate over 10k lines took ${elapsed}ms (budget: 500ms)`);
});
