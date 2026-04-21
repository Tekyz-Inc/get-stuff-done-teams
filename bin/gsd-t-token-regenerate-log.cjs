'use strict';
/**
 * GSD-T Token Log Regenerator (M43 D3)
 *
 * Reads `.gsd-t/metrics/token-usage.jsonl` end-to-end and writes
 * `.gsd-t/token-log.md` deterministically. Per metrics-schema-contract v2
 * §Derived Artifact, `token-log.md` is a regenerated view post-v2.
 *
 * Sort (v2 §5): startedAt asc → session_id asc → turn_id asc.
 * Numeric turn_ids sort numerically; mixed/non-numeric falls back to lex.
 *
 * Idempotent and deterministic: running twice produces byte-identical output.
 */

const fs = require('fs');
const path = require('path');

const capture = require('./gsd-t-token-capture.cjs');
const { NEW_HEADER, NEW_SEP, _formatTokensCell } = capture;

function _readJsonl(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  const text = fs.readFileSync(jsonlPath, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); }
    catch (_) { /* skip malformed line */ }
  }
  return rows;
}

function _tokenCellFromRow(row) {
  if (!row.hasUsage) return '—';
  const u = {
    input_tokens: row.inputTokens || 0,
    output_tokens: row.outputTokens || 0,
    cache_read_input_tokens: row.cacheReadInputTokens || 0,
    cache_creation_input_tokens: row.cacheCreationInputTokens || 0,
    total_cost_usd: (typeof row.costUSD === 'number') ? row.costUSD : undefined,
  };
  return _formatTokensCell(u);
}

function _cmpStart(a, b) {
  const av = a.startedAt || '';
  const bv = b.startedAt || '';
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function _cmpSession(a, b) {
  const av = a.session_id == null ? '' : String(a.session_id);
  const bv = b.session_id == null ? '' : String(b.session_id);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function _cmpTurn(a, b) {
  const av = a.turn_id == null ? '' : String(a.turn_id);
  const bv = b.turn_id == null ? '' : String(b.turn_id);
  const an = Number(av), bn = Number(bv);
  if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
    return an - bn;
  }
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function sortRows(rows) {
  return rows.slice().sort((a, b) =>
    _cmpStart(a, b) || _cmpSession(a, b) || _cmpTurn(a, b)
  );
}

function _durationCell(row) {
  const ms = Number(row.durationMs || 0);
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function _renderRow(row) {
  const tokensCell = _tokenCellFromRow(row);
  const notes  = (row.notes  == null || row.notes  === '') ? '-' : String(row.notes).replace(/\|/g, '\\|');
  const domain = (row.domain == null || row.domain === '') ? '-' : String(row.domain);
  const task   = (row.task   == null || row.task   === '') ? '-' : String(row.task);
  const ctxPct = (row.ctxPct == null) ? 'N/A' : String(row.ctxPct);
  return `| ${row.startedAt || ''} | ${row.endedAt || ''} | ${row.command || ''} | ${row.step || ''} | ${row.model || ''} | ${_durationCell(row)} | ${tokensCell} | ${notes} | ${domain} | ${task} | ${ctxPct} |`;
}

function renderMarkdown(rows) {
  const sorted = sortRows(rows);
  const lines = ['# GSD-T Token Log', '', NEW_HEADER, NEW_SEP];
  for (const r of sorted) lines.push(_renderRow(r));
  lines.push('');
  return lines.join('\n');
}

/**
 * Regenerate token-log.md from token-usage.jsonl.
 * @param {object} [opts]
 * @param {string} [opts.projectDir='.']
 * @param {string} [opts.jsonlPath]     override input path
 * @param {string} [opts.tokenLogPath]  override output path
 * @returns {{ wrote: string, rowCount: number }}
 */
function regenerateLog(opts = {}) {
  const projectDir = opts.projectDir || '.';
  const jsonlPath = opts.jsonlPath || path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  const tokenLogPath = opts.tokenLogPath || path.join(projectDir, '.gsd-t', 'token-log.md');
  const rows = _readJsonl(jsonlPath);
  const markdown = renderMarkdown(rows);
  const dir = path.dirname(tokenLogPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tokenLogPath, markdown);
  return { wrote: tokenLogPath, rowCount: rows.length };
}

module.exports = {
  regenerateLog,
  renderMarkdown,
  sortRows,
  _readJsonl,
  _renderRow,
  _tokenCellFromRow,
};
