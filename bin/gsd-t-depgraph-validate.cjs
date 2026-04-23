"use strict";

/**
 * gsd-t-depgraph-validate — M44 D4
 *
 * Pre-spawn dependency gate. Consumes the DAG from `bin/gsd-t-task-graph.cjs`
 * and filters candidate-ready tasks down to those whose declared `deps[]`
 * are all in DONE status. Vetoed tasks (any unmet dep, or any dep
 * referencing an unknown task id) are removed from the returned ready set
 * AND appended to the event stream as `dep_gate_veto` records so that
 * "why wasn't this task spawned?" is observable.
 *
 * Contract: .gsd-t/contracts/depgraph-validation-contract.md (v1.0.0)
 *
 * Hard rules (from constraints.md):
 *   - Zero external runtime deps (Node built-ins only)
 *   - Never throws on unmet deps; only throws on programming errors
 *   - Read-only on tasks.md / scope.md / contracts; only writes appended
 *     JSONL lines to .gsd-t/events/YYYY-MM-DD.jsonl
 *   - Synchronous; < 50 ms on realistic graphs
 *   - Mode-agnostic (no in-session vs unattended branching)
 *   - A task's dep is satisfied iff graph.byId[depId] exists AND
 *     byId[depId].status === 'done' (skipped/failed/pending all veto)
 */

const fs = require("node:fs");
const path = require("node:path");

// ─── event stream writer (self-contained; no external deps) ───────────────

/**
 * Append one JSON-line event to `.gsd-t/events/YYYY-MM-DD.jsonl`.
 * Creates the events directory on demand. Never throws on I/O failure —
 * event logging must never break the caller's control flow.
 */
function appendEvent(projectDir, event) {
  try {
    const eventsDir = path.join(projectDir, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const day = event.ts.slice(0, 10); // YYYY-MM-DD from ISO string
    const file = path.join(eventsDir, `${day}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(event) + "\n");
  } catch {
    // Intentionally swallowed — D4 must not throw on event-log failure.
  }
}

/**
 * Build a `dep_gate_veto` event with the base event-schema fields filled in
 * (null for optional context the gate doesn't own) plus the D4-specific
 * extras documented in depgraph-validation-contract.md §4.
 */
function buildVetoEvent(task, unmetDeps) {
  return {
    ts: new Date().toISOString(),
    event_type: "dep_gate_veto",
    command: null,
    phase: null,
    agent_id: null,
    parent_agent_id: null,
    trace_id: null,
    reasoning: `unmet deps: ${unmetDeps.join(", ")}`,
    outcome: "deferred",
    model: null,
    // D4-specific additive fields:
    task_id: task.id,
    domain: task.domain,
    unmet_deps: unmetDeps.slice(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Validate that each candidate-ready task has all of its deps satisfied.
 * Returns the reduced ready set (node objects, ordered as in graph.ready)
 * and the list of vetoes (one per task, carrying the full node + the
 * unmet-dep ids).
 *
 * Never throws on unmet deps; only throws on malformed input.
 *
 * @param {{graph: object, projectDir: string}} opts
 * @returns {{ready: object[], vetoed: {task: object, unmet_deps: string[]}[]}}
 */
function validateDepGraph(opts) {
  if (!opts || typeof opts !== "object") {
    throw new TypeError("validateDepGraph: opts must be an object");
  }
  const { graph, projectDir } = opts;
  if (!graph || typeof graph !== "object") {
    throw new TypeError("validateDepGraph: opts.graph must be the DAG object from buildTaskGraph");
  }
  const byId = graph.byId || Object.create(null);
  const pd = projectDir || process.cwd();

  // Candidate set: if graph.ready exists use it, else fall back to every
  // pending node (defensive — keeps the function useful when the caller
  // passes a hand-built fixture graph without a pre-computed ready mask).
  let candidateIds;
  if (Array.isArray(graph.ready) && graph.ready.length) {
    candidateIds = graph.ready.slice();
  } else if (Array.isArray(graph.nodes)) {
    candidateIds = graph.nodes
      .filter((n) => n && n.status === "pending")
      .map((n) => n.id);
  } else {
    candidateIds = [];
  }

  const ready = [];
  const vetoed = [];

  for (const id of candidateIds) {
    const task = byId[id];
    if (!task) continue; // stale id in ready mask — skip silently
    const deps = Array.isArray(task.deps) ? task.deps : [];
    const unmet = [];
    for (const d of deps) {
      const dep = byId[d];
      if (!dep || dep.status !== "done") {
        unmet.push(d);
      }
    }
    if (unmet.length === 0) {
      ready.push(task);
    } else {
      vetoed.push({ task, unmet_deps: unmet });
      appendEvent(pd, buildVetoEvent(task, unmet));
    }
  }

  return { ready, vetoed };
}

module.exports = {
  validateDepGraph,
  // Exposed for unit tests only; not a stable public surface.
  _buildVetoEvent: buildVetoEvent,
  _appendEvent: appendEvent,
};
