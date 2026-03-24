#!/usr/bin/env node

/**
 * GSD-T Global Sync Manager — Cross-project metrics and rule propagation
 *
 * Reads local project metrics and writes global aggregated files to
 * ~/.claude/metrics/. Provides APIs for global rollup aggregation,
 * global rule storage, signal distribution comparison, and universal
 * rule promotion logic.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_METRICS_DIR = path.join(os.homedir(), ".claude", "metrics");
const GLOBAL_RULES_FILE = path.join(GLOBAL_METRICS_DIR, "global-rules.jsonl");
const GLOBAL_ROLLUP_FILE = path.join(GLOBAL_METRICS_DIR, "global-rollup.jsonl");
const GLOBAL_SIGNAL_FILE = path.join(GLOBAL_METRICS_DIR, "global-signal-distributions.jsonl");

const ELO_START = 1000;
const ELO_K = 32;

const UNIVERSAL_THRESHOLD = 3;
const NPM_CANDIDATE_THRESHOLD = 5;

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Task 1: Core JSONL read/write + global rule management
  readGlobalRules, writeGlobalRule,
  readGlobalRollups, writeGlobalRollup,
  readGlobalSignalDistributions, writeGlobalSignalDistribution,
  // Task 2: Signal distribution comparison
  compareSignalDistributions, getDomainTypeComparison,
  // Task 3: Universal rule promotion + global ELO
  checkUniversalPromotion, getGlobalELO, getProjectRankings,
  // Internal (exposed for testing)
  _setGlobalDir,
};

// ── Overridable paths (for test isolation) ──────────────────────────────────

let _globalDir = GLOBAL_METRICS_DIR;
let _rulesFile = GLOBAL_RULES_FILE;
let _rollupFile = GLOBAL_ROLLUP_FILE;
let _signalFile = GLOBAL_SIGNAL_FILE;

/** @param {string} dir Override global metrics directory (for testing) */
function _setGlobalDir(dir) {
  _globalDir = dir;
  _rulesFile = path.join(dir, "global-rules.jsonl");
  _rollupFile = path.join(dir, "global-rollup.jsonl");
  _signalFile = path.join(dir, "global-signal-distributions.jsonl");
}

// ── Task 1: Core JSONL read/write ───────────────────────────────────────────

/** @returns {object[]} All global rules */
function readGlobalRules() {
  return loadJsonl(_rulesFile);
}

/**
 * Write or update a global rule. Dedup via trigger fingerprint.
 * If rule already exists (same trigger), increments promotion_count and
 * updates propagated_to. Otherwise appends new rule.
 * @param {object} rule
 * @returns {object} The written/updated rule
 */
function writeGlobalRule(rule) {
  ensureDir(_globalDir);
  const rules = loadJsonl(_rulesFile);
  const fingerprint = JSON.stringify(rule.original_rule && rule.original_rule.trigger
    ? rule.original_rule.trigger : (rule.trigger || {}));
  const existing = rules.find((r) => {
    const fp = JSON.stringify(r.original_rule && r.original_rule.trigger
      ? r.original_rule.trigger : (r.trigger || {}));
    return fp === fingerprint;
  });

  if (existing) {
    existing.promotion_count = (existing.promotion_count || 1) + 1;
    const srcDir = rule.source_project_dir || rule.source_project || "";
    if (srcDir && !existing.propagated_to.includes(srcDir)) {
      existing.propagated_to.push(srcDir);
    }
    // Auto-check universal/npm thresholds
    if (existing.promotion_count >= UNIVERSAL_THRESHOLD) existing.is_universal = true;
    if (existing.promotion_count >= NPM_CANDIDATE_THRESHOLD) existing.is_npm_candidate = true;
    atomicWriteJsonl(_rulesFile, rules);
    return existing;
  }

  // New rule — assign global_id
  const nextId = rules.length > 0
    ? Math.max(...rules.map((r) => parseInt((r.global_id || "grule-0").replace("grule-", ""), 10))) + 1
    : 1;
  const newRule = {
    id: rule.id || null,
    global_id: `grule-${String(nextId).padStart(3, "0")}`,
    source_project: rule.source_project || getProjectName(),
    source_project_dir: rule.source_project_dir || process.cwd(),
    original_rule: rule.original_rule || null,
    promoted_at: rule.promoted_at || new Date().toISOString(),
    propagated_to: rule.propagated_to || [],
    promotion_count: rule.promotion_count || 1,
    is_universal: (rule.promotion_count || 1) >= UNIVERSAL_THRESHOLD,
    is_npm_candidate: (rule.promotion_count || 1) >= NPM_CANDIDATE_THRESHOLD,
    shipped_in_version: rule.shipped_in_version || null,
  };
  rules.push(newRule);
  atomicWriteJsonl(_rulesFile, rules);
  return newRule;
}

/** @returns {object[]} All global rollup entries */
function readGlobalRollups() {
  return loadJsonl(_rollupFile);
}

/**
 * Append a global rollup entry. Dedup by source_project + milestone pair.
 * @param {object} entry
 * @returns {object} The written entry
 */
function writeGlobalRollup(entry) {
  ensureDir(_globalDir);
  const rollups = loadJsonl(_rollupFile);
  const existing = rollups.find((r) =>
    r.source_project === entry.source_project && r.milestone === entry.milestone);

  if (existing) {
    // Update in place
    Object.assign(existing, entry, { ts: new Date().toISOString() });
    atomicWriteJsonl(_rollupFile, rollups);
    return existing;
  }

  const newEntry = { ts: new Date().toISOString(), ...entry };
  rollups.push(newEntry);
  atomicWriteJsonl(_rollupFile, rollups);
  return newEntry;
}

/** @returns {object[]} All global signal distribution entries */
function readGlobalSignalDistributions() {
  return loadJsonl(_signalFile);
}

/**
 * Write or update a global signal distribution entry.
 * One entry per project (overwrites previous).
 * @param {object} entry
 * @returns {object} The written entry
 */
function writeGlobalSignalDistribution(entry) {
  ensureDir(_globalDir);
  const entries = loadJsonl(_signalFile);
  const idx = entries.findIndex((e) => e.source_project === entry.source_project);
  const newEntry = { ts: new Date().toISOString(), ...entry };

  if (idx >= 0) {
    entries[idx] = newEntry;
  } else {
    entries.push(newEntry);
  }
  atomicWriteJsonl(_signalFile, entries);
  return newEntry;
}

// ── Task 2: Signal distribution comparison ──────────────────────────────────

/**
 * Compare signal distributions across all projects.
 * Returns all projects' signal rates sorted by pass-through rate descending,
 * with the queried project highlighted.
 * @param {string} projectName
 * @returns {object}
 */
function compareSignalDistributions(projectName) {
  const entries = readGlobalSignalDistributions();
  if (entries.length < 2) {
    return {
      insufficient_data: true,
      projects: entries.map(formatProjectSignals),
      queried_project: projectName,
    };
  }

  const sorted = entries
    .map(formatProjectSignals)
    .sort((a, b) => (b.signal_rates["pass-through"] || 0) - (a.signal_rates["pass-through"] || 0));

  return {
    insufficient_data: false,
    projects: sorted.map((p) => ({
      ...p,
      is_queried: p.source_project === projectName,
    })),
    queried_project: projectName,
  };
}

/**
 * Compare signal distributions for a specific domain type across all projects.
 * @param {string} domainType
 * @returns {object}
 */
function getDomainTypeComparison(domainType) {
  const entries = readGlobalSignalDistributions();
  const matches = [];

  for (const entry of entries) {
    const domSignals = (entry.domain_type_signals || [])
      .find((d) => d.domain_type === domainType);
    if (domSignals) {
      matches.push({
        source_project: entry.source_project,
        domain_type: domainType,
        signal_counts: domSignals.signal_counts || {},
        total_tasks: domSignals.total_tasks || 0,
      });
    }
  }

  if (matches.length < 2) {
    return { insufficient_data: true, domain_type: domainType, projects: matches };
  }

  return { insufficient_data: false, domain_type: domainType, projects: matches };
}

// ── Task 3: Universal rule promotion + global ELO ───────────────────────────

/**
 * Check if a global rule qualifies for universal or npm-candidate status.
 * Updates the rule on disk if thresholds are met.
 * @param {string} globalRuleId
 * @returns {object|null} Updated rule or null if not found
 */
function checkUniversalPromotion(globalRuleId) {
  const rules = loadJsonl(_rulesFile);
  const rule = rules.find((r) => r.global_id === globalRuleId);
  if (!rule) return null;

  let changed = false;
  if (rule.promotion_count >= UNIVERSAL_THRESHOLD && !rule.is_universal) {
    rule.is_universal = true;
    changed = true;
  }
  if (rule.promotion_count >= NPM_CANDIDATE_THRESHOLD && !rule.is_npm_candidate) {
    rule.is_npm_candidate = true;
    changed = true;
  }

  if (changed) {
    atomicWriteJsonl(_rulesFile, rules);
  }
  return rule;
}

/**
 * Get the latest global ELO for a project.
 * @param {string} projectName
 * @returns {number|null}
 */
function getGlobalELO(projectName) {
  const rollups = readGlobalRollups();
  const projectRollups = rollups.filter((r) => r.source_project === projectName);
  if (projectRollups.length === 0) return null;
  // Return latest elo_after
  const latest = projectRollups[projectRollups.length - 1];
  return latest.elo_after != null ? latest.elo_after : null;
}

/**
 * Get all projects ranked by latest elo_after, descending.
 * @returns {object[]} Array of { source_project, elo_after, milestone }
 */
function getProjectRankings() {
  const rollups = readGlobalRollups();
  if (rollups.length === 0) return [];

  // Get latest rollup per project
  const latest = {};
  for (const r of rollups) {
    latest[r.source_project] = r;
  }

  return Object.values(latest)
    .map((r) => ({
      source_project: r.source_project,
      elo_after: r.elo_after != null ? r.elo_after : ELO_START,
      milestone: r.milestone,
    }))
    .sort((a, b) => b.elo_after - a.elo_after);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function formatProjectSignals(entry) {
  const rates = entry.signal_rates || {};
  // Ensure normalization
  const sum = Object.values(rates).reduce((s, v) => s + v, 0);
  const normalized = {};
  if (sum > 0) {
    for (const [k, v] of Object.entries(rates)) {
      normalized[k] = Math.round((v / sum) * 1000) / 1000;
    }
  }
  return {
    source_project: entry.source_project,
    total_tasks: entry.total_tasks || 0,
    signal_rates: sum > 0 ? normalized : rates,
  };
}

function getProjectName() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return pkg.name || path.basename(process.cwd());
  } catch {
    return path.basename(process.cwd());
  }
}

function loadJsonl(fp) {
  if (!fs.existsSync(fp)) return [];
  const c = fs.readFileSync(fp, "utf8").trim();
  return c ? c.split("\n").map(safeParse).filter(Boolean) : [];
}

function safeParse(l) { try { return JSON.parse(l); } catch { return null; } }

function atomicWriteJsonl(fp, records) {
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = fp + ".tmp." + process.pid;
  fs.writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.renameSync(tmp, fp);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
