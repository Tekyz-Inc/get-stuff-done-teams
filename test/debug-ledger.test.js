/**
 * Tests for bin/debug-ledger.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  readLedger,
  appendEntry,
  compactLedger,
  generateAntiRepetitionPreamble,
  getLedgerStats,
  clearLedger,
} = require("../bin/debug-ledger.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-debug-ledger-test-"));
}

function ledgerFile(projectDir) {
  return path.join(projectDir, ".gsd-t", "debug-state.jsonl");
}

function validEntry(overrides = {}) {
  return {
    iteration: 1,
    timestamp: "2026-03-24T00:00:00.000Z",
    test: "test/example.test.js",
    error: "AssertionError: expected 1 to equal 2",
    hypothesis: "Off-by-one in counter",
    fix: "Increment counter before return",
    fixFiles: ["bin/counter.js"],
    result: "PASS",
    learning: "Counter was incremented after instead of before the check",
    model: "sonnet",
    duration: 42,
    ...overrides,
  };
}

// ── readLedger ────────────────────────────────────────────────────────────────

describe("readLedger", () => {
  it("returns empty array when file does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      const entries = readLedger(tmpDir);
      assert.deepEqual(entries, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array for an empty file", () => {
    const tmpDir = makeTmpDir();
    try {
      const gsdDir = path.join(tmpDir, ".gsd-t");
      fs.mkdirSync(gsdDir, { recursive: true });
      fs.writeFileSync(ledgerFile(tmpDir), "");
      const entries = readLedger(tmpDir);
      assert.deepEqual(entries, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns parsed entries from a valid file", () => {
    const tmpDir = makeTmpDir();
    try {
      const entry1 = validEntry({ iteration: 1 });
      const entry2 = validEntry({ iteration: 2, result: "STILL_FAILS" });
      const gsdDir = path.join(tmpDir, ".gsd-t");
      fs.mkdirSync(gsdDir, { recursive: true });
      fs.writeFileSync(
        ledgerFile(tmpDir),
        JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n"
      );
      const entries = readLedger(tmpDir);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].iteration, 1);
      assert.equal(entries[1].iteration, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips malformed (non-JSON) lines gracefully", () => {
    const tmpDir = makeTmpDir();
    try {
      const good = validEntry({ iteration: 1 });
      const gsdDir = path.join(tmpDir, ".gsd-t");
      fs.mkdirSync(gsdDir, { recursive: true });
      fs.writeFileSync(
        ledgerFile(tmpDir),
        "not valid json\n" + JSON.stringify(good) + "\n{broken\n"
      );
      const entries = readLedger(tmpDir);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].iteration, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns only the valid entry when all lines are malformed", () => {
    const tmpDir = makeTmpDir();
    try {
      const gsdDir = path.join(tmpDir, ".gsd-t");
      fs.mkdirSync(gsdDir, { recursive: true });
      fs.writeFileSync(ledgerFile(tmpDir), "garbage\n{broken\n!!!\n");
      const entries = readLedger(tmpDir);
      assert.deepEqual(entries, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── appendEntry ───────────────────────────────────────────────────────────────

describe("appendEntry", () => {
  it("creates the ledger file if it does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      assert.ok(fs.existsSync(ledgerFile(tmpDir)));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates parent directories if they do not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      // Do not pre-create .gsd-t/
      appendEntry(tmpDir, validEntry());
      assert.ok(fs.existsSync(ledgerFile(tmpDir)));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("appends a valid entry as a JSON line", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ iteration: 1 }));
      appendEntry(tmpDir, validEntry({ iteration: 2 }));
      const entries = readLedger(tmpDir);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].iteration, 1);
      assert.equal(entries[1].iteration, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when a required field is missing", () => {
    const tmpDir = makeTmpDir();
    try {
      const bad = validEntry();
      delete bad.hypothesis;
      assert.throws(() => appendEntry(tmpDir, bad), /Missing required field: hypothesis/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when iteration is not a number", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.throws(
        () => appendEntry(tmpDir, validEntry({ iteration: "one" })),
        /iteration must be a number/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when duration is not a number", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.throws(
        () => appendEntry(tmpDir, validEntry({ duration: "fast" })),
        /duration must be a number/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when fixFiles is not an array", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.throws(
        () => appendEntry(tmpDir, validEntry({ fixFiles: "bin/foo.js" })),
        /fixFiles must be an array/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when result is not PASS or STILL_FAILS", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.throws(
        () => appendEntry(tmpDir, validEntry({ result: "UNKNOWN" })),
        /result must be "PASS" or "STILL_FAILS"/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts STILL_FAILS as a valid result", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.doesNotThrow(() => appendEntry(tmpDir, validEntry({ result: "STILL_FAILS" })));
      const entries = readLedger(tmpDir);
      assert.equal(entries[0].result, "STILL_FAILS");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts an empty fixFiles array", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.doesNotThrow(() => appendEntry(tmpDir, validEntry({ fixFiles: [] })));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when entry is not an object", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.throws(() => appendEntry(tmpDir, null), /Entry must be an object/);
      assert.throws(() => appendEntry(tmpDir, "string"), /Entry must be an object/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── compactLedger ─────────────────────────────────────────────────────────────

describe("compactLedger", () => {
  it("preserves the last 5 entries and adds a compacted summary entry", () => {
    const tmpDir = makeTmpDir();
    try {
      // Write 8 entries
      for (let i = 1; i <= 8; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i, result: i < 8 ? "STILL_FAILS" : "PASS" }));
      }
      compactLedger(tmpDir, "Summary of 8 iterations");
      const entries = readLedger(tmpDir);
      // 1 compacted entry + last 5 original entries = 6 total
      assert.equal(entries.length, 6);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("first entry after compaction has compacted=true", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 7; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Compacted summary");
      const entries = readLedger(tmpDir);
      assert.equal(entries[0].compacted, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("compacted entry contains the provided summary in learning field", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 6; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Root cause was missing null check");
      const entries = readLedger(tmpDir);
      assert.equal(entries[0].learning, "Root cause was missing null check");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves exactly the last 5 entries (iteration numbers match)", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 10; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Summary");
      const entries = readLedger(tmpDir);
      // entries[0] is compacted, entries[1..5] are iterations 6..10
      const preserved = entries.slice(1).map((e) => e.iteration);
      assert.deepEqual(preserved, [6, 7, 8, 9, 10]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("works when ledger has exactly 5 entries (no compaction needed but still runs)", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 5; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Summary of 5");
      const entries = readLedger(tmpDir);
      // 1 compacted + 5 tail = 6
      assert.equal(entries.length, 6);
      assert.equal(entries[0].compacted, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("works when ledger has fewer than 5 entries", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 3; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Short summary");
      const entries = readLedger(tmpDir);
      // 1 compacted + 3 tail = 4
      assert.equal(entries.length, 4);
      assert.equal(entries[0].compacted, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("replaces the file contents entirely (does not append)", () => {
    const tmpDir = makeTmpDir();
    try {
      for (let i = 1; i <= 8; i++) {
        appendEntry(tmpDir, validEntry({ iteration: i }));
      }
      compactLedger(tmpDir, "Summary");
      compactLedger(tmpDir, "Second compact");
      const entries = readLedger(tmpDir);
      // After second compaction: 1 compacted + last 5 of (1 compacted + 5 tail) = 6
      assert.ok(entries.length <= 7, "Should not grow unboundedly after double compaction");
      assert.equal(entries[0].compacted, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── generateAntiRepetitionPreamble ────────────────────────────────────────────

describe("generateAntiRepetitionPreamble", () => {
  it("returns empty string when ledger is empty", () => {
    const tmpDir = makeTmpDir();
    try {
      const result = generateAntiRepetitionPreamble(tmpDir);
      assert.equal(result, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty string when file does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      const result = generateAntiRepetitionPreamble(tmpDir);
      assert.equal(result, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes the mandatory header line", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ result: "STILL_FAILS" }));
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(
        preamble.includes("## Debug Ledger Context (DO NOT retry failed approaches)"),
        "Must include mandatory header"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("lists failed hypotheses with iteration numbers", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(
        tmpDir,
        validEntry({ iteration: 1, hypothesis: "Bad cache key", result: "STILL_FAILS" })
      );
      appendEntry(
        tmpDir,
        validEntry({ iteration: 2, hypothesis: "Race condition", result: "STILL_FAILS" })
      );
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(preamble.includes("Bad cache key"), "Should list first hypothesis");
      assert.ok(preamble.includes("Race condition"), "Should list second hypothesis");
      assert.ok(preamble.includes("[iteration 1]"), "Should include iteration number");
      assert.ok(preamble.includes("[iteration 2]"), "Should include iteration number");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("shows (none yet) when there are no failed hypotheses", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ result: "PASS" }));
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(preamble.includes("(none yet)"), "Should show (none yet) for no failures");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses last non-compacted learning for narrowing direction", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(
        tmpDir,
        validEntry({ iteration: 1, learning: "First learning", result: "STILL_FAILS" })
      );
      appendEntry(
        tmpDir,
        validEntry({ iteration: 2, learning: "Most recent learning", result: "STILL_FAILS" })
      );
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(
        preamble.includes("Most recent learning"),
        "Should use the last learning as direction"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("shows fallback direction message when no learnings exist", () => {
    const tmpDir = makeTmpDir();
    try {
      // Empty learning field — but still needs to be provided
      appendEntry(tmpDir, validEntry({ learning: "", result: "STILL_FAILS" }));
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(
        preamble.includes("No narrowing direction established yet."),
        "Should show fallback when no learnings"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes Tests Still Failing section", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(
        tmpDir,
        validEntry({
          test: "test/auth.test.js",
          error: "Expected 200 got 401",
          result: "STILL_FAILS",
        })
      );
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(preamble.includes("### Tests Still Failing:"), "Should have section header");
      assert.ok(preamble.includes("test/auth.test.js"), "Should list the failing test");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("shows (none recorded) in Tests Still Failing when all passed", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ result: "PASS" }));
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(
        preamble.includes("(none recorded)"),
        "Should show (none recorded) when no failures"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles mixed pass/fail entries correctly", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(
        tmpDir,
        validEntry({ iteration: 1, hypothesis: "Wrong approach", result: "STILL_FAILS" })
      );
      appendEntry(tmpDir, validEntry({ iteration: 2, result: "PASS" }));
      appendEntry(
        tmpDir,
        validEntry({ iteration: 3, hypothesis: "Another miss", result: "STILL_FAILS" })
      );
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(preamble.includes("Wrong approach"), "Should list failed hypothesis 1");
      assert.ok(preamble.includes("Another miss"), "Should list failed hypothesis 3");
      // PASS entries do not appear in failed section
      assert.ok(!preamble.includes("[iteration 2]"), "PASS entry should not be in failed list");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes all required sections in the preamble", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ result: "STILL_FAILS" }));
      const preamble = generateAntiRepetitionPreamble(tmpDir);
      assert.ok(preamble.includes("### Failed Hypotheses"), "Should have Failed Hypotheses section");
      assert.ok(
        preamble.includes("### Current Narrowing Direction:"),
        "Should have Narrowing Direction section"
      );
      assert.ok(
        preamble.includes("### Tests Still Failing:"),
        "Should have Tests Still Failing section"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── getLedgerStats ────────────────────────────────────────────────────────────

describe("getLedgerStats", () => {
  it("returns zero stats when file does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.entryCount, 0);
      assert.equal(stats.sizeBytes, 0);
      assert.equal(stats.needsCompaction, false);
      assert.deepEqual(stats.failedHypotheses, []);
      assert.equal(stats.passCount, 0);
      assert.equal(stats.failCount, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns correct entryCount", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ iteration: 1 }));
      appendEntry(tmpDir, validEntry({ iteration: 2 }));
      appendEntry(tmpDir, validEntry({ iteration: 3 }));
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.entryCount, 3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns correct passCount and failCount", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry({ iteration: 1, result: "PASS" }));
      appendEntry(tmpDir, validEntry({ iteration: 2, result: "STILL_FAILS" }));
      appendEntry(tmpDir, validEntry({ iteration: 3, result: "STILL_FAILS" }));
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.passCount, 1);
      assert.equal(stats.failCount, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns correct failedHypotheses list", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(
        tmpDir,
        validEntry({ iteration: 1, hypothesis: "Hypothesis A", result: "STILL_FAILS" })
      );
      appendEntry(
        tmpDir,
        validEntry({ iteration: 2, hypothesis: "Hypothesis B", result: "STILL_FAILS" })
      );
      appendEntry(tmpDir, validEntry({ iteration: 3, hypothesis: "Hypothesis C", result: "PASS" }));
      const stats = getLedgerStats(tmpDir);
      assert.deepEqual(stats.failedHypotheses, ["Hypothesis A", "Hypothesis B"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("needsCompaction is false when file is below 51200 bytes", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.needsCompaction, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("needsCompaction is true when file exceeds 51200 bytes", () => {
    const tmpDir = makeTmpDir();
    try {
      // Write a file just over the 51200-byte threshold
      const gsdDir = path.join(tmpDir, ".gsd-t");
      fs.mkdirSync(gsdDir, { recursive: true });
      const bigLine = JSON.stringify(validEntry({ learning: "x".repeat(2000) })) + "\n";
      let content = "";
      while (content.length <= 51200) {
        content += bigLine;
      }
      fs.writeFileSync(ledgerFile(tmpDir), content);
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.needsCompaction, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sizeBytes matches actual file size", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      const stats = getLedgerStats(tmpDir);
      const actualSize = fs.statSync(ledgerFile(tmpDir)).size;
      assert.equal(stats.sizeBytes, actualSize);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── clearLedger ───────────────────────────────────────────────────────────────

describe("clearLedger", () => {
  it("removes the ledger file when it exists", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      assert.ok(fs.existsSync(ledgerFile(tmpDir)), "Precondition: file must exist");
      clearLedger(tmpDir);
      assert.ok(!fs.existsSync(ledgerFile(tmpDir)), "File should be deleted");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("is a no-op when the file does not exist", () => {
    const tmpDir = makeTmpDir();
    try {
      assert.doesNotThrow(() => clearLedger(tmpDir));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves directory structure intact after clearing", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      clearLedger(tmpDir);
      const gsdDir = path.join(tmpDir, ".gsd-t");
      assert.ok(fs.existsSync(gsdDir), ".gsd-t directory should still exist");
      assert.ok(!fs.existsSync(ledgerFile(tmpDir)), "Only the file should be removed");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("after clear, readLedger returns empty array", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      clearLedger(tmpDir);
      const entries = readLedger(tmpDir);
      assert.deepEqual(entries, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("after clear, getLedgerStats shows zeros", () => {
    const tmpDir = makeTmpDir();
    try {
      appendEntry(tmpDir, validEntry());
      clearLedger(tmpDir);
      const stats = getLedgerStats(tmpDir);
      assert.equal(stats.entryCount, 0);
      assert.equal(stats.sizeBytes, 0);
      assert.equal(stats.needsCompaction, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
