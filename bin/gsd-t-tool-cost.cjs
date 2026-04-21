'use strict';
/**
 * GSD-T Tool-Cost CLI (M43 D2)
 *
 * `gsd-t tool-cost [--group-by tool|command|domain] [--since YYYY-MM-DD]
 *                   [--milestone Mxx] [--format table|json]`
 *
 * Consumer of `bin/gsd-t-tool-attribution.cjs`. Zero deps.
 *
 * Exit codes: 0 success, 2 arg parse error, 3 data access error.
 */

const fs = require('fs');
const path = require('path');

const attribution = require('./gsd-t-tool-attribution.cjs');

function _defaultTurnsPath(projectDir) {
  return path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
}
function _defaultEventsDir(projectDir) {
  return path.join(projectDir, '.gsd-t', 'events');
}

function parseArgs(argv) {
  const opts = {
    groupBy: 'tool',
    since: null,
    milestone: null,
    format: 'table',
    projectDir: process.cwd(),
    turnsPath: null,
    eventsGlob: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => argv[++i];
    if (a === '--group-by' || a === '-g') { opts.groupBy = take(); }
    else if (a.startsWith('--group-by=')) { opts.groupBy = a.slice('--group-by='.length); }
    else if (a === '--since') { opts.since = take(); }
    else if (a.startsWith('--since=')) { opts.since = a.slice('--since='.length); }
    else if (a === '--milestone') { opts.milestone = take(); }
    else if (a.startsWith('--milestone=')) { opts.milestone = a.slice('--milestone='.length); }
    else if (a === '--format' || a === '-f') { opts.format = take(); }
    else if (a.startsWith('--format=')) { opts.format = a.slice('--format='.length); }
    else if (a === '--project-dir') { opts.projectDir = take(); }
    else if (a.startsWith('--project-dir=')) { opts.projectDir = a.slice('--project-dir='.length); }
    else if (a === '--turns-path') { opts.turnsPath = take(); }
    else if (a === '--events-glob') { opts.eventsGlob = take(); }
    else if (a === '--help' || a === '-h') { opts.help = true; }
    else {
      const err = new Error(`tool-cost: unknown arg: ${a}`);
      err.exitCode = 2;
      throw err;
    }
  }
  if (!['tool', 'command', 'domain'].includes(opts.groupBy)) {
    const err = new Error(`tool-cost: --group-by must be tool|command|domain (got: ${opts.groupBy})`);
    err.exitCode = 2;
    throw err;
  }
  if (!['table', 'json'].includes(opts.format)) {
    const err = new Error(`tool-cost: --format must be table|json (got: ${opts.format})`);
    err.exitCode = 2;
    throw err;
  }
  return opts;
}

function helpText() {
  return [
    'Usage: gsd-t tool-cost [options]',
    '',
    'Attribute per-turn tokens/cost across the tools used in each turn.',
    '',
    'Options:',
    '  --group-by tool|command|domain   Aggregation key (default: tool)',
    '  --since YYYY-MM-DD               Only include turns on or after this day',
    '  --milestone Mxx                  Only include turns tagged with this milestone',
    '  --format table|json              Output format (default: table)',
    '  --project-dir PATH               Project root (default: cwd)',
    '  --turns-path PATH                Override token-usage.jsonl path',
    '  --events-glob PATH               Override events dir/file',
    '  -h, --help                       Show this help',
    '',
  ].join('\n');
}

// ── Rendering ────────────────────────────────────────────────────────

function _fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function _fmtInt(n) {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderTable(agg, opts) {
  const top = agg.slice(0, 20);
  const header = opts.groupBy === 'tool'    ? 'Tool' :
                 opts.groupBy === 'command' ? 'Command' :
                                               'Domain';
  const lines = [];
  lines.push(`═══ Tool Cost (group-by ${opts.groupBy}) ═══`);
  if (opts.since)     lines.push(`Since: ${opts.since}`);
  if (opts.milestone) lines.push(`Milestone: ${opts.milestone}`);
  lines.push('');
  if (top.length === 0) {
    lines.push('  (no data)');
    return lines.join('\n');
  }
  lines.push(`${header.padEnd(22)} ${'Turns'.padStart(6)} ${'Input'.padStart(12)} ${'Output'.padStart(10)} ${'CacheR'.padStart(12)} ${'CacheC'.padStart(10)} ${'Cost'.padStart(10)}`);
  lines.push('─'.repeat(22 + 1 + 6 + 1 + 12 + 1 + 10 + 1 + 12 + 1 + 10 + 1 + 10));
  for (const r of top) {
    lines.push(
      `${String(r.key).padEnd(22).slice(0, 22)} ` +
      `${String(r.turn_count).padStart(6)} ` +
      `${_fmtInt(r.total_input).padStart(12)} ` +
      `${_fmtInt(r.total_output).padStart(10)} ` +
      `${_fmtInt(r.total_cache_read).padStart(12)} ` +
      `${_fmtInt(r.total_cache_creation).padStart(10)} ` +
      `${_fmtMoney(r.total_cost_usd).padStart(10)}`
    );
  }
  return lines.join('\n');
}

function renderJson(agg) {
  // Newline-delimited JSON, one ranker row per line (contract §consumer).
  return agg.map((r) => JSON.stringify(r)).join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────

function compute(opts) {
  const projectDir = opts.projectDir || '.';
  const turnsPath = opts.turnsPath || _defaultTurnsPath(projectDir);
  const eventsGlob = opts.eventsGlob || _defaultEventsDir(projectDir);
  if (!fs.existsSync(turnsPath)) {
    // Empty-sink case per contract — not an error.
    return [];
  }
  const joined = attribution.joinTurnsAndEvents({
    turnsPath,
    eventsGlob,
    since: opts.since || undefined,
    milestone: opts.milestone || undefined,
  });
  let agg;
  if (opts.groupBy === 'command')     agg = attribution.aggregateByCommand(joined);
  else if (opts.groupBy === 'domain') agg = attribution.aggregateByDomain(joined);
  else                                agg = attribution.aggregateByTool(joined);
  return agg;
}

function run(argv) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    process.stderr.write(String(e.message || e) + '\n');
    return e.exitCode || 2;
  }
  if (opts.help) {
    process.stdout.write(helpText());
    return 0;
  }
  let agg;
  try { agg = compute(opts); }
  catch (e) {
    process.stderr.write(`tool-cost: data access error: ${e.message || e}\n`);
    return 3;
  }
  const out = (opts.format === 'json') ? renderJson(agg) : renderTable(agg, opts);
  process.stdout.write(out + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}

module.exports = {
  parseArgs,
  helpText,
  renderTable,
  renderJson,
  compute,
  run,
};
