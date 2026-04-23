# File-Disjointness Prover Contract — v0.1.0 (SKELETON)

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d5-file-disjointness-prover
**Consumers**: m44-d2-parallel-cli, m44-d6-pre-spawn-economics
**Status**: SKELETON — finalized at v1.0.0 in D5-T2

---

## 1. Purpose

Before spawning two or more tasks in parallel, prove that their declared write
targets are **pairwise disjoint**. If any two tasks would write the same file,
they cannot run concurrently — D5 removes them from the parallel set and routes
them to the sequential queue. This is the last pre-spawn gate after D4's
dependency check and before D6's economics decision.

D5 consumes the task-graph object produced by D1 (the `touches` field is
already resolved per task-graph-contract §7) and is **mode-agnostic**: the same
function is called in both in-session and unattended execution.

## 2. Module Interface

```js
const { proveDisjointness } = require('./bin/gsd-t-file-disjointness.cjs');

const result = proveDisjointness({ tasks, projectDir });
// → {
//     parallel:    TaskNode[][],  // groups confirmed pairwise-disjoint
//     sequential:  TaskNode[][],  // groups sharing ≥1 write target
//     unprovable:  TaskNode[],    // tasks with no touch-list source (routed sequential)
//   }
```

- Synchronous. Never throws for overlap or unprovable; always returns a result.
- `tasks`: array of task nodes (as emitted by D1), each carrying at least
  `id`, `domain`, `touches`.
- `projectDir`: repo root — used only for locating `.gsd-t/events/` (event append)
  and `.gsd-t/domains/` (git-history fallback).

## 3. Proof Algorithm

(finalized in v1.0.0 — skeleton)

## 4. Fallback Chain

(finalized in v1.0.0 — skeleton)

## 5. Event Format

(finalized in v1.0.0 — skeleton)

---

## Version History

- **v0.1.0** (2026-04-22, D5-T1) — Skeleton: interface + section headings only.
