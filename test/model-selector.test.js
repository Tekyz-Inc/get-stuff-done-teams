/**
 * Tests for bin/model-selector.js
 * Uses Node.js built-in test runner (node --test)
 *
 * v1.0.0 (M35 T2): declarative phase→tier rules, complexity-signal overrides,
 * /advisor fallback escalation hook (convention-based per M35-advisor-findings.md).
 *
 * AC requires at least 15 unit tests and coverage of all 13 phases listed in
 * token-telemetry-contract.md + M35-definition.md Part B.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  selectModel,
  listPhases,
  TIERS,
  DEFAULT_TIER,
  ESCALATION_HOOK,
} = require("../bin/model-selector.js");

describe("selectModel — phase defaults", () => {
  it("execute (default) → sonnet with escalation hook", () => {
    const r = selectModel({ phase: "execute" });
    assert.equal(r.model, TIERS.SONNET);
    assert.ok(r.reason.length > 0);
    assert.equal(r.escalation_hook, ESCALATION_HOOK);
  });

  it("execute + test_runner → haiku (mechanical, no hook)", () => {
    const r = selectModel({ phase: "execute", task_type: "test_runner" });
    assert.equal(r.model, TIERS.HAIKU);
    assert.equal(r.escalation_hook, null);
  });

  it("execute + branch_guard → haiku", () => {
    const r = selectModel({ phase: "execute", task_type: "branch_guard" });
    assert.equal(r.model, TIERS.HAIKU);
  });

  it("execute + file_check → haiku", () => {
    const r = selectModel({ phase: "execute", task_type: "file_check" });
    assert.equal(r.model, TIERS.HAIKU);
  });

  it("execute + qa → sonnet (per M31 refinement)", () => {
    const r = selectModel({ phase: "execute", task_type: "qa" });
    assert.equal(r.model, TIERS.SONNET);
    assert.equal(r.escalation_hook, null);
  });

  it("execute + red_team → opus", () => {
    const r = selectModel({ phase: "execute", task_type: "red_team" });
    assert.equal(r.model, TIERS.OPUS);
    assert.equal(r.escalation_hook, null);
  });

  it("wave → sonnet with escalation hook", () => {
    const r = selectModel({ phase: "wave" });
    assert.equal(r.model, TIERS.SONNET);
    assert.equal(r.escalation_hook, ESCALATION_HOOK);
  });

  it("quick → sonnet", () => {
    const r = selectModel({ phase: "quick" });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("integrate → sonnet", () => {
    const r = selectModel({ phase: "integrate" });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("debug (default) → opus", () => {
    const r = selectModel({ phase: "debug" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("debug + fix_apply → sonnet", () => {
    const r = selectModel({ phase: "debug", task_type: "fix_apply" });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("debug + root_cause → opus", () => {
    const r = selectModel({ phase: "debug", task_type: "root_cause" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("partition → opus", () => {
    const r = selectModel({ phase: "partition" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("discuss → opus", () => {
    const r = selectModel({ phase: "discuss" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("plan → sonnet with escalation hook", () => {
    const r = selectModel({ phase: "plan" });
    assert.equal(r.model, TIERS.SONNET);
    assert.equal(r.escalation_hook, ESCALATION_HOOK);
  });

  it("verify → opus", () => {
    const r = selectModel({ phase: "verify" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("test-sync → sonnet", () => {
    const r = selectModel({ phase: "test-sync" });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("doc-ripple → sonnet", () => {
    const r = selectModel({ phase: "doc-ripple" });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("red_team (standalone phase) → opus", () => {
    const r = selectModel({ phase: "red_team" });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("qa (standalone phase) → sonnet", () => {
    const r = selectModel({ phase: "qa" });
    assert.equal(r.model, TIERS.SONNET);
  });
});

describe("selectModel — edge cases", () => {
  it("unknown phase → sonnet default with explanatory reason", () => {
    const r = selectModel({ phase: "not-a-real-phase" });
    assert.equal(r.model, DEFAULT_TIER);
    assert.match(r.reason, /Unknown phase/);
    assert.equal(r.escalation_hook, null);
  });

  it("missing args → sonnet default", () => {
    const r = selectModel();
    assert.equal(r.model, DEFAULT_TIER);
    assert.equal(r.escalation_hook, null);
  });

  it("missing phase → sonnet default", () => {
    const r = selectModel({ task_type: "test_runner" });
    assert.equal(r.model, DEFAULT_TIER);
  });

  it("non-object args → sonnet default", () => {
    const r = selectModel("execute");
    assert.equal(r.model, DEFAULT_TIER);
  });
});

describe("selectModel — complexity signal overrides", () => {
  it("sonnet phase + cross_module_refactor signal → opus", () => {
    const r = selectModel({
      phase: "execute",
      complexity_signals: { cross_module_refactor: true },
    });
    assert.equal(r.model, TIERS.OPUS);
    assert.match(r.reason, /cross_module_refactor/);
  });

  it("sonnet phase + security_boundary signal → opus", () => {
    const r = selectModel({
      phase: "integrate",
      complexity_signals: { security_boundary: true },
    });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("sonnet phase + data_loss_risk signal → opus", () => {
    const r = selectModel({
      phase: "test-sync",
      complexity_signals: { data_loss_risk: true },
    });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("sonnet phase + contract_design signal → opus", () => {
    const r = selectModel({
      phase: "plan",
      complexity_signals: { contract_design: true },
    });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("opus phase + complexity signals → stays opus (no downgrade)", () => {
    const r = selectModel({
      phase: "partition",
      complexity_signals: { contract_design: true },
    });
    assert.equal(r.model, TIERS.OPUS);
  });

  it("haiku phase + complexity signals → stays haiku (no escalation of mechanical work)", () => {
    const r = selectModel({
      phase: "execute",
      task_type: "test_runner",
      complexity_signals: { cross_module_refactor: true },
    });
    assert.equal(r.model, TIERS.HAIKU);
  });

  it("falsy complexity signals are ignored", () => {
    const r = selectModel({
      phase: "execute",
      complexity_signals: { cross_module_refactor: false, security_boundary: null },
    });
    assert.equal(r.model, TIERS.SONNET);
  });

  it("unknown complexity signals are ignored", () => {
    const r = selectModel({
      phase: "execute",
      complexity_signals: { made_up_signal: true },
    });
    assert.equal(r.model, TIERS.SONNET);
  });
});

describe("listPhases — coverage assertions", () => {
  it("returns at least 13 distinct phases (M35 AC)", () => {
    const phases = listPhases();
    assert.ok(phases.length >= 13, `expected ≥13 phases, got ${phases.length}: ${phases.join(",")}`);
  });

  it("covers all M35 Part B canonical phases", () => {
    const phases = new Set(listPhases());
    const required = [
      "execute", "wave", "quick", "integrate", "debug",
      "partition", "discuss", "plan", "verify",
      "test-sync", "doc-ripple", "red_team", "qa",
    ];
    for (const p of required) {
      assert.ok(phases.has(p), `missing required phase: ${p}`);
    }
  });
});

describe("selectModel — return shape", () => {
  it("returns {model, reason, escalation_hook} on every call", () => {
    const r = selectModel({ phase: "execute" });
    assert.ok("model" in r);
    assert.ok("reason" in r);
    assert.ok("escalation_hook" in r);
    assert.equal(typeof r.model, "string");
    assert.equal(typeof r.reason, "string");
    assert.ok(r.escalation_hook === null || typeof r.escalation_hook === "string");
  });

  it("model is always one of haiku/sonnet/opus", () => {
    const valid = new Set([TIERS.HAIKU, TIERS.SONNET, TIERS.OPUS]);
    for (const phase of listPhases()) {
      const r = selectModel({ phase });
      assert.ok(valid.has(r.model), `phase ${phase} returned invalid model ${r.model}`);
    }
  });
});
