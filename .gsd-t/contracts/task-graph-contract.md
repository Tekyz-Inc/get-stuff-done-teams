# Task Graph Contract — v0.1.0 (skeleton)

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d1-task-graph-reader
**Consumers**: m44-d2-parallel-cli, m44-d4-depgraph-validation, m44-d5-file-disjointness-prover, m44-d6-pre-spawn-economics
**Status**: SKELETON — schema stubs only. Full schema lands in v1.0.0 (D1-T2).

---

## 1. Purpose

Defines the in-memory DAG (directed acyclic graph) emitted by `bin/gsd-t-task-graph.cjs` after parsing every `.gsd-t/domains/*/tasks.md` (and falling back to `scope.md` for touch lists). The DAG is the **single shared input** that downstream M44 domains consume — D1 is mode-agnostic and produces only the graph.

## 2. Module Interface (stub)

```js
const { buildTaskGraph, getReadyTasks, TaskGraphCycleError } = require('./bin/gsd-t-task-graph.cjs');

const graph = buildTaskGraph({ projectDir });
// → { nodes: TaskNode[], edges: Edge[], ready: string[], byId: { [id]: TaskNode }, warnings: string[] }

const ready = getReadyTasks(graph);
// → TaskNode[]  — same content as graph.nodes filtered by graph.ready
```

## 3. Node Schema (stub — finalized in v1.0.0)

```
TaskNode {
  id: string,         // e.g. "M44-D1-T2"
  domain: string,     // domain dir basename, e.g. "m44-d1-task-graph-reader"
  wave: number,       // wave index from "## Wave N — …" heading
  title: string,      // task title (line after ###)
  status: 'pending' | 'done' | 'skipped' | 'failed',
  touches: string[],  // file paths this task expects to write
  deps: string[],     // task ids this depends on
}
```

## 4. Edge Schema (stub)

```
Edge {
  from: string,  // dependent task id
  to: string,    // dependency task id (must be DONE before `from` is ready)
}
```

## 5. Ready-Mask Semantics (stub)

A task is **ready** iff:
- `status === 'pending'`, AND
- every entry in `deps[]` resolves to a node whose `status === 'done'`.

Tasks whose deps reference unknown ids are NOT ready (an unknown dep is treated as unmet; D4 owns the veto event).

## 6. Cycle Detection (stub)

`buildTaskGraph` MUST throw `TaskGraphCycleError` when a circular dependency is detected. The error carries `.cycle: string[]` listing the task ids in the cycle (start → … → start).

## 7. Touch-List Fallback (stub)

When a task block omits a `**Touches**:` line:
1. Fall back to the domain's `scope.md` "Files Owned" section (whole-domain coarse list).
2. If neither source provides a list, set `touches: []` and append a warning to `graph.warnings`.

## 8. Status Markers (stub)

| Marker | Status |
|--------|--------|
| `[ ]`  | `pending` |
| `[x]` / `[X]` | `done` |
| `[-]`  | `skipped` |
| `[!]`  | `failed` |

Unknown markers are treated as `pending` with a warning appended to `graph.warnings`.

## 9. Performance Budget (stub)

`buildTaskGraph` MUST complete in **< 200 ms** for a 100-domain / 1000-task project. Synchronous I/O only; no network, no async deferred work in the main path.

## 10. Read-Only Guarantee

D1 MUST NEVER write to any `tasks.md`, `scope.md`, or contract file during `buildTaskGraph` or `getReadyTasks`. Pure read.

---

## Version History

- **v0.1.0** (2026-04-22, this file) — Skeleton: interface + section headings only. Bodies finalized in v1.0.0.
