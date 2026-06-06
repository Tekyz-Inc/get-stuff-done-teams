"use strict";

// M82 — Competition Mode selection oracle (bin/gsd-t-competition-judge.cjs).
// The judge is the load-bearing half of generate-and-judge (deep-research:
// best-of-N coverage is real but BOUNDED BY JUDGE QUALITY). These tests pin the
// objective partition judge (calculator over the disjointness oracle) and the
// deterministic generic rubric selector.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { judge, scorePartition, rankPartitions, rankGeneric, _internal } = require("../bin/gsd-t-competition-judge.cjs");

const projectDir = process.cwd();

// ─── Objective partition judge ───────────────────────────────────────────

test("partition: more disjoint domains beats one fat domain", () => {
  const spec = {
    kind: "partition",
    candidates: [
      { id: "A", domains: [{ name: "all", touches: ["x.js", "y.js", "z.js"] }] },
      { id: "B", domains: [{ name: "f", touches: ["x.js"] }, { name: "b", touches: ["y.js", "z.js"] }] },
    ],
  };
  const r = judge(spec, projectDir);
  assert.equal(r.winner, "B");
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  const b = r.ranked.find((x) => x.id === "B");
  assert.equal(b.parallelGroups, 2);
  assert.equal(b.valid, true);
});

test("partition: overlapping domains are DISQUALIFIED (invalid), never win", () => {
  const spec = {
    kind: "partition",
    candidates: [
      { id: "overlap", domains: [{ name: "a", touches: ["shared.js"] }, { name: "b", touches: ["shared.js"] }] },
      { id: "clean", domains: [{ name: "a", touches: ["a.js"] }, { name: "b", touches: ["b.js"] }] },
    ],
  };
  const r = judge(spec, projectDir);
  assert.equal(r.winner, "clean");
  const bad = r.ranked.find((x) => x.id === "overlap");
  assert.equal(bad.valid, false);
  // invalid candidates are ranked last
  assert.ok(bad.rank > r.ranked.find((x) => x.id === "clean").rank);
});

test("partition: ALL candidates invalid → no winner, exit 4", () => {
  const spec = {
    kind: "partition",
    candidates: [
      { id: "X", domains: [{ name: "a", touches: ["f.js"] }, { name: "b", touches: ["f.js"] }] },
    ],
  };
  const r = judge(spec, projectDir);
  assert.equal(r.winner, null);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 4);
  assert.equal(r.reason, "no-valid-candidate");
});

test("partition: fewer waves wins when parallelGroups tie", () => {
  // Both have 2 parallel groups, but B also has an unprovable (no-touch) domain
  // that adds a serial bottleneck → A (clean) should win.
  const spec = {
    kind: "partition",
    candidates: [
      { id: "A", domains: [{ name: "a", touches: ["a.js"] }, { name: "b", touches: ["b.js"] }] },
      { id: "B", domains: [{ name: "a", touches: ["a.js"] }, { name: "b", touches: ["b.js"] }, { name: "c", touches: [] }] },
    ],
  };
  const r = judge(spec, projectDir);
  assert.equal(r.winner, "A");
  assert.equal(r.ranked.find((x) => x.id === "B").unprovableCount, 1);
});

test("scorePartition: pure & deterministic — same input, same score twice", () => {
  const cand = { id: "C", domains: [{ name: "x", touches: ["p.js"] }, { name: "y", touches: ["q.js"] }] };
  const s1 = scorePartition(cand, projectDir);
  const s2 = scorePartition(cand, projectDir);
  assert.deepEqual(s1, s2);
  assert.equal(s1.parallelGroups, 2);
  assert.equal(s1.valid, true);
});

test("rankPartitions: returns every candidate ranked, winner is rank 1", () => {
  const cands = [
    { id: "A", domains: [{ name: "a", touches: ["a.js", "b.js"] }] },
    { id: "B", domains: [{ name: "a", touches: ["a.js"] }, { name: "b", touches: ["b.js"] }] },
  ];
  const { ranked, winner } = rankPartitions(cands, projectDir);
  assert.equal(ranked.length, 2);
  assert.equal(winner, "B");
  assert.equal(ranked[0].id, "B");
  assert.equal(ranked[0].rank, 1);
});

// ─── Generic rubric selector (deterministic) ─────────────────────────────

test("generic: highest weighted score wins", () => {
  const spec = {
    kind: "generic",
    axes: [{ key: "coherence", weight: 2 }, { key: "completeness", weight: 1 }],
    candidates: [
      { id: "A", scores: { coherence: 5, completeness: 1 } }, // (10+1)/3 = 3.67
      { id: "B", scores: { coherence: 4, completeness: 5 } }, // (8+5)/3 = 4.33
    ],
  };
  const r = judge(spec, projectDir);
  assert.equal(r.winner, "B");
});

test("generic: ties broken by ORIGINAL index (reproducible under shuffle)", () => {
  // A and C tie; A appears first in input → A wins regardless of any upstream shuffle.
  const spec = {
    kind: "generic",
    axes: [{ key: "q", weight: 1 }],
    candidates: [
      { id: "A", scores: { q: 4 } },
      { id: "B", scores: { q: 2 } },
      { id: "C", scores: { q: 4 } },
    ],
  };
  const r1 = rankGeneric(spec);
  assert.equal(r1.winner, "A");
  // Reverse the tied pair's order in input → the EARLIER-listed tie still wins,
  // proving selection depends only on input order (caller controls it), not on score noise.
  const spec2 = {
    kind: "generic",
    axes: [{ key: "q", weight: 1 }],
    candidates: [
      { id: "C", scores: { q: 4 } },
      { id: "B", scores: { q: 2 } },
      { id: "A", scores: { q: 4 } },
    ],
  };
  assert.equal(rankGeneric(spec2).winner, "C");
});

// ─── Robustness ──────────────────────────────────────────────────────────

test("empty candidate set → exit 64, never throws", () => {
  const r = judge({ kind: "partition", candidates: [] }, projectDir);
  assert.equal(r.exitCode, 64);
  assert.equal(r.winner, null);
});

// ─── 'Never throws' guarantee on the FUNCTION, not just the CLI (Red Team MED-4) ──

test("judge() does not throw on a null candidate (in-process callers safe)", () => {
  assert.doesNotThrow(() => judge({ kind: "partition", candidates: [null] }, projectDir));
  const r = judge({ kind: "partition", candidates: [null] }, projectDir);
  // null is filtered out → no valid candidate → exit 4, winner null, no crash.
  assert.equal(r.winner, null);
});

test("judge() does not throw on a non-string id; such candidates are dropped", () => {
  assert.doesNotThrow(() => judge({ kind: "partition", candidates: [{ id: {}, domains: [] }] }, projectDir));
  const r = judge({ kind: "generic", axes: [{ key: "q", weight: 1 }], candidates: [{ id: 42, scores: { q: 5 } }] }, projectDir);
  // numeric id dropped → no candidates → no winner, no throw.
  assert.equal(r.winner, null);
});

test("rankPartitions: a valid candidate still wins even when a null is in the pool", () => {
  const r = judge({
    kind: "partition",
    candidates: [
      null,
      { id: "good", domains: [{ name: "a", touches: ["a.js"] }, { name: "b", touches: ["b.js"] }] },
    ],
  }, projectDir);
  assert.equal(r.winner, "good");
});

test("malformed candidate (no domains) is treated as zero-domain, not a crash", () => {
  const r = judge({ kind: "partition", candidates: [{ id: "A" }] }, projectDir);
  // zero domains → no parallel groups, but technically 'valid' (no overlap) →
  // it wins by default as the only candidate. Key assertion: no throw, has envelope.
  assert.ok(r.exitCode === 0 || r.exitCode === 4);
  assert.equal(r.n, 1);
});

// ─── Path-spelling conflict detection (Red Team #1) ──────────────────────

test("path variants of the SAME file are detected as a conflict (not falsely valid)", () => {
  // ./bin/X.js and bin/X.js are the same file — an overlap that MUST disqualify.
  const r = judge({
    kind: "partition",
    candidates: [
      { id: "trap", domains: [{ name: "a", touches: ["./bin/X.js"] }, { name: "b", touches: ["bin/X.js"] }] },
      { id: "clean", domains: [{ name: "a", touches: ["bin/a.js"] }, { name: "b", touches: ["bin/b.js"] }] },
    ],
  }, projectDir);
  assert.equal(r.winner, "clean");
  assert.equal(r.ranked.find((x) => x.id === "trap").valid, false);
});

test("_normPath collapses ./, //, backslashes, trailing slash", () => {
  const n = _internal._normPath;
  assert.equal(n("./bin/x.js"), "bin/x.js");
  assert.equal(n("bin//x.js"), "bin/x.js");
  assert.equal(n("bin\\x.js"), "bin/x.js");
  assert.equal(n("bin/x.js/"), "bin/x.js");
  assert.equal(n("a/./b/x.js"), "a/b/x.js");
  assert.equal(n("bin/x.js"), "bin/x.js");
  // case is PRESERVED (case-sensitive FS) — these are NOT the same file
  assert.notEqual(n("bin/X.js"), n("bin/x.js"));
});

test("duplicate touches within a domain don't inflate or break scoring", () => {
  const r = judge({
    kind: "partition",
    candidates: [{ id: "A", domains: [
      { name: "a", touches: ["x.js", "x.js", "./x.js"] },
      { name: "b", touches: ["y.js"] },
    ] }],
  }, projectDir);
  // a writes only x.js (deduped), b writes y.js → 2 disjoint parallel groups, valid.
  assert.equal(r.winner, "A");
  assert.equal(r.ranked[0].parallelGroups, 2);
  assert.equal(r.ranked[0].valid, true);
});
