/**
 * Tests for bin/rule-engine.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  getActiveRules, evaluateRules, getPreMortemRules, getPatchTemplate,
  recordActivation, flagInactiveRules, consolidateRules,
} = require("../bin/rule-engine.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-re-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t", "metrics"), { recursive: true });
});

after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function writeRules(rules) {
  const fp = path.join(tmpDir, ".gsd-t", "metrics", "rules.jsonl");
  fs.writeFileSync(fp, rules.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function writeTemplates(templates) {
  const fp = path.join(tmpDir, ".gsd-t", "metrics", "patch-templates.jsonl");
  fs.writeFileSync(fp, templates.map((t) => JSON.stringify(t)).join("\n") + "\n");
}

function writeMetrics(records) {
  const fp = path.join(tmpDir, ".gsd-t", "metrics", "task-metrics.jsonl");
  fs.writeFileSync(fp, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function makeRule(overrides = {}) {
  return {
    id: "rule-test", created_at: "2026-03-23T00:00:00Z", name: "Test Rule",
    description: "test", trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "domain", window: 0 },
    severity: "HIGH", action: "warn", patch_template_id: null,
    activation_count: 0, last_activated: null, milestone_created: "M26", status: "active",
    ...overrides,
  };
}

function makeMetric(overrides = {}) {
  return {
    ts: "2026-03-23T00:00:00Z", milestone: "M26", domain: "test-domain",
    task: "task-1", command: "execute", duration_s: 30, tokens_used: 5000,
    context_pct: 35, pass: true, fix_cycles: 0, signal_type: "pass-through",
    signal_weight: 1.0, notes: null,
    ...overrides,
  };
}

// ── getActiveRules ───────────────────────────────────────────────────────────

describe("getActiveRules", () => {
  it("returns only active rules", () => {
    writeRules([
      makeRule({ id: "r1", status: "active" }),
      makeRule({ id: "r2", status: "deprecated" }),
      makeRule({ id: "r3", status: "active" }),
    ]);
    const active = getActiveRules(tmpDir);
    assert.equal(active.length, 2);
    assert.deepEqual(active.map((r) => r.id), ["r1", "r3"]);
  });

  it("returns empty array when file missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-re-empty-"));
    const result = getActiveRules(emptyDir);
    assert.equal(result.length, 0);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("skips consolidated rules", () => {
    writeRules([makeRule({ id: "r1", status: "consolidated" })]);
    assert.equal(getActiveRules(tmpDir).length, 0);
  });
});

// ── evaluateRules ────────────────────────────────────────────────────────────

describe("evaluateRules", () => {
  it("evaluates gt operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ fix_cycles: 3 }), makeMetric({ fix_cycles: 1 })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchedRecords.length, 1);
    assert.equal(matches[0].matchedRecords[0].fix_cycles, 3);
  });

  it("evaluates gte operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gte", threshold: 2, scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ fix_cycles: 2 }), makeMetric({ fix_cycles: 1 })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 1);
  });

  it("evaluates lt operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "lt", threshold: 2, scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ fix_cycles: 1 }), makeMetric({ fix_cycles: 3 })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 1);
    assert.equal(matches[0].matchedRecords[0].fix_cycles, 1);
  });

  it("evaluates lte operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "lte", threshold: 2, scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ fix_cycles: 2 }), makeMetric({ fix_cycles: 3 })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 1);
  });

  it("evaluates eq operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "signal_type", operator: "eq", threshold: "debug-invoked", scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ signal_type: "debug-invoked" }), makeMetric({ signal_type: "pass-through" })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 1);
  });

  it("evaluates neq operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "signal_type", operator: "neq", threshold: "pass-through", scope: "domain", window: 0 } })]);
    writeMetrics([makeMetric({ signal_type: "debug-invoked" }), makeMetric({ signal_type: "pass-through" })]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 1);
  });

  it("evaluates in operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "signal_type", operator: "in", threshold: ["fix-cycle", "debug-invoked"], scope: "domain", window: 0 } })]);
    writeMetrics([
      makeMetric({ signal_type: "fix-cycle" }),
      makeMetric({ signal_type: "debug-invoked" }),
      makeMetric({ signal_type: "pass-through" }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches[0].matchedRecords.length, 2);
  });

  it("evaluates pattern_count operator", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "signal_type", operator: "pattern_count", threshold: 3, scope: "domain", window: 10 } })]);
    writeMetrics([
      makeMetric({ signal_type: "fix-cycle" }),
      makeMetric({ signal_type: "fix-cycle" }),
      makeMetric({ signal_type: "fix-cycle" }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchedRecords.length, 3);
  });

  it("pattern_count does not fire below threshold", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "signal_type", operator: "pattern_count", threshold: 5, scope: "domain", window: 10 } })]);
    writeMetrics([makeMetric({}), makeMetric({})]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 0);
  });

  it("respects window limit", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 0, scope: "domain", window: 2 } })]);
    writeMetrics([
      makeMetric({ fix_cycles: 5 }),
      makeMetric({ fix_cycles: 0 }),
      makeMetric({ fix_cycles: 0 }),
    ]);
    // Window=2 means only last 2 records (fix_cycles 0, 0) — rule should not match with gt 0
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 0);
  });

  it("returns empty for no metrics", () => {
    writeRules([makeRule({ id: "r1" })]);
    const metricsPath = path.join(tmpDir, ".gsd-t", "metrics", "task-metrics.jsonl");
    if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 0);
  });

  it("filters by domain scope", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 0, scope: "domain", window: 0 } })]);
    writeMetrics([
      makeMetric({ domain: "other-domain", fix_cycles: 5 }),
      makeMetric({ domain: "test-domain", fix_cycles: 0 }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 0); // test-domain has fix_cycles=0, not > 0 would be wrong; 0 > 0 is false
  });

  it("uses global scope across all domains", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "global", window: 0 } })]);
    writeMetrics([
      makeMetric({ domain: "other-domain", fix_cycles: 5 }),
      makeMetric({ domain: "test-domain", fix_cycles: 0 }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchedRecords.length, 1);
  });

  it("uses milestone scope to filter by milestone", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "milestone", window: 0 } })]);
    writeMetrics([
      makeMetric({ domain: "test-domain", milestone: "M25", fix_cycles: 5 }),
      makeMetric({ domain: "test-domain", milestone: "M26", fix_cycles: 1 }),
    ]);
    // Only M26 records should be evaluated; M25 record (fix_cycles=5) excluded
    const matches = evaluateRules("test-domain", { projectDir: tmpDir, milestone: "M26" });
    assert.equal(matches.length, 0); // fix_cycles=1 is not > 2
  });

  it("milestone scope returns matches when threshold met", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "milestone", window: 0 } })]);
    writeMetrics([
      makeMetric({ domain: "test-domain", milestone: "M26", fix_cycles: 5 }),
      makeMetric({ domain: "other-domain", milestone: "M26", fix_cycles: 4 }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir, milestone: "M26" });
    assert.equal(matches.length, 1);
    // milestone scope uses allRecs filtered by milestone, not domRecs
    assert.equal(matches[0].matchedRecords.length, 2);
  });

  it("evaluates first_pass_rate as derived metric", () => {
    writeRules([makeRule({ id: "r1", trigger: { metric: "first_pass_rate", operator: "lt", threshold: 1, scope: "domain", window: 0 } })]);
    writeMetrics([
      makeMetric({ pass: false }),
      makeMetric({ pass: true }),
    ]);
    const matches = evaluateRules("test-domain", { projectDir: tmpDir });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchedRecords.length, 1);
    assert.equal(matches[0].matchedRecords[0].pass, false);
  });
});

// ── recordActivation ─────────────────────────────────────────────────────────

describe("recordActivation", () => {
  it("increments count and sets timestamp", () => {
    writeRules([makeRule({ id: "r1", activation_count: 0, last_activated: null })]);
    recordActivation("r1", tmpDir);
    const rules = getActiveRules(tmpDir);
    assert.equal(rules[0].activation_count, 1);
    assert.ok(rules[0].last_activated);
  });

  it("increments existing count", () => {
    writeRules([makeRule({ id: "r1", activation_count: 5 })]);
    recordActivation("r1", tmpDir);
    const rules = getActiveRules(tmpDir);
    assert.equal(rules[0].activation_count, 6);
  });

  it("no-ops for unknown rule ID", () => {
    writeRules([makeRule({ id: "r1" })]);
    recordActivation("nonexistent", tmpDir); // should not throw
    assert.equal(getActiveRules(tmpDir).length, 1);
  });
});

// ── flagInactiveRules ────────────────────────────────────────────────────────

describe("flagInactiveRules", () => {
  it("flags rules with zero activations past threshold", () => {
    writeRules([
      makeRule({ id: "r1", milestone_created: "M20", activation_count: 0 }),
      makeRule({ id: "r2", milestone_created: "M26", activation_count: 0 }),
    ]);
    // r1 created at M20, max milestone is M26, diff=6, threshold=5 -> flagged
    // r2 created at M26, diff=0 -> not flagged
    const flagged = flagInactiveRules(5, tmpDir);
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].id, "r1");
  });

  it("does not flag rules with activations", () => {
    writeRules([makeRule({ id: "r1", milestone_created: "M20", activation_count: 3 })]);
    const flagged = flagInactiveRules(1, tmpDir);
    assert.equal(flagged.length, 0);
  });

  it("does not flag deprecated rules", () => {
    writeRules([makeRule({ id: "r1", milestone_created: "M20", activation_count: 0, status: "deprecated" })]);
    const flagged = flagInactiveRules(1, tmpDir);
    assert.equal(flagged.length, 0);
  });
});

// ── consolidateRules ─────────────────────────────────────────────────────────

describe("consolidateRules", () => {
  it("marks originals as consolidated and appends new", () => {
    writeRules([
      makeRule({ id: "r1", status: "active" }),
      makeRule({ id: "r2", status: "active" }),
    ]);
    const merged = makeRule({ id: "r-merged", name: "Merged Rule", status: "active" });
    consolidateRules(["r1", "r2"], merged, tmpDir);

    const all = getActiveRules(tmpDir);
    assert.equal(all.length, 1);
    assert.equal(all[0].id, "r-merged");
  });

  it("preserves non-consolidated rules", () => {
    writeRules([
      makeRule({ id: "r1", status: "active" }),
      makeRule({ id: "r2", status: "active" }),
      makeRule({ id: "r3", status: "active" }),
    ]);
    const merged = makeRule({ id: "r-merged", status: "active" });
    consolidateRules(["r1", "r2"], merged, tmpDir);

    const all = getActiveRules(tmpDir);
    assert.equal(all.length, 2); // r3 + r-merged
    assert.ok(all.find((r) => r.id === "r3"));
    assert.ok(all.find((r) => r.id === "r-merged"));
  });
});

// ── getPreMortemRules ────────────────────────────────────────────────────────

describe("getPreMortemRules", () => {
  it("returns rules with activations > 0", () => {
    writeRules([
      makeRule({ id: "r1", activation_count: 3 }),
      makeRule({ id: "r2", activation_count: 0 }),
    ]);
    const result = getPreMortemRules("test", tmpDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "r1");
  });

  it("returns empty when no rules have fired", () => {
    writeRules([makeRule({ id: "r1", activation_count: 0 })]);
    assert.equal(getPreMortemRules("test", tmpDir).length, 0);
  });
});

// ── getPatchTemplate ─────────────────────────────────────────────────────────

describe("getPatchTemplate", () => {
  it("returns template by ID", () => {
    writeTemplates([{ id: "tpl-1", rule_id: "r1", name: "Test Template" }]);
    const tpl = getPatchTemplate("tpl-1", tmpDir);
    assert.equal(tpl.name, "Test Template");
  });

  it("returns null for unknown ID", () => {
    writeTemplates([{ id: "tpl-1" }]);
    assert.equal(getPatchTemplate("tpl-999", tmpDir), null);
  });

  it("returns null when file missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-re-tpl-"));
    assert.equal(getPatchTemplate("tpl-1", emptyDir), null);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
