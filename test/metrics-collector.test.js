/**
 * Tests for bin/metrics-collector.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  collectTaskMetrics,
  readTaskMetrics,
  getPreFlightWarnings,
} = require("../bin/metrics-collector.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-metrics-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t", "metrics"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function validData(overrides = {}) {
  return {
    milestone: "M25",
    domain: "metrics-collection",
    task: "task-1",
    command: "execute",
    duration_s: 42,
    tokens_used: 5000,
    context_pct: 35.2,
    pass: true,
    fix_cycles: 0,
    signal_type: "pass-through",
    notes: "test record",
    ...overrides,
  };
}

// ── collectTaskMetrics ───────────────────────────────────────────────────────

describe("collectTaskMetrics", () => {
  it("writes valid JSONL line matching schema", () => {
    const record = collectTaskMetrics(validData(), tmpDir);
    assert.equal(record.milestone, "M25");
    assert.equal(record.signal_weight, 1.0);
    assert.ok(record.ts);
    const filePath = path.join(tmpDir, ".gsd-t", "metrics", "task-metrics.jsonl");
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    assert.ok(lines.length >= 1);
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert.equal(parsed.milestone, "M25");
  });

  it("auto-derives signal_weight from signal_type", () => {
    const record = collectTaskMetrics(validData({ signal_type: "fix-cycle" }), tmpDir);
    assert.equal(record.signal_weight, -0.5);
  });

  it("rejects missing required fields", () => {
    assert.throws(() => collectTaskMetrics({ milestone: "M25" }, tmpDir), /Missing required field/);
  });

  it("rejects invalid signal_type", () => {
    assert.throws(
      () => collectTaskMetrics(validData({ signal_type: "invalid" }), tmpDir),
      /Invalid signal_type/
    );
  });

  it("rejects negative duration_s", () => {
    assert.throws(
      () => collectTaskMetrics(validData({ duration_s: -1 }), tmpDir),
      /duration_s/
    );
  });

  it("rejects context_pct > 100", () => {
    assert.throws(
      () => collectTaskMetrics(validData({ context_pct: 101 }), tmpDir),
      /context_pct/
    );
  });

  it("rejects negative fix_cycles", () => {
    assert.throws(
      () => collectTaskMetrics(validData({ fix_cycles: -1 }), tmpDir),
      /fix_cycles/
    );
  });

  it("creates .gsd-t/metrics/ directory on first write", () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-fresh-"));
    collectTaskMetrics(validData(), freshDir);
    const filePath = path.join(freshDir, ".gsd-t", "metrics", "task-metrics.jsonl");
    assert.ok(fs.existsSync(filePath));
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it("signal_weight matches for all 5 signal types", () => {
    const expected = {
      "pass-through": 1.0,
      "fix-cycle": -0.5,
      "debug-invoked": -0.8,
      "user-correction": -1.0,
      "phase-skip": 0.3,
    };
    for (const [type, weight] of Object.entries(expected)) {
      const record = collectTaskMetrics(validData({ signal_type: type }), tmpDir);
      assert.equal(record.signal_weight, weight, `${type} should map to ${weight}`);
    }
  });
});

// ── readTaskMetrics ──────────────────────────────────────────────────────────

describe("readTaskMetrics", () => {
  it("returns empty array when file does not exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-empty-"));
    const result = readTaskMetrics({}, emptyDir);
    assert.deepEqual(result, []);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("filters by domain", () => {
    const result = readTaskMetrics({ domain: "metrics-collection" }, tmpDir);
    assert.ok(result.length > 0);
    result.forEach((r) => assert.equal(r.domain, "metrics-collection"));
  });

  it("filters by milestone", () => {
    const result = readTaskMetrics({ milestone: "M25" }, tmpDir);
    assert.ok(result.length > 0);
    result.forEach((r) => assert.equal(r.milestone, "M25"));
  });

  it("returns all records when no filters", () => {
    const result = readTaskMetrics({}, tmpDir);
    assert.ok(result.length > 0);
  });
});

// ── getPreFlightWarnings ─────────────────────────────────────────────────────

describe("getPreFlightWarnings", () => {
  it("returns empty array for unknown domain", () => {
    const warnings = getPreFlightWarnings("nonexistent-domain", tmpDir);
    assert.deepEqual(warnings, []);
  });

  it("returns first_pass_rate warning when rate < 0.6", () => {
    const failDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-fail-"));
    // Write 10 records with 5 failures (50% pass rate)
    for (let i = 0; i < 10; i++) {
      collectTaskMetrics(
        validData({
          domain: "failing-domain",
          task: `task-${i}`,
          pass: i < 5,
          signal_type: i < 5 ? "pass-through" : "fix-cycle",
          fix_cycles: i < 5 ? 0 : 1,
        }),
        failDir
      );
    }
    const warnings = getPreFlightWarnings("failing-domain", failDir);
    assert.ok(warnings.some((w) => w.includes("first-pass rate")));
    fs.rmSync(failDir, { recursive: true, force: true });
  });

  it("returns fix_cycles warning when avg > 2.0", () => {
    const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-fix-"));
    for (let i = 0; i < 5; i++) {
      collectTaskMetrics(
        validData({
          domain: "fix-heavy",
          task: `task-${i}`,
          pass: true,
          fix_cycles: 3,
          signal_type: "fix-cycle",
        }),
        fixDir
      );
    }
    const warnings = getPreFlightWarnings("fix-heavy", fixDir);
    assert.ok(warnings.some((w) => w.includes("fix cycles")));
    fs.rmSync(fixDir, { recursive: true, force: true });
  });

  it("returns no warnings for healthy domain", () => {
    const healthyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-healthy-"));
    for (let i = 0; i < 5; i++) {
      collectTaskMetrics(
        validData({ domain: "healthy", task: `task-${i}` }),
        healthyDir
      );
    }
    const warnings = getPreFlightWarnings("healthy", healthyDir);
    assert.deepEqual(warnings, []);
    fs.rmSync(healthyDir, { recursive: true, force: true });
  });
});
