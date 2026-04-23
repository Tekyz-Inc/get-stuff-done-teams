"use strict";

/**
 * M44 D5-T3 — file-disjointness prover unit tests
 *
 * Covers:
 *   - two tasks with no overlap → both parallel
 *   - two tasks sharing one file → sequential + fallback event written
 *   - unprovable task (no touch-list source) → sequential + reason='unprovable'
 *   - three-task set with one unprovable → unprovable sequential, other two
 *     parallel if disjoint
 *   - scope.md fallback: D5 treats a node whose touches came from scope.md
 *     identically to one with explicit touches (tasks are constructed inline;
 *     D1 is not exercised)
 *   - prover never throws for malformed input
 *   - event file is under .gsd-t/events/YYYY-MM-DD.jsonl with expected shape
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  proveDisjointness,
  _haveOverlap,
  _groupByOverlap,
  _resolveTouches,
} = require("../bin/gsd-t-file-disjointness.cjs");

// ─── fixture builders ───────────────────────────────────────────────────

function mkProjectDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "m44-d5-"));
}

function readEvents(projectDir) {
  const dir = path.join(projectDir, ".gsd-t", "events");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const line of src.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* ignore */ }
    }
  }
  return out;
}

// ─── two tasks, no overlap → both parallel ─────────────────────────────

test("two tasks with disjoint touches → both in parallel; no events", () => {
  const projectDir = mkProjectDir();
  const tasks = [
    { id: "M99-D1-T1", domain: "m99-d1", touches: ["bin/a.cjs"] },
    { id: "M99-D2-T1", domain: "m99-d2", touches: ["bin/b.cjs"] },
  ];
  const r = proveDisjointness({ tasks, projectDir });

  assert.equal(r.sequential.length, 0);
  assert.equal(r.unprovable.length, 0);
  assert.equal(r.parallel.length, 2, "each disjoint task is its own singleton group");
  const ids = r.parallel.flat().map((t) => t.id).sort();
  assert.deepEqual(ids, ["M99-D1-T1", "M99-D2-T1"]);

  // No events written (no fallback)
  const events = readEvents(projectDir);
  assert.equal(events.length, 0);
});

// ─── two tasks sharing one file → sequential + event ───────────────────

test("two tasks sharing a write target → sequential group + fallback events", () => {
  const projectDir = mkProjectDir();
  const tasks = [
    { id: "M99-D1-T1", domain: "m99-d1", touches: ["bin/shared.cjs", "bin/a.cjs"] },
    { id: "M99-D2-T1", domain: "m99-d2", touches: ["bin/shared.cjs", "bin/b.cjs"] },
  ];
  const r = proveDisjointness({ tasks, projectDir });

  assert.equal(r.parallel.length, 0);
  assert.equal(r.unprovable.length, 0);
  assert.equal(r.sequential.length, 1, "overlapping tasks coalesce into one group");
  assert.equal(r.sequential[0].length, 2);
  const ids = r.sequential[0].map((t) => t.id).sort();
  assert.deepEqual(ids, ["M99-D1-T1", "M99-D2-T1"]);

  // One event per task, reason='write-target-overlap'
  const events = readEvents(projectDir);
  assert.equal(events.length, 2);
  for (const e of events) {
    assert.equal(e.type, "disjointness_fallback");
    assert.equal(e.reason, "write-target-overlap");
    assert.match(e.task_id, /^M99-D[12]-T1$/);
    assert.match(e.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
});

// ─── unprovable task (empty touches, no git match) ─────────────────────

test("unprovable task (empty touches + no git history) → sequential + reason=unprovable", () => {
  // Use a fresh tmpdir with no git repo so the git-history fallback comes up empty.
  const projectDir = mkProjectDir();
  const tasks = [
    { id: "M99-D9-T1", domain: "m99-d9-nonexistent", touches: [] },
  ];
  const r = proveDisjointness({ tasks, projectDir });

  assert.equal(r.parallel.length, 0);
  assert.equal(r.unprovable.length, 1);
  assert.equal(r.unprovable[0].id, "M99-D9-T1");
  // Safe-default: also appears as a sequential singleton
  assert.equal(r.sequential.length, 1);
  assert.equal(r.sequential[0].length, 1);
  assert.equal(r.sequential[0][0].id, "M99-D9-T1");

  const events = readEvents(projectDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "disjointness_fallback");
  assert.equal(events[0].reason, "unprovable");
  assert.equal(events[0].task_id, "M99-D9-T1");
});

// ─── three-task set: one unprovable, other two disjoint ────────────────

test("three tasks: one unprovable, two disjoint → unprovable sequential, others parallel", () => {
  const projectDir = mkProjectDir();
  const tasks = [
    { id: "M99-D1-T1", domain: "m99-d1", touches: ["bin/a.cjs"] },
    { id: "M99-D2-T1", domain: "m99-d2", touches: ["bin/b.cjs"] },
    { id: "M99-D3-T1", domain: "m99-d3-empty", touches: [] }, // unprovable
  ];
  const r = proveDisjointness({ tasks, projectDir });

  // Two provable singletons → parallel
  assert.equal(r.parallel.length, 2);
  const parallelIds = r.parallel.flat().map((t) => t.id).sort();
  assert.deepEqual(parallelIds, ["M99-D1-T1", "M99-D2-T1"]);

  // Unprovable task
  assert.equal(r.unprovable.length, 1);
  assert.equal(r.unprovable[0].id, "M99-D3-T1");

  // Sequential: just the unprovable singleton
  assert.equal(r.sequential.length, 1);
  assert.equal(r.sequential[0].length, 1);
  assert.equal(r.sequential[0][0].id, "M99-D3-T1");

  // Only one event (for the unprovable)
  const events = readEvents(projectDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, "unprovable");
});

// ─── scope.md fallback path: D5 is agnostic to source of touches ───────

test("scope.md fallback: D5 treats scope-derived touches identically to explicit", () => {
  const projectDir = mkProjectDir();
  // Simulate what D1 would emit after the scope.md Files-Owned fallback:
  // a domain's touches include the WHOLE-DOMAIN file list (coarse but safe).
  // Two tasks in DIFFERENT domains whose owned files don't intersect must
  // both come out parallel.
  const tasks = [
    {
      id: "M99-D1-T1",
      domain: "m99-d1-foo",
      // From scope.md ## Files Owned
      touches: ["bin/foo.cjs", "test/foo.test.js"],
    },
    {
      id: "M99-D2-T1",
      domain: "m99-d2-bar",
      touches: ["bin/bar.cjs", "test/bar.test.js"],
    },
  ];
  const r = proveDisjointness({ tasks, projectDir });
  assert.equal(r.sequential.length, 0);
  assert.equal(r.unprovable.length, 0);
  assert.equal(r.parallel.length, 2);

  // Now flip the scenario: two tasks in same domain whose scope.md yielded
  // identical touch lists → must collapse to one sequential group.
  const projectDir2 = mkProjectDir();
  const tasks2 = [
    { id: "M99-D1-T1", domain: "m99-d1-foo", touches: ["bin/foo.cjs", "test/foo.test.js"] },
    { id: "M99-D1-T2", domain: "m99-d1-foo", touches: ["bin/foo.cjs", "test/foo.test.js"] },
  ];
  const r2 = proveDisjointness({ tasks: tasks2, projectDir: projectDir2 });
  assert.equal(r2.parallel.length, 0);
  assert.equal(r2.unprovable.length, 0);
  assert.equal(r2.sequential.length, 1);
  assert.deepEqual(
    r2.sequential[0].map((t) => t.id).sort(),
    ["M99-D1-T1", "M99-D1-T2"],
  );

  const events2 = readEvents(projectDir2);
  assert.equal(events2.length, 2);
  for (const e of events2) {
    assert.equal(e.reason, "write-target-overlap");
  }
});

// ─── robustness: malformed input never throws ─────────────────────────

test("robustness: empty/missing input never throws, returns empty result", () => {
  assert.doesNotThrow(() => proveDisjointness());
  assert.doesNotThrow(() => proveDisjointness({}));
  assert.doesNotThrow(() => proveDisjointness({ tasks: null }));
  const r = proveDisjointness({ tasks: [], projectDir: mkProjectDir() });
  assert.deepEqual(r, { parallel: [], sequential: [], unprovable: [] });
});

test("robustness: task with missing touches field falls through to unprovable (no throw)", () => {
  const projectDir = mkProjectDir();
  const tasks = [
    { id: "M99-D9-T1", domain: "m99-d9-nonexistent" }, // no touches field at all
  ];
  const r = proveDisjointness({ tasks, projectDir });
  assert.equal(r.unprovable.length, 1);
  assert.equal(r.unprovable[0].id, "M99-D9-T1");
});

// ─── internals ────────────────────────────────────────────────────────

test("_haveOverlap: basic set-intersection semantics", () => {
  assert.equal(_haveOverlap([], []), false);
  assert.equal(_haveOverlap(["a"], []), false);
  assert.equal(_haveOverlap(["a"], ["b"]), false);
  assert.equal(_haveOverlap(["a"], ["a"]), true);
  assert.equal(_haveOverlap(["a", "b"], ["c", "b"]), true);
});

test("_groupByOverlap: transitive closure via union-find", () => {
  // A↔B share x, B↔C share y → A,B,C must coalesce into ONE group
  const items = [
    { task: { id: "A" }, touches: ["x"] },
    { task: { id: "B" }, touches: ["x", "y"] },
    { task: { id: "C" }, touches: ["y"] },
    { task: { id: "D" }, touches: ["z"] }, // isolated
  ];
  const groups = _groupByOverlap(items);
  const normalized = groups
    .map((g) => g.map((t) => t.id).sort().join(","))
    .sort();
  assert.deepEqual(normalized, ["A,B,C", "D"]);
});

test("_resolveTouches: declared wins over git when non-empty", () => {
  const r = _resolveTouches(
    { id: "X", domain: "m99-d-nothing", touches: ["bin/x.cjs"] },
    mkProjectDir(),
  );
  assert.equal(r.source, "declared");
  assert.deepEqual(r.touches, ["bin/x.cjs"]);
});

test("_resolveTouches: falls to 'none' when touches empty and no git history matches", () => {
  const r = _resolveTouches(
    { id: "M99-D99-T99", domain: "m99-d99-nonexistent", touches: [] },
    mkProjectDir(),
  );
  assert.equal(r.source, "none");
  assert.deepEqual(r.touches, []);
});
