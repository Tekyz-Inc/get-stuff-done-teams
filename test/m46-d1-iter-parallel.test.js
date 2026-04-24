"use strict";

/**
 * M46 D1 T7 — unit tests for the iteration-parallel driver helpers.
 *
 * Contract: `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0.
 * Helpers under test are exported via the private `__test__` bag on
 * `bin/gsd-t-unattended.cjs` (see module.exports near line 190).
 *
 * These are pure unit tests — no fs, no child_process. Each case drives
 * one helper with a hand-built `state` object and, where needed, a fake
 * `iterFn` so we can observe concurrency and error-isolation behavior.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { __test__ } = require("../bin/gsd-t-unattended.cjs");
const { _runOneIter, _computeIterBatchSize, _runIterParallel, _reconcile } = __test__;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────
// Case 1: Serial fallback
// ─────────────────────────────────────────────────────────────────────────

test("_computeIterBatchSize — maxIterParallel:1 returns 1 (serial fallback)", () => {
  const state = { status: "running", iter: 0 };
  const size = _computeIterBatchSize(state, { maxIterParallel: 1 });
  assert.equal(size, 1);
});

test("_runIterParallel — batchSize=1 runs a single iter with no overlap", async () => {
  const state = { status: "running", iter: 0 };
  let inFlight = 0;
  let maxInFlight = 0;
  const iterFn = async () => {
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    await sleep(20);
    inFlight--;
    return { status: "running", tasksDone: [], verifyNeeded: false, artifacts: [] };
  };

  const results = await _runIterParallel(state, {}, iterFn, 1);
  assert.equal(results.length, 1);
  assert.equal(maxInFlight, 1, "only one iter should have been in flight at any time");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 2: Parallel batch — 3 concurrent iters finish in <200ms
// ─────────────────────────────────────────────────────────────────────────

test("_runIterParallel — batchSize=3 dispatches concurrently (Promise.all semantics)", async () => {
  const state = { status: "running", iter: 0 };
  let inFlight = 0;
  let maxInFlight = 0;
  const iterFn = async () => {
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    await sleep(100);
    inFlight--;
    return { status: "running", tasksDone: [], verifyNeeded: false, artifacts: [] };
  };

  const t0 = Date.now();
  const results = await _runIterParallel(state, {}, iterFn, 3);
  const elapsed = Date.now() - t0;

  assert.equal(results.length, 3);
  assert.equal(maxInFlight, 3, "all three iters should run concurrently");
  assert.ok(
    elapsed < 200,
    `three 100ms concurrent iters should finish in <200ms (got ${elapsed}ms)`,
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Case 3: Mode-safety — verify-needed forces serial
// ─────────────────────────────────────────────────────────────────────────

test("_computeIterBatchSize — status=verify-needed forces batchSize=1", () => {
  const state = { status: "verify-needed", iter: 0 };
  const size = _computeIterBatchSize(state, { maxIterParallel: 4 });
  assert.equal(size, 1, "verify gate must force serial until status clears");
});

test("_computeIterBatchSize — status=complete-milestone forces batchSize=1", () => {
  const state = { status: "complete-milestone", iter: 0 };
  const size = _computeIterBatchSize(state, { maxIterParallel: 4 });
  assert.equal(size, 1, "complete-milestone single-shot must force serial");
});

test("_computeIterBatchSize — milestoneBoundary=true forces batchSize=1", () => {
  const state = { status: "running", milestoneBoundary: true, iter: 0 };
  const size = _computeIterBatchSize(state, { maxIterParallel: 4 });
  assert.equal(size, 1, "milestone boundary must force serial");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 4: Error isolation — one rejection must not cancel siblings
// ─────────────────────────────────────────────────────────────────────────

test("_runIterParallel — one iter rejection does not cancel siblings", async () => {
  const state = { status: "running", iter: 0 };
  let callIdx = 0;
  const iterFn = async () => {
    const idx = callIdx++;
    await sleep(10);
    if (idx === 1) throw new Error("simulated iter failure");
    return {
      status: "running",
      tasksDone: [`t${idx}`],
      verifyNeeded: false,
      artifacts: [],
    };
  };

  const results = await _runIterParallel(state, {}, iterFn, 3);
  assert.equal(results.length, 3, "all three slots must appear in the result array");

  const errored = results.filter((r) => r.status === "error");
  const succeeded = results.filter((r) => r.status === "running");
  assert.equal(errored.length, 1, "exactly one iter recorded as error");
  assert.equal(succeeded.length, 2, "two siblings completed normally");
  assert.match(errored[0].error, /simulated iter failure/);
});

// ─────────────────────────────────────────────────────────────────────────
// Case 5: Stop-check invariant — checked between batches, not mid-batch
// ─────────────────────────────────────────────────────────────────────────

test("_runIterParallel — never reads a stop-check internally (batch-boundary invariant)", async () => {
  // Contract §3.3: stop-check is honored at batch boundaries only. Proving this
  // directly: the driver accepts no stopCheck function in its signature, so it
  // cannot poll one mid-batch. We assert the signature shape and that passing
  // an opts with a would-be stopCheck has no effect on in-flight slices.
  assert.equal(
    _runIterParallel.length,
    4,
    "_runIterParallel signature is (state, opts, iterFn, batchSize) — no stopCheck param",
  );

  const state = { status: "running", iter: 0 };
  let stopCheckCalls = 0;
  const stopCheck = () => {
    stopCheckCalls++;
    return true; // would stop if ever consulted
  };
  const iterFn = async () => {
    await sleep(10);
    return { status: "running", tasksDone: [], verifyNeeded: false, artifacts: [] };
  };

  // Pass stopCheck as part of opts — driver must NOT call it.
  const results = await _runIterParallel(state, { stopCheck }, iterFn, 3);
  assert.equal(results.length, 3, "all 3 iters complete because stopCheck is not polled mid-batch");
  assert.equal(stopCheckCalls, 0, "stopCheck must never be invoked inside _runIterParallel");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 6: State reconciliation — merge per-iter deltas
// ─────────────────────────────────────────────────────────────────────────

test("_reconcile — unions completedTasks, dedupes, ORs verifyNeeded, appends artifacts", () => {
  const state = {
    iter: 5,
    status: "running",
    completedTasks: ["T-1"],
    artifacts: ["a0"],
    verifyNeeded: false,
  };

  const r1 = {
    status: "running",
    tasksDone: ["T-2", "T-3"],
    verifyNeeded: false,
    artifacts: ["a1"],
  };
  const r2 = {
    status: "verify-needed",
    tasksDone: ["T-3", "T-4"], // T-3 dupe should dedupe
    verifyNeeded: true,
    artifacts: ["a2", "a3"],
  };

  _reconcile(state, [r1, r2]);

  // completedTasks: union with dedupe, preserve order
  assert.deepEqual(
    state.completedTasks,
    ["T-1", "T-2", "T-3", "T-4"],
    "completedTasks must be a deduped, order-preserving union",
  );
  // status: last-writer-wins
  assert.equal(state.status, "verify-needed", "last non-matching status wins");
  // verifyNeeded: OR across results
  assert.equal(state.verifyNeeded, true, "verifyNeeded is OR-across-results");
  // artifacts: append-only concat
  assert.deepEqual(state.artifacts, ["a0", "a1", "a2", "a3"]);
  // iter counter: _reconcile does NOT advance state.iter. That invariant is
  // owned by the main while loop (one increment per fan-out pass via
  // `_runOneIter` at line ~1133). Double-incrementing here would break the
  // pre-M46 supervisor contract (covered by m43/m44 wire tests).
  assert.equal(state.iter, 5, "state.iter unchanged by _reconcile");
  // lastBatch metadata written
  assert.ok(state.lastBatch, "lastBatch metadata must be written");
  assert.equal(state.lastBatch.size, 2);
  assert.equal(state.lastBatch.errorCount, 0);
  assert.ok(state.lastBatch.endedAt, "lastBatch.endedAt must be an ISO timestamp");
});

test("_reconcile — empty results array is a no-op", () => {
  const state = { iter: 3, status: "running", completedTasks: ["T-1"] };
  const before = JSON.stringify(state);
  _reconcile(state, []);
  assert.equal(JSON.stringify(state), before, "no mutation when results is empty");
});

test("_reconcile — counts error results in lastBatch.errorCount", () => {
  const state = { iter: 0, status: "running" };
  const results = [
    { status: "running", tasksDone: [], verifyNeeded: false, artifacts: [] },
    { status: "error", tasksDone: [], verifyNeeded: false, artifacts: [], error: "boom" },
    { status: "error", tasksDone: [], verifyNeeded: false, artifacts: [], error: "boom2" },
  ];
  _reconcile(state, results);
  assert.equal(state.lastBatch.size, 3);
  assert.equal(state.lastBatch.errorCount, 2);
  // state.iter is not touched by _reconcile — main loop owns that increment.
  assert.equal(state.iter, 0, "state.iter unchanged by _reconcile");
});

// ─────────────────────────────────────────────────────────────────────────
// Sanity: _runOneIter is exported and is a function
// ─────────────────────────────────────────────────────────────────────────

test("__test__ bag exports all four helpers as functions", () => {
  assert.equal(typeof _runOneIter, "function");
  assert.equal(typeof _computeIterBatchSize, "function");
  assert.equal(typeof _runIterParallel, "function");
  assert.equal(typeof _reconcile, "function");
});
