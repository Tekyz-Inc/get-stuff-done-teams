# Dep-Graph Validation Contract — v0.1.0 (skeleton)

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d4-depgraph-validation
**Consumers**: m44-d2-parallel-cli (pre-spawn gate), m44-d3-command-file-integration
**Status**: SKELETON — veto semantics + event format stubbed. Full rules finalized in v1.0.0 (D4-T2).

---

## 1. Purpose

Defines the pre-spawn dependency gate that filters a "candidate ready set" (typically `graph.ready` from `bin/gsd-t-task-graph.cjs`) down to a subset whose declared `deps[]` are all **done**. Tasks with any unmet dep are vetoed: removed from the ready list AND recorded as a `dep_gate_veto` event on the append-only event stream.

D4 is the authority on "why wasn't this task spawned?" attribution. D1 builds the graph; D4 turns "unmet" into an observable veto record.

## 2. Module Interface (stub)

```js
const { validateDepGraph } = require('./bin/gsd-t-depgraph-validate.cjs');

const { ready, vetoed } = validateDepGraph({ graph, projectDir });
// ready   → TaskNode[]   — tasks whose deps are all done (OK to spawn)
// vetoed  → { task, unmet_deps }[]  — one entry per vetoed task; task is a TaskNode, unmet_deps is a string[] of dep ids
```

## 3. Veto Semantics (stub)

A task is **vetoed** iff any of:
- A dep id in `task.deps` does not exist in `graph.byId` (unknown reference).
- A dep id resolves to a node whose `status !== 'done'` (pending / skipped / failed all veto — only `done` satisfies, per task-graph-contract §5).

Vetoed tasks are removed from the returned `ready` set. The caller (D2) decides whether to spawn the smaller batch or fall back to sequential execution.

## 4. Event Format (stub)

For every vetoed task, `validateDepGraph` appends ONE `dep_gate_veto` event to `.gsd-t/events/YYYY-MM-DD.jsonl` (rotation + schema per `event-schema-contract.md`). The event carries:

```
{
  ts:           <ISO 8601 UTC ms>,
  event_type:   "dep_gate_veto",
  task_id:      <string>,
  domain:       <string>,
  unmet_deps:   [<dep_id>, …],
  …base event fields (command/phase/agent_id/parent_agent_id/trace_id/reasoning/outcome/model)
}
```

## 5. Non-Throwing Guarantee (stub)

`validateDepGraph` MUST NOT throw on unmet deps — that is normal control flow, not an error. It only throws on programming errors (e.g., `opts.graph` not an object). Cycle detection is D1's job and happens earlier during `buildTaskGraph`.

## 6. Read-Only Guarantee (stub)

D4 MUST NEVER write to `tasks.md`, `scope.md`, or any domain artifact. Its only write surface is appending JSONL lines to `.gsd-t/events/YYYY-MM-DD.jsonl`.

## 7. Performance Budget (stub)

`validateDepGraph` MUST add **< 50 ms** to the pre-spawn path on realistic graphs (100 domains / 1000 tasks). Synchronous I/O only; no network, no async deferred work in the main path.

## 8. Mode-Agnosticism (stub)

D4 is mode-agnostic. Same call shape in [in-session] and [unattended] modes. Mode-specific decisions (what to do with the reduced set — spawn smaller batch vs fall back to sequential) are owned by D2.

---

## Version History

- **v0.1.0** (2026-04-22, this file) — Skeleton: interface + section headings + stub bodies. Finalized in v1.0.0 (D4-T2).
