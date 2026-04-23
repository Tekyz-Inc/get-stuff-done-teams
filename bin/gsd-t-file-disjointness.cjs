"use strict";

/**
 * gsd-t-file-disjointness — M44 D5 (SKELETON — T1)
 *
 * Pre-spawn file-disjointness prover. Consumes the task-graph DAG from D1 and
 * partitions a candidate parallel set into:
 *   - parallel   — groups confirmed pairwise-disjoint (safe to spawn together)
 *   - sequential — groups sharing ≥1 write target (must serialize)
 *   - unprovable — tasks with no touch-list source (routed sequential; safe-default)
 *
 * Contract: .gsd-t/contracts/file-disjointness-contract.md
 *
 * Hard rules (from constraints.md):
 *   - Unprovable is ALWAYS safe — never assume disjointness
 *   - Zero external runtime deps (Node built-ins + git subprocess only)
 *   - Never throws (returns result object)
 *   - Read-only on all domain files; only writes to .gsd-t/events/YYYY-MM-DD.jsonl
 *   - D5 checks WRITE targets only; reads never conflict
 *   - Mode-agnostic
 *
 * Finalized in T2.
 */

// Stub — finalized implementation lands in T2.
function proveDisjointness(/* { tasks, projectDir } */) {
  return { parallel: [], sequential: [], unprovable: [] };
}

module.exports = {
  proveDisjointness,
};
