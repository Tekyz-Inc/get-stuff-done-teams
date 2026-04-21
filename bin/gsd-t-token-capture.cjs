'use strict';
/**
 * GSD-T Token Capture Wrapper (M41 D1)
 *
 * Single reusable module every GSD-T spawn call site uses. Parses the
 * `usage` envelope from Claude's result frame, appends a row to
 * `.gsd-t/token-log.md`, and appends a schema-v1 JSONL record to
 * `.gsd-t/metrics/token-usage.jsonl`.
 *
 * Zero external deps. `.cjs` so it loads in both ESM-default projects
 * and CJS projects without transpilation.
 *
 * Contracts:
 *   - .gsd-t/contracts/metrics-schema-contract.md (schema v1)
 *   - .gsd-t/contracts/stream-json-sink-contract.md v1.1.0 (usage semantics)
 *
 * Missing `usage` → write `—` in Tokens column. Never `0`, never `N/A`.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;

const NEW_HEADER = '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |';
const NEW_SEP    = '|---|---|---|---|---|---|---|---|---|---|---|';

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function _parseUsageFromResult(result) {
  if (!result || typeof result !== 'object') return undefined;
  if (result.usage && typeof result.usage === 'object') return result.usage;
  if (result.result && typeof result.result === 'object' && result.result.usage && typeof result.result.usage === 'object') {
    return result.result.usage;
  }
  return undefined;
}

function _formatTokensCell(usage) {
  if (!usage || typeof usage !== 'object') return '—';
  const inp = Number(usage.input_tokens || 0);
  const out = Number(usage.output_tokens || 0);
  const cr  = Number(usage.cache_read_input_tokens || 0);
  const cc  = Number(usage.cache_creation_input_tokens || 0);
  const costNum = (typeof usage.total_cost_usd === 'number') ? usage.total_cost_usd : (typeof usage.cost_usd === 'number' ? usage.cost_usd : null);
  const cost = (costNum == null) ? '—' : `$${costNum.toFixed(2)}`;
  if (!inp && !out && !cr && !cc && cost === '—') return '—';
  return `in=${inp} out=${out} cr=${cr} cc=${cc} ${cost}`;
}

function _ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _ensureTokenLogHeader(tokenLogPath) {
  if (!fs.existsSync(tokenLogPath)) {
    _ensureDir(tokenLogPath);
    fs.writeFileSync(tokenLogPath, `# GSD-T Token Log\n\n${NEW_HEADER}\n${NEW_SEP}\n`);
    return;
  }
  const text = fs.readFileSync(tokenLogPath, 'utf8');
  if (text.includes(NEW_HEADER)) return;
  // Old header detection: first header line that starts with `| Datetime-start`
  const lines = text.split('\n');
  const headerIdx = lines.findIndex(l => /^\|\s*Datetime-start\s*\|/.test(l));
  if (headerIdx < 0) {
    // No header at all — append new one
    fs.writeFileSync(tokenLogPath, text.trimEnd() + `\n\n${NEW_HEADER}\n${NEW_SEP}\n`);
    return;
  }
  // Replace old header + separator with new header + separator, preserve existing rows
  const sepIdx = headerIdx + 1;
  lines[headerIdx] = NEW_HEADER;
  if (lines[sepIdx] && /^\|[\s\-|]+\|$/.test(lines[sepIdx])) {
    lines[sepIdx] = NEW_SEP;
  } else {
    lines.splice(sepIdx, 0, NEW_SEP);
  }
  fs.writeFileSync(tokenLogPath, lines.join('\n'));
}

function _appendTokenLogRow(tokenLogPath, row) {
  _ensureTokenLogHeader(tokenLogPath);
  const line = `| ${row.startedAt} | ${row.endedAt} | ${row.command} | ${row.step} | ${row.model} | ${row.durationSec}s | ${row.tokensCell} | ${row.notes} | ${row.domain} | ${row.task} | ${row.ctxPct} |\n`;
  fs.appendFileSync(tokenLogPath, line);
}

function _appendJsonlRecord(jsonlPath, record) {
  _ensureDir(jsonlPath);
  fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n');
}

function _buildJsonlRecord({ command, step, model, startedAt, endedAt, durationSec, usage, domain, task, notes, ctxPct, milestone, source, sessionId, turnId, sessionType, toolAttribution, compactionPressure }) {
  const u = usage || {};
  const cost = (typeof u.total_cost_usd === 'number') ? u.total_cost_usd : (typeof u.cost_usd === 'number' ? u.cost_usd : null);
  const rec = {
    schemaVersion: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    source: source || 'live',
    command,
    step,
    model,
    startedAt,
    endedAt,
    durationMs: durationSec * 1000,
    inputTokens: Number(u.input_tokens || 0),
    outputTokens: Number(u.output_tokens || 0),
    cacheReadInputTokens: Number(u.cache_read_input_tokens || 0),
    cacheCreationInputTokens: Number(u.cache_creation_input_tokens || 0),
    costUSD: cost,
    domain: domain || null,
    task: task || null,
    milestone: milestone || null,
    ctxPct: ctxPct == null ? null : ctxPct,
    notes: notes || null,
    hasUsage: !!usage,
  };
  if (sessionId != null)  rec.session_id  = String(sessionId);
  if (turnId != null)     rec.turn_id     = String(turnId);
  if (sessionType != null) rec.sessionType = sessionType;
  if (Array.isArray(toolAttribution) && toolAttribution.length) rec.tool_attribution = toolAttribution;
  if (compactionPressure && typeof compactionPressure === 'object') rec.compaction_pressure = compactionPressure;
  return rec;
}

function _inferMilestone(projectDir) {
  try {
    const progress = fs.readFileSync(path.join(projectDir, '.gsd-t', 'progress.md'), 'utf8');
    const m = /\*\*(M\d+)\b/.exec(progress) || /## Status:\s*(M\d+)/.exec(progress);
    return m ? m[1] : null;
  } catch (_) { return null; }
}

function _resolveCtxPct(projectDir) {
  try {
    const tb = require('./token-budget.cjs');
    const s = tb.getSessionStatus(projectDir);
    return (s && typeof s.pct === 'number') ? s.pct : (s && s.pct) || 'N/A';
  } catch (_) { return 'N/A'; }
}

function _parseStartedAt(s) {
  if (!s) return Date.now();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
    const [d, t] = s.split(' ');
    return new Date(`${d}T${t}:00`).getTime();
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Record a single spawn row to both token-log.md and token-usage.jsonl.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string} opts.command        e.g. 'gsd-t-execute'
 * @param {string} opts.step           e.g. 'Step 4'
 * @param {string} opts.model          e.g. 'sonnet'
 * @param {string} opts.startedAt      'YYYY-MM-DD HH:MM'
 * @param {string} opts.endedAt        'YYYY-MM-DD HH:MM'
 * @param {object} [opts.usage]        Claude usage envelope; undefined → '—'
 * @param {string} [opts.domain]
 * @param {string} [opts.task]
 * @param {string|number} [opts.ctxPct]
 * @param {string} [opts.notes]
 * @param {'live'|'backfill'} [opts.source]
 * @param {string} [opts.sessionId]          v2 — stable session identifier
 * @param {string|number} [opts.turnId]      v2 — per-turn identifier within sessionId
 * @param {'in-session'|'headless'} [opts.sessionType]  v2 — channel classifier
 * @param {Array}  [opts.toolAttribution]    v2 — D2 joiner output; usually omitted by spawn callers
 * @param {object} [opts.compactionPressure] v2 — D5 runway snapshot; usually omitted by spawn callers
 * @returns {{tokenLogPath: string, jsonlPath: string}}
 */
function recordSpawnRow(opts) {
  const projectDir = opts.projectDir || '.';
  const tokenLogPath = opts.tokenLogPath || path.join(projectDir, '.gsd-t', 'token-log.md');
  const jsonlPath   = opts.jsonlPath   || path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');

  const startMs = _parseStartedAt(opts.startedAt);
  const endMs   = _parseStartedAt(opts.endedAt);
  const durationSec = Math.max(0, Math.round((endMs - startMs) / 1000));

  const tokensCell = _formatTokensCell(opts.usage);
  const notes = (opts.notes == null || opts.notes === '') ? '-' : String(opts.notes).replace(/\|/g, '\\|');
  const domain = (opts.domain == null || opts.domain === '') ? '-' : String(opts.domain);
  const task   = (opts.task   == null || opts.task   === '') ? '-' : String(opts.task);
  const ctxPct = (opts.ctxPct == null) ? 'N/A' : String(opts.ctxPct);

  // skipMarkdownLog: JSONL is canonical (D3). The markdown log is a legacy view
  // kept in sync for human-readable tailing; high-frequency producers (D1
  // per-turn in-session rows, D2 joiner) should write JSONL-only and rely on
  // `gsd-t tokens --regenerate-log` for the markdown rendering.
  if (!opts.skipMarkdownLog) {
    _appendTokenLogRow(tokenLogPath, {
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
      command: opts.command,
      step: opts.step,
      model: opts.model,
      durationSec,
      tokensCell,
      notes,
      domain,
      task,
      ctxPct,
    });
  }

  const milestone = opts.milestone || _inferMilestone(projectDir);
  _appendJsonlRecord(jsonlPath, _buildJsonlRecord({
    command: opts.command,
    step: opts.step,
    model: opts.model,
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
    durationSec,
    usage: opts.usage,
    domain: opts.domain || null,
    task: opts.task || null,
    notes: opts.notes || null,
    ctxPct: opts.ctxPct == null ? null : opts.ctxPct,
    milestone,
    source: opts.source || 'live',
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    sessionType: opts.sessionType,
    toolAttribution: opts.toolAttribution,
    compactionPressure: opts.compactionPressure,
  }));

  return { tokenLogPath, jsonlPath };
}

/**
 * Wrap an async spawn callable; capture timing + usage + write the row.
 *
 * @param {object} opts
 * @param {string} opts.command
 * @param {string} opts.step
 * @param {string} opts.model
 * @param {string} opts.description
 * @param {string} [opts.projectDir='.']
 * @param {() => Promise<any>} opts.spawnFn
 * @param {string} [opts.domain]
 * @param {string} [opts.task]
 * @returns {Promise<{result: any, usage: any|undefined, rowWritten: {tokenLogPath, jsonlPath}}>}
 */
async function captureSpawn(opts) {
  if (!opts || typeof opts.spawnFn !== 'function') {
    throw new Error('captureSpawn: spawnFn is required and must be a function');
  }
  const projectDir = opts.projectDir || '.';
  const startDate = new Date();
  const startedAt = fmtDateTime(startDate);
  const startMs = startDate.getTime();

  // Visible banner before the spawn fires
  process.stdout.write(`⚙ [${opts.model}] ${opts.command} → ${opts.description}\n`);

  let result, caught;
  try {
    result = await opts.spawnFn();
  } catch (err) {
    caught = err;
  }

  const endDate = new Date();
  const endedAt = fmtDateTime(endDate);

  const usage = caught ? undefined : _parseUsageFromResult(result);
  const ctxPct = _resolveCtxPct(projectDir);
  const notes = caught ? `spawn_error: ${String(caught && caught.message || caught).slice(0, 200)}` : (opts.notes || '-');

  const rowWritten = recordSpawnRow({
    projectDir,
    command: opts.command,
    step: opts.step,
    model: opts.model,
    startedAt,
    endedAt,
    usage,
    domain: opts.domain,
    task: opts.task,
    ctxPct,
    notes,
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    sessionType: opts.sessionType,
    toolAttribution: opts.toolAttribution,
    compactionPressure: opts.compactionPressure,
  });

  if (caught) throw caught;
  return { result, usage, rowWritten };
}

module.exports = {
  captureSpawn,
  recordSpawnRow,
  _parseUsageFromResult,
  _formatTokensCell,
  _ensureTokenLogHeader,
  _buildJsonlRecord,
  SCHEMA_VERSION,
  NEW_HEADER,
  NEW_SEP,
};
