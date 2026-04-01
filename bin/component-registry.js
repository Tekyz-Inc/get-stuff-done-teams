#!/usr/bin/env node

/**
 * GSD-T Component Registry — Track and audit GSD-T enforcement components
 *
 * Manages the component registry (.gsd-t/component-registry.jsonl) and
 * cost/benefit ledger (.gsd-t/metrics/component-impact.jsonl) for M31
 * harness self-audit capability.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

module.exports = {
  getComponents, getComponent, registerComponent, updateStatus,
  getFlaggedComponents, recordImpact, getImpactHistory, seedRegistry,
};

// ── getComponents ─────────────────────────────────────────────────────────────

/** @param {string} [projectDir] @returns {object[]} All registered components */
function getComponents(projectDir) {
  return loadJsonl(registryPath(projectDir));
}

// ── getComponent ──────────────────────────────────────────────────────────────

/** @param {string} id @param {string} [projectDir] @returns {object|null} */
function getComponent(id, projectDir) {
  return getComponents(projectDir).find((c) => c.id === id) || null;
}

// ── registerComponent ─────────────────────────────────────────────────────────

/** @param {object} component @param {string} [projectDir] @returns {object} */
function registerComponent(component, projectDir) {
  const fp = registryPath(projectDir);
  const components = loadJsonl(fp);
  if (components.find((c) => c.id === component.id)) {
    throw new Error(`Component '${component.id}' already registered`);
  }
  const entry = { ...component, status: component.status || "active" };
  ensureDir(path.dirname(fp));
  fs.appendFileSync(fp, JSON.stringify(entry) + "\n");
  return entry;
}

// ── updateStatus ──────────────────────────────────────────────────────────────

/** @param {string} id @param {string} status @param {string} [projectDir] @returns {boolean} */
function updateStatus(id, status, projectDir) {
  const fp = registryPath(projectDir);
  const components = loadJsonl(fp);
  const comp = components.find((c) => c.id === id);
  if (!comp) return false;
  comp.status = status;
  atomicWriteJsonl(fp, components);
  return true;
}

// ── getFlaggedComponents ──────────────────────────────────────────────────────

/** @param {string} [projectDir] @returns {object[]} Components with status 'flagged' */
function getFlaggedComponents(projectDir) {
  return getComponents(projectDir).filter((c) => c.status === "flagged");
}

// ── recordImpact ──────────────────────────────────────────────────────────────

/** @param {string} componentId @param {string} milestoneId @param {object} impactData @param {string} [projectDir] @returns {object} */
function recordImpact(componentId, milestoneId, impactData, projectDir) {
  const fp = impactPath(projectDir);
  const history = loadJsonl(fp);
  const consecutive = computeConsecutiveNegative(history, componentId, impactData.verdict);
  const entry = {
    ts: new Date().toISOString(),
    milestone: milestoneId,
    component_id: componentId,
    token_cost: impactData.token_cost || 0,
    bugs_prevented: impactData.bugs_prevented || 0,
    false_positives: impactData.false_positives || 0,
    context_pct: impactData.context_pct || 0,
    verdict: impactData.verdict || "neutral",
    consecutive_negative: consecutive,
  };
  ensureDir(path.dirname(fp));
  fs.appendFileSync(fp, JSON.stringify(entry) + "\n");
  if (consecutive >= 3) updateStatus(componentId, "flagged", projectDir);
  return entry;
}

// ── getImpactHistory ──────────────────────────────────────────────────────────

/** @param {string} componentId @param {string} [projectDir] @returns {object[]} */
function getImpactHistory(componentId, projectDir) {
  return loadJsonl(impactPath(projectDir)).filter((r) => r.component_id === componentId);
}

// ── seedRegistry ──────────────────────────────────────────────────────────────

/** Seed registry with all known GSD-T enforcement components. Skips existing. @param {string} [projectDir] */
function seedRegistry(projectDir) {
  const seeds = buildSeeds();
  const fp = registryPath(projectDir);
  const existing = loadJsonl(fp);
  const existingIds = new Set(existing.map((c) => c.id));
  ensureDir(path.dirname(fp));
  const toAdd = seeds.filter((s) => !existingIds.has(s.id));
  for (const comp of toAdd) {
    fs.appendFileSync(fp, JSON.stringify(comp) + "\n");
  }
  return toAdd;
}

// ── Internal: seed data ───────────────────────────────────────────────────────

function buildSeeds() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: "comp-red-team",
      name: "Red Team Adversarial QA",
      description: "Adversarial subagent that tries to break code after QA passes. Inverted incentive: more bugs found = more value.",
      injection_points: ["gsd-t-execute", "gsd-t-integrate", "gsd-t-quick", "gsd-t-debug"],
      token_cost_estimate: 8000,
      date_added: today,
      milestone_added: "M30",
      category: "qa",
      can_disable: true,
      shadow_capable: true,
      status: "active",
    },
    {
      id: "comp-qa-agent",
      name: "QA Agent",
      description: "Test generation, execution, and gap reporting subagent. Never writes feature code.",
      injection_points: ["gsd-t-execute", "gsd-t-integrate"],
      token_cost_estimate: 5000,
      date_added: today,
      milestone_added: "M17",
      category: "qa",
      can_disable: true,
      shadow_capable: true,
      status: "active",
    },
    {
      id: "comp-stack-rules",
      name: "Stack Rules Engine",
      description: "Auto-detects project tech stack and injects mandatory best-practice rules into subagent prompts.",
      injection_points: ["gsd-t-execute", "gsd-t-quick", "gsd-t-integrate", "gsd-t-wave", "gsd-t-debug"],
      token_cost_estimate: 2000,
      date_added: today,
      milestone_added: "M22",
      category: "enforcement",
      can_disable: false,
      shadow_capable: false,
      status: "active",
    },
    {
      id: "comp-doc-ripple",
      name: "Doc-Ripple",
      description: "Automated document ripple — updates downstream docs after code changes by analyzing blast radius.",
      injection_points: ["gsd-t-execute", "gsd-t-quick", "gsd-t-integrate"],
      token_cost_estimate: 3000,
      date_added: today,
      milestone_added: "M28",
      category: "documentation",
      can_disable: true,
      shadow_capable: true,
      status: "active",
    },
    {
      id: "comp-e2e-enforcement",
      name: "E2E Enforcement",
      description: "Mandates running full E2E suite when playwright.config.* or cypress.config.* exists. Blocks unit-only reporting.",
      injection_points: ["gsd-t-execute", "gsd-t-test-sync", "gsd-t-verify", "gsd-t-quick", "gsd-t-wave"],
      token_cost_estimate: 500,
      date_added: today,
      milestone_added: "M24",
      category: "enforcement",
      can_disable: false,
      shadow_capable: false,
      status: "active",
    },
    {
      id: "comp-pre-commit-gate",
      name: "Pre-Commit Gate",
      description: "Mandatory checklist before every commit: contracts, docs, schema, requirements, architecture all updated.",
      injection_points: ["gsd-t-execute", "gsd-t-quick", "gsd-t-integrate", "gsd-t-wave"],
      token_cost_estimate: 1000,
      date_added: today,
      milestone_added: "M10",
      category: "enforcement",
      can_disable: false,
      shadow_capable: false,
      status: "active",
    },
    {
      id: "comp-observability",
      name: "Observability Logging",
      description: "Token usage tracking and context utilization logging for every subagent spawn. Writes to token-log.md.",
      injection_points: ["gsd-t-execute", "gsd-t-quick", "gsd-t-integrate", "gsd-t-wave", "gsd-t-debug"],
      token_cost_estimate: 200,
      date_added: today,
      milestone_added: "M25",
      category: "orchestration",
      can_disable: false,
      shadow_capable: false,
      status: "active",
    },
  ];
}

// ── Internal: consecutive negative counter ────────────────────────────────────

function computeConsecutiveNegative(history, componentId, newVerdict) {
  const prior = history.filter((r) => r.component_id === componentId);
  if (newVerdict !== "negative") return 0;
  let count = 1;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].verdict === "negative") count++;
    else break;
  }
  return count;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function registryPath(d) { return path.join(d || process.cwd(), ".gsd-t", "component-registry.jsonl"); }
function impactPath(d) { return path.join(d || process.cwd(), ".gsd-t", "metrics", "component-impact.jsonl"); }

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

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
