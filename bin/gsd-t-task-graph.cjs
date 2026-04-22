"use strict";

/**
 * gsd-t-task-graph — M44 D1 (skeleton, T1)
 *
 * Parses `.gsd-t/domains/* /tasks.md` (and `scope.md` for fallback touch-lists)
 * into an in-memory DAG that downstream M44 domains consume:
 *   - D2 `gsd-t parallel` CLI
 *   - D4 dep-graph validation (veto on unmet deps)
 *   - D5 file-disjointness prover (touch-list overlap check)
 *   - D6 pre-spawn economics (per-task cost estimate)
 *
 * Contract: .gsd-t/contracts/task-graph-contract.md
 *
 * THIS IS A T1 SCAFFOLD — full parser + cycle detection lands in T2.
 */

class TaskGraphCycleError extends Error {
  constructor(cycle) {
    super(`Task graph cycle detected: ${Array.isArray(cycle) ? cycle.join(" → ") : "(unknown)"}`);
    this.name = "TaskGraphCycleError";
    this.cycle = Array.isArray(cycle) ? cycle.slice() : [];
  }
}

/**
 * Build the task graph from .gsd-t/domains/<domain>/tasks.md (+ scope.md
 * fallback for touches). Synchronous. Throws TaskGraphCycleError on cycle.
 *
 * @param {{projectDir: string}} opts
 * @returns {{nodes: object[], edges: object[], ready: string[],
 *            byId: Object<string, object>, warnings: string[]}}
 */
function buildTaskGraph(_opts) {
  // TODO(M44-D1-T2): real parser + cycle detection + touch fallback.
  return { nodes: [], edges: [], ready: [], byId: {}, warnings: [] };
}

/**
 * Convenience: return the list of ready TaskNode objects.
 */
function getReadyTasks(_graph) {
  // TODO(M44-D1-T2): map graph.ready → graph.byId entries.
  return [];
}

module.exports = {
  buildTaskGraph,
  getReadyTasks,
  TaskGraphCycleError,
};
