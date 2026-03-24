/**
 * Tests for bin/global-sync-manager.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const gsm = require("../bin/global-sync-manager.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-gsm-test-"));
  gsm._setGlobalDir(tmpDir);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean files between tests
  for (const f of ["global-rules.jsonl", "global-rollup.jsonl", "global-signal-distributions.jsonl"]) {
    const fp = path.join(tmpDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
});

// ── readGlobalRules / writeGlobalRule ───────────────────────────────────────

describe("readGlobalRules", () => {
  it("returns empty array when file does not exist", () => {
    const result = gsm.readGlobalRules();
    assert.deepStrictEqual(result, []);
  });

  it("returns rules after writing", () => {
    gsm.writeGlobalRule(makeRule());
    const rules = gsm.readGlobalRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].global_id, "grule-001");
  });
});

describe("writeGlobalRule", () => {
  it("creates global dir on first write", () => {
    const subDir = path.join(tmpDir, "nested", "metrics");
    gsm._setGlobalDir(subDir);
    gsm.writeGlobalRule(makeRule());
    assert.ok(fs.existsSync(subDir));
    gsm._setGlobalDir(tmpDir); // restore
  });

  it("assigns incremental global_id", () => {
    gsm.writeGlobalRule(makeRule({ id: "r1", trigger: { metric: "a", operator: "gt", threshold: 1 } }));
    gsm.writeGlobalRule(makeRule({ id: "r2", trigger: { metric: "b", operator: "gt", threshold: 2 } }));
    const rules = gsm.readGlobalRules();
    assert.equal(rules.length, 2);
    assert.equal(rules[0].global_id, "grule-001");
    assert.equal(rules[1].global_id, "grule-002");
  });

  it("deduplicates by trigger fingerprint and increments promotion_count", () => {
    const trigger = { metric: "fix_cycles", operator: "gt", threshold: 2 };
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/proj/a" }));
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/proj/b" }));
    const rules = gsm.readGlobalRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].promotion_count, 2);
    assert.ok(rules[0].propagated_to.includes("/proj/b"));
  });

  it("sets is_universal when promotion_count reaches 3", () => {
    const trigger = { metric: "x", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/a" }));
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/b" }));
    let rules = gsm.readGlobalRules();
    assert.equal(rules[0].is_universal, false);

    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/c" }));
    rules = gsm.readGlobalRules();
    assert.equal(rules[0].promotion_count, 3);
    assert.equal(rules[0].is_universal, true);
    assert.equal(rules[0].is_npm_candidate, false);
  });

  it("sets is_npm_candidate when promotion_count reaches 5", () => {
    const trigger = { metric: "y", operator: "gt", threshold: 1 };
    for (let i = 0; i < 5; i++) {
      gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: `/proj/${i}` }));
    }
    const rules = gsm.readGlobalRules();
    assert.equal(rules[0].promotion_count, 5);
    assert.equal(rules[0].is_universal, true);
    assert.equal(rules[0].is_npm_candidate, true);
  });

  it("does not duplicate propagated_to entries", () => {
    const trigger = { metric: "z", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/same" }));
    gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: "/same" }));
    const rules = gsm.readGlobalRules();
    const count = rules[0].propagated_to.filter((p) => p === "/same").length;
    assert.equal(count, 1);
  });
});

// ── readGlobalRollups / writeGlobalRollup ───────────────────────────────────

describe("readGlobalRollups", () => {
  it("returns empty array when file does not exist", () => {
    assert.deepStrictEqual(gsm.readGlobalRollups(), []);
  });
});

describe("writeGlobalRollup", () => {
  it("appends rollup entry", () => {
    gsm.writeGlobalRollup(makeRollup());
    const rollups = gsm.readGlobalRollups();
    assert.equal(rollups.length, 1);
    assert.equal(rollups[0].source_project, "test-project");
  });

  it("updates existing entry for same project+milestone", () => {
    gsm.writeGlobalRollup(makeRollup({ elo_after: 1010 }));
    gsm.writeGlobalRollup(makeRollup({ elo_after: 1020 }));
    const rollups = gsm.readGlobalRollups();
    assert.equal(rollups.length, 1);
    assert.equal(rollups[0].elo_after, 1020);
  });

  it("allows different milestones for same project", () => {
    gsm.writeGlobalRollup(makeRollup({ milestone: "M25" }));
    gsm.writeGlobalRollup(makeRollup({ milestone: "M26" }));
    assert.equal(gsm.readGlobalRollups().length, 2);
  });
});

// ── readGlobalSignalDistributions / writeGlobalSignalDistribution ───────────

describe("readGlobalSignalDistributions", () => {
  it("returns empty array when file does not exist", () => {
    assert.deepStrictEqual(gsm.readGlobalSignalDistributions(), []);
  });
});

describe("writeGlobalSignalDistribution", () => {
  it("appends entry", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist());
    assert.equal(gsm.readGlobalSignalDistributions().length, 1);
  });

  it("overwrites entry for same project", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist({ total_tasks: 10 }));
    gsm.writeGlobalSignalDistribution(makeSignalDist({ total_tasks: 20 }));
    const entries = gsm.readGlobalSignalDistributions();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].total_tasks, 20);
  });
});

// ── compareSignalDistributions ──────────────────────────────────────────────

describe("compareSignalDistributions", () => {
  it("returns insufficient_data when fewer than 2 projects", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist());
    const result = gsm.compareSignalDistributions("test-project");
    assert.equal(result.insufficient_data, true);
  });

  it("returns sorted comparison when 2+ projects exist", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-a",
      signal_rates: { "pass-through": 0.8, "fix-cycle": 0.2 },
    }));
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-b",
      signal_rates: { "pass-through": 0.9, "fix-cycle": 0.1 },
    }));
    const result = gsm.compareSignalDistributions("proj-a");
    assert.equal(result.insufficient_data, false);
    assert.equal(result.projects[0].source_project, "proj-b"); // higher pass-through
    assert.equal(result.projects.length, 2);
    const queried = result.projects.find((p) => p.is_queried);
    assert.equal(queried.source_project, "proj-a");
  });

  it("normalizes signal rates to sum=1", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-x",
      signal_rates: { "pass-through": 80, "fix-cycle": 20 },
    }));
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-y",
      signal_rates: { "pass-through": 0.7, "fix-cycle": 0.3 },
    }));
    const result = gsm.compareSignalDistributions("proj-x");
    const projX = result.projects.find((p) => p.source_project === "proj-x");
    assert.equal(projX.signal_rates["pass-through"], 0.8);
    assert.equal(projX.signal_rates["fix-cycle"], 0.2);
  });
});

// ── getDomainTypeComparison ─────────────────────────────────────────────────

describe("getDomainTypeComparison", () => {
  it("returns insufficient_data when fewer than 2 projects have the domain type", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      domain_type_signals: [{ domain_type: "auth", signal_counts: { "pass-through": 5 }, total_tasks: 5 }],
    }));
    const result = gsm.getDomainTypeComparison("auth");
    assert.equal(result.insufficient_data, true);
    assert.equal(result.projects.length, 1);
  });

  it("returns comparison when 2+ projects have matching domain type", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-a",
      domain_type_signals: [{ domain_type: "auth", signal_counts: { "pass-through": 5 }, total_tasks: 5 }],
    }));
    gsm.writeGlobalSignalDistribution(makeSignalDist({
      source_project: "proj-b",
      domain_type_signals: [{ domain_type: "auth", signal_counts: { "pass-through": 3, "fix-cycle": 2 }, total_tasks: 5 }],
    }));
    const result = gsm.getDomainTypeComparison("auth");
    assert.equal(result.insufficient_data, false);
    assert.equal(result.projects.length, 2);
  });

  it("returns empty when no projects have the domain type", () => {
    gsm.writeGlobalSignalDistribution(makeSignalDist());
    const result = gsm.getDomainTypeComparison("nonexistent");
    assert.equal(result.insufficient_data, true);
    assert.equal(result.projects.length, 0);
  });
});

// ── checkUniversalPromotion ─────────────────────────────────────────────────

describe("checkUniversalPromotion", () => {
  it("returns null for nonexistent rule", () => {
    assert.equal(gsm.checkUniversalPromotion("grule-999"), null);
  });

  it("does not set universal for promotion_count < 3", () => {
    gsm.writeGlobalRule(makeRule({ promotion_count: 1 }));
    const rules = gsm.readGlobalRules();
    const result = gsm.checkUniversalPromotion(rules[0].global_id);
    assert.equal(result.is_universal, false);
  });

  it("sets is_universal when promotion_count >= 3", () => {
    const trigger = { metric: "uni", operator: "gt", threshold: 1 };
    for (let i = 0; i < 3; i++) {
      gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: `/p/${i}` }));
    }
    const rules = gsm.readGlobalRules();
    const result = gsm.checkUniversalPromotion(rules[0].global_id);
    assert.equal(result.is_universal, true);
  });

  it("sets is_npm_candidate when promotion_count >= 5", () => {
    const trigger = { metric: "npm", operator: "gt", threshold: 1 };
    for (let i = 0; i < 5; i++) {
      gsm.writeGlobalRule(makeRule({ trigger, source_project_dir: `/q/${i}` }));
    }
    const rules = gsm.readGlobalRules();
    const result = gsm.checkUniversalPromotion(rules[0].global_id);
    assert.equal(result.is_universal, true);
    assert.equal(result.is_npm_candidate, true);
  });
});

// ── getGlobalELO ────────────────────────────────────────────────────────────

describe("getGlobalELO", () => {
  it("returns null when no rollup data exists", () => {
    assert.equal(gsm.getGlobalELO("nonexistent"), null);
  });

  it("returns latest elo_after for project", () => {
    gsm.writeGlobalRollup(makeRollup({ milestone: "M25", elo_after: 1010 }));
    gsm.writeGlobalRollup(makeRollup({ milestone: "M26", elo_after: 1025 }));
    assert.equal(gsm.getGlobalELO("test-project"), 1025);
  });
});

// ── getProjectRankings ──────────────────────────────────────────────────────

describe("getProjectRankings", () => {
  it("returns empty array when no rollups exist", () => {
    assert.deepStrictEqual(gsm.getProjectRankings(), []);
  });

  it("returns projects sorted by elo_after descending", () => {
    gsm.writeGlobalRollup(makeRollup({ source_project: "proj-a", elo_after: 1010 }));
    gsm.writeGlobalRollup(makeRollup({ source_project: "proj-b", elo_after: 1050 }));
    gsm.writeGlobalRollup(makeRollup({ source_project: "proj-c", elo_after: 990 }));
    const rankings = gsm.getProjectRankings();
    assert.equal(rankings.length, 3);
    assert.equal(rankings[0].source_project, "proj-b");
    assert.equal(rankings[1].source_project, "proj-a");
    assert.equal(rankings[2].source_project, "proj-c");
  });

  it("uses latest rollup per project when multiple milestones exist", () => {
    gsm.writeGlobalRollup(makeRollup({ source_project: "proj-x", milestone: "M25", elo_after: 1000 }));
    gsm.writeGlobalRollup(makeRollup({ source_project: "proj-x", milestone: "M26", elo_after: 1050 }));
    const rankings = gsm.getProjectRankings();
    assert.equal(rankings.length, 1);
    assert.equal(rankings[0].elo_after, 1050);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRule(overrides = {}) {
  const trigger = overrides.trigger || { metric: "fix_cycles", operator: "gt", threshold: 2 };
  return {
    id: overrides.id || "rule-test",
    original_rule: { trigger, ...(overrides.original_rule || {}) },
    source_project: overrides.source_project || "test-project",
    source_project_dir: overrides.source_project_dir || "/test/project",
    promoted_at: "2026-03-23T00:00:00Z",
    propagated_to: overrides.propagated_to || [],
    promotion_count: overrides.promotion_count || undefined,
    ...overrides,
  };
}

function makeRollup(overrides = {}) {
  return {
    source_project: "test-project",
    source_project_dir: "/test/project",
    milestone: "M27",
    version: "2.45.10",
    total_tasks: 11,
    first_pass_rate: 0.818,
    avg_duration_s: 45,
    total_fix_cycles: 2,
    total_tokens: 50000,
    elo_after: 1015,
    signal_distribution: { "pass-through": 9, "fix-cycle": 2 },
    domain_breakdown: [{ domain: "global-metrics", tasks: 4, first_pass_rate: 1.0, avg_duration_s: 40 }],
    ...overrides,
  };
}

function makeSignalDist(overrides = {}) {
  return {
    source_project: "test-project",
    source_project_dir: "/test/project",
    total_tasks: 30,
    signal_counts: { "pass-through": 24, "fix-cycle": 6 },
    signal_rates: { "pass-through": 0.8, "fix-cycle": 0.2 },
    domain_type_signals: [],
    ...overrides,
  };
}
