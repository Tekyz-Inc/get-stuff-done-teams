/**
 * Tests for bin/qa-calibrator.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  logMiss, getCategoryMissRates, getWeakSpots,
  generateQAInjection, getPersistentWeakSpots,
} = require("../bin/qa-calibrator.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qa-cal-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t", "metrics"), { recursive: true });
});

after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function missLogPath() {
  return path.join(tmpDir, ".gsd-t", "metrics", "qa-miss-log.jsonl");
}

function clearMissLog() {
  const fp = missLogPath();
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

function writeMisses(records) {
  clearMissLog();
  fs.writeFileSync(missLogPath(), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function makeMiss(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    milestone: "M31",
    domain: "qa-calibrator",
    task: "task-1",
    category: "boundary-input",
    description: "missing null check",
    severity: "HIGH",
    red_team_finding_id: "rt-001",
    ...overrides,
  };
}

// ── logMiss ──────────────────────────────────────────────────────────────────

describe("logMiss", () => {
  it("writes a valid JSONL record to the miss log", () => {
    clearMissLog();
    const miss = makeMiss({ category: "error-path", description: "unhandled rejection" });
    logMiss(miss, tmpDir);
    const content = fs.readFileSync(missLogPath(), "utf8").trim();
    const parsed = JSON.parse(content);
    assert.equal(parsed.category, "error-path");
    assert.equal(parsed.description, "unhandled rejection");
    assert.ok(parsed.ts, "ts should be set");
  });

  it("appends multiple records (each line is valid JSON)", () => {
    clearMissLog();
    logMiss(makeMiss({ category: "boundary-input" }), tmpDir);
    logMiss(makeMiss({ category: "regression" }), tmpDir);
    const lines = fs.readFileSync(missLogPath(), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).category, "boundary-input");
    assert.equal(JSON.parse(lines[1]).category, "regression");
  });

  it("adds ts automatically if not supplied", () => {
    clearMissLog();
    const { ts: _ignored, ...missWithoutTs } = makeMiss();
    logMiss(missWithoutTs, tmpDir);
    const parsed = JSON.parse(fs.readFileSync(missLogPath(), "utf8").trim());
    assert.ok(parsed.ts, "ts should be injected");
  });

  it("creates .gsd-t/metrics directory if missing", () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qa-fresh-"));
    try {
      logMiss(makeMiss(), freshDir);
      const fp = path.join(freshDir, ".gsd-t", "metrics", "qa-miss-log.jsonl");
      assert.ok(fs.existsSync(fp));
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });
});

// ── getCategoryMissRates ──────────────────────────────────────────────────────

describe("getCategoryMissRates", () => {
  it("returns all 7 categories", () => {
    clearMissLog();
    const rates = getCategoryMissRates(5, tmpDir);
    assert.equal(rates.length, 7);
    const cats = rates.map((r) => r.category);
    assert.ok(cats.includes("boundary-input"));
    assert.ok(cats.includes("e2e-gap"));
  });

  it("returns zero rates when log is empty", () => {
    clearMissLog();
    const rates = getCategoryMissRates(5, tmpDir);
    rates.forEach((r) => {
      assert.equal(r.missRate, 0);
      assert.equal(r.qaMissed, 0);
    });
  });

  it("computes correct miss rate as fraction of total misses", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
    ]);
    const rates = getCategoryMissRates(5, tmpDir);
    const bi = rates.find((r) => r.category === "boundary-input");
    const ep = rates.find((r) => r.category === "error-path");
    // 2 boundary-input out of 4 total = 0.5
    assert.equal(bi.missRate, 0.5);
    assert.equal(bi.qaMissed, 2);
    // 2 error-path out of 4 total = 0.5
    assert.equal(ep.missRate, 0.5);
  });

  it("respects windowSize by limiting to recent milestones", () => {
    writeMisses([
      makeMiss({ milestone: "M28", category: "regression" }),
      makeMiss({ milestone: "M29", category: "regression" }),
      makeMiss({ milestone: "M30", category: "regression" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
    ]);
    // windowSize=1 — only most recent milestone M31
    const rates = getCategoryMissRates(1, tmpDir);
    const reg = rates.find((r) => r.category === "regression");
    const bi = rates.find((r) => r.category === "boundary-input");
    assert.equal(reg.qaMissed, 0);
    assert.equal(bi.qaMissed, 1);
  });

  it("returns empty log as zero rates when file missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qa-empty-"));
    try {
      const rates = getCategoryMissRates(5, emptyDir);
      assert.equal(rates.length, 7);
      rates.forEach((r) => assert.equal(r.missRate, 0));
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── getWeakSpots ──────────────────────────────────────────────────────────────

describe("getWeakSpots", () => {
  it("returns empty array when no weak spots", () => {
    clearMissLog();
    const spots = getWeakSpots(5, tmpDir);
    assert.equal(spots.length, 0);
  });

  it("returns categories with miss rate >30%", () => {
    // 4 boundary-input out of 5 total = 80% — above threshold
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
    ]);
    const spots = getWeakSpots(5, tmpDir);
    const cats = spots.map((s) => s.category);
    assert.ok(cats.includes("boundary-input"));
    // error-path: 1/5 = 20%, below threshold
    assert.ok(!cats.includes("error-path"));
  });

  it("does NOT include categories at exactly 30%", () => {
    // 3 boundary-input out of 10 total = exactly 30%
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "regression" }),
      makeMiss({ milestone: "M31", category: "regression" }),
      makeMiss({ milestone: "M31", category: "regression" }),
      makeMiss({ milestone: "M31", category: "e2e-gap" }),
    ]);
    const spots = getWeakSpots(5, tmpDir);
    // boundary-input: 3/10 = 0.30 exactly — NOT a weak spot (must be strictly >30%)
    const cats = spots.map((s) => s.category);
    assert.ok(!cats.includes("boundary-input"));
  });

  it("includes recentExamples from descriptions", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input", description: "null pointer" }),
      makeMiss({ milestone: "M31", category: "boundary-input", description: "empty string" }),
      makeMiss({ milestone: "M31", category: "boundary-input", description: "negative int" }),
    ]);
    const spots = getWeakSpots(5, tmpDir);
    assert.equal(spots.length, 1); // 3/3 = 100%
    assert.ok(spots[0].recentExamples.includes("null pointer"));
    assert.ok(spots[0].recentExamples.includes("empty string"));
  });
});

// ── generateQAInjection ───────────────────────────────────────────────────────

describe("generateQAInjection", () => {
  it("returns empty string when no weak spots", () => {
    clearMissLog();
    const result = generateQAInjection(5, tmpDir);
    assert.equal(result, "");
  });

  it("returns markdown with QA PRIORITY FOCUS AREAS header", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
    ]);
    const result = generateQAInjection(5, tmpDir);
    assert.ok(result.includes("## QA PRIORITY FOCUS AREAS (auto-calibrated)"));
  });

  it("includes the weak spot category and miss rate percentage", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "error-path" }),
    ]);
    const result = generateQAInjection(5, tmpDir);
    assert.ok(result.includes("**error-path**"));
    assert.ok(result.includes("% miss rate"));
  });

  it("includes closing motivational text", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "e2e-gap" }),
      makeMiss({ milestone: "M31", category: "e2e-gap" }),
    ]);
    const result = generateQAInjection(5, tmpDir);
    assert.ok(result.includes("Red Team most often finds bugs you missed"));
  });

  it("includes recent miss examples in the output", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input", description: "null check fail" }),
      makeMiss({ milestone: "M31", category: "boundary-input", description: "overflow bug" }),
    ]);
    const result = generateQAInjection(5, tmpDir);
    assert.ok(result.includes("null check fail") || result.includes("overflow bug"));
  });
});

// ── getPersistentWeakSpots ────────────────────────────────────────────────────

describe("getPersistentWeakSpots", () => {
  it("returns empty array when fewer than 3 milestones in log", () => {
    writeMisses([
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M32", category: "boundary-input" }),
    ]);
    const result = getPersistentWeakSpots(tmpDir);
    assert.equal(result.length, 0);
  });

  it("returns category present as weak spot in 3+ consecutive milestones", () => {
    // boundary-input is the only category in each milestone -> 100% miss rate each time
    writeMisses([
      makeMiss({ milestone: "M30", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
      makeMiss({ milestone: "M32", category: "boundary-input" }),
    ]);
    const result = getPersistentWeakSpots(tmpDir);
    const cats = result.map((r) => r.category);
    assert.ok(cats.includes("boundary-input"));
  });

  it("does NOT return category with only 2 consecutive milestones above threshold", () => {
    writeMisses([
      makeMiss({ milestone: "M30", category: "boundary-input" }),
      makeMiss({ milestone: "M30", category: "error-path" }),
      makeMiss({ milestone: "M31", category: "error-path" }), // boundary-input absent -> 0%
      makeMiss({ milestone: "M32", category: "boundary-input" }),
    ]);
    // boundary-input: M30 = 50% (above), M31 = 0% (breaks streak), M32 = 100% (above)
    // Max consecutive = 1 for boundary-input — does NOT qualify
    const result = getPersistentWeakSpots(tmpDir);
    const cats = result.map((r) => r.category);
    assert.ok(!cats.includes("boundary-input"));
  });

  it("returns empty array when log file is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qa-pers-"));
    try {
      const result = getPersistentWeakSpots(emptyDir);
      assert.equal(result.length, 0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("requires strictly consecutive milestones — reset after a miss-free milestone", () => {
    // 4 milestones: M28 above, M29 clean, M30 above, M31 above — max consecutive = 2 (M30-M31)
    writeMisses([
      makeMiss({ milestone: "M28", category: "boundary-input" }),
      makeMiss({ milestone: "M29", category: "error-path" }), // boundary-input at 0%
      makeMiss({ milestone: "M30", category: "boundary-input" }),
      makeMiss({ milestone: "M31", category: "boundary-input" }),
    ]);
    const result = getPersistentWeakSpots(tmpDir);
    const cats = result.map((r) => r.category);
    assert.ok(!cats.includes("boundary-input"), "streak broken at M29 — should not qualify");
  });
});
