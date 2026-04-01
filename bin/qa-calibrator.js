#!/usr/bin/env node

/**
 * GSD-T QA Calibrator — Self-calibrating miss-rate tracking and QA injection
 *
 * Reads/writes .gsd-t/metrics/qa-miss-log.jsonl to track categories where
 * Red Team finds bugs QA missed. Computes miss rates and generates targeted
 * QA prompt injections for weak spots.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "contract-violation", "boundary-input", "state-transition",
  "error-path", "missing-flow", "regression", "e2e-gap",
];

const WEAK_SPOT_THRESHOLD = 0.30;
const PERSISTENT_MILESTONE_COUNT = 3;

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  logMiss, getCategoryMissRates, getWeakSpots,
  generateQAInjection, getPersistentWeakSpots,
};

// ── logMiss ──────────────────────────────────────────────────────────────────

/**
 * Log a QA miss (Red Team found, QA missed)
 * @param {object} miss - miss record matching schema
 * @param {string} [projectDir]
 */
function logMiss(miss, projectDir) {
  const fp = missLogPath(projectDir);
  ensureDir(path.dirname(fp));
  const record = { ts: new Date().toISOString(), ...miss };
  fs.appendFileSync(fp, JSON.stringify(record) + "\n");
}

// ── getCategoryMissRates ─────────────────────────────────────────────────────

/**
 * Compute per-category miss rates across recent milestones.
 * missRate = category misses / total misses in window (relative share).
 * @param {number} [windowSize=5]
 * @param {string} [projectDir]
 * @returns {object[]} [{ category, missRate, totalFindings, qaMissed }]
 */
function getCategoryMissRates(windowSize, projectDir) {
  const win = typeof windowSize === "number" ? windowSize : 5;
  const records = loadMissLog(projectDir);
  const milestones = getRecentMilestones(records, win);
  const inWindow = records.filter((r) => milestones.includes(r.milestone));
  const total = inWindow.length;
  return CATEGORIES.map((cat) => {
    const catRecs = inWindow.filter((r) => r.category === cat);
    const qaMissed = catRecs.length;
    const totalFindings = qaMissed;
    const missRate = total > 0 ? qaMissed / total : 0;
    return { category: cat, missRate, totalFindings, qaMissed };
  });
}

// ── getWeakSpots ─────────────────────────────────────────────────────────────

/**
 * Get current weak spots (categories with >30% miss rate)
 * @param {number} [windowSize=5]
 * @param {string} [projectDir]
 * @returns {object[]} [{ category, missRate, recentExamples: string[] }]
 */
function getWeakSpots(windowSize, projectDir) {
  const win = typeof windowSize === "number" ? windowSize : 5;
  const records = loadMissLog(projectDir);
  const milestones = getRecentMilestones(records, win);
  const inWindow = records.filter((r) => milestones.includes(r.milestone));
  const total = inWindow.length;
  return CATEGORIES
    .map((cat) => {
      const catRecs = inWindow.filter((r) => r.category === cat);
      const missRate = total > 0 ? catRecs.length / total : 0;
      const recentExamples = catRecs.slice(-3).map((r) => r.description || r.task || "");
      return { category: cat, missRate, recentExamples };
    })
    .filter((s) => s.missRate > WEAK_SPOT_THRESHOLD);
}

// ── generateQAInjection ──────────────────────────────────────────────────────

/**
 * Generate QA prompt injection text for weak spots
 * @param {number} [windowSize=5]
 * @param {string} [projectDir]
 * @returns {string} markdown text to inject, or "" if no weak spots
 */
function generateQAInjection(windowSize, projectDir) {
  const spots = getWeakSpots(windowSize, projectDir);
  if (spots.length === 0) return "";
  const lines = spots.map((s) => {
    const pct = Math.round(s.missRate * 100);
    const label = categoryLabel(s.category);
    const examples = s.recentExamples.filter(Boolean).slice(0, 2).join(", ");
    const exStr = examples ? `: Recent misses: ${examples}` : "";
    return `- **${s.category}** (${pct}% miss rate): ${label}${exStr}`;
  });
  return [
    "## QA PRIORITY FOCUS AREAS (auto-calibrated)",
    "",
    "Your historical miss rate for these categories is elevated. Pay EXTRA attention:",
    "",
    ...lines,
    "",
    "These are the areas where Red Team most often finds bugs you missed. Proving them clean is high-value.",
  ].join("\n");
}

// ── getPersistentWeakSpots ───────────────────────────────────────────────────

/**
 * Check if a weak spot should generate a permanent rule engine patch
 * @param {string} [projectDir]
 * @returns {object[]} categories with >30% miss rate for 3+ consecutive milestones
 */
function getPersistentWeakSpots(projectDir) {
  const records = loadMissLog(projectDir);
  const milestones = getRecentMilestones(records, Infinity);
  if (milestones.length < PERSISTENT_MILESTONE_COUNT) return [];
  return CATEGORIES.filter((cat) => {
    let consecutive = 0;
    let maxConsecutive = 0;
    for (const ms of milestones) {
      const msRecs = records.filter((r) => r.milestone === ms);
      const catRecs = msRecs.filter((r) => r.category === cat);
      const rate = msRecs.length > 0 ? catRecs.length / msRecs.length : 0;
      if (rate > WEAK_SPOT_THRESHOLD) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 0;
      }
    }
    return maxConsecutive >= PERSISTENT_MILESTONE_COUNT;
  }).map((cat) => {
    const catRecs = records.filter((r) => r.category === cat);
    const total = records.length;
    return { category: cat, missRate: total > 0 ? catRecs.length / total : 0 };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function missLogPath(d) {
  return path.join(d || process.cwd(), ".gsd-t", "metrics", "qa-miss-log.jsonl");
}

function loadMissLog(projectDir) {
  const fp = missLogPath(projectDir);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map(safeParse).filter(Boolean);
}

function getRecentMilestones(records, windowSize) {
  const seen = [];
  for (const r of records) {
    if (r.milestone && !seen.includes(r.milestone)) seen.push(r.milestone);
  }
  return windowSize === Infinity ? seen : seen.slice(-windowSize);
}


function categoryLabel(cat) {
  const labels = {
    "contract-violation": "Code doesn't match contract interface definition",
    "boundary-input": "Edge cases and boundary values",
    "state-transition": "Invalid state changes and missing state guards",
    "error-path": "Error handling completeness",
    "missing-flow": "Required user flows and code paths",
    "regression": "Previously working functionality",
    "e2e-gap": "End-to-end scenario coverage",
  };
  return labels[cat] || cat;
}

function safeParse(l) { try { return JSON.parse(l); } catch { return null; } }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
