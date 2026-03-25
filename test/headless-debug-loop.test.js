/**
 * Tests for headless debug-loop functions
 * Covers: parseDebugLoopFlags, getEscalationModel
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  parseDebugLoopFlags,
  getEscalationModel,
} = require("../bin/gsd-t.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-debug-loop-test-"));
}

function removeTempDir(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

// ─── parseDebugLoopFlags ──────────────────────────────────────────────────────

describe("parseDebugLoopFlags", () => {
  it("returns default values when no flags given", () => {
    const { flags, positional } = parseDebugLoopFlags([]);
    assert.equal(flags.maxIterations, 20);
    assert.equal(flags.testCmd, null);
    assert.equal(flags.fixScope, null);
    assert.equal(flags.json, false);
    assert.equal(flags.log, false);
    assert.deepStrictEqual(positional, []);
  });

  it("parses --max-iterations=N", () => {
    const { flags } = parseDebugLoopFlags(["--max-iterations=10"]);
    assert.equal(flags.maxIterations, 10);
  });

  it("parses --max-iterations=1 (minimum positive)", () => {
    const { flags } = parseDebugLoopFlags(["--max-iterations=1"]);
    assert.equal(flags.maxIterations, 1);
  });

  it("ignores --max-iterations=0 (invalid, keeps default)", () => {
    const { flags } = parseDebugLoopFlags(["--max-iterations=0"]);
    assert.equal(flags.maxIterations, 20);
  });

  it("ignores --max-iterations=-5 (invalid, keeps default)", () => {
    const { flags } = parseDebugLoopFlags(["--max-iterations=-5"]);
    assert.equal(flags.maxIterations, 20);
  });

  it("ignores --max-iterations=abc (NaN, keeps default)", () => {
    const { flags } = parseDebugLoopFlags(["--max-iterations=abc"]);
    assert.equal(flags.maxIterations, 20);
  });

  it("parses --test-cmd flag", () => {
    const { flags } = parseDebugLoopFlags(["--test-cmd=node --test"]);
    assert.equal(flags.testCmd, "node --test");
  });

  it("parses --fix-scope flag", () => {
    const { flags } = parseDebugLoopFlags(["--fix-scope=src/auth"]);
    assert.equal(flags.fixScope, "src/auth");
  });

  it("parses --json flag", () => {
    const { flags } = parseDebugLoopFlags(["--json"]);
    assert.equal(flags.json, true);
  });

  it("parses --log flag", () => {
    const { flags } = parseDebugLoopFlags(["--log"]);
    assert.equal(flags.log, true);
  });

  it("parses all flags combined", () => {
    const { flags, positional } = parseDebugLoopFlags([
      "--max-iterations=15",
      "--test-cmd=npm test",
      "--fix-scope=lib/",
      "--json",
      "--log",
    ]);
    assert.equal(flags.maxIterations, 15);
    assert.equal(flags.testCmd, "npm test");
    assert.equal(flags.fixScope, "lib/");
    assert.equal(flags.json, true);
    assert.equal(flags.log, true);
    assert.deepStrictEqual(positional, []);
  });

  it("collects unrecognized args as positional", () => {
    const { flags, positional } = parseDebugLoopFlags(["extra-arg", "--json", "another"]);
    assert.equal(flags.json, true);
    assert.deepStrictEqual(positional, ["extra-arg", "another"]);
  });

  it("returns separate flags and positional objects", () => {
    const result = parseDebugLoopFlags(["--max-iterations=5", "myarg"]);
    assert.ok(Object.hasOwn(result, "flags"), "result has flags key");
    assert.ok(Object.hasOwn(result, "positional"), "result has positional key");
  });

  it("empty --test-cmd= yields empty string (not null)", () => {
    const { flags } = parseDebugLoopFlags(["--test-cmd="]);
    assert.equal(flags.testCmd, "");
  });

  it("empty --fix-scope= yields empty string (not null)", () => {
    const { flags } = parseDebugLoopFlags(["--fix-scope="]);
    assert.equal(flags.fixScope, "");
  });
});

// ─── getEscalationModel ───────────────────────────────────────────────────────

describe("getEscalationModel", () => {
  it("returns sonnet for iteration 1 (lower bound of tier 1)", () => {
    assert.equal(getEscalationModel(1), "sonnet");
  });

  it("returns sonnet for iteration 3 (mid tier 1)", () => {
    assert.equal(getEscalationModel(3), "sonnet");
  });

  it("returns sonnet for iteration 5 (upper bound of tier 1)", () => {
    assert.equal(getEscalationModel(5), "sonnet");
  });

  it("returns opus for iteration 6 (lower bound of tier 2)", () => {
    assert.equal(getEscalationModel(6), "opus");
  });

  it("returns opus for iteration 10 (mid tier 2)", () => {
    assert.equal(getEscalationModel(10), "opus");
  });

  it("returns opus for iteration 15 (upper bound of tier 2)", () => {
    assert.equal(getEscalationModel(15), "opus");
  });

  it("returns null for iteration 16 (lower bound of stop tier)", () => {
    assert.equal(getEscalationModel(16), null);
  });

  it("returns null for iteration 18 (mid stop tier)", () => {
    assert.equal(getEscalationModel(18), null);
  });

  it("returns null for iteration 20 (default max iterations)", () => {
    assert.equal(getEscalationModel(20), null);
  });

  it("returns null for iteration beyond 20", () => {
    assert.equal(getEscalationModel(100), null);
  });
});

// ─── debugLedger integration via temp dirs ────────────────────────────────────

describe("debugLedger appendEntry integration", () => {
  let dir;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(dir);
  });

  it("appends a valid entry and reads it back", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const entry = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "assertion failed",
      hypothesis: "iteration-1",
      fix: "fixed the thing",
      fixFiles: [],
      result: "STILL_FAILS",
      learning: "it still broke",
      model: "sonnet",
      duration: 12,
    };
    debugLedger.appendEntry(dir, entry);
    const entries = debugLedger.readLedger(dir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].iteration, 1);
    assert.equal(entries[0].model, "sonnet");
    assert.equal(entries[0].result, "STILL_FAILS");
  });

  it("throws on missing required fields", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    assert.throws(() => {
      debugLedger.appendEntry(dir, { iteration: 1 });
    }, /missing required field/i);
  });

  it("throws when result is invalid", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const entry = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "",
      hypothesis: "h1",
      fix: "f1",
      fixFiles: [],
      result: "INVALID",
      learning: "l1",
      model: "sonnet",
      duration: 5,
    };
    assert.throws(() => {
      debugLedger.appendEntry(dir, entry);
    }, /result must be/i);
  });

  it("getLedgerStats returns correct entry count and pass/fail counts", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const base = {
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "",
      hypothesis: "h",
      fix: "f",
      fixFiles: [],
      learning: "l",
      model: "sonnet",
      duration: 5,
    };
    debugLedger.appendEntry(dir, { ...base, iteration: 1, result: "STILL_FAILS" });
    debugLedger.appendEntry(dir, { ...base, iteration: 2, result: "STILL_FAILS" });
    debugLedger.appendEntry(dir, { ...base, iteration: 3, result: "PASS" });
    const stats = debugLedger.getLedgerStats(dir);
    assert.equal(stats.entryCount, 3);
    assert.equal(stats.failCount, 2);
    assert.equal(stats.passCount, 1);
    assert.equal(stats.needsCompaction, false);
  });

  it("getLedgerStats returns empty stats when no ledger file", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const stats = debugLedger.getLedgerStats(dir);
    assert.equal(stats.entryCount, 0);
    assert.equal(stats.sizeBytes, 0);
    assert.equal(stats.needsCompaction, false);
    assert.deepStrictEqual(stats.failedHypotheses, []);
    assert.equal(stats.passCount, 0);
    assert.equal(stats.failCount, 0);
  });

  it("clearLedger removes the ledger file", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const entry = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "",
      hypothesis: "h1",
      fix: "f1",
      fixFiles: [],
      result: "PASS",
      learning: "done",
      model: "sonnet",
      duration: 3,
    };
    debugLedger.appendEntry(dir, entry);
    const ledgerFile = path.join(dir, ".gsd-t", "debug-state.jsonl");
    assert.ok(fs.existsSync(ledgerFile), "ledger file should exist after append");
    debugLedger.clearLedger(dir);
    assert.ok(!fs.existsSync(ledgerFile), "ledger file should not exist after clear");
  });

  it("clearLedger is a no-op when file does not exist", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    assert.doesNotThrow(() => debugLedger.clearLedger(dir));
  });

  it("compactLedger keeps last 5 entries and prepends compacted summary", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const base = {
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "err",
      hypothesis: "h",
      fix: "f",
      fixFiles: [],
      result: "STILL_FAILS",
      learning: "l",
      model: "sonnet",
      duration: 5,
    };
    for (let i = 1; i <= 8; i++) {
      debugLedger.appendEntry(dir, { ...base, iteration: i });
    }
    debugLedger.compactLedger(dir, "compacted summary text");
    const entries = debugLedger.readLedger(dir);
    // 1 compacted entry + last 5 = 6 total
    assert.equal(entries.length, 6);
    assert.equal(entries[0].compacted, true);
    assert.equal(entries[0].learning, "compacted summary text");
  });

  it("generateAntiRepetitionPreamble returns empty string when ledger is empty", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const preamble = debugLedger.generateAntiRepetitionPreamble(dir);
    assert.equal(preamble, "");
  });

  it("generateAntiRepetitionPreamble lists failed hypotheses from ledger", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const base = {
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "assertion at line 42",
      fix: "tried fixing x",
      fixFiles: [],
      result: "STILL_FAILS",
      learning: "x was not the cause",
      model: "sonnet",
      duration: 8,
    };
    debugLedger.appendEntry(dir, { ...base, iteration: 1, hypothesis: "hypothesis-1" });
    debugLedger.appendEntry(dir, { ...base, iteration: 2, hypothesis: "hypothesis-2" });
    const preamble = debugLedger.generateAntiRepetitionPreamble(dir);
    assert.ok(preamble.includes("hypothesis-1"), "preamble should mention hypothesis-1");
    assert.ok(preamble.includes("hypothesis-2"), "preamble should mention hypothesis-2");
    assert.ok(preamble.includes("DO NOT retry"), "preamble should contain anti-repetition instruction");
  });
});

// ─── needsCompaction trigger ──────────────────────────────────────────────────

describe("debugLedger needsCompaction trigger", () => {
  let dir;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(dir);
  });

  it("needsCompaction is false for small ledger", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    const entry = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      test: "node --test",
      error: "",
      hypothesis: "h1",
      fix: "f1",
      fixFiles: [],
      result: "STILL_FAILS",
      learning: "l1",
      model: "sonnet",
      duration: 5,
    };
    debugLedger.appendEntry(dir, entry);
    const stats = debugLedger.getLedgerStats(dir);
    assert.equal(stats.needsCompaction, false);
  });

  it("needsCompaction is true when ledger exceeds 50KB", () => {
    const debugLedger = require("../bin/debug-ledger.js");
    // Write directly — bypass validation to create bulk data fast
    const ledgerFile = path.join(dir, ".gsd-t", "debug-state.jsonl");
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    // Write >50KB of content
    const bigLine = JSON.stringify({
      iteration: 1, timestamp: new Date().toISOString(),
      test: "t", error: "e".repeat(1000), hypothesis: "h",
      fix: "f", fixFiles: [], result: "STILL_FAILS",
      learning: "l".repeat(1000), model: "sonnet", duration: 5,
    }) + "\n";
    let content = "";
    while (content.length < 52000) content += bigLine;
    fs.writeFileSync(ledgerFile, content);
    const stats = debugLedger.getLedgerStats(dir);
    assert.equal(stats.needsCompaction, true);
  });
});
