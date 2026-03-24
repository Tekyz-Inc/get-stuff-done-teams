#!/usr/bin/env node

/**
 * GSD-T Declarative Rule Engine — Pattern detection via JSONL rules
 *
 * Loads rules from .gsd-t/metrics/rules.jsonl, evaluates them against
 * task-metrics data, manages activation tracking and rule lifecycle.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

module.exports = {
  getActiveRules, evaluateRules, getPreMortemRules, getPatchTemplate,
  recordActivation, flagInactiveRules, consolidateRules,
};

// ── getActiveRules ───────────────────────────────────────────────────────────

/** @param {string} [projectDir] @returns {object[]} Active rules */
function getActiveRules(projectDir) {
  return loadJsonl(rulesPath(projectDir)).filter((r) => r.status === "active");
}

// ── evaluateRules ────────────────────────────────────────────────────────────

/** @param {string} domain @param {object} [opts] @returns {object[]} Matches */
function evaluateRules(domain, opts) {
  const o = opts || {};
  const dir = o.projectDir || process.cwd();
  const rules = getActiveRules(dir);
  const { readTaskMetrics } = require("./metrics-collector.js");
  const filters = o.milestone ? { milestone: o.milestone } : {};
  const allRecs = readTaskMetrics(filters, dir);
  const domRecs = allRecs.filter((r) => r.domain === domain);
  const matches = [];
  for (const rule of rules) {
    const win = rule.trigger.window || 0;
    const scope = rule.trigger.scope || "domain";
    let recs;
    if (scope === "global") recs = win > 0 ? allRecs.slice(-win) : allRecs;
    else if (scope === "milestone") {
      recs = allRecs.filter((r) => r.milestone === o.milestone);
      if (win > 0) recs = recs.slice(-win);
    } else recs = win > 0 ? domRecs.slice(-win) : domRecs;
    if (recs.length === 0) continue;
    const matched = evalTrigger(rule.trigger, recs);
    if (matched.length > 0) matches.push({ rule, matchedRecords: matched, severity: rule.severity });
  }
  return matches;
}

// ── getPreMortemRules ────────────────────────────────────────────────────────

/** @param {string} domainType @param {string} [projectDir] @returns {object[]} */
function getPreMortemRules(domainType, projectDir) {
  return getActiveRules(projectDir || process.cwd()).filter((r) => r.activation_count > 0);
}

// ── getPatchTemplate ─────────────────────────────────────────────────────────

/** @param {string} templateId @param {string} [projectDir] @returns {object|null} */
function getPatchTemplate(templateId, projectDir) {
  return loadJsonl(templatesPath(projectDir)).find((t) => t.id === templateId) || null;
}

// ── recordActivation ─────────────────────────────────────────────────────────

/** @param {string} ruleId @param {string} [projectDir] */
function recordActivation(ruleId, projectDir) {
  const fp = rulesPath(projectDir);
  const rules = loadJsonl(fp);
  const r = rules.find((x) => x.id === ruleId);
  if (!r) return;
  r.activation_count = (r.activation_count || 0) + 1;
  r.last_activated = new Date().toISOString();
  atomicWriteJsonl(fp, rules);
}

// ── flagInactiveRules ────────────────────────────────────────────────────────

/** @param {number} threshold @param {string} [projectDir] @returns {object[]} */
function flagInactiveRules(threshold, projectDir) {
  const rules = loadJsonl(rulesPath(projectDir));
  return rules.filter((r) => {
    if (r.status !== "active" || r.activation_count > 0) return false;
    const num = parseMilestoneNum(r.milestone_created);
    if (num === null) return false;
    // Compare against highest milestone number among all rules as proxy for "current"
    const maxM = rules.reduce((m, x) => Math.max(m, parseMilestoneNum(x.milestone_created) || 0), 0);
    return (maxM - num) >= threshold;
  });
}

// ── consolidateRules ─────────────────────────────────────────────────────────

/** @param {string[]} ruleIds @param {object} consolidated @param {string} [projectDir] */
function consolidateRules(ruleIds, consolidated, projectDir) {
  const fp = rulesPath(projectDir);
  const rules = loadJsonl(fp);
  for (const rule of rules) { if (ruleIds.includes(rule.id)) rule.status = "consolidated"; }
  rules.push(consolidated);
  atomicWriteJsonl(fp, rules);
}

// ── Trigger evaluation ───────────────────────────────────────────────────────

function evalTrigger(trigger, records) {
  const { metric, operator, threshold } = trigger;
  if (operator === "pattern_count") {
    const m = records.filter((r) => fieldVal(r, metric) != null);
    return m.length >= threshold ? m : [];
  }
  return records.filter((r) => {
    const v = fieldVal(r, metric);
    return v != null && cmp(v, operator, threshold);
  });
}

function cmp(v, op, t) {
  switch (op) {
    case "gt": return v > t;   case "gte": return v >= t;
    case "lt": return v < t;   case "lte": return v <= t;
    case "eq": return v === t;  case "neq": return v !== t;
    case "in": return Array.isArray(t) && t.includes(v);
    default: return false;
  }
}

function fieldVal(rec, metric) {
  return metric === "first_pass_rate" ? (rec.pass ? 1 : 0) : rec[metric];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rulesPath(d) { return path.join(d || process.cwd(), ".gsd-t", "metrics", "rules.jsonl"); }
function templatesPath(d) { return path.join(d || process.cwd(), ".gsd-t", "metrics", "patch-templates.jsonl"); }

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

function parseMilestoneNum(s) {
  const m = (s || "").match(/M(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
