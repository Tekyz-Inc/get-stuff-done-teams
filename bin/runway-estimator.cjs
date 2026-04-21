'use strict';
/**
 * GSD-T Runway Estimator (M43 D5 — dialog-channel growth meter)
 *
 * Under M43's channel-separation model, the only thing that runs in the
 * in-session channel is the `/gsd` router dialog. Everything else spawns.
 * This module reads the per-turn usage rows the M43 D1 capture writes to
 * `.gsd-t/metrics/token-usage.jsonl` (schema v2) and surfaces a one-line
 * "~N turns to `/compact`" warning to the router.
 *
 * Scope (revised 2026-04-21 per M43 partition.md §D5):
 *   - Read-only. Never refuses, never reroutes. Under always-headless there
 *     is nothing to reroute *to*.
 *   - Median-of-deltas growth slope (outlier-resistant; a single spike turn
 *     does not flip `shouldWarn`).
 *   - Zero external deps. `.cjs` so it loads in both ESM-default projects
 *     and CJS projects without transpilation.
 *
 * Contracts:
 *   - .gsd-t/contracts/context-meter-contract.md §Dialog Growth Meter
 *   - .gsd-t/contracts/metrics-schema-contract.md (schema v2)
 *
 * Consumers:
 *   - commands/gsd.md (router warning footer)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_K = 5;
const DEFAULT_MODEL_CONTEXT_CAP = 200000;
// Claude Code starts auto-compacting ~8% before the model window fills, so the
// effective dialog ceiling is 0.92 × modelContextCap.
const PRE_COMPACT_HEADROOM = 0.92;
const DEFAULT_WARN_THRESHOLD_TURNS = 5;
const MIN_HISTORY = 3;

// ── Row loading ──────────────────────────────────────────────────────

function _safeParse(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '{') return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

/**
 * Load in-session rows for the given session from the canonical sink.
 *
 * @param {string} projectDir
 * @param {string} sessionId
 * @returns {object[]}  schema-v2 rows, unsorted
 */
function _loadInSessionRows(projectDir, sessionId) {
  const p = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  if (!fs.existsSync(p)) return [];
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (_) { return []; }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const j = _safeParse(line);
    if (!j) continue;
    if (j.sessionType !== 'in-session') continue;
    if (sessionId != null && j.session_id !== sessionId) continue;
    rows.push(j);
  }
  return rows;
}

// ── Math helpers ─────────────────────────────────────────────────────

function _median(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Deterministic ordering for per-turn rows. Prefers timestamp (`ts`) when
 * present (monotonic per session), falls back to `turn_id` string compare.
 */
function _sortTurns(rows) {
  return rows.slice().sort((a, b) => {
    const ta = a.ts || '';
    const tb = b.ts || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ia = String(a.turn_id || '');
    const ib = String(b.turn_id || '');
    if (ia !== ib) return ia < ib ? -1 : 1;
    return 0;
  });
}

/**
 * Compute the dialog-growth signal for one session.
 *
 * Reads the last K in-session turns for `sessionId` from
 * `.gsd-t/metrics/token-usage.jsonl`, computes the median of turn-over-turn
 * `input_tokens` deltas (robust to single-turn spikes), then predicts how
 * many turns remain before dialog input crosses the pre-auto-compact ceiling
 * (`modelContextCap × 0.92`).
 *
 * Returns `{ shouldWarn: false, reason: 'insufficient_history' }` when fewer
 * than `MIN_HISTORY` in-session turns exist for the session.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string} opts.sessionId                required
 * @param {number} [opts.k]                      default 5 (last K turns)
 * @param {number} [opts.modelContextCap]        default 200000
 * @param {number} [opts.warnThresholdTurns]     default 5
 * @returns {{
 *   shouldWarn: boolean,
 *   slope: number,
 *   median_delta: number,
 *   latest_input_tokens: number,
 *   predicted_turns_to_compact: number,
 *   k: number,
 *   history_len: number,
 *   reason?: string
 * }}
 */
function estimateDialogGrowth(opts) {
  const projectDir = (opts && opts.projectDir) || '.';
  const sessionId = opts && opts.sessionId;
  const k = (opts && Number.isFinite(opts.k) && opts.k > 0) ? Math.floor(opts.k) : DEFAULT_K;
  const cap = (opts && Number.isFinite(opts.modelContextCap) && opts.modelContextCap > 0)
    ? opts.modelContextCap
    : DEFAULT_MODEL_CONTEXT_CAP;
  const warnThreshold = (opts && Number.isFinite(opts.warnThresholdTurns) && opts.warnThresholdTurns > 0)
    ? opts.warnThresholdTurns
    : DEFAULT_WARN_THRESHOLD_TURNS;

  const empty = {
    shouldWarn: false,
    slope: 0,
    median_delta: 0,
    latest_input_tokens: 0,
    predicted_turns_to_compact: Infinity,
    k,
    history_len: 0,
  };

  if (!sessionId) {
    return { ...empty, reason: 'missing_session_id' };
  }

  const allRows = _loadInSessionRows(projectDir, sessionId);
  if (allRows.length === 0) {
    return { ...empty, reason: 'no_rows' };
  }

  const sorted = _sortTurns(allRows);
  const window = sorted.slice(-k);

  if (window.length < MIN_HISTORY) {
    return { ...empty, history_len: window.length, reason: 'insufficient_history' };
  }

  // Per-turn input token footprint. Schema v2 writes `inputTokens` (camel)
  // via the token-capture wrapper; older rows may carry the raw envelope.
  const inputs = window.map(r => {
    if (Number.isFinite(r.inputTokens)) return r.inputTokens;
    if (r.usage && Number.isFinite(r.usage.input_tokens)) return r.usage.input_tokens;
    return 0;
  });

  const deltas = [];
  for (let i = 1; i < inputs.length; i++) {
    deltas.push(inputs[i] - inputs[i - 1]);
  }

  const median_delta = _median(deltas);
  const slope = median_delta;
  const latest_input_tokens = inputs[inputs.length - 1];

  const ceiling = cap * PRE_COMPACT_HEADROOM;
  let predicted_turns_to_compact;
  if (slope > 0) {
    const headroom = ceiling - latest_input_tokens;
    predicted_turns_to_compact = headroom <= 0 ? 0 : Math.ceil(headroom / slope);
  } else {
    predicted_turns_to_compact = Infinity;
  }

  const shouldWarn = Number.isFinite(predicted_turns_to_compact) && predicted_turns_to_compact <= warnThreshold;

  return {
    shouldWarn,
    slope,
    median_delta,
    latest_input_tokens,
    predicted_turns_to_compact,
    k,
    history_len: window.length,
  };
}

module.exports = {
  estimateDialogGrowth,
  // Exposed for unit tests; not part of the stable contract.
  _internal: {
    _median,
    _sortTurns,
    _loadInSessionRows,
    DEFAULT_K,
    DEFAULT_MODEL_CONTEXT_CAP,
    PRE_COMPACT_HEADROOM,
    DEFAULT_WARN_THRESHOLD_TURNS,
    MIN_HISTORY,
  },
};
