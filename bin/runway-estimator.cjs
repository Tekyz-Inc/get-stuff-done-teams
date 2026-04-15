#!/usr/bin/env node

/**
 * GSD-T Runway Estimator — Pre-flight context runway projection
 *
 * Reads current context percentage from the M34 context meter state file and
 * historical token-telemetry records (token-metrics.jsonl) to project whether
 * a command about to run will complete before the v3.0.0 stop band (85%).
 *
 * Confidence-weighted: high ≥50 records, medium ≥10, low <10. Low confidence
 * applies a 1.25x conservative skew. On missing history a constant fallback
 * is used (4%/task sonnet-default, 8%/task opus-default). On refusal the
 * estimator never prompts the user — callers hand off to headless-auto-spawn.
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/runway-estimator-contract.md v1.0.0
 * Consumers: bin/gsd-t.js, commands/gsd-t-execute|wave|integrate|quick|debug.md
 */

const fs = require("fs");
const path = require("path");

// ── Constants ────────────────────────────────────────────────────────────────

// Mirrors token-budget-contract v3.0.0 — must stay in sync.
const STOP_THRESHOLD_PCT = 85;

// Confidence grading thresholds (frozen in runway-estimator-contract v1.0.0).
const CONFIDENCE_HIGH_MIN = 50;
const CONFIDENCE_MEDIUM_MIN = 10;

// Conservative skew multiplier applied to low-confidence projections.
const LOW_CONFIDENCE_SKEW = 1.25;

// Conservative constant fallback when no history exists at all.
const FALLBACK_PCT_PER_TASK_SONNET = 4;
const FALLBACK_PCT_PER_TASK_OPUS = 8;

// Opus-default phases — used when picking a constant fallback for a command
// with no historical telemetry. Commands not listed default to sonnet.
const OPUS_DEFAULT_COMMANDS = new Set([
  "gsd-t-debug",
  "gsd-t-integrate",
]);

const STATE_FILE_REL = path.join(".gsd-t", ".context-meter-state.json");
const METRICS_FILE_REL = path.join(".gsd-t", "token-metrics.jsonl");

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  estimateRunway,
  STOP_THRESHOLD_PCT,
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MEDIUM_MIN,
  LOW_CONFIDENCE_SKEW,
};

// ── estimateRunway ───────────────────────────────────────────────────────────

/**
 * @param {{
 *   command: string,
 *   domain_type?: string,
 *   remaining_tasks: number,
 *   projectDir?: string,
 *   headlessAvailable?: boolean
 * }} opts
 * @returns {{
 *   can_start: boolean,
 *   current_pct: number,
 *   projected_end_pct: number,
 *   confidence: 'low'|'medium'|'high',
 *   confidence_basis: number,
 *   pct_per_task: number,
 *   recommendation: 'proceed'|'headless'|'clear-and-resume',
 *   reason: string
 * }}
 */
function estimateRunway(opts) {
  const command = opts.command;
  const domain_type = opts.domain_type || "";
  const remaining_tasks = Math.max(0, Number(opts.remaining_tasks) || 0);
  const projectDir = opts.projectDir || process.cwd();
  const headlessAvailable = opts.headlessAvailable !== false;

  const current_pct = readCurrentPct(projectDir);
  const records = readMetrics(projectDir);
  const { pct_per_task, confidence, confidence_basis } = computePctPerTask(
    records,
    command,
    domain_type,
  );

  const skew = confidence === "low" ? LOW_CONFIDENCE_SKEW : 1.0;
  const projected_end_pct = round1(
    current_pct + pct_per_task * remaining_tasks * skew,
  );
  const can_start = projected_end_pct < STOP_THRESHOLD_PCT;

  let recommendation;
  let reason;
  if (can_start) {
    recommendation = "proceed";
    reason = `Projected end ${projected_end_pct}% < ${STOP_THRESHOLD_PCT}% stop threshold`;
  } else if (headlessAvailable) {
    recommendation = "headless";
    reason = `Projected end ${projected_end_pct}% ≥ ${STOP_THRESHOLD_PCT}% — auto-spawn headless`;
  } else {
    recommendation = "clear-and-resume";
    reason = `Projected end ${projected_end_pct}% ≥ ${STOP_THRESHOLD_PCT}% — headless unavailable, clear-and-resume`;
  }

  return {
    can_start,
    current_pct,
    projected_end_pct,
    confidence,
    confidence_basis,
    pct_per_task: round2(pct_per_task),
    recommendation,
    reason,
  };
}

// ── Internal: read current pct from M34 state file ──────────────────────────

function readCurrentPct(projectDir) {
  try {
    const fp = path.join(projectDir, STATE_FILE_REL);
    const raw = fs.readFileSync(fp, "utf8");
    const s = JSON.parse(raw);
    if (typeof s.pct === "number" && Number.isFinite(s.pct)) {
      return round1(s.pct);
    }
  } catch (_) {
    // Missing or unreadable — warn and fall through.
    try {
      process.stderr.write(
        `runway-estimator: ${STATE_FILE_REL} missing or unreadable — assuming current_pct=0\n`,
      );
    } catch (_) {
      /* ignore */
    }
  }
  return 0;
}

// ── Internal: read token-metrics.jsonl ──────────────────────────────────────

function readMetrics(projectDir) {
  try {
    const fp = path.join(projectDir, METRICS_FILE_REL);
    const raw = fs.readFileSync(fp, "utf8");
    const out = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch (_) {
        /* skip malformed */
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

// ── Internal: compute pct-per-task with confidence grading ──────────────────

function computePctPerTask(records, command, domain_type) {
  // Tier 1: {command, domain_type} pair — sharpest match.
  if (domain_type) {
    const pair = records.filter(
      (r) => r.command === command && r.domain_type === domain_type,
    );
    if (pair.length >= CONFIDENCE_MEDIUM_MIN) {
      return {
        pct_per_task: meanPctDelta(pair),
        confidence: gradeConfidence(pair.length),
        confidence_basis: pair.length,
      };
    }
  }

  // Tier 2: {command} aggregate.
  const cmd = records.filter((r) => r.command === command);
  if (cmd.length >= CONFIDENCE_MEDIUM_MIN) {
    return {
      pct_per_task: meanPctDelta(cmd),
      confidence: gradeConfidence(cmd.length),
      confidence_basis: cmd.length,
    };
  }

  // Tier 3: constant fallback — confidence=low, basis=cmd.length (0 or few).
  return {
    pct_per_task: fallbackPctPerTask(command),
    confidence: "low",
    confidence_basis: cmd.length,
  };
}

function meanPctDelta(records) {
  if (!records.length) return 0;
  let sum = 0;
  let n = 0;
  for (const r of records) {
    const before = Number(r.context_window_pct_before);
    const after = Number(r.context_window_pct_after);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    const delta = after - before;
    if (delta < 0) continue; // pathological — treat as 0
    sum += delta;
    n += 1;
  }
  if (n === 0) return 0;
  return sum / n;
}

function gradeConfidence(n) {
  if (n >= CONFIDENCE_HIGH_MIN) return "high";
  if (n >= CONFIDENCE_MEDIUM_MIN) return "medium";
  return "low";
}

function fallbackPctPerTask(command) {
  if (OPUS_DEFAULT_COMMANDS.has(command)) return FALLBACK_PCT_PER_TASK_OPUS;
  return FALLBACK_PCT_PER_TASK_SONNET;
}

// ── Internal: rounding helpers ──────────────────────────────────────────────

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
