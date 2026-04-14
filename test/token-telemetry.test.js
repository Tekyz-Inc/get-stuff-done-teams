/**
 * Tests for bin/token-telemetry.js
 * Uses Node.js built-in test runner (node --test)
 *
 * v1.0.0 (M35): frozen 18-field schema per token-telemetry-contract.md v1.0.0.
 * These are the initial 8 tests from token-telemetry Task 2 AC; an additional
 * ~7 tests for the `gsd-t metrics --tokens` CLI output land in Task 4.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  recordSpawn,
  readAll,
  aggregate,
  REQUIRED_FIELDS,
} = require("../bin/token-telemetry.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tt-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean the jsonl file and .gsd-t dir between tests.
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) {
    fs.rmSync(gsd, { recursive: true, force: true });
  }
});

/** Build a valid record with sensible defaults; override via `overrides`. */
function makeRecord(overrides = {}) {
  return {
    timestamp: "2026-04-14T22:45:12Z",
    milestone: "M35",
    command: "gsd-t-execute",
    phase: "execute",
    step: "Step 2",
    domain: "m35-token-telemetry",
    domain_type: "bin-script",
    task: "T2",
    model: "sonnet",
    duration_s: 47,
    input_tokens_before: 43210,
    input_tokens_after: 51890,
    tokens_consumed: 8680,
    context_window_pct_before: 21.6,
    context_window_pct_after: 25.9,
    outcome: "success",
    halt_type: null,
    escalated_via_advisor: false,
    ...overrides,
  };
}

// ── Schema ─────────────────────────────────────────────────────────────────

describe("token-telemetry schema", () => {
  it("exports all 18 required fields", () => {
    assert.equal(REQUIRED_FIELDS.length, 18);
    // Spot-check a few frozen field names.
    assert.ok(REQUIRED_FIELDS.includes("timestamp"));
    assert.ok(REQUIRED_FIELDS.includes("tokens_consumed"));
    assert.ok(REQUIRED_FIELDS.includes("halt_type"));
    assert.ok(REQUIRED_FIELDS.includes("escalated_via_advisor"));
  });
});

// ── recordSpawn — happy path ───────────────────────────────────────────────

describe("recordSpawn", () => {
  it("writes a valid record as one JSONL line", () => {
    recordSpawn(makeRecord(), tmpDir);
    const fp = path.join(tmpDir, ".gsd-t", "token-metrics.jsonl");
    assert.ok(fs.existsSync(fp));
    const contents = fs.readFileSync(fp, "utf8");
    const lines = contents.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.milestone, "M35");
    assert.equal(parsed.tokens_consumed, 8680);
    assert.equal(parsed.halt_type, null);
  });

  it("creates .gsd-t/ and token-metrics.jsonl on first write", () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tt-fresh-"));
    // No .gsd-t/ directory exists yet — recordSpawn must create it.
    recordSpawn(makeRecord(), freshDir);
    assert.ok(fs.existsSync(path.join(freshDir, ".gsd-t")));
    assert.ok(fs.existsSync(path.join(freshDir, ".gsd-t", "token-metrics.jsonl")));
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  it("appends — repeated calls do not overwrite prior records", () => {
    recordSpawn(makeRecord({ task: "T1" }), tmpDir);
    recordSpawn(makeRecord({ task: "T2" }), tmpDir);
    recordSpawn(makeRecord({ task: "T3" }), tmpDir);
    const records = readAll(tmpDir);
    assert.equal(records.length, 3);
    assert.deepEqual(
      records.map((r) => r.task),
      ["T1", "T2", "T3"],
    );
  });

  it("rejects a record missing a required field", () => {
    const bad = makeRecord();
    delete bad.tokens_consumed;
    assert.throws(
      () => recordSpawn(bad, tmpDir),
      /missing required field: tokens_consumed/,
    );
  });
});

// ── readAll ────────────────────────────────────────────────────────────────

describe("readAll", () => {
  it("returns [] when .gsd-t/token-metrics.jsonl is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tt-empty-"));
    const records = readAll(emptyDir);
    assert.deepEqual(records, []);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("parses all records from a populated file", () => {
    recordSpawn(makeRecord({ task: "T1", tokens_consumed: 100 }), tmpDir);
    recordSpawn(makeRecord({ task: "T2", tokens_consumed: 200 }), tmpDir);
    const records = readAll(tmpDir);
    assert.equal(records.length, 2);
    assert.equal(records[0].tokens_consumed, 100);
    assert.equal(records[1].tokens_consumed, 200);
  });
});

// ── aggregate ──────────────────────────────────────────────────────────────

describe("aggregate", () => {
  it("groups by model and returns count/total/mean/median/p95", () => {
    recordSpawn(makeRecord({ model: "sonnet", tokens_consumed: 1000 }), tmpDir);
    recordSpawn(makeRecord({ model: "sonnet", tokens_consumed: 2000 }), tmpDir);
    recordSpawn(makeRecord({ model: "opus", tokens_consumed: 5000 }), tmpDir);
    const records = readAll(tmpDir);
    const groups = aggregate(records, { by: ["model"] });
    assert.equal(groups.length, 2);
    const sonnet = groups.find((g) => g.key.model === "sonnet");
    const opus = groups.find((g) => g.key.model === "opus");
    assert.equal(sonnet.count, 2);
    assert.equal(sonnet.total_tokens, 3000);
    assert.equal(sonnet.mean, 1500);
    assert.equal(opus.count, 1);
    assert.equal(opus.total_tokens, 5000);
    assert.equal(opus.mean, 5000);
  });

  it("groups by command", () => {
    recordSpawn(makeRecord({ command: "gsd-t-execute", tokens_consumed: 1000 }), tmpDir);
    recordSpawn(makeRecord({ command: "gsd-t-execute", tokens_consumed: 3000 }), tmpDir);
    recordSpawn(makeRecord({ command: "gsd-t-wave", tokens_consumed: 500 }), tmpDir);
    const records = readAll(tmpDir);
    const groups = aggregate(records, { by: ["command"] });
    assert.equal(groups.length, 2);
    const exec = groups.find((g) => g.key.command === "gsd-t-execute");
    const wave = groups.find((g) => g.key.command === "gsd-t-wave");
    assert.equal(exec.count, 2);
    assert.equal(exec.total_tokens, 4000);
    assert.equal(wave.count, 1);
    assert.equal(wave.total_tokens, 500);
  });
});
