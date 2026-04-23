"use strict";

/**
 * gsd-t-economics — M44 D6 (pre-spawn economics estimator)
 *
 * Contract: .gsd-t/contracts/economics-estimator-contract.md
 *
 * Hard invariants:
 *   - Zero external runtime deps (Node built-ins only).
 *   - Corpus loaded ONCE per projectDir at module init (sync read, cached).
 *   - NEVER returns undefined — global median fallback guarantees a number.
 *   - D6 is a HINT only; D2 owns the final gate decision.
 *   - Event emission is best-effort; failures never fail the estimate.
 */

const fs = require("node:fs");
const path = require("node:path");

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Effective CW ceiling in tokens. Matches:
 *   - bin/token-budget.cjs (200000)
 *   - bin/context-meter-config.cjs (modelWindowSize: 200000)
 *   - bin/runway-estimator.cjs (DEFAULT_MODEL_CONTEXT_CAP = 200000)
 */
const CW_CEILING_TOKENS = 200000;

/** Confidence tier cutoffs (exact-match row counts). */
const HIGH_CONFIDENCE_MIN = 5; // ≥5 exact matches
// MEDIUM: 1-4 exact matches.
// LOW: fuzzy match (domain-only or command-only).
// FALLBACK: global median.

/** Mode-specific gate thresholds (percent of CW ceiling). */
const IN_SESSION_PARALLEL_OK_PCT = 85;
const UNATTENDED_PARALLEL_OK_PCT = 60;
const UNATTENDED_SPLIT_PCT = 60;

// ─── Corpus loading (ONCE per projectDir) ─────────────────────────────────

const _corpusCache = new Map(); // projectDir → loaded corpus index

/**
 * Synchronously load the token-usage corpus for a given projectDir.
 * Cached indefinitely per process per projectDir.
 *
 * @param {string} projectDir
 * @returns {{
 *   rows: object[],
 *   exact:   Map<string, number[]>,  // "cmd|step|dom" → [totals]
 *   byDomain: Map<string, number[]>, // dom → [totals]
 *   byCommand: Map<string, number[]>, // cmd → [totals]
 *   globalMedian: number,
 *   globalPct: number,
 * }}
 */
function loadCorpus(projectDir) {
  if (_corpusCache.has(projectDir)) return _corpusCache.get(projectDir);

  const corpusPath = path.join(projectDir, ".gsd-t", "metrics", "token-usage.jsonl");
  let raw = "";
  try {
    raw = fs.readFileSync(corpusPath, "utf8");
  } catch {
    raw = "";
  }

  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === "object") rows.push(r);
    } catch {
      /* skip malformed */
    }
  }

  const exact = new Map();
  const byDomain = new Map();
  const byCommand = new Map();
  const allTotals = [];

  for (const r of rows) {
    const total = rowTotalTokens(r);
    const cmd = r.command || "-";
    const step = r.step || "-";
    const dom = r.domain || "-";
    const key = `${cmd}|${step}|${dom}`;
    pushMap(exact, key, total);
    pushMap(byDomain, dom, total);
    pushMap(byCommand, cmd, total);
    allTotals.push(total);
  }

  const globalMedian = median(allTotals);
  const globalPct = tokensToCwPct(globalMedian);

  const idx = { rows, exact, byDomain, byCommand, globalMedian, globalPct };
  _corpusCache.set(projectDir, idx);
  return idx;
}

/** Row-level total = input + output + cacheRead + cacheCreation. */
function rowTotalTokens(r) {
  return (r.inputTokens || 0)
    + (r.outputTokens || 0)
    + (r.cacheReadInputTokens || 0)
    + (r.cacheCreationInputTokens || 0);
}

function pushMap(m, k, v) {
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(v);
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function tokensToCwPct(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return (tokens / CW_CEILING_TOKENS) * 100;
}

// ─── Event emission (best-effort) ─────────────────────────────────────────

function writeEconomicsEvent(projectDir, ev) {
  try {
    const dir = path.join(projectDir, ".gsd-t", "events");
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date(ev.ts || Date.now());
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const file = path.join(dir, `${y}-${m}-${d}.jsonl`);
    const line = JSON.stringify(ev) + "\n";
    fs.appendFileSync(file, line, "utf8");
    return true;
  } catch {
    return false; // best-effort — never fails the estimate
  }
}

// ─── Lookup algorithm ─────────────────────────────────────────────────────

/**
 * Three-tier lookup against the corpus:
 *   1. Exact `command|step|domain` match → HIGH (≥5) or MEDIUM (1–4).
 *   2. Fuzzy match (domain-only, then command-only) → LOW.
 *   3. Global median → FALLBACK.
 *
 * Returns { estimatedTokens, matchedRows, confidence }.
 */
function lookupInCorpus(taskNode, corpus) {
  const cmd = (taskNode && taskNode.command) || "-";
  const step = (taskNode && taskNode.step) || "-";
  const dom = (taskNode && taskNode.domain) || "-";

  // Tier 1: exact triplet.
  const exactKey = `${cmd}|${step}|${dom}`;
  const exactRows = corpus.exact.get(exactKey);
  if (exactRows && exactRows.length > 0) {
    const n = exactRows.length;
    return {
      estimatedTokens: median(exactRows),
      matchedRows: n,
      confidence: n >= HIGH_CONFIDENCE_MIN ? "HIGH" : "MEDIUM",
    };
  }

  // Tier 2a: domain-only fuzzy match.
  if (dom && dom !== "-") {
    const domRows = corpus.byDomain.get(dom);
    if (domRows && domRows.length > 0) {
      return {
        estimatedTokens: median(domRows),
        matchedRows: domRows.length,
        confidence: "LOW",
      };
    }
  }

  // Tier 2b: command-only fuzzy match.
  if (cmd && cmd !== "-") {
    const cmdRows = corpus.byCommand.get(cmd);
    if (cmdRows && cmdRows.length > 0) {
      return {
        estimatedTokens: median(cmdRows),
        matchedRows: cmdRows.length,
        confidence: "LOW",
      };
    }
  }

  // Tier 3: global median fallback.
  return {
    estimatedTokens: corpus.globalMedian,
    matchedRows: 0,
    confidence: "FALLBACK",
  };
}

// ─── Gate arithmetic ──────────────────────────────────────────────────────

function decideGates(mode, estimatedCwPct, confidence) {
  let parallelOk;
  let split;

  if (mode === "unattended") {
    parallelOk = estimatedCwPct <= UNATTENDED_PARALLEL_OK_PCT;
    split = estimatedCwPct > UNATTENDED_SPLIT_PCT;
  } else {
    // 'in-session' (default)
    parallelOk = estimatedCwPct <= IN_SESSION_PARALLEL_OK_PCT;
    split = false;
  }

  // Worker-count recommendation: 1 by default; halve (floor 1) for FALLBACK
  // confidence per §5 guidance. LOW confidence keeps 1 worker at this level —
  // D2 applies the "reduce by 1–2" heuristic itself (it owns pool sizing).
  let workerCount = 1;
  if (confidence === "FALLBACK") workerCount = 1; // already 1; documented for clarity
  return { parallelOk, split, workerCount };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Estimate a task's CW footprint and produce a mode-specific recommendation.
 *
 * @param {object} opts
 * @param {{id?:string, command?:string, step?:string, domain?:string}} opts.taskNode
 * @param {'in-session'|'unattended'} opts.mode
 * @param {string} [opts.projectDir]
 * @returns {{estimatedCwPct:number, parallelOk:boolean, split:boolean, workerCount:number, matchedRows:number, confidence:'HIGH'|'MEDIUM'|'LOW'|'FALLBACK'}}
 */
function estimateTaskFootprint(opts) {
  const taskNode = (opts && opts.taskNode) || {};
  const mode = (opts && opts.mode) || "in-session";
  const projectDir = (opts && opts.projectDir) || process.cwd();

  const corpus = loadCorpus(projectDir);

  const { estimatedTokens, matchedRows, confidence } = lookupInCorpus(taskNode, corpus);
  const estimatedCwPct = tokensToCwPct(estimatedTokens);

  const { parallelOk, split, workerCount } = decideGates(mode, estimatedCwPct, confidence);

  // Best-effort event emission.
  writeEconomicsEvent(projectDir, {
    type: "economics_decision",
    ts: new Date().toISOString(),
    task_id: taskNode.id || null,
    mode,
    estimatedCwPct,
    parallelOk,
    split,
    confidence,
    matchedRows,
  });

  return {
    estimatedCwPct,
    parallelOk,
    split,
    workerCount,
    matchedRows,
    confidence,
  };
}

module.exports = {
  estimateTaskFootprint,
  // Internals exposed for unit tests + calibration tooling:
  _CW_CEILING_TOKENS: CW_CEILING_TOKENS,
  _loadCorpus: loadCorpus,
  _lookupInCorpus: lookupInCorpus,
  _rowTotalTokens: rowTotalTokens,
  _median: median,
  _tokensToCwPct: tokensToCwPct,
  _resetCorpusCache: function resetCorpusCache() { _corpusCache.clear(); },
};
