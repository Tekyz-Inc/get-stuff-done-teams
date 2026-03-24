/**
 * Tests for bin/patch-lifecycle.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  createCandidate, applyPatch, recordMeasurement,
  checkPromotionGate, promote, graduate, deprecate, getPatchesByStatus,
} = require("../bin/patch-lifecycle.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-pl-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t", "metrics", "patches"), { recursive: true });
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

function seedTemplate() {
  writeRules([{
    id: "rule-001", status: "active", name: "Test", description: "test",
    trigger: { metric: "fix_cycles", operator: "gt", threshold: 2, scope: "domain", window: 0 },
    severity: "HIGH", action: "patch", patch_template_id: "tpl-001",
    activation_count: 0, last_activated: null, milestone_created: "M26", created_at: "2026-01-01T00:00:00Z",
  }]);
  writeTemplates([{
    id: "tpl-001", rule_id: "rule-001", name: "Test Patch", description: "test",
    target_file: "test-target.md", edit_type: "append", edit_anchor: null,
    edit_content: "## Appended by patch", target_metric: "fix_cycles", created_at: "2026-01-01T00:00:00Z",
  }]);
}

function cleanPatches() {
  const dir = path.join(tmpDir, ".gsd-t", "metrics", "patches");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  }
}

// ── createCandidate ──────────────────────────────────────────────────────────

describe("createCandidate", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("creates patch file with correct schema", () => {
    const patch = createCandidate("rule-001", "tpl-001", 3.5, tmpDir);
    assert.equal(patch.status, "candidate");
    assert.equal(patch.rule_id, "rule-001");
    assert.equal(patch.template_id, "tpl-001");
    assert.equal(patch.metric_before, 3.5);
    assert.ok(patch.created_at);
    assert.equal(patch.applied_at, null);
    assert.deepEqual(patch.measured_milestones, []);
    const fp = path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`);
    assert.ok(fs.existsSync(fp));
  });

  it("generates incrementing IDs", () => {
    const p1 = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    const p2 = createCandidate("rule-001", "tpl-001", 2, tmpDir);
    assert.equal(p1.id, "patch-001");
    assert.equal(p2.id, "patch-002");
  });
});

// ── applyPatch ───────────────────────────────────────────────────────────────

describe("applyPatch", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("applies append edit to target file", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Original\n");
    const patch = createCandidate("rule-001", "tpl-001", 3.5, tmpDir);
    const ok = applyPatch(patch.id, tmpDir);
    assert.equal(ok, true);
    const content = fs.readFileSync(path.join(tmpDir, "test-target.md"), "utf8");
    assert.ok(content.includes("## Appended by patch"));
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.equal(updated.status, "applied");
    assert.ok(updated.applied_at);
  });

  it("applies prepend edit", () => {
    writeTemplates([{
      id: "tpl-001", rule_id: "rule-001", name: "Prepend", description: "test",
      target_file: "test-target.md", edit_type: "prepend", edit_anchor: null,
      edit_content: "# Prepended", target_metric: "fix_cycles", created_at: "2026-01-01T00:00:00Z",
    }]);
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Original\n");
    const patch = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    applyPatch(patch.id, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, "test-target.md"), "utf8");
    assert.ok(content.startsWith("# Prepended"));
  });

  it("applies insert_after edit", () => {
    writeTemplates([{
      id: "tpl-001", rule_id: "rule-001", name: "InsertAfter", description: "test",
      target_file: "test-target.md", edit_type: "insert_after", edit_anchor: "# Original",
      edit_content: "## Inserted", target_metric: "fix_cycles", created_at: "2026-01-01T00:00:00Z",
    }]);
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Original\nsome content\n");
    const patch = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    applyPatch(patch.id, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, "test-target.md"), "utf8");
    assert.ok(content.includes("# Original\n## Inserted\nsome content"));
  });

  it("applies replace edit", () => {
    writeTemplates([{
      id: "tpl-001", rule_id: "rule-001", name: "Replace", description: "test",
      target_file: "test-target.md", edit_type: "replace", edit_anchor: "OLD TEXT",
      edit_content: "NEW TEXT", target_metric: "fix_cycles", created_at: "2026-01-01T00:00:00Z",
    }]);
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "before OLD TEXT after\n");
    const patch = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    applyPatch(patch.id, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, "test-target.md"), "utf8");
    assert.ok(content.includes("before NEW TEXT after"));
    assert.ok(!content.includes("OLD TEXT"));
  });

  it("returns false when target file missing", () => {
    const patch = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    // Don't create test-target.md
    const targetPath = path.join(tmpDir, "test-target.md");
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    const ok = applyPatch(patch.id, tmpDir);
    assert.equal(ok, false);
  });

  it("returns false for non-candidate patch", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1, tmpDir);
    applyPatch(patch.id, tmpDir); // now "applied"
    const ok2 = applyPatch(patch.id, tmpDir); // try again
    assert.equal(ok2, false);
  });
});

// ── recordMeasurement ────────────────────────────────────────────────────────

describe("recordMeasurement", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("updates metric_after and improvement_pct", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 2.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 3.0, tmpDir);
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.equal(updated.status, "measured");
    assert.equal(updated.metric_after, 3.0);
    assert.equal(updated.improvement_pct, 50); // (3-2)/2 * 100
    assert.deepEqual(updated.measured_milestones, ["M27"]);
  });

  it("accumulates milestones without duplicates", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 2.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 3.0, tmpDir);
    recordMeasurement(patch.id, "M28", 3.5, tmpDir);
    recordMeasurement(patch.id, "M28", 3.5, tmpDir); // duplicate
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.deepEqual(updated.measured_milestones, ["M27", "M28"]);
    assert.equal(updated.metric_after, 3.5);
  });
});

// ── checkPromotionGate ───────────────────────────────────────────────────────

describe("checkPromotionGate", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("passes when >55% improvement and 2+ milestones", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.0, tmpDir);
    recordMeasurement(patch.id, "M28", 2.0, tmpDir);
    // improvement: (2-1)/1 * 100 = 100% > 55%
    const result = checkPromotionGate(patch.id, tmpDir);
    assert.equal(result.passes, true);
    assert.equal(result.improvement_pct, 100);
  });

  it("fails when <2 milestones measured", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.0, tmpDir);
    const result = checkPromotionGate(patch.id, tmpDir);
    assert.equal(result.passes, false);
    assert.ok(result.reason.includes("1/2"));
  });

  it("fails when improvement <= 55%", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 2.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.5, tmpDir);
    recordMeasurement(patch.id, "M28", 2.5, tmpDir);
    // improvement: (2.5-2)/2 * 100 = 25% <= 55%
    const result = checkPromotionGate(patch.id, tmpDir);
    assert.equal(result.passes, false);
  });

  it("returns not-found for unknown patch", () => {
    const result = checkPromotionGate("patch-999", tmpDir);
    assert.equal(result.passes, false);
    assert.ok(result.reason.includes("not found"));
  });
});

// ── promote / deprecate ──────────────────────────────────────────────────────

describe("promote", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("sets status to promoted with timestamp", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.0, tmpDir);
    promote(patch.id, tmpDir);
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.equal(updated.status, "promoted");
    assert.ok(updated.promoted_at);
  });
});

describe("deprecate", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("sets status to deprecated with reason", () => {
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    deprecate(patch.id, "Failed promotion gate", tmpDir);
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.equal(updated.status, "deprecated");
    assert.equal(updated.deprecation_reason, "Failed promotion gate");
    assert.ok(updated.deprecated_at);
  });
});

// ── graduate ─────────────────────────────────────────────────────────────────

describe("graduate", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("graduates with 3+ milestones and returns target info", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.0, tmpDir);
    recordMeasurement(patch.id, "M28", 2.5, tmpDir);
    recordMeasurement(patch.id, "M29", 3.0, tmpDir);
    promote(patch.id, tmpDir);
    const result = graduate(patch.id, tmpDir);
    assert.equal(result.target, "test-target.md");
    assert.ok(result.content.includes("Appended by patch"));
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, ".gsd-t", "metrics", "patches", `${patch.id}.json`), "utf8"));
    assert.equal(updated.status, "graduated");
    assert.ok(updated.graduated_at);
  });

  it("returns null when not enough milestones", () => {
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const patch = createCandidate("rule-001", "tpl-001", 1.0, tmpDir);
    applyPatch(patch.id, tmpDir);
    recordMeasurement(patch.id, "M27", 2.0, tmpDir);
    promote(patch.id, tmpDir);
    const result = graduate(patch.id, tmpDir);
    assert.equal(result.target, null);
  });
});

// ── getPatchesByStatus ───────────────────────────────────────────────────────

describe("getPatchesByStatus", () => {
  beforeEach(() => { cleanPatches(); seedTemplate(); });

  it("filters patches by status", () => {
    createCandidate("rule-001", "tpl-001", 1, tmpDir);
    createCandidate("rule-001", "tpl-001", 2, tmpDir);
    fs.writeFileSync(path.join(tmpDir, "test-target.md"), "# Test\n");
    const p3 = createCandidate("rule-001", "tpl-001", 3, tmpDir);
    applyPatch(p3.id, tmpDir);

    const candidates = getPatchesByStatus("candidate", tmpDir);
    assert.equal(candidates.length, 2);
    const applied = getPatchesByStatus("applied", tmpDir);
    assert.equal(applied.length, 1);
  });

  it("returns empty for nonexistent directory", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-pl-empty-"));
    assert.equal(getPatchesByStatus("candidate", emptyDir).length, 0);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
