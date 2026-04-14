#!/usr/bin/env node

/**
 * GSD-T Token Budget — Session-level token tracking and graduated degradation
 *
 * Reads .gsd-t/token-log.md for historical averages, tracks session usage,
 * and returns model override recommendations at degradation thresholds.
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

const THRESHOLDS = {
  warn: 60,
  downgrade: 70,
  conserve: 85,
  stop: 95,
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

/**
 * @param {string} [projectDir]
 * @returns {{ consumed: number, estimated_remaining: number, pct: number, threshold: string }}
 *
 * v2.74.12: previously this read process.env.CLAUDE_CONTEXT_TOKENS_USED /
 * CLAUDE_CONTEXT_TOKENS_MAX, which Claude Code does not export — so consumed
 * was always 0 and threshold was always 'normal'. The graduated-degradation
 * machinery downstream was inert. Now we synthesise a percent from the real
 * task counter at .gsd-t/.task-counter, mapping 0..limit linearly to
 * 0..100%. This keeps the API stable so commands that ask for thresholds
 * (downgrade/conserve/stop) get a real signal.
 */
function getSessionStatus(projectDir) {
  const dir = projectDir || process.cwd();
  const counter = readTaskCounter(dir);
  const limit = counter.limit > 0 ? counter.limit : 5;
  const consumed = counter.count;
  const pct = Math.min(100, Math.round((consumed / limit) * 100 * 10) / 10);
  const threshold = resolveThreshold(pct);
  const estimated_remaining = Math.max(0, limit - consumed);
  return { consumed, estimated_remaining, pct, threshold };
}

function readTaskCounter(dir) {
  try {
    const fp = path.join(dir, ".gsd-t", ".task-counter");
    const raw = fs.readFileSync(fp, "utf8");
    const s = JSON.parse(raw);
    let limit = 5;
    try {
      const cfgRaw = fs.readFileSync(path.join(dir, ".gsd-t", "task-counter-config.json"), "utf8");
      const cfg = JSON.parse(cfgRaw);
      if (cfg && typeof cfg.limit === "number" && cfg.limit > 0) limit = cfg.limit;
    } catch (_) {}
    if (process.env.GSD_T_TASK_LIMIT) {
      const n = parseInt(process.env.GSD_T_TASK_LIMIT, 10);
      if (!isNaN(n) && n > 0) limit = n;
    }
    return { count: typeof s.count === "number" ? s.count : 0, limit };
  } catch (_) {
    return { count: 0, limit: 5 };
  }
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

// ── getDegradationActions ─────────────────────────────────────────────────────

/**
 * @param {string} [projectDir]
 * @returns {{ threshold: string, actions: string[], modelOverrides: object }}
 */
function getDegradationActions(projectDir) {
  const { threshold } = getSessionStatus(projectDir);
  return buildDegradationResponse(threshold);
}

// ── estimateMilestoneCost ─────────────────────────────────────────────────────

/**
 * @param {object[]} remainingTasks - [{ model, taskType, complexity }]
 * @param {string} [projectDir]
 * @returns {{ estimatedTokens: number, estimatedPct: number, feasible: boolean }}
 */
function estimateMilestoneCost(remainingTasks, projectDir) {
  const status = getSessionStatus(projectDir);
  const limit = status.consumed + status.estimated_remaining || 5;
  const estimatedTokens = remainingTasks.reduce((sum, t) => {
    return sum + estimateCost(t.model, t.taskType, { complexity: t.complexity, projectDir });
  }, 0);
  // Estimate task-equivalents needed for the remaining work: cost-weighted
  // approximation against historical avg, capped at the configured task limit.
  const taskEquivalents = remainingTasks.length;
  const estimatedPct = limit > 0 ? Math.min(100, Math.round((taskEquivalents / limit) * 100 * 10) / 10) : 0;
  const feasible = taskEquivalents <= status.estimated_remaining;
  return { estimatedTokens, estimatedPct, feasible };
}

// ── Internal: threshold resolution ───────────────────────────────────────────

function resolveThreshold(pct) {
  if (pct >= THRESHOLDS.stop) return "stop";
  if (pct >= THRESHOLDS.conserve) return "conserve";
  if (pct >= THRESHOLDS.downgrade) return "downgrade";
  if (pct >= THRESHOLDS.warn) return "warn";
  return "normal";
}

function buildDegradationResponse(threshold) {
  const responses = {
    normal: {
      threshold: "normal",
      actions: [],
      modelOverrides: {},
    },
    warn: {
      threshold: "warn",
      actions: ["Display budget alert", "Reduce iteration budgets to minimum (2)"],
      modelOverrides: {},
    },
    downgrade: {
      threshold: "downgrade",
      actions: ["Downgrade non-critical Sonnet to Haiku", "Skip exploratory testing", "Disable shadow-mode audit"],
      modelOverrides: {
        "sonnet:qa": "sonnet",
        "sonnet:execute": "haiku",
        "sonnet:doc-ripple": "skip",
        "opus:red-team": "sonnet",
        "haiku:*": "haiku",
      },
    },
    conserve: {
      threshold: "conserve",
      actions: ["Pause doc-ripple", "Pause design brief generation", "Checkpoint all progress"],
      modelOverrides: {
        "sonnet:qa": "sonnet",
        "sonnet:execute": "haiku",
        "sonnet:doc-ripple": "skip",
        "opus:red-team": "sonnet",
        "haiku:*": "haiku",
      },
    },
    stop: {
      threshold: "stop",
      actions: ["Hard stop", "Save all progress", "Display resume instruction"],
      modelOverrides: {},
    },
  };
  return responses[threshold] || responses.normal;
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
