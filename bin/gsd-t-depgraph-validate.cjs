"use strict";

/**
 * gsd-t-depgraph-validate — M44 D4 (skeleton, T1)
 *
 * Pre-spawn dependency gate. Consumes the DAG from `bin/gsd-t-task-graph.cjs`
 * and filters `graph.ready` down to tasks whose declared `deps[]` are all
 * in DONE status. Vetoed tasks (any unmet dep, or any dep referencing an
 * unknown task id) are appended to the event stream as `dep_gate_veto`
 * records so that "why wasn't this task spawned?" is observable.
 *
 * Contract: .gsd-t/contracts/depgraph-validation-contract.md
 *
 * THIS IS A T1 SCAFFOLD — real filtering + event append lands in T2.
 *
 * Hard rules (from constraints.md):
 *   - Zero external runtime deps (Node built-ins only)
 *   - Never throws on unmet deps; only throws on programming errors
 *   - Read-only on tasks.md / scope.md / contracts; only writes appended
 *     JSONL lines to .gsd-t/events/YYYY-MM-DD.jsonl
 *   - Synchronous; < 50 ms on realistic graphs
 *   - Mode-agnostic
 */

/**
 * Validate that every task in the graph's ready set has all its dependencies
 * satisfied (all deps in `done` status and present in graph.byId). Vetoed
 * tasks are removed from the returned `ready` set AND appended to the event
 * stream as `dep_gate_veto` events.
 *
 * @param {{graph: object, projectDir: string}} opts
 * @returns {{ready: object[], vetoed: {task: object, unmet_deps: string[]}[]}}
 */
function validateDepGraph(_opts) {
  // TODO(M44-D4-T2): real filtering + event append.
  return { ready: [], vetoed: [] };
}

module.exports = {
  validateDepGraph,
};
