/**
 * Regression test: `mapHeadlessExitCode` must match terminal markers,
 * not free-form narration.
 *
 * Bug history (M45, 2026-04-23):
 *   The pre-fix matcher did `lower.includes("tests failed")`, which fires on
 *   narration like "0 tests failed" or "the test suite reports tests failed".
 *   During the M45 worker run, the string "tests failed" appeared 6× in
 *   healthy output, flipping the worker's exit code 0 → 1 and halting the
 *   supervisor with a false-failed marker.
 *
 * Contract: every heuristic substring matcher must require either a non-zero
 * numeric count, a structured prefix (FAIL:, Tests: N failed), or a
 * line-boundary / sentence-start anchor for free-form phrases.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mapHeadlessExitCode } = require("../bin/headless-exit-codes.cjs");

describe("mapHeadlessExitCode — polarity discipline", () => {
  describe("'tests failed' must not fire on narration", () => {
    it("returns 0 on '0 tests failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "Summary: 0 tests failed"), 0);
    });

    it("returns 0 on 'no tests failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "Great news — no tests failed."), 0);
    });

    it("returns 0 on narrative mention of 'tests failed'", () => {
      const narrative =
        "The documentation explains how the runner reports tests failed " +
        "versus tests passed. Currently 0 tests failed.";
      assert.equal(mapHeadlessExitCode(0, narrative), 0);
    });

    it("returns 0 on quoted 'tests failed' as an example", () => {
      const quoted =
        "Legacy check message was 'tests failed' but we replaced it.";
      assert.equal(mapHeadlessExitCode(0, quoted), 0);
    });

    it("reproduces the M45 regression (6× occurrences, all narration)", () => {
      const m45Narration = [
        "Run summary: 0 tests failed.",
        "We previously had tests failed messaging in the worker.",
        "The phrase 'tests failed' triggered a false positive.",
        "After the fix, 0 tests failed.",
        "Documentation now clarifies when tests failed fires.",
        "Final count: 0 tests failed, 1935 tests passed.",
      ].join("\n");
      assert.equal(mapHeadlessExitCode(0, m45Narration), 0);
    });
  });

  describe("'tests failed' still fires on genuine failures", () => {
    it("returns 1 on '1 test failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "1 test failed"), 1);
    });

    it("returns 1 on '3 tests failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "Output: 3 tests failed."), 1);
    });

    it("returns 1 on '7 specs failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "Result: 7 specs failed"), 1);
    });

    it("returns 1 on '2 suites failed'", () => {
      assert.equal(mapHeadlessExitCode(0, "2 suites failed, 5 passed"), 1);
    });

    it("returns 1 on structured 'FAIL src/foo.test.js'", () => {
      assert.equal(
        mapHeadlessExitCode(0, "FAIL src/foo.test.js — assertion error"),
        1,
      );
    });

    it("returns 1 on Jest-style 'Tests: 5 failed, 10 passed'", () => {
      assert.equal(
        mapHeadlessExitCode(
          0,
          "Running suite...\nTests: 5 failed, 10 passed\nDone.",
        ),
        1,
      );
    });
  });

  describe("verification phrases polarity", () => {
    it("returns 0 on narrative mention of 'verification failed'", () => {
      const narrative =
        "Before the fix, when verification failed the supervisor " +
        "would halt. We changed that behavior.";
      // Mid-sentence "when verification failed" — but prose starts with
      // "Before". The phrase "verification failed" is not at a sentence
      // boundary. Should not fire.
      assert.equal(mapHeadlessExitCode(0, narrative), 0);
    });

    it("returns 1 when verification failed is at start of line", () => {
      assert.equal(
        mapHeadlessExitCode(0, "verification failed — quality gate"),
        1,
      );
    });

    it("returns 1 when verification failed follows sentence punctuation", () => {
      assert.equal(
        mapHeadlessExitCode(
          0,
          "Ran quality gate. verification failed on suite 3.",
        ),
        1,
      );
    });

    it("returns 1 on 'Verify failed: 3 tests failing'", () => {
      assert.equal(
        mapHeadlessExitCode(0, "Verify failed: 3 tests failing"),
        1,
      );
    });
  });

  describe("context-budget phrases polarity", () => {
    it("returns 0 on narrative mention", () => {
      const narrative =
        "We handle the case where the context budget exceeded threshold " +
        "internally — not an error.";
      assert.equal(mapHeadlessExitCode(0, narrative), 0);
    });

    it("returns 2 at start of output", () => {
      assert.equal(
        mapHeadlessExitCode(0, "Context budget exceeded — stopping"),
        2,
      );
    });

    it("returns 2 after sentence boundary", () => {
      assert.equal(
        mapHeadlessExitCode(
          0,
          "Checked runway. Token limit reached in context window.",
        ),
        2,
      );
    });
  });

  describe("existing contract-case compatibility", () => {
    it("preserves: success on 'All tests passed.'", () => {
      assert.equal(mapHeadlessExitCode(0, "All tests passed."), 0);
    });

    it("preserves: non-zero exit → 3", () => {
      assert.equal(mapHeadlessExitCode(1, "Some output"), 3);
    });

    it("preserves: verification failed → 1", () => {
      assert.equal(
        mapHeadlessExitCode(0, "verification failed — quality gate"),
        1,
      );
    });

    it("preserves: context budget → 2", () => {
      assert.equal(
        mapHeadlessExitCode(0, "Context budget exceeded — stopping"),
        2,
      );
    });

    it("preserves: blocked needs human → 4", () => {
      assert.equal(
        mapHeadlessExitCode(0, "Blocked — needs human approval to proceed"),
        4,
      );
    });

    it("preserves: blocked human input → 4", () => {
      assert.equal(mapHeadlessExitCode(0, "Blocked: human input required"), 4);
    });

    it("preserves: non-zero exit dominates terminal markers", () => {
      assert.equal(mapHeadlessExitCode(2, "verification failed"), 3);
    });

    it("preserves: unknown command → 5", () => {
      assert.equal(mapHeadlessExitCode(0, "Unknown command: /gsd-t-resume"), 5);
    });

    it("preserves: unknown command wins over later terminal marker", () => {
      assert.equal(
        mapHeadlessExitCode(0, "Unknown command: /x\nverify failed"),
        5,
      );
    });
  });
});
