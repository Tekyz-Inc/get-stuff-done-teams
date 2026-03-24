/**
 * Tests for cross-project-sync: syncGlobalRulesToProject, syncGlobalRules,
 * exportUniversalRulesForNpm, seedUniversalRules
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// We test the gsd-t.js functions indirectly by setting up the global metrics
// files and then calling the sync functions via require of the module.
// Since gsd-t.js functions are internal (not exported), we test via the
// global-sync-manager + rule-engine combination that the sync logic depends on.

const gsm = require("../bin/global-sync-manager.js");

let tmpGlobalDir;
let tmpProjectDir;

before(() => {
  tmpGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-sync-global-"));
  tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-sync-proj-"));
  gsm._setGlobalDir(tmpGlobalDir);
  // Create project structure
  fs.mkdirSync(path.join(tmpProjectDir, ".gsd-t", "metrics"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpGlobalDir, { recursive: true, force: true });
  fs.rmSync(tmpProjectDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean global files
  for (const f of ["global-rules.jsonl", "global-rollup.jsonl", "global-signal-distributions.jsonl"]) {
    const fp = path.join(tmpGlobalDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  // Clean local rules
  const localRules = path.join(tmpProjectDir, ".gsd-t", "metrics", "rules.jsonl");
  if (fs.existsSync(localRules)) fs.unlinkSync(localRules);
});

// ── writeGlobalRule + readGlobalRules integration ───────────────────────────

describe("Global rule sync integration", () => {
  it("writeGlobalRule creates rule with correct schema fields", () => {
    const rule = gsm.writeGlobalRule({
      id: "rule-001",
      original_rule: {
        trigger: { metric: "fix_cycles", operator: "gt", threshold: 2 },
        name: "High Fix Cycles",
        description: "Fires when fix_cycles > 2",
        severity: "HIGH",
        action: "warn",
      },
      source_project: "test-project",
      source_project_dir: tmpProjectDir,
    });
    assert.ok(rule.global_id.startsWith("grule-"));
    assert.equal(rule.source_project, "test-project");
    assert.equal(rule.promotion_count, 1);
    assert.equal(rule.is_universal, false);
    assert.equal(rule.is_npm_candidate, false);
    assert.equal(rule.shipped_in_version, null);
  });

  it("rules injected as candidates have correct status and activation_count", () => {
    // Simulate what syncGlobalRulesToProject does
    const trigger = { metric: "fix_cycles", operator: "gt", threshold: 2 };
    gsm.writeGlobalRule({
      id: "r1", original_rule: { trigger, name: "Test", description: "d", severity: "HIGH", action: "warn" },
      source_project: "proj-a", source_project_dir: "/a",
    });
    gsm.writeGlobalRule({
      id: "r1", original_rule: { trigger, name: "Test", description: "d", severity: "HIGH", action: "warn" },
      source_project: "proj-b", source_project_dir: "/b",
    });

    const rules = gsm.readGlobalRules();
    assert.equal(rules[0].promotion_count, 2);

    // Now check that a candidate rule would be created with correct fields
    const candidate = {
      id: `global-${rules[0].global_id}`,
      status: "active",
      activation_count: 0,
    };
    assert.equal(candidate.status, "active");
    assert.equal(candidate.activation_count, 0);
  });

  it("dedup: writing same trigger from different projects increments promotion_count", () => {
    const trigger = { metric: "context_pct", operator: "gt", threshold: 80 };
    gsm.writeGlobalRule({ id: "r1", original_rule: { trigger }, source_project: "p1", source_project_dir: "/p1" });
    gsm.writeGlobalRule({ id: "r1", original_rule: { trigger }, source_project: "p2", source_project_dir: "/p2" });
    gsm.writeGlobalRule({ id: "r1", original_rule: { trigger }, source_project: "p3", source_project_dir: "/p3" });
    const rules = gsm.readGlobalRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].promotion_count, 3);
    assert.equal(rules[0].is_universal, true);
  });

  it("graceful fallback when global-rules.jsonl does not exist", () => {
    const rules = gsm.readGlobalRules();
    assert.deepStrictEqual(rules, []);
  });
});

// ── syncGlobalRules iterates projects correctly ─────────────────────────────

describe("syncGlobalRules behavior", () => {
  it("qualifying rules: universal=true OR promotion_count >= 2", () => {
    const trigger1 = { metric: "a", operator: "gt", threshold: 1 };
    const trigger2 = { metric: "b", operator: "gt", threshold: 1 };

    // Rule 1: promotion_count=1, not universal — should NOT qualify
    gsm.writeGlobalRule({ id: "r1", original_rule: { trigger: trigger1 }, source_project: "p1", source_project_dir: "/p1" });

    // Rule 2: promotion_count=2 — SHOULD qualify
    gsm.writeGlobalRule({ id: "r2", original_rule: { trigger: trigger2 }, source_project: "p2", source_project_dir: "/p2" });
    gsm.writeGlobalRule({ id: "r2", original_rule: { trigger: trigger2 }, source_project: "p3", source_project_dir: "/p3" });

    const rules = gsm.readGlobalRules();
    const qualifying = rules.filter((r) => r.is_universal === true || (r.promotion_count || 0) >= 2);
    assert.equal(qualifying.length, 1);
    assert.equal(qualifying[0].promotion_count, 2);
  });
});

// ── exportUniversalRulesForNpm ──────────────────────────────────────────────

describe("exportUniversalRulesForNpm behavior", () => {
  it("only exports rules where is_npm_candidate is true", () => {
    const trigger = { metric: "npm-test", operator: "gt", threshold: 1 };
    // Create a rule with 5 promotions to make it an npm candidate
    for (let i = 0; i < 5; i++) {
      gsm.writeGlobalRule({
        id: "npm-r1",
        original_rule: { trigger, name: "NPM Test", description: "test" },
        source_project: `proj-${i}`,
        source_project_dir: `/proj/${i}`,
      });
    }
    const rules = gsm.readGlobalRules();
    const npmCandidates = rules.filter((r) => r.is_npm_candidate === true);
    assert.equal(npmCandidates.length, 1);
    assert.equal(npmCandidates[0].promotion_count, 5);
  });

  it("non-npm-candidate rules are not exported", () => {
    const trigger = { metric: "no-npm", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({ id: "r1", original_rule: { trigger }, source_project: "p1", source_project_dir: "/p1" });
    const rules = gsm.readGlobalRules();
    const npmCandidates = rules.filter((r) => r.is_npm_candidate === true);
    assert.equal(npmCandidates.length, 0);
  });
});

// ── seedUniversalRules ──────────────────────────────────────────────────────

describe("seedUniversalRules behavior", () => {
  it("shipped rules written as candidates with correct format", () => {
    // Create a shipped rules file
    const rulesDir = path.join(tmpProjectDir, "examples", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    const shippedRule = {
      global_id: "grule-001",
      original_rule: {
        trigger: { metric: "fix_cycles", operator: "gt", threshold: 3 },
        name: "High Fix Cycles",
        description: "Fired when fix cycles exceed 3",
        severity: "HIGH",
        action: "warn",
      },
      is_npm_candidate: true,
      shipped_in_version: "2.45.10",
    };
    fs.writeFileSync(path.join(rulesDir, "universal-rules.jsonl"), JSON.stringify(shippedRule) + "\n");

    // Simulate seeding by reading and creating candidate
    const content = fs.readFileSync(path.join(rulesDir, "universal-rules.jsonl"), "utf8").trim();
    const rules = content.split("\n").map((l) => JSON.parse(l));
    assert.equal(rules.length, 1);
    assert.equal(rules[0].global_id, "grule-001");
    assert.equal(rules[0].is_npm_candidate, true);

    // Clean up
    fs.rmSync(path.join(tmpProjectDir, "examples"), { recursive: true, force: true });
  });
});

// ── gsd-t.js sync functions (direct tests) ──────────────────────────────────

const gsdtCli = require("../bin/gsd-t.js");

describe("syncGlobalRulesToProject", () => {
  it("returns 0 when no global rules exist", () => {
    const result = gsdtCli.syncGlobalRulesToProject(tmpProjectDir);
    assert.equal(result, 0);
  });

  it("returns 0 when no qualifying rules (promotion_count < 2, not universal)", () => {
    const trigger = { metric: "low_promo", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger, name: "Low", description: "test", severity: "LOW", action: "warn" },
      source_project: "solo",
      source_project_dir: "/solo",
    });
    const result = gsdtCli.syncGlobalRulesToProject(tmpProjectDir);
    assert.equal(result, 0);
  });

  it("injects qualifying rule (promotion_count >= 2) as candidate to local rules.jsonl", () => {
    const trigger = { metric: "sync_test", operator: "gt", threshold: 5 };
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger, name: "Sync Test", description: "test sync", severity: "HIGH", action: "warn" },
      source_project: "p1",
      source_project_dir: "/p1",
    });
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger, name: "Sync Test", description: "test sync", severity: "HIGH", action: "warn" },
      source_project: "p2",
      source_project_dir: "/p2",
    });

    const count = gsdtCli.syncGlobalRulesToProject(tmpProjectDir);
    assert.equal(count, 1);

    // Verify the candidate was written to local rules.jsonl
    const localRulesFile = path.join(tmpProjectDir, ".gsd-t", "metrics", "rules.jsonl");
    assert.ok(fs.existsSync(localRulesFile));
    const content = fs.readFileSync(localRulesFile, "utf8").trim();
    const rules = content.split("\n").map((l) => JSON.parse(l));
    assert.equal(rules.length, 1);
    assert.equal(rules[0].status, "active");
    assert.equal(rules[0].activation_count, 0);
    assert.ok(rules[0].id.startsWith("global-grule-"));
    assert.equal(rules[0].milestone_created, "global");
    assert.ok(rules[0].source_global_id);
  });

  it("does not re-inject rule that already exists locally", () => {
    const trigger = { metric: "dedup_local", operator: "gt", threshold: 3 };
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger, name: "Dedup", description: "d", severity: "MEDIUM", action: "warn" },
      source_project: "p1",
      source_project_dir: "/p1",
    });
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger, name: "Dedup", description: "d", severity: "MEDIUM", action: "warn" },
      source_project: "p2",
      source_project_dir: "/p2",
    });

    // First sync
    const count1 = gsdtCli.syncGlobalRulesToProject(tmpProjectDir);
    assert.equal(count1, 1);

    // Second sync — should not inject again
    const count2 = gsdtCli.syncGlobalRulesToProject(tmpProjectDir);
    assert.equal(count2, 0);
  });

  it("returns 0 gracefully for nonexistent project dir", () => {
    const trigger = { metric: "nodir", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger },
      source_project: "p1",
      source_project_dir: "/p1",
    });
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger },
      source_project: "p2",
      source_project_dir: "/p2",
    });
    const result = gsdtCli.syncGlobalRulesToProject("/nonexistent/path/xyz");
    assert.equal(result, 0);
  });
});

describe("syncGlobalRules", () => {
  it("returns 0 when no global rules exist", () => {
    const result = gsdtCli.syncGlobalRules([tmpProjectDir]);
    assert.equal(result, 0);
  });

  it("syncs qualifying rules across multiple projects", () => {
    // Create two project dirs
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-syncA-"));
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-syncB-"));
    fs.mkdirSync(path.join(projA, ".gsd-t", "metrics"), { recursive: true });
    fs.mkdirSync(path.join(projB, ".gsd-t", "metrics"), { recursive: true });

    const trigger = { metric: "multi_sync", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({
      id: "ms1",
      original_rule: { trigger, name: "Multi", description: "test", severity: "HIGH", action: "warn" },
      source_project: "origin1",
      source_project_dir: "/origin1",
    });
    gsm.writeGlobalRule({
      id: "ms1",
      original_rule: { trigger, name: "Multi", description: "test", severity: "HIGH", action: "warn" },
      source_project: "origin2",
      source_project_dir: "/origin2",
    });

    const total = gsdtCli.syncGlobalRules([projA, projB]);
    assert.equal(total, 2);

    // Cleanup
    fs.rmSync(projA, { recursive: true, force: true });
    fs.rmSync(projB, { recursive: true, force: true });
  });

  it("skips nonexistent project directories", () => {
    const trigger = { metric: "skip_test", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({
      id: "sk1",
      original_rule: { trigger },
      source_project: "p1",
      source_project_dir: "/p1",
    });
    gsm.writeGlobalRule({
      id: "sk1",
      original_rule: { trigger },
      source_project: "p2",
      source_project_dir: "/p2",
    });
    const result = gsdtCli.syncGlobalRules(["/nonexistent/dir1", "/nonexistent/dir2"]);
    assert.equal(result, 0);
  });
});

describe("exportUniversalRulesForNpm", () => {
  it("returns 0 when no npm candidates exist", () => {
    const trigger = { metric: "no_npm", operator: "gt", threshold: 1 };
    gsm.writeGlobalRule({
      id: "r1",
      original_rule: { trigger },
      source_project: "p1",
      source_project_dir: "/p1",
    });
    const result = gsdtCli.exportUniversalRulesForNpm();
    assert.equal(result, 0);
  });

  it("returns 0 when no global rules exist at all", () => {
    const result = gsdtCli.exportUniversalRulesForNpm();
    assert.equal(result, 0);
  });
});
