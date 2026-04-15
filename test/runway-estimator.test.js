/**
 * Tests for bin/runway-estimator.js
 * Uses Node.js built-in test runner (node --test)
 *
 * Contract: .gsd-t/contracts/runway-estimator-contract.md v1.0.0
 *
 * AC requires ≥20 tests covering: empty/missing telemetry, tier fallback,
 * confidence boundaries (9/10/49/50), 1.25x conservative skew, proceed and
 * refusal paths, multi-task projection, sonnet/opus fallback constants,
 * missing context-meter-state, and clear-and-resume recommendation.
 *
 * RE-T5 appends a smoke test using an 80% CTX_PCT fixture.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  estimateRunway,
  STOP_THRESHOLD_PCT,
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MEDIUM_MIN,
  LOW_CONFIDENCE_SKEW,
} = require("../bin/runway-estimator.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-re-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) {
    fs.rmSync(gsd, { recursive: true, force: true });
  }
  fs.mkdirSync(gsd, { recursive: true });
});

/** Write the M34 context-meter-state.json fixture with a given pct. */
function writeState(pct) {
  const fp = path.join(tmpDir, ".gsd-t", ".context-meter-state.json");
  fs.writeFileSync(
    fp,
    JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      inputTokens: Math.round((pct / 100) * 200000),
      modelWindowSize: 200000,
      pct,
      threshold: "normal",
      checkCount: 1,
    }),
  );
}

/** Append N telemetry records with a fixed pct delta. */
function writeMetrics(records) {
  const fp = path.join(tmpDir, ".gsd-t", "token-metrics.jsonl");
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(fp, lines);
}

/** Build a minimal telemetry record with a pct delta of `delta`. */
function makeRecord({
  command = "gsd-t-execute",
  domain_type = "bin-script",
  before = 20,
  delta = 4,
} = {}) {
  return {
    timestamp: "2026-04-14T22:45:12Z",
    milestone: "M35",
    command,
    phase: "execute",
    step: "Step 2",
    domain: "d",
    domain_type,
    task: "T1",
    model: "sonnet",
    duration_s: 10,
    input_tokens_before: 1000,
    input_tokens_after: 1500,
    tokens_consumed: 500,
    context_window_pct_before: before,
    context_window_pct_after: before + delta,
    outcome: "success",
    halt_type: null,
    escalated_via_advisor: false,
  };
}

// ── Empty / missing telemetry ────────────────────────────────────────────────

describe("missing inputs — constant fallback", () => {
  it("empty token-metrics.jsonl → constant fallback, confidence=low", () => {
    writeState(10);
    writeMetrics([]);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "low");
    assert.equal(r.confidence_basis, 0);
    assert.equal(r.pct_per_task, 4);
  });

  it("missing token-metrics.jsonl → same as empty (fallback, low)", () => {
    writeState(10);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "low");
    assert.equal(r.pct_per_task, 4);
  });

  it("missing .context-meter-state.json → current_pct=0", () => {
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
    });
    assert.equal(r.current_pct, 0);
  });
});

// ── Tier 1 → Tier 2 fallback (pair insufficient) ─────────────────────────────

describe("tier fallback — pair insufficient", () => {
  it("5 records for {command, domain_type} → falls back to command aggregate", () => {
    writeState(10);
    const recs = [];
    // 5 pair-specific records (insufficient — < 10)
    for (let i = 0; i < 5; i++) {
      recs.push(makeRecord({ domain_type: "frontend-ui", delta: 10 }));
    }
    // 12 command-level records with delta=2 (should win via Tier 2 medium)
    for (let i = 0; i < 12; i++) {
      recs.push(makeRecord({ domain_type: "bin-script", delta: 2 }));
    }
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "frontend-ui",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    // Should use Tier 2 — command aggregate = mean of all 17 records
    assert.equal(r.confidence, "medium");
    assert.equal(r.confidence_basis, 17);
  });
});

// ── Confidence boundaries ────────────────────────────────────────────────────

describe("confidence grading boundaries", () => {
  it("exactly 10 records → medium", () => {
    writeState(10);
    const recs = Array.from({ length: 10 }, () => makeRecord({ delta: 3 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "medium");
    assert.equal(r.confidence_basis, 10);
  });

  it("exactly 9 records → falls to command tier; still low fallback", () => {
    writeState(10);
    const recs = Array.from({ length: 9 }, () => makeRecord({ delta: 3 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "low");
  });

  it("exactly 50 records → high", () => {
    writeState(10);
    const recs = Array.from({ length: 50 }, () => makeRecord({ delta: 2 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "high");
  });

  it("exactly 49 records → medium", () => {
    writeState(10);
    const recs = Array.from({ length: 49 }, () => makeRecord({ delta: 2 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "medium");
  });

  it("55 records → high (sharpest match wins)", () => {
    writeState(10);
    const recs = Array.from({ length: 55 }, () => makeRecord({ delta: 1 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "high");
  });

  it("15 records for command → medium, uses historical mean", () => {
    writeState(10);
    const recs = Array.from({ length: 15 }, () => makeRecord({ delta: 3 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.confidence, "medium");
    assert.equal(r.pct_per_task, 3); // mean of 15 records at delta=3
  });
});

// ── Conservative skew ────────────────────────────────────────────────────────

describe("conservative skew", () => {
  it("low confidence → 1.25x multiplier applied to projection", () => {
    writeState(10);
    // 0 records → fallback (4% sonnet) at low confidence
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 10,
      projectDir: tmpDir,
    });
    // raw = 10 + 4*10 = 50, with 1.25x skew on the delta = 10 + 50 = 60
    assert.equal(r.projected_end_pct, 60);
  });

  it("medium confidence → no skew", () => {
    writeState(10);
    const recs = Array.from({ length: 12 }, () => makeRecord({ delta: 4 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 10,
      projectDir: tmpDir,
    });
    // raw = 10 + 4*10 = 50, no skew
    assert.equal(r.projected_end_pct, 50);
  });

  it("high confidence → no skew", () => {
    writeState(10);
    const recs = Array.from({ length: 55 }, () => makeRecord({ delta: 4 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 10,
      projectDir: tmpDir,
    });
    assert.equal(r.projected_end_pct, 50);
  });
});

// ── Proceed / refusal paths ──────────────────────────────────────────────────

describe("recommendation paths", () => {
  it("projected end < 85 → proceed", () => {
    writeState(20);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
    });
    assert.equal(r.can_start, true);
    assert.equal(r.recommendation, "proceed");
  });

  it("projected end ≥ 85 → headless (refusal)", () => {
    writeState(50);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 10,
      projectDir: tmpDir,
    });
    // raw = 50 + 4*10 = 90, skew = 50 + 50 = 100 (low confidence)
    assert.equal(r.can_start, false);
    assert.equal(r.recommendation, "headless");
  });

  it("projected end exactly 85 → refusal (< is strict)", () => {
    writeState(45);
    const recs = Array.from({ length: 12 }, () => makeRecord({ delta: 4 }));
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 10,
      projectDir: tmpDir,
    });
    // 45 + 40 = 85 → not < 85 → refusal
    assert.equal(r.projected_end_pct, 85);
    assert.equal(r.can_start, false);
  });

  it("headlessAvailable=false on refusal → clear-and-resume", () => {
    writeState(80);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
      headlessAvailable: false,
    });
    assert.equal(r.can_start, false);
    assert.equal(r.recommendation, "clear-and-resume");
  });

  it("remaining_tasks=0 → projected equals current, always proceed", () => {
    writeState(80);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 0,
      projectDir: tmpDir,
    });
    assert.equal(r.projected_end_pct, 80);
    assert.equal(r.can_start, true);
  });
});

// ── Multi-task projection ────────────────────────────────────────────────────

describe("multi-task projection", () => {
  it("5 remaining tasks at 4%/task sonnet fallback = 20% raw consumption", () => {
    writeState(10);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
    });
    // low confidence skew: 10 + 4*5*1.25 = 10 + 25 = 35
    assert.equal(r.projected_end_pct, 35);
  });
});

// ── Fallback constants ───────────────────────────────────────────────────────

describe("fallback constants", () => {
  it("sonnet-default command (gsd-t-execute) → 4% per task", () => {
    writeState(0);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.pct_per_task, 4);
  });

  it("opus-default command (gsd-t-debug) → 8% per task", () => {
    writeState(0);
    const r = estimateRunway({
      command: "gsd-t-debug",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.pct_per_task, 8);
  });

  it("opus-default command (gsd-t-integrate) → 8% per task", () => {
    writeState(0);
    const r = estimateRunway({
      command: "gsd-t-integrate",
      domain_type: "",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    assert.equal(r.pct_per_task, 8);
  });
});

// ── Robustness — malformed and missing data ──────────────────────────────────

describe("robustness", () => {
  it("malformed JSONL lines are skipped silently", () => {
    writeState(10);
    const fp = path.join(tmpDir, ".gsd-t", "token-metrics.jsonl");
    const valid = JSON.stringify(makeRecord({ delta: 3 }));
    fs.writeFileSync(fp, `${valid}\nnot-json\n${valid}\n{bad\n${valid}\n`);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    // 3 valid records — below medium threshold, falls back to low
    assert.equal(r.confidence, "low");
  });

  it("negative pct delta records are treated as 0", () => {
    writeState(10);
    const recs = [];
    // 12 records with mixed deltas — one pathological negative
    for (let i = 0; i < 11; i++) recs.push(makeRecord({ delta: 2 }));
    const bad = makeRecord({ before: 50, delta: 0 });
    bad.context_window_pct_after = 40; // negative delta
    recs.push(bad);
    writeMetrics(recs);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    // Mean computed only over the 11 valid records = 2
    assert.equal(r.pct_per_task, 2);
  });

  it("decision object shape is frozen v1.0.0", () => {
    writeState(10);
    const r = estimateRunway({
      command: "gsd-t-execute",
      domain_type: "bin-script",
      remaining_tasks: 1,
      projectDir: tmpDir,
    });
    const keys = Object.keys(r).sort();
    assert.deepEqual(keys, [
      "can_start",
      "confidence",
      "confidence_basis",
      "current_pct",
      "pct_per_task",
      "projected_end_pct",
      "reason",
      "recommendation",
    ]);
  });

  it("exported constants match contract v1.0.0", () => {
    assert.equal(STOP_THRESHOLD_PCT, 85);
    assert.equal(CONFIDENCE_HIGH_MIN, 50);
    assert.equal(CONFIDENCE_MEDIUM_MIN, 10);
    assert.equal(LOW_CONFIDENCE_SKEW, 1.25);
  });
});

// ── RE-T5 smoke test — between-iteration refusal path ───────────────────────

describe("smoke: 80% CTX_PCT between-iteration refusal (RE-T5)", () => {
  it("gsd-t-wave at 80% with 5 remaining tasks → refusal + headless", () => {
    writeState(80);
    const r = estimateRunway({
      command: "gsd-t-wave",
      domain_type: "bin-script",
      remaining_tasks: 5,
      projectDir: tmpDir,
    });
    assert.equal(r.can_start, false);
    assert.equal(r.recommendation, "headless");
    assert.equal(r.current_pct, 80);
    // Sonnet-default fallback at low confidence: 80 + 4*5*1.25 = 80 + 25 = 105
    assert.equal(r.projected_end_pct, 105);
  });
});
