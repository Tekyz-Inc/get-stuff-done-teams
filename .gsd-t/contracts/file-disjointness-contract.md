# File-Disjointness Prover Contract — v1.0.0

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d5-file-disjointness-prover
**Consumers**: m44-d2-parallel-cli, m44-d6-pre-spawn-economics
**Status**: ACTIVE — finalized 2026-04-22 (D5-T2)

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
//     parallel:    TaskNode[][],  // groups confirmed pairwise-disjoint (singletons only at v1.0.0)
//     sequential:  TaskNode[][],  // groups sharing ≥1 write target (plus unprovable singletons)
//     unprovable:  TaskNode[],    // tasks with no touch-list source (also listed in sequential)
//   }
```

- `tasks`: array of task nodes as emitted by D1. Each node carries at least
  `id`, `domain`, and `touches` (may be `[]`).
- `projectDir`: repo root — used only for locating `.gsd-t/events/` (event
  append) and `.gsd-t/domains/` (git-history fallback).
- Synchronous. Never throws. Always returns a result object.

## 3. Proof Algorithm

1. **Resolve effective touch list** per task via the fallback chain in §4.
2. **Classify** each task:
   - Unprovable (no source yielded any paths) → added to `unprovable` AND
     appended as a singleton to `sequential`. Event emitted with
     `reason: 'unprovable'`. Safe-default: never assume disjoint.
   - Provable → join the overlap-grouping pass.
3. **Overlap grouping** via union-find over the pairwise-overlap relation on
   write targets. Two tasks `a` and `b` overlap iff
   `a.touches ∩ b.touches ≠ ∅`.
   - A connected component of size 1 → `parallel` (safe to spawn alongside
     other parallel singletons).
   - A connected component of size ≥ 2 → `sequential`. One
     `disjointness_fallback` event per task in the group with
     `reason: 'write-target-overlap'`.

Only WRITE targets matter. Read-only file access never produces a conflict;
the task-graph `touches` field already reflects expected writes only (see
task-graph-contract §3.2 and §7).

## 4. Fallback Chain (touch-list source priority)

1. **Explicit `touches`** on the task node — populated by D1 from
   `**Touches**:` or `**Files touched**:` in `tasks.md`, or from the
   scope.md `## Files Owned` fallback (task-graph-contract §7). D5 uses
   `task.touches` as-is when non-empty.
2. **Git-history heuristic** — only when `task.touches === []`:
   - `git log --name-only --pretty=format:"COMMIT:%H %s" -n 100 -- .gsd-t/domains/<task.domain>/`
   - For every commit whose subject contains the task id, collect every
     file path listed under that commit.
   - Bounded to 100 commits to prevent runaway I/O.
   - `child_process.execSync` wrapped in `try/catch` — on any git failure
     (no repo, missing binary, non-zero exit), treat as no result.
3. **Unprovable** — no source yielded any paths → always routed sequential
   as a singleton, with event `reason: 'unprovable'`.

## 5. Event Format

For every task routed to `sequential` (including unprovable singletons),
append a line to `.gsd-t/events/YYYY-MM-DD.jsonl` (UTC date at write time):

```json
{
  "type": "disjointness_fallback",
  "task_id": "M44-D2-T3",
  "reason": "unprovable" | "write-target-overlap",
  "ts": "2026-04-22T14:07:33.482Z"
}
```

Reason values:
- `unprovable` — no touch-list source produced paths (explicit field absent,
  scope.md empty, git-history heuristic matched nothing in the last 100
  commits).
- `write-target-overlap` — the task shares at least one write target with
  another task in the same candidate parallel set.

Event writing is **best-effort**: filesystem errors are swallowed (the event
stream is observability, not a correctness gate). The prover never throws.

Note: this event shape is intentionally compact — it is a D5-local trace
record for pre-spawn decisions, not a full event-schema-contract §2 envelope.
The main event stream is written by the event-writer CLI for command-level
transitions; this file is the same JSONL file so downstream tooling
(`gsd-t-reflect`, dashboards) can see both kinds of entries.

## 6. Read-Only Guarantee

D5 MUST NEVER write to any `tasks.md`, `scope.md`, or contract file during
`proveDisjointness`. The only write surface is appending to
`.gsd-t/events/YYYY-MM-DD.jsonl`.

## 7. Mode-Agnosticism

D5 has **zero awareness** of in-session vs unattended execution. It consumes
the task-graph `touches` field and returns a partition. Downstream consumers
(D2 in-session, D6 unattended) decide what to do with `sequential` and
`unprovable` groups.

## 8. Error Handling

`proveDisjointness` is total: it never throws. Specific degraded modes:

- Git subprocess failure → treated as "no match"; task becomes unprovable.
- `.gsd-t/events/` unwritable → event silently dropped; result still returned.
- `opts.tasks` missing / non-array → result is all-empty.
- Task with missing `touches` field → treated as `[]` (falls through to
  git-history heuristic).

## 9. Performance

`proveDisjointness` is O(N² × |touches|) in the worst case (pairwise overlap
check). For the expected M44 scale (≤ 20 candidate parallel tasks per spawn
cycle) this is negligible. The git-history fallback is the expensive path;
only tasks with entirely empty `touches` pay it, and it is bounded to 100
commits per task.

---

## Version History

- **v1.0.0** (2026-04-22, D5-T2) — Full schema locked. Real prover,
  union-find grouping, git-history fallback, event emission. Downstream
  consumers may wire in.
- **v0.1.0** (2026-04-22, D5-T1) — Skeleton: interface + section headings only.
