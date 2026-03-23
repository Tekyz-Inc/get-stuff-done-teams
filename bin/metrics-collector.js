#!/usr/bin/env node

/**
 * GSD-T Metrics Collector — Per-task telemetry writer
 *
 * Writes structured task-metrics records to .gsd-t/metrics/task-metrics.jsonl.
 * Reads and filters metrics for pre-flight intelligence checks.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

// ── Signal type → weight mapping (per metrics-schema-contract.md) ────────────

const SIGNAL_WEIGHTS = {
  "pass-through": 1.0,
  "fix-cycle": -0.5,
  "debug-invoked": -0.8,
  "user-correction": -1.0,
  "phase-skip": 0.3,
};

const VALID_SIGNAL_TYPES = new Set(Object.keys(SIGNAL_WEIGHTS));

const REQUIRED_FIELDS = [
  "milestone", "domain", "task", "command", "duration_s",
  "tokens_used", "context_pct", "pass", "fix_cycles", "signal_type",
];

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { collectTaskMetrics, readTaskMetrics, getPreFlightWarnings };

// ── collectTaskMetrics ───────────────────────────────────────────────────────

function collectTaskMetrics(data, projectDir) {
  const dir = projectDir || process.env.GSD_T_PROJECT_DIR || process.cwd();
  const error = validateRecord(data);
  if (error) throw new Error(error);
  const record = buildRecord(data);
  const filePath = resolveMetricsFile(dir);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n");
  return record;
}

// ── readTaskMetrics ──────────────────────────────────────────────────────────

function readTaskMetrics(filters, projectDir) {
  const dir = projectDir || process.env.GSD_T_PROJECT_DIR || process.cwd();
  const filePath = resolveMetricsFile(dir);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
  return lines
    .map(safeParse)
    .filter(Boolean)
    .filter((r) => matchesFilters(r, filters || {}));
}

// ── getPreFlightWarnings ─────────────────────────────────────────────────────

function getPreFlightWarnings(domain, projectDir) {
  const records = readTaskMetrics({ domain }, projectDir);
  const recent = records.slice(-10);
  if (recent.length === 0) return [];
  const warnings = [];
  const passCount = recent.filter((r) => r.pass).length;
  const rate = passCount / recent.length;
  if (rate < 0.6) {
    warnings.push(`Domain ${domain} has ${(rate * 100).toFixed(0)}% first-pass rate (last ${recent.length} tasks). Consider splitting tasks.`);
  }
  const avgFix = recent.reduce((s, r) => s + r.fix_cycles, 0) / recent.length;
  if (avgFix > 2.0) {
    warnings.push(`Domain ${domain} averaging ${avgFix.toFixed(1)} fix cycles. Review constraints.`);
  }
  return warnings;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function validateRecord(data) {
  if (!data || typeof data !== "object") return "Data must be an object";
  for (const f of REQUIRED_FIELDS) {
    if (data[f] === undefined || data[f] === null) return `Missing required field: ${f}`;
  }
  if (!VALID_SIGNAL_TYPES.has(data.signal_type)) {
    return `Invalid signal_type: "${data.signal_type}"`;
  }
  if (typeof data.duration_s !== "number" || data.duration_s < 0) {
    return "duration_s must be a non-negative number";
  }
  if (typeof data.context_pct !== "number" || data.context_pct < 0 || data.context_pct > 100) {
    return "context_pct must be 0-100";
  }
  if (typeof data.fix_cycles !== "number" || data.fix_cycles < 0) {
    return "fix_cycles must be >= 0";
  }
  return null;
}

function buildRecord(data) {
  return {
    ts: new Date().toISOString(),
    milestone: data.milestone,
    domain: data.domain,
    task: data.task,
    command: data.command,
    duration_s: data.duration_s,
    tokens_used: data.tokens_used,
    context_pct: data.context_pct,
    pass: Boolean(data.pass),
    fix_cycles: data.fix_cycles,
    signal_type: data.signal_type,
    signal_weight: SIGNAL_WEIGHTS[data.signal_type],
    notes: data.notes || null,
  };
}

function resolveMetricsFile(projectDir) {
  return path.join(projectDir, ".gsd-t", "metrics", "task-metrics.jsonl");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function matchesFilters(record, filters) {
  for (const [key, val] of Object.entries(filters)) {
    if (record[key] !== val) return false;
  }
  return true;
}

// ── CLI Entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = parseCLIArgs(process.argv.slice(2));
  try {
    collectTaskMetrics(args);
    process.exit(0);
  } catch (err) {
    process.stderr.write(err.message + "\n");
    process.exit(1);
  }
}

function parseCLIArgs(argv) {
  const map = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2).replace(/-/g, "_");
      let val = argv[i + 1];
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      map[key] = val;
      i++;
    }
  }
  return map;
}
