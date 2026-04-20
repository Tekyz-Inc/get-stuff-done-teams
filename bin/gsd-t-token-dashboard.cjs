'use strict';
/**
 * GSD-T Token Dashboard (M41 D4)
 *
 * Cumulative historical view of `.gsd-t/metrics/token-usage.jsonl`.
 * Feeds the `gsd-t tokens` CLI and the token-block tail of `gsd-t status`.
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_JSONL_PATH = (projectDir) => path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');

function _safeParse(line) {
  try { return JSON.parse(line); } catch (_) { return null; }
}

function _day(startedAt) {
  if (!startedAt) return 'unknown';
  // YYYY-MM-DD slice works for both ISO and our 'YYYY-MM-DD HH:MM' format.
  return String(startedAt).slice(0, 10);
}

function _cost(r) {
  return (typeof r.costUSD === 'number' && r.costUSD >= 0) ? r.costUSD : 0;
}

/**
 * Aggregate token-usage records.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string} [opts.since]       YYYY-MM-DD (inclusive)
 * @param {string} [opts.milestone]   e.g. 'M41'
 * @returns {Promise<object>}
 */
async function aggregate(opts) {
  const projectDir = opts.projectDir || '.';
  const jsonlPath = opts.jsonlPath || DEFAULT_JSONL_PATH(projectDir);
  const sinceDay = opts.since || null;
  const milestone = opts.milestone || null;

  const agg = {
    totalRecords: 0,
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreateTokens: 0,
    byDay: {},
    byCommand: {},
    byModel: {},
    topSpawns: [],
    rolling7d: { days: 0, totalCostUSD: 0, dailyAvgUSD: 0, monthlyProjectionUSD: 0 },
    currentMilestone: milestone,
    source: jsonlPath,
  };

  if (!fs.existsSync(jsonlPath)) {
    return agg;
  }

  const rs = fs.createReadStream(jsonlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

  const rawRecords = [];

  for await (const line of rl) {
    const trimmed = line && line.trim();
    if (!trimmed) continue;
    const r = _safeParse(trimmed);
    if (!r || typeof r !== 'object') continue;

    const day = _day(r.startedAt);
    if (sinceDay && day < sinceDay) continue;
    if (milestone && r.milestone && r.milestone !== milestone) continue;
    if (milestone && !r.milestone) continue;

    rawRecords.push(r);

    agg.totalRecords += 1;
    agg.totalCostUSD += _cost(r);
    agg.totalInputTokens += Number(r.inputTokens || 0);
    agg.totalOutputTokens += Number(r.outputTokens || 0);
    agg.totalCacheReadTokens += Number(r.cacheReadInputTokens || 0);
    agg.totalCacheCreateTokens += Number(r.cacheCreationInputTokens || 0);

    // byDay
    if (!agg.byDay[day]) agg.byDay[day] = { day, records: 0, costUSD: 0, inputTokens: 0, outputTokens: 0 };
    const d = agg.byDay[day];
    d.records += 1;
    d.costUSD += _cost(r);
    d.inputTokens += Number(r.inputTokens || 0);
    d.outputTokens += Number(r.outputTokens || 0);

    // byCommand
    const cmd = r.command || 'unknown';
    if (!agg.byCommand[cmd]) agg.byCommand[cmd] = { command: cmd, records: 0, costUSD: 0, inputTokens: 0, outputTokens: 0 };
    const c = agg.byCommand[cmd];
    c.records += 1;
    c.costUSD += _cost(r);
    c.inputTokens += Number(r.inputTokens || 0);
    c.outputTokens += Number(r.outputTokens || 0);

    // byModel
    const m = r.model || 'unknown';
    if (!agg.byModel[m]) agg.byModel[m] = { model: m, records: 0, costUSD: 0, inputTokens: 0, cacheReadTokens: 0, cacheHitRate: 0 };
    const mm = agg.byModel[m];
    mm.records += 1;
    mm.costUSD += _cost(r);
    mm.inputTokens += Number(r.inputTokens || 0);
    mm.cacheReadTokens += Number(r.cacheReadInputTokens || 0);
  }

  // Top 10 spawns by cost desc
  agg.topSpawns = rawRecords
    .slice()
    .sort((a, b) => _cost(b) - _cost(a))
    .slice(0, 10)
    .map((r) => ({
      startedAt: r.startedAt,
      command: r.command,
      step: r.step,
      model: r.model,
      costUSD: _cost(r),
      inputTokens: r.inputTokens || 0,
      outputTokens: r.outputTokens || 0,
    }));

  // Cache-hit rate per model
  for (const key of Object.keys(agg.byModel)) {
    const mm = agg.byModel[key];
    const denom = mm.inputTokens + mm.cacheReadTokens;
    mm.cacheHitRate = denom > 0 ? mm.cacheReadTokens / denom : 0;
  }

  // Rolling 7-day window by calendar day
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoffMs = now - sevenDaysMs;
  let rollingCost = 0;
  const rollingDays = new Set();
  for (const r of rawRecords) {
    const ts = Date.parse(String(r.startedAt).replace(' ', 'T') + (r.startedAt && r.startedAt.length === 16 ? ':00Z' : ''));
    if (Number.isFinite(ts) && ts >= cutoffMs) {
      rollingCost += _cost(r);
      rollingDays.add(_day(r.startedAt));
    }
  }
  agg.rolling7d.days = rollingDays.size;
  agg.rolling7d.totalCostUSD = rollingCost;
  agg.rolling7d.dailyAvgUSD = rollingCost / 7;
  agg.rolling7d.monthlyProjectionUSD = agg.rolling7d.dailyAvgUSD * 30;

  return agg;
}

function _fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  return `$${n.toFixed(2)}`;
}
function _fmtPct(n) {
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}
function _fmtInt(n) {
  return String(Number(n || 0).toLocaleString('en-US'));
}

function renderTable(agg) {
  const lines = [];
  lines.push('═══ Token Dashboard ═══');
  lines.push(`Records: ${_fmtInt(agg.totalRecords)} | Total cost: ${_fmtMoney(agg.totalCostUSD)} | Input: ${_fmtInt(agg.totalInputTokens)} | Output: ${_fmtInt(agg.totalOutputTokens)}`);
  if (agg.currentMilestone) lines.push(`Milestone filter: ${agg.currentMilestone}`);
  lines.push('');

  lines.push('── By Day ──');
  const days = Object.values(agg.byDay).sort((a, b) => a.day.localeCompare(b.day));
  if (days.length === 0) lines.push('  (no data)');
  for (const d of days) {
    lines.push(`  ${d.day}  ${String(d.records).padStart(4)} spawns   ${_fmtMoney(d.costUSD).padStart(8)}   in=${_fmtInt(d.inputTokens)}  out=${_fmtInt(d.outputTokens)}`);
  }
  lines.push('');

  lines.push('── By Command ──');
  const cmds = Object.values(agg.byCommand).sort((a, b) => b.costUSD - a.costUSD);
  if (cmds.length === 0) lines.push('  (no data)');
  for (const c of cmds) {
    lines.push(`  ${c.command.padEnd(30)} ${String(c.records).padStart(4)}   ${_fmtMoney(c.costUSD).padStart(8)}`);
  }
  lines.push('');

  lines.push('── By Model ──');
  const models = Object.values(agg.byModel).sort((a, b) => b.costUSD - a.costUSD);
  if (models.length === 0) lines.push('  (no data)');
  for (const m of models) {
    lines.push(`  ${m.model.padEnd(20)} ${String(m.records).padStart(4)}   ${_fmtMoney(m.costUSD).padStart(8)}   cache-hit: ${_fmtPct(m.cacheHitRate)}`);
  }
  lines.push('');

  lines.push('── Top 10 Spawns by Cost ──');
  if (agg.topSpawns.length === 0) lines.push('  (no data)');
  for (let i = 0; i < agg.topSpawns.length; i++) {
    const s = agg.topSpawns[i];
    lines.push(`  ${String(i + 1).padStart(2)}. ${s.startedAt}  ${String(s.command || '').padEnd(22)} ${String(s.step || '').padEnd(14)} ${_fmtMoney(s.costUSD)}`);
  }
  lines.push('');

  lines.push('── Rolling 7-Day Projection ──');
  lines.push(`  7-day cost: ${_fmtMoney(agg.rolling7d.totalCostUSD)} across ${agg.rolling7d.days} day(s)`);
  lines.push(`  Daily avg:  ${_fmtMoney(agg.rolling7d.dailyAvgUSD)}`);
  lines.push(`  Monthly projection (× 30): ${_fmtMoney(agg.rolling7d.monthlyProjectionUSD)}`);

  return lines.join('\n');
}

function renderJson(agg) {
  return JSON.stringify(agg, null, 2);
}

/**
 * Renders exactly 2 content lines + 1 separator = 3 output lines total.
 */
function renderStatusBlock(agg) {
  const sep = '───';
  if (!agg || agg.totalRecords === 0) {
    return sep + '\nTokens: no data yet (run a command to populate)\n(run `gsd-t tokens` for full dashboard)';
  }
  const line1 = `Tokens: ${_fmtInt(agg.totalRecords)} spawns, ${_fmtMoney(agg.totalCostUSD)} total${agg.currentMilestone ? ` (${agg.currentMilestone})` : ''}`;
  const line2 = `Rolling 7d: ${_fmtMoney(agg.rolling7d.totalCostUSD)} (${_fmtMoney(agg.rolling7d.dailyAvgUSD)}/day → ${_fmtMoney(agg.rolling7d.monthlyProjectionUSD)}/mo proj.)`;
  return `${sep}\n${line1}\n${line2}`;
}

/**
 * Synchronous variant of aggregate() — for callers that need a blocking read
 * (e.g. the `gsd-t status` tail where we can't await). Uses fs.readFileSync
 * and shares the same record-processing loop. Safe for typical JSONL sizes
 * (<100k lines); prefer aggregate() for large files or background work.
 */
function aggregateSync(opts) {
  const projectDir = opts.projectDir || '.';
  const jsonlPath = opts.jsonlPath || DEFAULT_JSONL_PATH(projectDir);
  const sinceDay = opts.since || null;
  const milestone = opts.milestone || null;

  const agg = {
    totalRecords: 0,
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreateTokens: 0,
    byDay: {},
    byCommand: {},
    byModel: {},
    topSpawns: [],
    rolling7d: { days: 0, totalCostUSD: 0, dailyAvgUSD: 0, monthlyProjectionUSD: 0 },
    currentMilestone: milestone,
    source: jsonlPath,
  };

  if (!fs.existsSync(jsonlPath)) return agg;

  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const lines = raw.split('\n');
  const rawRecords = [];

  for (const line of lines) {
    const trimmed = line && line.trim();
    if (!trimmed) continue;
    const r = _safeParse(trimmed);
    if (!r || typeof r !== 'object') continue;

    const day = _day(r.startedAt);
    if (sinceDay && day < sinceDay) continue;
    if (milestone && r.milestone && r.milestone !== milestone) continue;
    if (milestone && !r.milestone) continue;

    rawRecords.push(r);
    agg.totalRecords += 1;
    agg.totalCostUSD += _cost(r);
    agg.totalInputTokens += Number(r.inputTokens || 0);
    agg.totalOutputTokens += Number(r.outputTokens || 0);
    agg.totalCacheReadTokens += Number(r.cacheReadInputTokens || 0);
    agg.totalCacheCreateTokens += Number(r.cacheCreationInputTokens || 0);
  }

  const now = Date.now();
  const cutoffMs = now - 7 * 24 * 60 * 60 * 1000;
  let rollingCost = 0;
  const rollingDays = new Set();
  for (const r of rawRecords) {
    const ts = Date.parse(String(r.startedAt).replace(' ', 'T') + (r.startedAt && r.startedAt.length === 16 ? ':00Z' : ''));
    if (Number.isFinite(ts) && ts >= cutoffMs) {
      rollingCost += _cost(r);
      rollingDays.add(_day(r.startedAt));
    }
  }
  agg.rolling7d.days = rollingDays.size;
  agg.rolling7d.totalCostUSD = rollingCost;
  agg.rolling7d.dailyAvgUSD = rollingCost / 7;
  agg.rolling7d.monthlyProjectionUSD = agg.rolling7d.dailyAvgUSD * 30;

  return agg;
}

module.exports = {
  aggregate,
  aggregateSync,
  renderTable,
  renderJson,
  renderStatusBlock,
  _safeParse,
  _day,
};
