#!/usr/bin/env node

/**
 * GSD-T Token Budget — Session-level token tracking (single-band, v3.12)
 *
 * Reads .gsd-t/.context-meter-state.json (M34) for context-window readings
 * and returns a single-band status signal (normal / threshold) that the
 * orchestrator uses to decide whether the next subagent spawn must go
 * through autoSpawnHeadless().
 *
 * v3.12.0 (M38 — meter reduction):
 *   - Collapsed three-band model (normal/warn/stop) to single-band
 *     (normal/threshold). The orchestrator makes the routing decision;
 *     the meter reports a band, not a degradation policy.
 *   - `getDegradationActions` export removed.
 *   - Dead-meter detection, `stale` band, and `deadReason` removed.
 *     Stale state transparently falls through to the heuristic — the
 *     fail-open hook never raised a user-visible alarm anyway, and the
 *     orchestrator's headless-by-default posture handles overflow
 *     structurally rather than by trying to instruct Claude mid-session.
 *   - Threshold default is `thresholdPct` from context-meter-config.json
 *     (default 75%). There is no intermediate warn band.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_RATIOS = { haiku: 1, sonnet: 5, opus: 25 };

// Base token estimates per task type (in haiku-equivalent units)
const BASE_ESTIMATES = {
  execute: 8000,
  qa: 5000,
  "red-team": 10000,
  "doc-ripple": 3000,
  plan: 4000,
  integrate: 6000,
  verify: 5000,
  default: 6000,
};

// v3.12 single-band default. Overridable via context-meter-config.json.
const DEFAULT_THRESHOLD_PCT = 75;

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  estimateCost,
  getSessionStatus,
  recordUsage,
  estimateMilestoneCost,
  getModelCostRatios,
};

// ── getModelCostRatios ────────────────────────────────────────────────────────

/** @returns {{ haiku: 1, sonnet: 5, opus: 25 }} */
function getModelCostRatios() {
  return { ...MODEL_RATIOS };
}

// ── estimateCost ──────────────────────────────────────────────────────────────

/**
 * @param {string} model - 'haiku' | 'sonnet' | 'opus'
 * @param {string} taskType - 'execute' | 'qa' | 'red-team' | etc.
 * @param {{ complexity?: number, historicalAvg?: number, projectDir?: string }} [options]
 * @returns {number} estimated tokens
 */
function estimateCost(model, taskType, options) {
  const o = options || {};
  const ratio = MODEL_RATIOS[model] || MODEL_RATIOS.sonnet;
  if (o.historicalAvg) return Math.round(o.historicalAvg * ratio);
  const hist = getHistoricalAvg(model, taskType, o.projectDir);
  if (hist) return Math.round(hist);
  const base = BASE_ESTIMATES[taskType] || BASE_ESTIMATES.default;
  const complexity = o.complexity || 1.0;
  return Math.round(base * ratio * complexity);
}

// ── getSessionStatus ─────────────────────────────────────────────────────────

const STATE_FILE_REL = path.join(".gsd-t", ".context-meter-state.json");
const CONFIG_FILE_REL = path.join(".gsd-t", "context-meter-config.json");
const STATE_STALE_MS = 5 * 60 * 1000;

/**
 * @param {string} [projectDir]
 * @returns {{ consumed: number, estimated_remaining: number, pct: number, threshold: 'normal'|'threshold' }}
 *
 * v3.12 (M38): reads `.gsd-t/.context-meter-state.json` produced by the
 * Context Meter PostToolUse hook. When the state file is fresh (timestamp
 * within 5 minutes), real `input_tokens` drive the response. Otherwise we
 * fall back to a historical heuristic from `.gsd-t/token-log.md`. Stale or
 * missing state is not a distinct band — the fail-open hook never raised
 * a user-visible alarm, and the orchestrator's headless-by-default spawn
 * path handles overflow structurally.
 */
function getSessionStatus(projectDir) {
  const dir = projectDir || process.cwd();
  const thresholdPct = resolveThresholdPct(dir);
  const real = readContextMeterState(dir);
  if (real) {
    const consumed = real.inputTokens;
    const window = real.modelWindowSize > 0 ? real.modelWindowSize : 200000;
    const estimated_remaining = Math.max(0, window - consumed);
    const pct = Math.round(real.pct * 10) / 10;
    const threshold = bandFor(pct, thresholdPct);
    return { consumed, estimated_remaining, pct, threshold };
  }
  return getSessionStatusHeuristic(dir, thresholdPct);
}

function readContextMeterState(dir) {
  try {
    const fp = path.join(dir, STATE_FILE_REL);
    const raw = fs.readFileSync(fp, "utf8");
    const s = JSON.parse(raw);
    if (!s || typeof s.inputTokens !== "number" || typeof s.pct !== "number") return null;
    if (!s.timestamp) return null;
    const age = Date.now() - Date.parse(s.timestamp);
    if (isNaN(age) || age > STATE_STALE_MS || age < 0) return null;
    if (s.lastError && typeof s.lastError === "object") return null;
    return s;
  } catch (_) {
    return null;
  }
}

function resolveThresholdPct(dir) {
  try {
    const fp = path.join(dir, CONFIG_FILE_REL);
    const raw = fs.readFileSync(fp, "utf8");
    const c = JSON.parse(raw);
    const pct = Number(c.thresholdPct);
    if (Number.isFinite(pct) && pct > 0 && pct < 100) return pct;
  } catch (_) {
    /* fall through */
  }
  return DEFAULT_THRESHOLD_PCT;
}

function getSessionStatusHeuristic(dir, thresholdPct) {
  const window = 200000;
  const consumed = readSessionConsumed(dir);
  const estimated_remaining = Math.max(0, window - consumed);
  const pct = window > 0 ? Math.round((consumed / window) * 100 * 10) / 10 : 0;
  const threshold = bandFor(pct, thresholdPct);
  return { consumed, estimated_remaining, pct, threshold };
}

// ── recordUsage ──────────────────────────────────────────────────────────────

/**
 * @param {{ model: string, taskType: string, tokens: number, duration_s: number, projectDir?: string }} usage
 */
function recordUsage(usage) {
  const dir = usage.projectDir || process.cwd();
  const fp = tokenLogPath(dir);
  ensureDir(path.dirname(fp));
  const now = fmtDate(new Date());
  const line = `| ${now} | ${now} | token-budget | record | ${usage.model} | ${usage.duration_s}s | recorded | ${usage.tokens} | null | | ${usage.taskType} | N/A |\n`;
  if (!fs.existsSync(fp)) {
    const header = "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |\n|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|---------|\n";
    fs.writeFileSync(fp, header);
  }
  fs.appendFileSync(fp, line);
}

// ── estimateMilestoneCost ─────────────────────────────────────────────────────

/**
 * @param {object[]} remainingTasks - [{ model, taskType, complexity }]
 * @param {string} [projectDir]
 * @returns {{ estimatedTokens: number, estimatedPct: number, feasible: boolean }}
 */
function estimateMilestoneCost(remainingTasks, projectDir) {
  const status = getSessionStatus(projectDir);
  const window = status.consumed + status.estimated_remaining || 200000;
  const estimatedTokens = remainingTasks.reduce((sum, t) => {
    return sum + estimateCost(t.model, t.taskType, { complexity: t.complexity, projectDir });
  }, 0);
  const estimatedPct = window > 0 ? Math.min(100, Math.round((estimatedTokens / window) * 100 * 10) / 10) : 0;
  const feasible = estimatedTokens <= status.estimated_remaining;
  return { estimatedTokens, estimatedPct, feasible };
}

// ── Internal: single-band resolution ─────────────────────────────────────────

function bandFor(pct, thresholdPct) {
  if (!Number.isFinite(pct)) return "normal";
  return pct >= thresholdPct ? "threshold" : "normal";
}

// ── Internal: token-log parsing ───────────────────────────────────────────────

function readSessionConsumed(projectDir) {
  const fp = tokenLogPath(projectDir || process.cwd());
  if (!fs.existsSync(fp)) return 0;
  const today = fmtDate(new Date()).slice(0, 10); // YYYY-MM-DD
  const lines = fs.readFileSync(fp, "utf8").split("\n");
  let total = 0;
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cols = parseRow(line);
    if (cols.length < 8) continue;
    const dtStart = (cols[0] || "").trim();
    if (!dtStart.startsWith(today)) continue;
    const tokens = parseInt(cols[7], 10);
    if (!isNaN(tokens) && tokens > 0) total += tokens;
  }
  return total;
}

function getHistoricalAvg(model, taskType, projectDir) {
  const fp = tokenLogPath(projectDir || process.cwd());
  if (!fs.existsSync(fp)) return null;
  const lines = fs.readFileSync(fp, "utf8").split("\n");
  const matches = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cols = parseRow(line);
    if (cols.length < 8) continue;
    const rowModel = (cols[4] || "").trim();
    const rowTask = (cols[10] || (cols[3] || "")).trim();
    const tokens = parseInt(cols[7], 10);
    if (rowModel === model && rowTask === taskType && !isNaN(tokens) && tokens > 0) {
      matches.push(tokens);
    }
  }
  if (matches.length === 0) return null;
  return matches.reduce((s, v) => s + v, 0) / matches.length;
}

function parseRow(line) {
  return line.split("|").slice(1, -1);
}

// ── Internal: helpers ────────────────────────────────────────────────────────

function tokenLogPath(dir) {
  return path.join(dir, ".gsd-t", "token-log.md");
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
