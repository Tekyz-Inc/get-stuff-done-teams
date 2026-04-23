"use strict";

/**
 * M44 D4-T3 — depgraph-validate unit tests
 *
 * Covers:
 *   - all deps done → full ready set; zero vetoed; no events written
 *   - one dep unmet (that task vetoed, others unaffected) → 1 ready + 1 vetoed
 *   - three-task chain with only first done (only second ready, third vetoed)
 *   - empty graph → empty ready + empty vetoed (no throw)
 *   - unknown dep reference (treated as unmet + veto event emitted)
 *   - event schema correctness (type, task_id, domain, unmet_deps, ts ISO)
 *   - non-throwing guarantee on unmet deps (never throws)
 *   - event directory created on demand
 *   - skipped/failed deps do NOT satisfy (per task-graph-contract §5)
 *
 * All tests run against an isolated projectDir under os.tmpdir() so event
 * appends do NOT pollute the repo's real `.gsd-t/events/YYYY-MM-DD.jsonl`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateDepGraph } = require("../bin/gsd-t-depgraph-validate.cjs");

// ─── fixture helpers ────────────────────────────────────────────────────

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "m44-d4-"));
}

function readTodayEvents(projectDir) {
  const day = new Date().toISOString().slice(0, 10);
  const p = path.join(projectDir, ".gsd-t", "events", `${day}.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function node(id, { domain = "d1", status = "pending", deps = [] } = {}) {
  return { id, domain, wave: 2, title: id, status, deps, touches: [] };
}

function graphFromNodes(nodes, readyIds) {
  const byId = Object.create(null);
  for (const n of nodes) byId[n.id] = n;
  return {
    nodes,
    edges: [],
    byId,
    warnings: [],
    ready: readyIds || nodes.filter((n) => n.status === "pending").map((n) => n.id),
  };
}

// ─── acceptance-criteria tests ──────────────────────────────────────────

test("all deps done → full ready set, zero vetoed, no events written", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "done" });
  const n2 = node("M99-D1-T2", { status: "pending", deps: ["M99-D1-T1"] });
  const n3 = node("M99-D1-T3", { status: "pending", deps: ["M99-D1-T1"] });
  const graph = graphFromNodes([n1, n2, n3], ["M99-D1-T2", "M99-D1-T3"]);

  const { ready, vetoed } = validateDepGraph({ graph, projectDir });

  assert.equal(ready.length, 2);
  assert.deepEqual(ready.map((t) => t.id), ["M99-D1-T2", "M99-D1-T3"]);
  assert.equal(vetoed.length, 0);
  assert.equal(readTodayEvents(projectDir).length, 0, "no veto events expected");
});

test("one dep unmet → that task vetoed, others unaffected", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "done" });      // dep already done
  const n2 = node("M99-D1-T2", { status: "pending" });   // blocks n4
  const n3 = node("M99-D1-T3", { status: "pending", deps: ["M99-D1-T1"] }); // ready
  const n4 = node("M99-D1-T4", { status: "pending", deps: ["M99-D1-T2"] }); // blocked
  const graph = graphFromNodes([n1, n2, n3, n4], ["M99-D1-T2", "M99-D1-T3", "M99-D1-T4"]);

  const { ready, vetoed } = validateDepGraph({ graph, projectDir });

  // T2 has no deps → ready; T3's dep is done → ready; T4 vetoed on T2 (pending, not done)
  assert.deepEqual(ready.map((t) => t.id).sort(), ["M99-D1-T2", "M99-D1-T3"]);
  assert.equal(vetoed.length, 1);
  assert.equal(vetoed[0].task.id, "M99-D1-T4");
  assert.deepEqual(vetoed[0].unmet_deps, ["M99-D1-T2"]);

  const events = readTodayEvents(projectDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "dep_gate_veto");
  assert.equal(events[0].task_id, "M99-D1-T4");
  assert.equal(events[0].domain, "d1");
  assert.deepEqual(events[0].unmet_deps, ["M99-D1-T2"]);
});

test("three-task chain first-done → only second ready, third vetoed", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "done" });
  const n2 = node("M99-D1-T2", { status: "pending", deps: ["M99-D1-T1"] });
  const n3 = node("M99-D1-T3", { status: "pending", deps: ["M99-D1-T2"] });
  const graph = graphFromNodes([n1, n2, n3], ["M99-D1-T2", "M99-D1-T3"]);

  const { ready, vetoed } = validateDepGraph({ graph, projectDir });

  assert.deepEqual(ready.map((t) => t.id), ["M99-D1-T2"]);
  assert.equal(vetoed.length, 1);
  assert.equal(vetoed[0].task.id, "M99-D1-T3");
  assert.deepEqual(vetoed[0].unmet_deps, ["M99-D1-T2"]);

  const events = readTodayEvents(projectDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].task_id, "M99-D1-T3");
});

test("empty graph → empty ready + empty vetoed, no throw", () => {
  const projectDir = mkTmpProject();
  const graph = graphFromNodes([], []);
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });
  assert.deepEqual(ready, []);
  assert.deepEqual(vetoed, []);
  assert.equal(readTodayEvents(projectDir).length, 0);
});

test("unknown dep reference is unmet → vetoed with unmet_deps containing the unknown id", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "pending", deps: ["M99-D9-T99"] }); // unknown
  const graph = graphFromNodes([n1], ["M99-D1-T1"]);

  const { ready, vetoed } = validateDepGraph({ graph, projectDir });

  assert.equal(ready.length, 0);
  assert.equal(vetoed.length, 1);
  assert.equal(vetoed[0].task.id, "M99-D1-T1");
  assert.deepEqual(vetoed[0].unmet_deps, ["M99-D9-T99"]);

  const events = readTodayEvents(projectDir);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].unmet_deps, ["M99-D9-T99"]);
});

// ─── veto event schema correctness ──────────────────────────────────────

test("veto event carries full base schema fields + additive D4 fields", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { domain: "m99-d1-foo", status: "pending", deps: ["M99-D9-T99"] });
  const graph = graphFromNodes([n1], ["M99-D1-T1"]);
  validateDepGraph({ graph, projectDir });

  const events = readTodayEvents(projectDir);
  assert.equal(events.length, 1);
  const e = events[0];
  // Base event-schema fields must all be present (null where unused)
  for (const f of ["ts", "event_type", "command", "phase", "agent_id",
    "parent_agent_id", "trace_id", "reasoning", "outcome", "model"]) {
    assert.ok(f in e, `event missing base field ${f}`);
  }
  // ts is a valid ISO 8601 UTC timestamp
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.ts), `bad ts: ${e.ts}`);
  assert.equal(e.event_type, "dep_gate_veto");
  assert.equal(e.outcome, "deferred");
  assert.equal(e.task_id, "M99-D1-T1");
  assert.equal(e.domain, "m99-d1-foo");
  assert.deepEqual(e.unmet_deps, ["M99-D9-T99"]);
  assert.ok(e.reasoning && e.reasoning.includes("M99-D9-T99"),
    `reasoning should cite unmet dep, got: ${e.reasoning}`);
});

// ─── non-throwing guarantee ─────────────────────────────────────────────

test("unmet deps NEVER throw (pure filter, not an error)", () => {
  const projectDir = mkTmpProject();
  const nodes = [];
  for (let i = 1; i <= 20; i++) {
    nodes.push(node(`M99-D1-T${i}`, { status: "pending", deps: [`M99-D9-T${i}`] })); // all unknown
  }
  const graph = graphFromNodes(nodes, nodes.map((n) => n.id));
  // Must not throw
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });
  assert.equal(ready.length, 0);
  assert.equal(vetoed.length, 20);
  assert.equal(readTodayEvents(projectDir).length, 20);
});

test("malformed opts (missing graph) DOES throw — programming error", () => {
  assert.throws(() => validateDepGraph({}), /opts\.graph/);
  assert.throws(() => validateDepGraph(), /opts must be an object/);
  assert.throws(() => validateDepGraph({ graph: null }), /opts\.graph/);
});

// ─── skipped/failed deps do not satisfy ─────────────────────────────────

test("skipped dep does NOT satisfy dependents — veto", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "skipped" });
  const n2 = node("M99-D1-T2", { status: "pending", deps: ["M99-D1-T1"] });
  const graph = graphFromNodes([n1, n2], ["M99-D1-T2"]);
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });
  assert.equal(ready.length, 0);
  assert.equal(vetoed.length, 1);
  assert.equal(vetoed[0].task.id, "M99-D1-T2");
});

test("failed dep does NOT satisfy dependents — veto", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "failed" });
  const n2 = node("M99-D1-T2", { status: "pending", deps: ["M99-D1-T1"] });
  const graph = graphFromNodes([n1, n2], ["M99-D1-T2"]);
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });
  assert.equal(ready.length, 0);
  assert.equal(vetoed.length, 1);
  assert.deepEqual(vetoed[0].unmet_deps, ["M99-D1-T1"]);
});

// ─── side-effect surface checks ─────────────────────────────────────────

test("events directory is created on demand", () => {
  const projectDir = mkTmpProject();
  // No .gsd-t/events/ yet
  assert.ok(!fs.existsSync(path.join(projectDir, ".gsd-t", "events")));

  const n1 = node("M99-D1-T1", { status: "pending", deps: ["X-X-X1-T9"] });
  const graph = graphFromNodes([n1], ["M99-D1-T1"]);
  validateDepGraph({ graph, projectDir });

  assert.ok(fs.existsSync(path.join(projectDir, ".gsd-t", "events")),
    "events dir should be created on demand");
});

test("multiple unmet deps on one task → single veto event with all ids", () => {
  const projectDir = mkTmpProject();
  const n1 = node("M99-D1-T1", { status: "pending" });
  const n2 = node("M99-D1-T2", { status: "pending" });
  const n3 = node("M99-D1-T3", {
    status: "pending",
    deps: ["M99-D1-T1", "M99-D1-T2", "M99-D9-T99"],
  });
  const graph = graphFromNodes([n1, n2, n3], ["M99-D1-T3"]);
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });
  assert.equal(ready.length, 0);
  assert.equal(vetoed.length, 1);
  assert.deepEqual(vetoed[0].unmet_deps, ["M99-D1-T1", "M99-D1-T2", "M99-D9-T99"]);

  const events = readTodayEvents(projectDir);
  assert.equal(events.length, 1, "exactly one event per vetoed task");
  assert.deepEqual(events[0].unmet_deps, ["M99-D1-T1", "M99-D1-T2", "M99-D9-T99"]);
});

// ─── M44-D4 synthetic gate fixture (T4 acceptance) ──────────────────────

test("M44-D4 gate fixture — task with unmet dep is vetoed, independent task is ready", () => {
  const projectDir = mkTmpProject();
  const indep = node("M44-D9-T1", { domain: "m44-d9-test", status: "pending" });
  const blocked = node("M44-D9-T2", {
    domain: "m44-d9-test",
    status: "pending",
    deps: ["M44-D9-T99"], // unknown → unmet
  });
  const graph = graphFromNodes([indep, blocked], ["M44-D9-T1", "M44-D9-T2"]);
  const { ready, vetoed } = validateDepGraph({ graph, projectDir });

  assert.deepEqual(ready.map((t) => t.id), ["M44-D9-T1"]);
  assert.equal(vetoed.length, 1);
  assert.equal(vetoed[0].task.id, "M44-D9-T2");
  assert.deepEqual(vetoed[0].unmet_deps, ["M44-D9-T99"]);
});
