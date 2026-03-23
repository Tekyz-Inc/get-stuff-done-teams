#!/usr/bin/env node

/**
 * GSD-T Metrics Rollup — Milestone-level aggregation, ELO, heuristics
 *
 * Reads task-metrics.jsonl, computes rollup stats and process ELO,
 * runs 4 detection heuristics, writes to rollup.jsonl.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

// ── Constants ────────────────────────────────────────────────────────────────

const ELO_START = 1000;
const ELO_K = 32;

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateRollup, computeELO, runHeuristics, readRollups };

// ── generateRollup ───────────────────────────────────────────────────────────

function generateRollup(milestone, version, projectDir) {
  const dir = projectDir || process.env.GSD_T_PROJECT_DIR || process.cwd();
  const tasks = readTaskMetrics(dir, milestone);
  if (tasks.length === 0) throw new Error(`No task-metrics found for ${milestone}`);
  const prev = getPreviousRollup(dir);
  const eloBefore = prev ? prev.elo_after : ELO_START;
  const eloAfter = computeELO(eloBefore, tasks);
  const rollup = buildRollup(milestone, version, tasks, eloBefore, eloAfter, prev);
  const filePath = resolveRollupFile(dir);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(rollup) + "\n");
  return rollup;
}

// ── computeELO ───────────────────────────────────────────────────────────────

function computeELO(eloBefore, tasks) {
  const total = tasks.length;
  if (total === 0) return eloBefore;
  const sumWeights = tasks.reduce((s, t) => s + (t.signal_weight || 0), 0);
  const actual = (sumWeights + total) / (2 * total);
  const expected = 1 / (1 + Math.pow(10, (ELO_START - eloBefore) / 400));
  return Math.round((eloBefore + ELO_K * (actual - expected)) * 100) / 100;
}

// ── runHeuristics ────────────────────────────────────────────────────────────

function runHeuristics(current, previous, rawTasks) {
  const flags = [];
  if (previous) {
    checkFirstPassSpike(current, previous, flags);
    checkReworkAnomaly(current, previous, flags);
    checkDurationRegression(current, previous, flags);
  }
  checkContextOverflow(rawTasks || [], flags);
  return flags;
}

// ── readRollups ──────────────────────────────────────────────────────────────

function readRollups(filters, projectDir) {
  const dir = projectDir || process.env.GSD_T_PROJECT_DIR || process.cwd();
  const filePath = resolveRollupFile(dir);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").trim().split("\n")
    .map(safeParse).filter(Boolean)
    .filter((r) => matchFilters(r, filters || {}));
}

// ── Internal: buildRollup ────────────────────────────────────────────────────

function buildRollup(milestone, version, tasks, eloBefore, eloAfter, prev) {
  const total = tasks.length;
  const passCount = tasks.filter((t) => t.fix_cycles === 0 && t.pass).length;
  const firstPassRate = Math.round((passCount / total) * 1000) / 1000;
  const avgDur = Math.round(tasks.reduce((s, t) => s + t.duration_s, 0) / total * 100) / 100;
  const avgCtx = Math.round(tasks.reduce((s, t) => s + t.context_pct, 0) / total * 100) / 100;
  const totalFix = tasks.reduce((s, t) => s + t.fix_cycles, 0);
  const totalTokens = tasks.reduce((s, t) => s + t.tokens_used, 0);
  const sigDist = buildSignalDist(tasks);
  const domBreak = buildDomainBreakdown(tasks);
  const trend = prev ? buildTrendDelta(firstPassRate, avgDur, eloAfter - eloBefore, prev) : null;
  const rollup = {
    ts: new Date().toISOString(), milestone, version, total_tasks: total,
    first_pass_rate: firstPassRate, avg_duration_s: avgDur, avg_context_pct: avgCtx,
    total_fix_cycles: totalFix, total_tokens: totalTokens,
    elo_before: eloBefore, elo_after: eloAfter, elo_delta: Math.round((eloAfter - eloBefore) * 100) / 100,
    signal_distribution: sigDist, domain_breakdown: domBreak, trend_delta: trend,
    heuristic_flags: [],
  };
  rollup.heuristic_flags = runHeuristics(rollup, prev, tasks);
  return rollup;
}

// ── Internal: signal distribution ────────────────────────────────────────────

function buildSignalDist(tasks) {
  const dist = {};
  tasks.forEach((t) => { dist[t.signal_type] = (dist[t.signal_type] || 0) + 1; });
  return dist;
}

// ── Internal: domain breakdown ───────────────────────────────────────────────

function buildDomainBreakdown(tasks) {
  const groups = {};
  tasks.forEach((t) => { (groups[t.domain] = groups[t.domain] || []).push(t); });
  return Object.entries(groups).map(([domain, items]) => ({
    domain, tasks: items.length,
    first_pass_rate: Math.round(items.filter((t) => t.fix_cycles === 0 && t.pass).length / items.length * 1000) / 1000,
    avg_duration_s: Math.round(items.reduce((s, t) => s + t.duration_s, 0) / items.length * 100) / 100,
  }));
}

// ── Internal: trend delta ────────────────────────────────────────────────────

function buildTrendDelta(fpr, avgDur, eloDelta, prev) {
  return {
    first_pass_rate_delta: Math.round((fpr - prev.first_pass_rate) * 1000) / 1000,
    avg_duration_delta: Math.round((avgDur - prev.avg_duration_s) * 100) / 100,
    elo_delta: Math.round(eloDelta * 100) / 100,
  };
}

// ── Internal: heuristics ─────────────────────────────────────────────────────

function checkFirstPassSpike(cur, prev, flags) {
  if (prev.first_pass_rate - cur.first_pass_rate > 0.15) {
    flags.push({ heuristic: "first-pass-failure-spike", severity: "HIGH",
      description: `First-pass rate dropped from ${(prev.first_pass_rate * 100).toFixed(0)}% to ${(cur.first_pass_rate * 100).toFixed(0)}%` });
  }
}

function checkReworkAnomaly(cur, prev, flags) {
  const prevAvg = prev.total_tasks > 0 ? prev.total_fix_cycles / prev.total_tasks : 0;
  const curAvg = cur.total_tasks > 0 ? cur.total_fix_cycles / cur.total_tasks : 0;
  if (prevAvg > 0 && curAvg > 2 * prevAvg) {
    flags.push({ heuristic: "rework-rate-anomaly", severity: "MEDIUM",
      description: `Fix cycle avg ${curAvg.toFixed(1)} is >2x previous ${prevAvg.toFixed(1)}` });
  }
}

function checkContextOverflow(tasks, flags) {
  if (tasks.length === 0) return;
  const failed = tasks.filter((t) => !t.pass);
  if (failed.length === 0) return;
  const highCtx = failed.filter((t) => t.context_pct > 80);
  if (highCtx.length / failed.length > 0.3) {
    flags.push({ heuristic: "context-overflow-correlation", severity: "MEDIUM",
      description: `${highCtx.length}/${failed.length} failed tasks had context >80%` });
  }
}

function checkDurationRegression(cur, prev, flags) {
  if (prev.avg_duration_s > 0 && cur.avg_duration_s > 2 * prev.avg_duration_s) {
    flags.push({ heuristic: "duration-regression", severity: "LOW",
      description: `Avg duration ${cur.avg_duration_s.toFixed(0)}s is >2x previous ${prev.avg_duration_s.toFixed(0)}s` });
  }
}

// ── Internal: file helpers ───────────────────────────────────────────────────

function readTaskMetrics(dir, milestone) {
  const fp = path.join(dir, ".gsd-t", "metrics", "task-metrics.jsonl");
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, "utf8").trim().split("\n")
    .map(safeParse).filter(Boolean)
    .filter((r) => r.milestone === milestone);
}

function getPreviousRollup(dir) {
  const all = readRollups({}, dir);
  return all.length > 0 ? all[all.length - 1] : null;
}

function resolveRollupFile(dir) {
  return path.join(dir, ".gsd-t", "metrics", "rollup.jsonl");
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function safeParse(l) { try { return JSON.parse(l); } catch { return null; } }
function matchFilters(r, f) { return Object.entries(f).every(([k, v]) => r[k] === v); }

// ── CLI Entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const milestone = args[0];
  const version = args[1] || "0.0.0";
  if (!milestone) { process.stderr.write("Usage: metrics-rollup.js <milestone> [version]\n"); process.exit(1); }
  try {
    const rollup = generateRollup(milestone, version);
    process.stdout.write(JSON.stringify(rollup, null, 2) + "\n");
  } catch (err) { process.stderr.write(err.message + "\n"); process.exit(1); }
}
