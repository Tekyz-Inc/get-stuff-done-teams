/**
 * Tests for bin/token-optimizer.js.
 * Uses Node.js built-in test runner (node --test).
 *
 * Contract: .gsd-t/contracts/token-telemetry-contract.md v1.0.0
 *
 * Coverage (OB-T1):
 *   - Rule 1 (demote): opus success-rate threshold triggers
 *   - Rule 2 (escalate): sonnet failure-rate threshold triggers
 *   - Rule 3 (runway-tune): projected vs actual over-estimate (no-op until
 *     schema adds fields, but rule wired)
 *   - Rule 4 (investigate): per-phase p95 > 2× median
 *   - Empty-recommendations marker line written
 *   - appendToBacklog writes correct format
 *   - Cooldown filter suppresses rejected entries
 *   - Multiple rules can fire from one dataset
 *   - parseBacklog round-trips entries
 *   - setRecommendationStatus rewrites in-place
 *
 * Integration roundtrip (OB-T4) is a separate describe block at the bottom.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const opt = require("../bin/token-optimizer.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-opt-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) fs.rmSync(gsd, { recursive: true, force: true });
  fs.mkdirSync(gsd, { recursive: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(overrides) {
  return Object.assign(
    {
      timestamp: "2026-04-15T00:00:00.000Z",
      milestone: "M35",
      command: "gsd-t-execute",
      phase: "execute",
      step: "Step 2",
      domain: "m35-test",
      domain_type: "bin-script",
      task: "T1",
      model: "sonnet",
      duration_s: 30,
      input_tokens_before: 10000,
      input_tokens_after: 18000,
      tokens_consumed: 8000,
      context_window_pct_before: 5.0,
      context_window_pct_after: 9.0,
      outcome: "success",
      halt_type: null,
      escalated_via_advisor: false,
    },
    overrides,
  );
}

function writeMetrics(records) {
  const fp = path.join(tmpDir, ".gsd-t", "token-metrics.jsonl");
  fs.writeFileSync(fp, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

// ── Rule 1: demote ──────────────────────────────────────────────────────────

describe("OB-T1: Rule 1 — demote", () => {
  it("triggers on opus phase with ≥90% success + meaningful volume", () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "opus",
          command: "gsd-t-test-sync",
          phase: "test-sync",
          outcome: "success",
          tokens_consumed: 6400,
        }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    const demotions = recs.filter((r) => r.type === "demote");
    assert.equal(demotions.length, 1);
    assert.ok(demotions[0].evidence.includes("gsd-t-test-sync"));
    assert.ok(demotions[0].evidence.includes("100%"));
    assert.ok(demotions[0].proposed_change.includes("model-selector.js"));
  });

  it("does NOT trigger on opus with <90% success rate", () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "opus",
          outcome: i < 7 ? "success" : "failure",
        }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.equal(recs.filter((r) => r.type === "demote").length, 0);
  });

  it("does NOT trigger with insufficient volume (<3 spawns)", () => {
    writeMetrics([
      makeRecord({ model: "opus", outcome: "success" }),
      makeRecord({ model: "opus", outcome: "success" }),
    ]);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.equal(recs.filter((r) => r.type === "demote").length, 0);
  });
});

// ── Rule 2: escalate ────────────────────────────────────────────────────────

describe("OB-T1: Rule 2 — escalate", () => {
  it("triggers on sonnet phase with ≥30% failure rate", () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "sonnet",
          command: "gsd-t-debug",
          phase: "debug",
          outcome: i < 4 ? "failure" : "success", // 40% failure
        }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    const escalations = recs.filter((r) => r.type === "escalate");
    assert.equal(escalations.length, 1);
    assert.ok(escalations[0].evidence.includes("40%"));
    assert.ok(escalations[0].proposed_change.includes("opus"));
  });

  it("does NOT trigger on sonnet with low failure rate", () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({ model: "sonnet", outcome: "success" }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.equal(recs.filter((r) => r.type === "escalate").length, 0);
  });
});

// ── Rule 3: runway-tune (no-op until schema extension) ────────────────────

describe("OB-T1: Rule 3 — runway-tune", () => {
  it("is a no-op when projected_end_pct/actual_end_pct fields absent", () => {
    const records = [];
    for (let i = 0; i < 5; i++) records.push(makeRecord({ model: "sonnet" }));
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.equal(recs.filter((r) => r.type === "runway-tune").length, 0);
  });

  it("fires when fields are present and over-estimate > 15pt", () => {
    writeMetrics([
      makeRecord({ projected_end_pct: 80, actual_end_pct: 60 }),
    ]);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    const tunes = recs.filter((r) => r.type === "runway-tune");
    assert.equal(tunes.length, 1);
    assert.ok(tunes[0].evidence.includes("80%"));
    assert.ok(tunes[0].evidence.includes("60%"));
  });
});

// ── Rule 4: investigate (outlier) ───────────────────────────────────────────

describe("OB-T1: Rule 4 — investigate", () => {
  it("triggers when p95 > 2× median with ≥10 spawns", () => {
    const records = [];
    // 9 records with ~5000 tokens, 1 with 20000 — p95 spike.
    for (let i = 0; i < 9; i++) {
      records.push(makeRecord({ model: "sonnet", tokens_consumed: 5000 }));
    }
    records.push(makeRecord({ model: "sonnet", tokens_consumed: 20000 }));
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    const outliers = recs.filter((r) => r.type === "investigate");
    assert.equal(outliers.length, 1);
    assert.ok(outliers[0].evidence.includes("outlier signal"));
  });

  it("does NOT trigger with low sample count (<10)", () => {
    const records = [];
    for (let i = 0; i < 5; i++) {
      records.push(makeRecord({ tokens_consumed: 5000 }));
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.equal(recs.filter((r) => r.type === "investigate").length, 0);
  });
});

// ── Empty-recommendations marker ────────────────────────────────────────────

describe("OB-T1: empty-recommendations marker", () => {
  it("appendToBacklog writes a 'no recommendations' line when recs empty", () => {
    opt.appendToBacklog([], tmpDir);
    const backlog = opt.readBacklog(tmpDir);
    assert.ok(backlog.includes("# Token Optimization Backlog"));
    assert.ok(backlog.includes("no recommendations"));
  });
});

// ── appendToBacklog format ──────────────────────────────────────────────────

describe("OB-T1: appendToBacklog format", () => {
  it("writes an entry with all required metadata fields", () => {
    const rec = {
      id: "M35-OPT-001",
      type: "demote",
      detected_at: "2026-04-15T00:00:00.000Z",
      evidence: "10 gsd-t-test-sync spawns on opus, 100% success",
      projected_savings: "~45% tokens",
      proposed_change: "bin/model-selector.js — add test-sync to sonnet tier",
      risk: "Low",
      status: "pending",
      rejection_cooldown: 0,
      fingerprint: "demote|command=gsd-t-test-sync|phase=test-sync",
    };
    opt.appendToBacklog([rec], tmpDir);
    const backlog = opt.readBacklog(tmpDir);
    assert.ok(backlog.includes("## [M35-OPT-001]"));
    assert.ok(backlog.includes("**Type**: demote"));
    assert.ok(backlog.includes("**Evidence**:"));
    assert.ok(backlog.includes("**Projected savings**:"));
    assert.ok(backlog.includes("**Proposed change**:"));
    assert.ok(backlog.includes("**Risk**:"));
    assert.ok(backlog.includes("**Status**: pending"));
    assert.ok(backlog.includes("**Rejection cooldown**: 0"));
    assert.ok(backlog.includes("**Fingerprint**:"));
  });
});

// ── Cooldown filter ─────────────────────────────────────────────────────────

describe("OB-T1: cooldown filter", () => {
  it("suppresses a rejected entry's fingerprint from re-surfacing", () => {
    // Seed a rejected entry directly in the backlog.
    const backlog = `# Token Optimization Backlog

## [M35-OPT-001] Demote phase from opus → sonnet
**Type**: demote
**Detected**: 2026-04-15T00:00:00.000Z at complete-milestone M35
**Evidence**: 10 gsd-t-test-sync spawns on opus, 100% success
**Projected savings**: ~45% tokens
**Proposed change**: bin/model-selector.js — add gsd-t-test-sync to sonnet tier
**Risk**: Low
**Status**: rejected
**Rejection cooldown**: 5
**Fingerprint**: demote|command=gsd-t-test-sync|phase=test-sync
`;
    opt.writeBacklog(tmpDir, backlog);

    // Now seed metrics that would normally trigger the same demote.
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "opus",
          command: "gsd-t-test-sync",
          phase: "test-sync",
          outcome: "success",
        }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    // The fingerprint matches a rejected entry with cooldown 5 → suppressed.
    assert.equal(recs.filter((r) => r.type === "demote").length, 0);
  });
});

// ── Multiple rules from one dataset ────────────────────────────────────────

describe("OB-T1: multiple rules fire from one dataset", () => {
  it("demote + escalate can both trigger from one fixture", () => {
    const records = [];
    // Opus success — triggers demote
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "opus",
          command: "gsd-t-test-sync",
          phase: "test-sync",
          outcome: "success",
        }),
      );
    }
    // Sonnet failure — triggers escalate
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          model: "sonnet",
          command: "gsd-t-debug",
          phase: "debug",
          outcome: i < 4 ? "failure" : "success",
        }),
      );
    }
    writeMetrics(records);
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.ok(recs.some((r) => r.type === "demote"));
    assert.ok(recs.some((r) => r.type === "escalate"));
  });
});

// ── parseBacklog round-trip ────────────────────────────────────────────────

describe("OB-T1: parseBacklog round-trip", () => {
  it("parses entries back into objects", () => {
    const rec = {
      id: "M35-OPT-042",
      type: "demote",
      detected_at: "2026-04-15T00:00:00.000Z",
      evidence: "evidence text",
      projected_savings: "savings",
      proposed_change: "change",
      risk: "Low",
      status: "pending",
      rejection_cooldown: 0,
    };
    opt.appendToBacklog([rec], tmpDir);
    const entries = opt.parseBacklog(opt.readBacklog(tmpDir));
    const found = entries.find((e) => e.id === "M35-OPT-042");
    assert.ok(found);
    assert.equal(found.type, "demote");
    assert.equal(found.status, "pending");
    assert.equal(found.rejection_cooldown, 0);
  });
});

// ── setRecommendationStatus ────────────────────────────────────────────────

describe("OB-T1: setRecommendationStatus", () => {
  it("rewrites a single entry's status + cooldown in-place", () => {
    const rec = {
      id: "M35-OPT-100",
      type: "demote",
      detected_at: "2026-04-15T00:00:00.000Z",
      evidence: "ev",
      projected_savings: "ps",
      proposed_change: "pc",
      risk: "Low",
      status: "pending",
      rejection_cooldown: 0,
    };
    opt.appendToBacklog([rec], tmpDir);
    let content = opt.readBacklog(tmpDir);
    content = opt.setRecommendationStatus(content, "M35-OPT-100", {
      status: "rejected",
      rejection_cooldown: 5,
    });
    opt.writeBacklog(tmpDir, content);
    const entries = opt.parseBacklog(opt.readBacklog(tmpDir));
    const e = entries.find((x) => x.id === "M35-OPT-100");
    assert.equal(e.status, "rejected");
    assert.equal(e.rejection_cooldown, 5);
  });
});

// ── Robustness ──────────────────────────────────────────────────────────────

describe("OB-T1: robustness", () => {
  it("detectRecommendations returns [] when metrics file is missing", () => {
    const recs = opt.detectRecommendations({ projectDir: tmpDir });
    assert.deepEqual(recs, []);
  });

  it("detectRecommendations skips malformed JSONL lines", () => {
    const fp = path.join(tmpDir, ".gsd-t", "token-metrics.jsonl");
    fs.writeFileSync(fp, "not-json\n" + JSON.stringify(makeRecord()) + "\n");
    assert.doesNotThrow(() =>
      opt.detectRecommendations({ projectDir: tmpDir }),
    );
  });

  it("exports DETECTION_RULES array with 4 rules", () => {
    assert.ok(Array.isArray(opt.DETECTION_RULES));
    assert.equal(opt.DETECTION_RULES.length, 4);
    const types = opt.DETECTION_RULES.map((r) => r.type);
    assert.deepEqual(
      types.sort(),
      ["demote", "escalate", "investigate", "runway-tune"].sort(),
    );
  });
});

// ── OB-T4: Integration roundtrip ────────────────────────────────────────────
// fixture → detectRecommendations → appendToBacklog → apply (simulated) →
// reject (simulated) → re-detect respects cooldown

describe("OB-T4: integration roundtrip", () => {
  it("fixture → detect → append → apply → reject → re-detect filters", () => {
    // Use a separate tempdir so the roundtrip is fully isolated.
    const rtDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-rt-"));
    try {
      fs.mkdirSync(path.join(rtDir, ".gsd-t"), { recursive: true });

      // 1. Synthetic token-metrics.jsonl — 10 opus/execute/success records.
      const records = [];
      for (let i = 0; i < 10; i++) {
        records.push(
          makeRecord({
            model: "opus",
            command: "gsd-t-execute",
            phase: "execute",
            outcome: "success",
            tokens_consumed: 6400,
          }),
        );
      }
      // Also add 10 sonnet/debug/failure records to trigger escalate.
      for (let i = 0; i < 10; i++) {
        records.push(
          makeRecord({
            model: "sonnet",
            command: "gsd-t-debug",
            phase: "debug",
            outcome: i < 5 ? "failure" : "success",
          }),
        );
      }
      fs.writeFileSync(
        path.join(rtDir, ".gsd-t", "token-metrics.jsonl"),
        records.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );

      // 2. Detect — should return one demote and one escalate.
      const recs1 = opt.detectRecommendations({ projectDir: rtDir });
      assert.ok(
        recs1.length >= 2,
        `expected at least 2 recommendations, got ${recs1.length}`,
      );
      const demote = recs1.find((r) => r.type === "demote");
      const escalate = recs1.find((r) => r.type === "escalate");
      assert.ok(demote, "demote recommendation should fire");
      assert.ok(escalate, "escalate recommendation should fire");

      // 3. Append — backlog should contain both entries.
      opt.appendToBacklog(recs1, rtDir);
      let backlog = opt.readBacklog(rtDir);
      assert.ok(backlog.includes(demote.id));
      assert.ok(backlog.includes(escalate.id));
      let entries = opt.parseBacklog(backlog);
      assert.ok(entries.find((e) => e.id === demote.id && e.status === "pending"));

      // 4. Simulate apply on the demote entry.
      backlog = opt.setRecommendationStatus(backlog, demote.id, {
        status: "promoted",
      });
      opt.writeBacklog(rtDir, backlog);
      entries = opt.parseBacklog(opt.readBacklog(rtDir));
      const applied = entries.find((e) => e.id === demote.id);
      assert.equal(applied.status, "promoted");

      // 5. Simulate reject on the escalate entry with cooldown 5.
      backlog = opt.setRecommendationStatus(
        opt.readBacklog(rtDir),
        escalate.id,
        {
          status: "rejected",
          rejection_cooldown: 5,
        },
      );
      opt.writeBacklog(rtDir, backlog);
      entries = opt.parseBacklog(opt.readBacklog(rtDir));
      const rejected = entries.find((e) => e.id === escalate.id);
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.rejection_cooldown, 5);

      // 6. Re-detect with same fixture — escalate must not re-surface.
      const recs2 = opt.detectRecommendations({ projectDir: rtDir });
      assert.equal(
        recs2.filter((r) => r.type === "escalate").length,
        0,
        "rejected escalate entry must be filtered by cooldown",
      );
    } finally {
      fs.rmSync(rtDir, { recursive: true, force: true });
    }
  });
});
