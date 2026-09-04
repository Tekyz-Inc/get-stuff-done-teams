# Dep-Graph Validation Contract — v1.0.0

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d4-depgraph-validation
**Consumers**: m44-d2-parallel-cli (pre-spawn gate), m44-d3-command-file-integration
**Status**: ACTIVE — finalized 2026-04-22 (D4-T2)

---

## 1. Purpose

Defines the pre-spawn dependency gate that filters a candidate-ready set (typically `graph.ready` from `bin/gsd-t-task-graph.cjs`) down to a subset whose declared `deps[]` are all **done**. Tasks with any unmet dep are vetoed: removed from the returned ready list AND recorded as a `dep_gate_veto` event on the append-only event stream.

D4 is the authority on "why wasn't this task spawned?" attribution. D1 builds the graph; D4 turns "unmet" into an observable veto record. D2 decides what to do with the reduced set (spawn smaller batch, fall back to sequential, etc.).

## 2. Module Interface

```js
const { validateDepGraph } = require('./bin/gsd-t-depgraph-validate.cjs');

const { ready, vetoed } = validateDepGraph({ graph, projectDir });
// ready   → TaskNode[]                       — tasks whose deps are all done (OK to spawn)
// vetoed  → { task: TaskNode, unmet_deps: string[] }[]
//            one entry per vetoed task; unmet_deps lists the dep ids that failed
```

`validateDepGraph(opts)`:
- `opts.graph` (object, required) — the DAG emitted by `buildTaskGraph`. Must carry `byId: {[id]: TaskNode}`; MAY carry `ready: string[]` (preferred — candidate set) and `nodes: TaskNode[]` (fallback when no `ready` mask present: every pending node becomes a candidate).
- `opts.projectDir` (string) — repo root that contains `.gsd-t/events/`. Defaults to `process.cwd()`.
- Returns the `{ready, vetoed}` pair defined above.
- Synchronous; never performs network I/O.
- **Never throws on unmet deps** (see §5). Only throws on malformed input (missing `opts` / missing `opts.graph`).

## 3. Veto Semantics

A candidate task is **vetoed** iff ANY of its `deps[]` entries fail the DONE-check:

- `graph.byId[depId]` does not exist → unknown reference → veto.
- `graph.byId[depId].status !== 'done'` → pending / skipped / failed → veto.

Only `done` satisfies a dep (per `task-graph-contract.md` §5). `skipped` does NOT satisfy: a skipped task may have left work undone that the dependent assumed. `failed` does not satisfy either, for the same reason.

Each vetoed task appears exactly once in the `vetoed` array, carrying the ORIGINAL task node (not a copy) and the full list of unmet dep ids in declaration order.

The returned `ready` array preserves the order of `graph.ready` (candidate order): D4 does not rank, re-order, or prioritize. Ordering is D2's concern (e.g., by wave, by economics).

## 4. Event Format

For every vetoed task, `validateDepGraph` appends exactly ONE `dep_gate_veto` event to `.gsd-t/events/YYYY-MM-DD.jsonl` (rotation + base schema per `event-schema-contract.md`). The event carries the standard base fields (null when not owned by D4) plus D4-specific additive fields:

```json
{
  "ts":              "<ISO 8601 UTC with ms, e.g. 2026-04-22T15:30:12.345Z>",
  "event_type":      "dep_gate_veto",
  "command":         null,
  "phase":           null,
  "agent_id":        null,
  "parent_agent_id": null,
  "trace_id":        null,
  "reasoning":       "unmet deps: <dep1>, <dep2>",
  "outcome":         "deferred",
  "model":           null,
  "task_id":         "<task.id>",
  "domain":          "<task.domain>",
  "unmet_deps":      ["<dep1>", "<dep2>", ...]
}
```

Day rotation is derived from `ts.slice(0, 10)` (UTC date of the event). The events directory is created on demand (`mkdir -p` equivalent). Event-log I/O failures are silently swallowed — D4 must never break the caller's control flow over a logging hiccup.

Callers that want richer context (command / trace / agent id) can enrich the event at a later layer by pairing the `(task_id, ts)` with their own trace events — D4 emits the bare canonical form so it can be called from anywhere without a coupling to the supervisor/orchestrator env.

## 5. Non-Throwing Guarantee

`validateDepGraph` MUST NOT throw on:
- Unmet deps (normal control flow — they go into `vetoed`).
- Unknown dep ids (treated the same as unmet — §3).
- Event-file I/O errors (`.gsd-t/events/` unwritable, disk full, etc.).

It MAY throw only on programming errors:
- `opts` is not an object.
- `opts.graph` is missing or not an object.

Rationale: a hard throw on unmet deps would kill the entire parallel path when only SOME candidates are blocked. D4 reduces the set; the caller keeps going with whatever is ready. Cycle detection is D1's responsibility and happens earlier during `buildTaskGraph` (throws `TaskGraphCycleError`).

## 6. Read-Only Guarantee

D4 MUST NEVER write to `tasks.md`, `scope.md`, or any contract file. Its ONLY write surface is appending JSONL lines to `.gsd-t/events/YYYY-MM-DD.jsonl` (and creating the `.gsd-t/events/` directory on demand).

State transitions on `tasks.md` (flipping `[ ]` → `[x]` after a task completes) are owned by `gsd-t-execute` / the supervisor — not D4.

## 7. Performance Budget

`validateDepGraph` MUST add **< 50 ms** to the pre-spawn path on realistic graphs (100 domains / 1000 tasks). Implementation is O(R · D) where R = |candidate set| and D = average deps per task. Synchronous I/O only — at most one `appendFileSync` per vetoed task. No network. No async deferred work.

## 8. Mode-Agnosticism

D4 is mode-agnostic. The same `validateDepGraph` call is used identically in [in-session] and [unattended] modes. Mode-specific decisions (what to do with the reduced set — spawn smaller batch vs fall back to sequential) are entirely D2's responsibility.

## 9. Interaction with Other M44 Gates

D4 runs **before** D5 (file-disjointness) and D6 (economics) in the pre-spawn pipeline:

```
graph.ready
    │
    ▼
  D4 validateDepGraph     ← removes deps-unmet tasks (this contract)
    │
    ▼
  D5 disjointness check   ← removes file-overlap tasks
    │
    ▼
  D6 economics            ← removes tasks over cost ceiling
    │
    ▼
  final parallel batch    ← D2 spawns
```

Each gate's `vetoed` output is independent — a task vetoed by D4 never reaches D5 or D6 (so no double-vetoing). This ordering is owned by D2 and is not a requirement of this contract; D4 just guarantees it behaves correctly as a pure filter.

---

## Version History

- **v1.0.0** (2026-04-22, D4-T2) — Full rules locked. Veto semantics, event format, non-throw guarantee, perf budget, and pipeline ordering all finalized. Downstream domains (D2) may wire the gate in.
- **v0.1.0** (2026-04-22, D4-T1) — Skeleton: interface + section headings + stub bodies.
