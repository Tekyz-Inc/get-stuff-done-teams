"use strict";

/**
 * M46 D2 T6 — unit tests for bin/gsd-t-worker-dispatch.cjs
 *
 * Tests dispatchWorkerTasks() by mocking bin/gsd-t-parallel.cjs::runDispatch
 * via require.cache monkey-patching. The module under test resolves the
 * parallel helper lazily inside dispatchWorkerTasks() with
 * require(path.join(__dirname, 'gsd-t-parallel.cjs')), so overwriting the
 * cached exports before the call intercepts it.
 */

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const PARALLEL_PATH = require.resolve("../bin/gsd-t-parallel.cjs");
const DISPATCH_PATH = require.resolve("../bin/gsd-t-worker-dispatch.cjs");

// Preserve the real runDispatch so we can restore it between tests.
let _origRunDispatch;

function installMock(fn) {
  // Ensure the parallel module is loaded so it has a cache entry.
  require(PARALLEL_PATH);
  const entry = require.cache[PARALLEL_PATH];
  assert.ok(entry, "parallel module must be in require.cache");
  if (_origRunDispatch === undefined) {
    _origRunDispatch = entry.exports.runDispatch;
  }
  entry.exports.runDispatch = fn;
}

function restoreRunDispatch() {
  const entry = require.cache[PARALLEL_PATH];
  if (entry && _origRunDispatch !== undefined) {
    entry.exports.runDispatch = _origRunDispatch;
  }
}

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m46-d2-"));
}

function loadDispatchFresh() {
  // Drop the dispatch module's cache so any closed-over state resets.
  delete require.cache[DISPATCH_PATH];
  return require(DISPATCH_PATH);
}

beforeEach(() => {
  // Reset the dispatch module so each test re-resolves the parallel module
  // and picks up our freshly-installed mock.
  delete require.cache[DISPATCH_PATH];
});

afterEach(() => {
  restoreRunDispatch();
  delete require.cache[DISPATCH_PATH];
});

// ─────────────────────────────────────────────────────────────────────────
// Case 1: File-disjoint 3-task workload → parallel: true, runDispatch once
// ─────────────────────────────────────────────────────────────────────────

test("file-disjoint 3-task workload → parallel:true, runDispatch called once with 3 tasks", async () => {
  const calls = [];
  installMock(async (opts) => {
    calls.push(opts);
    return {
      workerResults: [
        { taskId: "T-1", exitCode: 0, durationMs: 111 },
        { taskId: "T-2", exitCode: 0, durationMs: 222 },
        { taskId: "T-3", exitCode: 0, durationMs: 333 },
      ],
    };
  });

  const { dispatchWorkerTasks } = loadDispatchFresh();
  const projectDir = mkTmpProject();
  const tasks = [
    { taskId: "T-1", files: ["src/a.js"], command: "gsd-t-execute" },
    { taskId: "T-2", files: ["src/b.js"], command: "gsd-t-execute" },
    { taskId: "T-3", files: ["src/c.js"], command: "gsd-t-execute" },
  ];

  const result = await dispatchWorkerTasks({
    projectDir,
    parentSessionId: "parent-abc",
    tasks,
  });

  assert.equal(result.parallel, true);
  assert.equal(result.reason, "dispatched");
  assert.equal(calls.length, 1, "runDispatch called exactly once");
  assert.equal(calls[0].tasks.length, 3, "all 3 tasks forwarded");
  assert.equal(calls[0].mode, "worker-subdispatch");
  assert.equal(calls[0].projectDir, projectDir);
});

// ─────────────────────────────────────────────────────────────────────────
// Case 2: Overlapping-file 2-task workload → parallel:false, not called
// ─────────────────────────────────────────────────────────────────────────

test("overlapping-file 2-task workload → parallel:false, reason:file-overlap, runDispatch NOT called", async () => {
  let callCount = 0;
  installMock(async () => {
    callCount++;
    return { workerResults: [] };
  });

  const { dispatchWorkerTasks } = loadDispatchFresh();
  const result = await dispatchWorkerTasks({
    projectDir: mkTmpProject(),
    parentSessionId: "parent-abc",
    tasks: [
      { taskId: "T-1", files: ["src/shared.js", "src/a.js"] },
      { taskId: "T-2", files: ["src/shared.js", "src/b.js"] },
    ],
  });

  assert.equal(result.parallel, false);
  assert.equal(result.reason, "file-overlap");
  assert.deepEqual(result.taskResults, []);
  assert.equal(callCount, 0, "runDispatch must not be invoked on file overlap");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 3: Single-task workload → parallel:false, reason:single-task
// ─────────────────────────────────────────────────────────────────────────

test("single-task workload → parallel:false, reason:single-task, runDispatch NOT called", async () => {
  let callCount = 0;
  installMock(async () => {
    callCount++;
    return { workerResults: [] };
  });

  const { dispatchWorkerTasks } = loadDispatchFresh();
  const result = await dispatchWorkerTasks({
    projectDir: mkTmpProject(),
    parentSessionId: "parent-abc",
    tasks: [{ taskId: "T-solo", files: ["src/a.js"] }],
  });

  assert.equal(result.parallel, false);
  assert.equal(result.reason, "single-task");
  assert.deepEqual(result.taskResults, []);
  assert.equal(callCount, 0, "runDispatch must not be invoked for a single task");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 4: Empty-task workload → parallel:false, reason:no-tasks
// ─────────────────────────────────────────────────────────────────────────

test("empty-task workload → parallel:false, reason:no-tasks, runDispatch NOT called", async () => {
  let callCount = 0;
  installMock(async () => {
    callCount++;
    return { workerResults: [] };
  });

  const { dispatchWorkerTasks } = loadDispatchFresh();
  const result = await dispatchWorkerTasks({
    projectDir: mkTmpProject(),
    parentSessionId: "parent-abc",
    tasks: [],
  });

  assert.equal(result.parallel, false);
  assert.equal(result.reason, "no-tasks");
  assert.deepEqual(result.taskResults, []);
  assert.equal(callCount, 0, "runDispatch must not be invoked on empty workload");
});

// ─────────────────────────────────────────────────────────────────────────
// Case 5: runDispatch throws → parallel:false, reason:/^dispatch-error/,
// caller does not die
// ─────────────────────────────────────────────────────────────────────────

test("runDispatch throws → parallel:false, reason matches /^dispatch-error/, caller survives", async () => {
  installMock(async () => {
    throw new Error("boom from parallel");
  });

  const { dispatchWorkerTasks } = loadDispatchFresh();

  let result;
  await assert.doesNotReject(async () => {
    result = await dispatchWorkerTasks({
      projectDir: mkTmpProject(),
      parentSessionId: "parent-abc",
      tasks: [
        { taskId: "T-1", files: ["src/a.js"] },
        { taskId: "T-2", files: ["src/b.js"] },
      ],
    });
  });

  assert.equal(result.parallel, false);
  assert.match(result.reason, /^dispatch-error/);
  assert.match(result.reason, /boom from parallel/);
  assert.deepEqual(result.taskResults, []);
});

// ─────────────────────────────────────────────────────────────────────────
// Case 6: Aggregated result preserves per-task taskId/exitCode/durationMs
// ─────────────────────────────────────────────────────────────────────────

test("aggregated result preserves per-task taskId/exitCode/durationMs from mock", async () => {
  const mockResults = [
    { taskId: "T-1", exitCode: 0, durationMs: 111 },
    { taskId: "T-2", exitCode: 1, durationMs: 222 },
    { taskId: "T-3", exitCode: 0, durationMs: 333 },
  ];
  installMock(async () => ({ workerResults: mockResults }));

  const { dispatchWorkerTasks } = loadDispatchFresh();
  const result = await dispatchWorkerTasks({
    projectDir: mkTmpProject(),
    parentSessionId: "parent-abc",
    tasks: [
      { taskId: "T-1", files: ["src/a.js"] },
      { taskId: "T-2", files: ["src/b.js"] },
      { taskId: "T-3", files: ["src/c.js"] },
    ],
  });

  assert.equal(result.parallel, true);
  assert.equal(result.taskResults.length, 3);
  for (let i = 0; i < mockResults.length; i++) {
    assert.equal(result.taskResults[i].taskId, mockResults[i].taskId);
    assert.equal(result.taskResults[i].exitCode, mockResults[i].exitCode);
    assert.equal(result.taskResults[i].durationMs, mockResults[i].durationMs);
  }
  assert.ok(typeof result.wallClockMs === "number" && result.wallClockMs >= 0);
});
