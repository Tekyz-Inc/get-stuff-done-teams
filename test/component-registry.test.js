/**
 * Tests for bin/component-registry.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  getComponents, getComponent, registerComponent, updateStatus,
  getFlaggedComponents, recordImpact, getImpactHistory, seedRegistry,
} = require("../bin/component-registry.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-cr-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t", "metrics"), { recursive: true });
});

after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

beforeEach(() => {
  // Clean registry and impact files before each test
  const reg = path.join(tmpDir, ".gsd-t", "component-registry.jsonl");
  const imp = path.join(tmpDir, ".gsd-t", "metrics", "component-impact.jsonl");
  if (fs.existsSync(reg)) fs.unlinkSync(reg);
  if (fs.existsSync(imp)) fs.unlinkSync(imp);
});

function makeComponent(overrides = {}) {
  return {
    id: "comp-test",
    name: "Test Component",
    description: "A test component",
    injection_points: ["gsd-t-execute"],
    token_cost_estimate: 1000,
    date_added: "2026-04-01",
    milestone_added: "M31",
    category: "qa",
    can_disable: true,
    shadow_capable: true,
    status: "active",
    ...overrides,
  };
}

function makeImpact(overrides = {}) {
  return {
    token_cost: 500,
    bugs_prevented: 2,
    false_positives: 0,
    context_pct: 10,
    verdict: "positive",
    ...overrides,
  };
}

// ── getComponents ─────────────────────────────────────────────────────────────

describe("getComponents", () => {
  it("returns empty array when registry missing", () => {
    const result = getComponents(tmpDir);
    assert.equal(result.length, 0);
  });

  it("returns all components in registry", () => {
    registerComponent(makeComponent({ id: "comp-a" }), tmpDir);
    registerComponent(makeComponent({ id: "comp-b" }), tmpDir);
    const result = getComponents(tmpDir);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((c) => c.id), ["comp-a", "comp-b"]);
  });
});

// ── getComponent ──────────────────────────────────────────────────────────────

describe("getComponent", () => {
  it("returns component by ID", () => {
    registerComponent(makeComponent({ id: "comp-find-me" }), tmpDir);
    const comp = getComponent("comp-find-me", tmpDir);
    assert.ok(comp);
    assert.equal(comp.id, "comp-find-me");
  });

  it("returns null for unknown ID", () => {
    assert.equal(getComponent("comp-does-not-exist", tmpDir), null);
  });
});

// ── registerComponent ─────────────────────────────────────────────────────────

describe("registerComponent", () => {
  it("registers a new component and returns it", () => {
    const comp = registerComponent(makeComponent(), tmpDir);
    assert.equal(comp.id, "comp-test");
    assert.equal(comp.status, "active");
  });

  it("defaults status to active when not provided", () => {
    const c = makeComponent();
    delete c.status;
    const comp = registerComponent(c, tmpDir);
    assert.equal(comp.status, "active");
  });

  it("throws on duplicate ID", () => {
    registerComponent(makeComponent(), tmpDir);
    assert.throws(() => registerComponent(makeComponent(), tmpDir), /already registered/);
  });

  it("persists to disk", () => {
    registerComponent(makeComponent({ id: "comp-persist" }), tmpDir);
    const all = getComponents(tmpDir);
    assert.equal(all.find((c) => c.id === "comp-persist")?.name, "Test Component");
  });
});

// ── updateStatus ──────────────────────────────────────────────────────────────

describe("updateStatus", () => {
  it("updates component status", () => {
    registerComponent(makeComponent({ id: "comp-upd" }), tmpDir);
    const result = updateStatus("comp-upd", "deprecated", tmpDir);
    assert.equal(result, true);
    const comp = getComponent("comp-upd", tmpDir);
    assert.equal(comp.status, "deprecated");
  });

  it("returns false for unknown ID", () => {
    const result = updateStatus("comp-ghost", "flagged", tmpDir);
    assert.equal(result, false);
  });

  it("can update to flagged status", () => {
    registerComponent(makeComponent({ id: "comp-flag" }), tmpDir);
    updateStatus("comp-flag", "flagged", tmpDir);
    const comp = getComponent("comp-flag", tmpDir);
    assert.equal(comp.status, "flagged");
  });
});

// ── getFlaggedComponents ──────────────────────────────────────────────────────

describe("getFlaggedComponents", () => {
  it("returns only flagged components", () => {
    registerComponent(makeComponent({ id: "comp-active", status: "active" }), tmpDir);
    registerComponent(makeComponent({ id: "comp-flagged", status: "flagged" }), tmpDir);
    registerComponent(makeComponent({ id: "comp-depr", status: "deprecated" }), tmpDir);
    const flagged = getFlaggedComponents(tmpDir);
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].id, "comp-flagged");
  });

  it("returns empty array when no flagged components", () => {
    registerComponent(makeComponent({ id: "comp-ok" }), tmpDir);
    assert.equal(getFlaggedComponents(tmpDir).length, 0);
  });
});

// ── recordImpact ──────────────────────────────────────────────────────────────

describe("recordImpact", () => {
  it("records an impact entry and returns it", () => {
    registerComponent(makeComponent({ id: "comp-imp" }), tmpDir);
    const entry = recordImpact("comp-imp", "M31", makeImpact(), tmpDir);
    assert.equal(entry.component_id, "comp-imp");
    assert.equal(entry.milestone, "M31");
    assert.equal(entry.verdict, "positive");
    assert.ok(entry.ts);
  });

  it("persists impact to component-impact.jsonl", () => {
    registerComponent(makeComponent({ id: "comp-persist-imp" }), tmpDir);
    recordImpact("comp-persist-imp", "M31", makeImpact(), tmpDir);
    const history = getImpactHistory("comp-persist-imp", tmpDir);
    assert.equal(history.length, 1);
  });

  it("sets consecutive_negative to 0 for positive verdict", () => {
    registerComponent(makeComponent({ id: "comp-pos" }), tmpDir);
    const entry = recordImpact("comp-pos", "M31", makeImpact({ verdict: "positive" }), tmpDir);
    assert.equal(entry.consecutive_negative, 0);
  });

  it("counts consecutive negative verdicts", () => {
    registerComponent(makeComponent({ id: "comp-neg" }), tmpDir);
    recordImpact("comp-neg", "M29", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-neg", "M30", makeImpact({ verdict: "negative" }), tmpDir);
    const entry = recordImpact("comp-neg", "M31", makeImpact({ verdict: "negative" }), tmpDir);
    assert.equal(entry.consecutive_negative, 3);
  });

  it("resets consecutive_negative when verdict is not negative", () => {
    registerComponent(makeComponent({ id: "comp-reset" }), tmpDir);
    recordImpact("comp-reset", "M29", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-reset", "M30", makeImpact({ verdict: "negative" }), tmpDir);
    const entry = recordImpact("comp-reset", "M31", makeImpact({ verdict: "positive" }), tmpDir);
    assert.equal(entry.consecutive_negative, 0);
  });
});

// ── Flagging Threshold (consecutive_negative >= 3) ───────────────────────────

describe("flagging threshold", () => {
  it("flags component after 3 consecutive negative verdicts", () => {
    registerComponent(makeComponent({ id: "comp-auto-flag" }), tmpDir);
    recordImpact("comp-auto-flag", "M29", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-auto-flag", "M30", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-auto-flag", "M31", makeImpact({ verdict: "negative" }), tmpDir);
    const comp = getComponent("comp-auto-flag", tmpDir);
    assert.equal(comp.status, "flagged");
  });

  it("does not flag component with only 2 consecutive negatives", () => {
    registerComponent(makeComponent({ id: "comp-no-flag" }), tmpDir);
    recordImpact("comp-no-flag", "M30", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-no-flag", "M31", makeImpact({ verdict: "negative" }), tmpDir);
    const comp = getComponent("comp-no-flag", tmpDir);
    assert.equal(comp.status, "active");
  });

  it("does not flag on non-consecutive negatives", () => {
    registerComponent(makeComponent({ id: "comp-non-consec" }), tmpDir);
    recordImpact("comp-non-consec", "M29", makeImpact({ verdict: "negative" }), tmpDir);
    recordImpact("comp-non-consec", "M30", makeImpact({ verdict: "positive" }), tmpDir);
    recordImpact("comp-non-consec", "M31", makeImpact({ verdict: "negative" }), tmpDir);
    const comp = getComponent("comp-non-consec", tmpDir);
    assert.equal(comp.status, "active");
  });
});

// ── getImpactHistory ──────────────────────────────────────────────────────────

describe("getImpactHistory", () => {
  it("returns impact records for a component", () => {
    registerComponent(makeComponent({ id: "comp-hist" }), tmpDir);
    recordImpact("comp-hist", "M29", makeImpact(), tmpDir);
    recordImpact("comp-hist", "M30", makeImpact(), tmpDir);
    const history = getImpactHistory("comp-hist", tmpDir);
    assert.equal(history.length, 2);
  });

  it("filters to only the requested component", () => {
    registerComponent(makeComponent({ id: "comp-h1" }), tmpDir);
    registerComponent(makeComponent({ id: "comp-h2" }), tmpDir);
    recordImpact("comp-h1", "M31", makeImpact(), tmpDir);
    recordImpact("comp-h2", "M31", makeImpact(), tmpDir);
    const history = getImpactHistory("comp-h1", tmpDir);
    assert.equal(history.length, 1);
    assert.equal(history[0].component_id, "comp-h1");
  });

  it("returns empty array when no history", () => {
    assert.equal(getImpactHistory("comp-no-history", tmpDir).length, 0);
  });
});

// ── seedRegistry ─────────────────────────────────────────────────────────────

describe("seedRegistry", () => {
  it("seeds all 7 expected components", () => {
    const added = seedRegistry(tmpDir);
    assert.equal(added.length, 7);
  });

  it("produces expected component IDs", () => {
    seedRegistry(tmpDir);
    const ids = getComponents(tmpDir).map((c) => c.id);
    const expected = [
      "comp-red-team", "comp-qa-agent", "comp-stack-rules",
      "comp-doc-ripple", "comp-e2e-enforcement", "comp-pre-commit-gate",
      "comp-observability",
    ];
    for (const id of expected) {
      assert.ok(ids.includes(id), `Missing component: ${id}`);
    }
  });

  it("all seeded components have required fields", () => {
    seedRegistry(tmpDir);
    const components = getComponents(tmpDir);
    for (const comp of components) {
      assert.ok(comp.id, `Component missing id`);
      assert.ok(comp.name, `Component ${comp.id} missing name`);
      assert.ok(comp.description, `Component ${comp.id} missing description`);
      assert.ok(Array.isArray(comp.injection_points), `Component ${comp.id} missing injection_points`);
      assert.ok(typeof comp.token_cost_estimate === "number", `Component ${comp.id} missing token_cost_estimate`);
      assert.ok(comp.category, `Component ${comp.id} missing category`);
      assert.ok(typeof comp.can_disable === "boolean", `Component ${comp.id} missing can_disable`);
      assert.ok(typeof comp.shadow_capable === "boolean", `Component ${comp.id} missing shadow_capable`);
      assert.ok(comp.status, `Component ${comp.id} missing status`);
    }
  });

  it("skips components that already exist (idempotent)", () => {
    seedRegistry(tmpDir);
    const added2 = seedRegistry(tmpDir);
    assert.equal(added2.length, 0);
    // Total count should still be 7
    assert.equal(getComponents(tmpDir).length, 7);
  });

  it("partially seeds when some components already exist", () => {
    registerComponent(makeComponent({ id: "comp-red-team", name: "Existing Red Team" }), tmpDir);
    const added = seedRegistry(tmpDir);
    // Should add 6 (not comp-red-team which already exists)
    assert.equal(added.length, 6);
    assert.equal(getComponents(tmpDir).length, 7);
    // The pre-existing one should retain its original name
    const rt = getComponent("comp-red-team", tmpDir);
    assert.equal(rt.name, "Existing Red Team");
  });

  it("all seeded components have active status", () => {
    seedRegistry(tmpDir);
    const components = getComponents(tmpDir);
    for (const comp of components) {
      assert.equal(comp.status, "active", `Component ${comp.id} should be active`);
    }
  });
});
