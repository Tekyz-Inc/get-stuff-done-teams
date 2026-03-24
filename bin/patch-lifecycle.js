#!/usr/bin/env node

/**
 * GSD-T Patch Lifecycle Manager — 5-stage patch lifecycle
 *
 * Manages patches through: candidate -> applied -> measured -> promoted -> graduated.
 * Promotion gate requires >55% improvement over 2+ milestones.
 * Graduation writes patch into permanent methodology artifact.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

module.exports = {
  createCandidate, applyPatch, recordMeasurement,
  checkPromotionGate, promote, graduate, deprecate, getPatchesByStatus,
};

// ── createCandidate ──────────────────────────────────────────────────────────

/** @param {string} ruleId @param {string} templateId @param {number} metricBefore @param {string} [projectDir] @returns {object} */
function createCandidate(ruleId, templateId, metricBefore, projectDir) {
  const dir = projectDir || process.cwd();
  const patchDir = patchesDir(dir);
  ensureDir(patchDir);
  const id = nextPatchId(patchDir);
  const patch = {
    id, template_id: templateId, rule_id: ruleId, status: "candidate",
    created_at: new Date().toISOString(), applied_at: null,
    measured_milestones: [], metric_before: metricBefore, metric_after: null,
    improvement_pct: null, promoted_at: null, graduated_at: null,
    graduation_target: null, deprecated_at: null, deprecation_reason: null,
  };
  writePatch(patchDir, patch);
  return patch;
}

// ── applyPatch ───────────────────────────────────────────────────────────────

/** @param {string} patchId @param {string} [projectDir] @returns {boolean} */
function applyPatch(patchId, projectDir) {
  const dir = projectDir || process.cwd();
  const patch = readPatch(patchesDir(dir), patchId);
  if (!patch || patch.status !== "candidate") return false;
  const { getPatchTemplate } = require("./rule-engine.js");
  const tpl = getPatchTemplate(patch.template_id, dir);
  if (!tpl) return false;
  const targetPath = path.join(dir, tpl.target_file);
  if (!fs.existsSync(targetPath)) return false;
  const content = fs.readFileSync(targetPath, "utf8");
  const edited = applyEdit(content, tpl);
  if (edited === null) return false;
  fs.writeFileSync(targetPath, edited);
  patch.status = "applied";
  patch.applied_at = new Date().toISOString();
  writePatch(patchesDir(dir), patch);
  return true;
}

// ── recordMeasurement ────────────────────────────────────────────────────────

/** @param {string} patchId @param {string} milestoneId @param {number} metricAfter @param {string} [projectDir] */
function recordMeasurement(patchId, milestoneId, metricAfter, projectDir) {
  const dir = projectDir || process.cwd();
  const patch = readPatch(patchesDir(dir), patchId);
  if (!patch || (patch.status !== "applied" && patch.status !== "measured")) return;
  if (!patch.measured_milestones.includes(milestoneId)) {
    patch.measured_milestones.push(milestoneId);
  }
  patch.metric_after = metricAfter;
  patch.improvement_pct = patch.metric_before !== 0
    ? ((metricAfter - patch.metric_before) / Math.abs(patch.metric_before)) * 100
    : metricAfter > 0 ? 100 : 0;
  patch.status = "measured";
  writePatch(patchesDir(dir), patch);
}

// ── checkPromotionGate ───────────────────────────────────────────────────────

/** @param {string} patchId @param {string} [projectDir] @returns {object} */
function checkPromotionGate(patchId, projectDir) {
  const patch = readPatch(patchesDir(projectDir), patchId);
  if (!patch) return { passes: false, improvement_pct: 0, reason: "Patch not found" };
  if (patch.measured_milestones.length < 2) {
    return { passes: false, improvement_pct: patch.improvement_pct || 0, reason: `Only ${patch.measured_milestones.length}/2 milestones measured` };
  }
  if ((patch.improvement_pct || 0) <= 55) {
    return { passes: false, improvement_pct: patch.improvement_pct || 0, reason: `Improvement ${(patch.improvement_pct || 0).toFixed(1)}% <= 55% threshold` };
  }
  return { passes: true, improvement_pct: patch.improvement_pct, reason: "Gate passed" };
}

// ── promote ──────────────────────────────────────────────────────────────────

/** @param {string} patchId @param {string} [projectDir] */
function promote(patchId, projectDir) {
  const dir = projectDir || process.cwd();
  const patch = readPatch(patchesDir(dir), patchId);
  if (!patch || patch.status !== "measured") return;
  patch.status = "promoted";
  patch.promoted_at = new Date().toISOString();
  writePatch(patchesDir(dir), patch);
}

// ── graduate ─────────────────────────────────────────────────────────────────

/** @param {string} patchId @param {string} [projectDir] @returns {object} */
function graduate(patchId, projectDir) {
  const dir = projectDir || process.cwd();
  const patch = readPatch(patchesDir(dir), patchId);
  if (!patch || patch.status !== "promoted") return { target: null, content: null };
  // Check graduation criteria: promoted for 3+ additional milestones
  const promotedMs = patch.measured_milestones.length;
  if (promotedMs < 3) return { target: null, content: null };
  const { getPatchTemplate } = require("./rule-engine.js");
  const tpl = getPatchTemplate(patch.template_id, dir);
  if (!tpl) return { target: null, content: null };
  // Write to graduation target (the template's target file)
  const target = tpl.target_file;
  patch.status = "graduated";
  patch.graduated_at = new Date().toISOString();
  patch.graduation_target = target;
  writePatch(patchesDir(dir), patch);
  return { target, content: tpl.edit_content };
}

// ── deprecate ────────────────────────────────────────────────────────────────

/** @param {string} patchId @param {string} reason @param {string} [projectDir] */
function deprecate(patchId, reason, projectDir) {
  const dir = projectDir || process.cwd();
  const patch = readPatch(patchesDir(dir), patchId);
  if (!patch) return;
  patch.status = "deprecated";
  patch.deprecated_at = new Date().toISOString();
  patch.deprecation_reason = reason;
  writePatch(patchesDir(dir), patch);
}

// ── getPatchesByStatus ───────────────────────────────────────────────────────

/** @param {string} status @param {string} [projectDir] @returns {object[]} */
function getPatchesByStatus(status, projectDir) {
  const dir = patchesDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith("patch-") && f.endsWith(".json"))
    .map((f) => safeParse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter((p) => p && p.status === status);
}

// ── Edit operations ──────────────────────────────────────────────────────────

function applyEdit(content, tpl) {
  const { edit_type, edit_anchor, edit_content } = tpl;
  switch (edit_type) {
    case "append": return content + "\n" + edit_content + "\n";
    case "prepend": return edit_content + "\n" + content;
    case "insert_after": {
      const idx = content.indexOf(edit_anchor);
      if (idx === -1) return null;
      const lineEnd = content.indexOf("\n", idx);
      if (lineEnd === -1) return content + "\n" + edit_content;
      return content.slice(0, lineEnd + 1) + edit_content + "\n" + content.slice(lineEnd + 1);
    }
    case "replace": {
      const i = content.indexOf(edit_anchor);
      if (i === -1) return null;
      return content.slice(0, i) + edit_content + content.slice(i + edit_anchor.length);
    }
    default: return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function patchesDir(d) { return path.join(d || process.cwd(), ".gsd-t", "metrics", "patches"); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function nextPatchId(dir) {
  if (!fs.existsSync(dir)) return "patch-001";
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("patch-") && f.endsWith(".json"));
  const nums = files.map((f) => parseInt(f.match(/patch-(\d+)/)?.[1] || "0", 10));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `patch-${String(max + 1).padStart(3, "0")}`;
}

function readPatch(dir, id) {
  const fp = path.join(dir, `${id}.json`);
  return fs.existsSync(fp) ? safeParse(fs.readFileSync(fp, "utf8")) : null;
}
function writePatch(dir, p) { ensureDir(dir); fs.writeFileSync(path.join(dir, `${p.id}.json`), JSON.stringify(p, null, 2) + "\n"); }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
