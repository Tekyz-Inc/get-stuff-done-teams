/**
 * Tests for bin/metrics-rollup.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  generateRollup,
  computeELO,
  runHeuristics,
  readRollups,
} = require("../bin/metrics-rollup.js");

const { collectTaskMetrics } = require("../bin/metrics-collector.js");

let tmpDir;

function seedTasks(dir, overrides = [], count = 5) {
  for (let i = 0; i < count; i++) {
    collectTaskMetrics({
      milestone: "M25",
      domain: "test-domain",
      task: `task-${i}`,
      command: "execute",
      duration_s: 30 + i * 10,
      tokens_used: 3000 + i * 500,
      context_pct: 25 + i * 5,
      pass: true,
      fix_cycles: 0,
      signal_type: "pass-through",
      notes: `test task ${i}`,
      ...(overrides[i] || {}),
    }, dir);
  }
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-rollup-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── computeELO ───────────────────────────────────────────────────────────────

describe("computeELO", () => {
  it("returns correct ELO for starting value 1000 with all-pass tasks", () => {
    const tasks = Array(5).fill({ signal_weight: 1.0 });
    const result = computeELO(1000, tasks);
    // actual = (5 + 5) / 10 = 1.0, expected = 0.5, delta = 0.5 * 32 = 16
    assert.equal(result, 1016);
  });

  it("returns correct ELO for mixed signals", () => {
    const tasks = [
      { signal_weight: 1.0 },
      { signal_weight: 1.0 },
      { signal_weight: -0.5 },
      { signal_weight: -0.5 },
      { signal_weight: 0.3 },
    ];
    const result = computeELO(1000, tasks);
    // sumWeights = 1.3, actual = (1.3+5)/(10) = 0.63
    // expected = 0.5, delta = 0.13 * 32 = 4.16
    assert.equal(result, 1004.16);
  });

  it("is deterministic — same input produces same output", () => {
    const tasks = [{ signal_weight: 1.0 }, { signal_weight: -0.8 }];
    const r1 = computeELO(1050, tasks);
    const r2 = computeELO(1050, tasks);
    assert.equal(r1, r2);
  });

  it("returns eloBefore when no tasks", () => {
    assert.equal(computeELO(1000, []), 1000);
  });

  it("handles ELO above 1000 correctly", () => {
    const tasks = Array(3).fill({ signal_weight: 1.0 });
    const result = computeELO(1100, tasks);
    assert.ok(typeof result === "number");
    assert.ok(result > 1100); // all pass should increase
  });
});

// ── runHeuristics ────────────────────────────────────────────────────────────

describe("runHeuristics", () => {
  it("detects first-pass-failure-spike when rate drops >15%", () => {
    const cur = { first_pass_rate: 0.4, total_fix_cycles: 5, total_tasks: 10, avg_duration_s: 50 };
    const prev = { first_pass_rate: 0.8, total_fix_cycles: 2, total_tasks: 10, avg_duration_s: 50 };
    const flags = runHeuristics(cur, prev, []);
    assert.ok(flags.some((f) => f.heuristic === "first-pass-failure-spike"));
    assert.ok(flags.some((f) => f.severity === "HIGH"));
  });

  it("detects rework-rate-anomaly when fix cycles >2x", () => {
    const cur = { first_pass_rate: 0.8, total_fix_cycles: 20, total_tasks: 10, avg_duration_s: 50 };
    const prev = { first_pass_rate: 0.8, total_fix_cycles: 5, total_tasks: 10, avg_duration_s: 50 };
    const flags = runHeuristics(cur, prev, []);
    assert.ok(flags.some((f) => f.heuristic === "rework-rate-anomaly"));
  });

  it("detects context-overflow-correlation when >30% failed tasks have high context", () => {
    const cur = { first_pass_rate: 0.5 };
    const tasks = [
      { pass: false, context_pct: 85 },
      { pass: false, context_pct: 90 },
      { pass: false, context_pct: 30 },
      { pass: true, context_pct: 50 },
    ];
    const flags = runHeuristics(cur, null, tasks);
    assert.ok(flags.some((f) => f.heuristic === "context-overflow-correlation"));
  });

  it("detects duration-regression when avg >2x previous", () => {
    const cur = { first_pass_rate: 0.8, total_fix_cycles: 2, total_tasks: 10, avg_duration_s: 200 };
    const prev = { first_pass_rate: 0.8, total_fix_cycles: 2, total_tasks: 10, avg_duration_s: 50 };
    const flags = runHeuristics(cur, prev, []);
    assert.ok(flags.some((f) => f.heuristic === "duration-regression"));
  });

  it("returns empty array when no anomalies", () => {
    const cur = { first_pass_rate: 0.8, total_fix_cycles: 2, total_tasks: 10, avg_duration_s: 50 };
    const prev = { first_pass_rate: 0.8, total_fix_cycles: 2, total_tasks: 10, avg_duration_s: 50 };
    const flags = runHeuristics(cur, prev, []);
    assert.deepEqual(flags, []);
  });

  it("returns empty when no previous rollup (only context-overflow checked)", () => {
    const cur = { first_pass_rate: 0.8 };
    const flags = runHeuristics(cur, null, [{ pass: true, context_pct: 30 }]);
    assert.deepEqual(flags, []);
  });
});

// ── generateRollup ───────────────────────────────────────────────────────────

describe("generateRollup", () => {
  it("produces valid rollup entry matching schema", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-gen-"));
    seedTasks(dir);
    const rollup = generateRollup("M25", "2.43.10", dir);
    assert.equal(rollup.milestone, "M25");
    assert.equal(rollup.version, "2.43.10");
    assert.equal(rollup.total_tasks, 5);
    assert.ok(rollup.first_pass_rate >= 0 && rollup.first_pass_rate <= 1);
    assert.ok(rollup.avg_duration_s > 0);
    assert.ok(rollup.elo_before === 1000);
    assert.ok(typeof rollup.elo_after === "number");
    assert.ok(Array.isArray(rollup.domain_breakdown));
    assert.ok(Array.isArray(rollup.heuristic_flags));
    assert.equal(rollup.trend_delta, null); // first milestone
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes to rollup.jsonl file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-gen2-"));
    seedTasks(dir);
    generateRollup("M25", "2.43.10", dir);
    const fp = path.join(dir, ".gsd-t", "metrics", "rollup.jsonl");
    assert.ok(fs.existsSync(fp));
    const lines = fs.readFileSync(fp, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("computes trend_delta for second milestone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-trend-"));
    seedTasks(dir);
    generateRollup("M25", "2.43.10", dir);
    // Seed M26 tasks
    for (let i = 0; i < 3; i++) {
      collectTaskMetrics({
        milestone: "M26", domain: "d2", task: `task-${i}`,
        command: "execute", duration_s: 20, tokens_used: 2000,
        context_pct: 20, pass: true, fix_cycles: 0,
        signal_type: "pass-through",
      }, dir);
    }
    const r2 = generateRollup("M26", "2.44.10", dir);
    assert.ok(r2.trend_delta !== null);
    assert.ok("first_pass_rate_delta" in r2.trend_delta);
    assert.ok("avg_duration_delta" in r2.trend_delta);
    assert.ok("elo_delta" in r2.trend_delta);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("domain_breakdown correctly groups by domain", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-dom-"));
    collectTaskMetrics({
      milestone: "M25", domain: "d1", task: "t1", command: "execute",
      duration_s: 30, tokens_used: 3000, context_pct: 25, pass: true,
      fix_cycles: 0, signal_type: "pass-through",
    }, dir);
    collectTaskMetrics({
      milestone: "M25", domain: "d2", task: "t2", command: "execute",
      duration_s: 40, tokens_used: 4000, context_pct: 35, pass: true,
      fix_cycles: 0, signal_type: "pass-through",
    }, dir);
    const rollup = generateRollup("M25", "2.43.10", dir);
    assert.equal(rollup.domain_breakdown.length, 2);
    const names = rollup.domain_breakdown.map((d) => d.domain).sort();
    assert.deepEqual(names, ["d1", "d2"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws when no task-metrics exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-empty-"));
    assert.throws(() => generateRollup("M99", "1.0.0", emptyDir), /No task-metrics/);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ── readRollups ──────────────────────────────────────────────────────────────

describe("readRollups", () => {
  it("returns empty array when file does not exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-norollup-"));
    const result = readRollups({}, emptyDir);
    assert.deepEqual(result, []);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("filters by milestone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-readrollup-"));
    seedTasks(dir);
    generateRollup("M25", "2.43.10", dir);
    const result = readRollups({ milestone: "M25" }, dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].milestone, "M25");
    const empty = readRollups({ milestone: "M99" }, dir);
    assert.equal(empty.length, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
