#!/usr/bin/env node

/**
 * GSD-T Token Budget — Session-level token tracking (three-band model)
 *
 * Reads .gsd-t/.context-meter-state.json (M34) for real context-window
 * readings, tracks session usage, and returns a three-band status signal
 * (normal / warn / stop) that callers use to decide whether to proceed,
 * log a warning, or halt cleanly.
 *
 * v3.0.0 (M35 — clean break from v2.0.0):
 *   - The `downgrade` and `conserve` bands were REMOVED. Silent model
 *     degradation and silent phase-skipping are anti-features — they
 *     violate GSD-T's "quality is non-negotiable" principle.
 *   - `getDegradationActions()` now returns `{band, pct, message}` instead
 *     of `{threshold, actions, modelOverrides}`. No `modelOverride`, no
 *     `skipPhases`, no `checkpoint` side-channel.
 *   - `warn` threshold tightened from 60% → 70%. `stop` tightened from
 *     95% → 85% — keeps us clear of the runtime's native ~95% compact.
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

// v3.0.0 three-band thresholds. Lower-bound inclusive.
//   pct <  70 → normal
//   70 ≤ pct <  85 → warn (informational — log, proceed)
//   pct ≥ 85 → stop  (halt cleanly, hand off to runway estimator)
const WARN_THRESHOLD_PCT = 70;
const STOP_THRESHOLD_PCT = 85;

const THRESHOLDS = {
  warn: WARN_THRESHOLD_PCT,
  stop: STOP_THRESHOLD_PCT,
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  estimateCost,
  getSessionStatus,
  recordUsage,
  getDegradationActions,
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
const STATE_STALE_MS = 5 * 60 * 1000;

/**
 * @param {string} [projectDir]
 * @returns {{ consumed: number, estimated_remaining: number, pct: number, threshold: string }}
 *
 * v2.0.0 (M34): reads `.gsd-t/.context-meter-state.json` produced by the
 * Context Meter PostToolUse hook. When that file is fresh (timestamp within
 * the last 5 minutes), real `input_tokens` drive the response. Otherwise we
 * fall back to a historical heuristic from `.gsd-t/token-log.md`, preserving
 * graceful degradation for projects without the hook installed.
 */
function getSessionStatus(projectDir) {
  const dir = projectDir || process.cwd();
  const real = readContextMeterState(dir);
  if (real) {
    const consumed = real.inputTokens;
    const window = real.modelWindowSize > 0 ? real.modelWindowSize : 200000;
    const estimated_remaining = Math.max(0, window - consumed);
    const pct = Math.round(real.pct * 10) / 10;
    const threshold = resolveThreshold(pct);
    return { consumed, estimated_remaining, pct, threshold };
  }
  return getSessionStatusHeuristic(dir);
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
    return s;
  } catch (_) {
    return null;
  }
}

function getSessionStatusHeuristic(dir) {
  const window = 200000;
  const consumed = readSessionConsumed(dir);
  const estimated_remaining = Math.max(0, window - consumed);
  const pct = window > 0 ? Math.round((consumed / window) * 100 * 10) / 10 : 0;
  const threshold = resolveThreshold(pct);
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

// ── getDegradationActions (v3.0.0 — three-band) ─────────────────────────────

/**
 * v3.0.0 three-band response. The name is preserved for caller-identification
 * convenience; the return shape is a CLEAN BREAK from v2.0.0 — no
 * `modelOverrides`, no `actions` list, no `skipPhases`, no `checkpoint`
 * side-channel. Callers that relied on those fields MUST be updated.
 *
 * @param {string} [projectDir]
 * @returns {{ band: 'normal'|'warn'|'stop', pct: number, message: string }}
 */
function getDegradationActions(projectDir) {
  const { threshold, pct } = getSessionStatus(projectDir);
  return buildBandResponse(threshold, pct);
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

// ── Internal: threshold resolution (v3.0.0 — three-band) ─────────────────────

function resolveThreshold(pct) {
  if (!Number.isFinite(pct)) return "normal";
  if (pct >= THRESHOLDS.stop) return "stop";
  if (pct >= THRESHOLDS.warn) return "warn";
  return "normal";
}

function buildBandResponse(band, pct) {
  const safePct = Number.isFinite(pct) ? pct : 0;
  switch (band) {
    case "warn":
      return {
        band: "warn",
        pct: safePct,
        message: `Context ${safePct.toFixed(1)}% — warn band (≥${WARN_THRESHOLD_PCT}%). Informational only; proceed.`,
      };
    case "stop":
      return {
        band: "stop",
        pct: safePct,
        message: `Context ${safePct.toFixed(1)}% — stop band (≥${STOP_THRESHOLD_PCT}%). Halt cleanly; hand off to runway estimator / headless auto-spawn.`,
      };
    case "normal":
    default:
      return {
        band: "normal",
        pct: safePct,
        message: `Context ${safePct.toFixed(1)}% — normal band. Proceed.`,
      };
  }
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
