# Task Graph Contract — v1.1.0

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d1-task-graph-reader
**Consumers**: m44-d2-parallel-cli, m44-d3-command-file-integration, m44-d4-depgraph-validation, m44-d5-file-disjointness-prover, m44-d6-pre-spawn-economics
**Status**: ACTIVE — finalized 2026-04-22 (D1-T2)

---

## 1. Purpose

Defines the in-memory DAG (directed acyclic graph) emitted by `bin/gsd-t-task-graph.cjs` after parsing every `.gsd-t/domains/*/tasks.md` (and falling back to `scope.md` for touch lists). The DAG is the **single shared input** that downstream M44 domains consume — D1 is mode-agnostic and produces only the graph.

This contract is the boundary between "how tasks are written down" (markdown convention in `tasks.md`) and "how tasks are reasoned about" (typed graph structure). Downstream code MUST NOT re-parse `tasks.md` itself; it MUST consume the graph object emitted by `buildTaskGraph`.

## 2. Module Interface

```js
const {
  buildTaskGraph,
  getReadyTasks,
  TaskGraphCycleError,
} = require('./bin/gsd-t-task-graph.cjs');

const graph = buildTaskGraph({ projectDir });
// → { nodes: TaskNode[], edges: Edge[], ready: string[], byId: {[id]: TaskNode}, warnings: string[] }

const ready = getReadyTasks(graph);
// → TaskNode[]  — same content as graph.nodes filtered by graph.ready
```

`buildTaskGraph(opts)`:
- `opts.projectDir` (string, required) — repo root containing `.gsd-t/domains/`
- Returns the graph object described in §3-§5
- Throws `TaskGraphCycleError` if a cycle is detected (see §6)
- Synchronous; never performs network I/O or async deferred work

`getReadyTasks(graph)`:
- Returns `graph.ready.map(id => graph.byId[id])` (filtered for null entries)
- Pure function, never throws

`TaskGraphCycleError`:
- `name === "TaskGraphCycleError"`, `instanceof Error`
- `.cycle: string[]` — task ids forming the cycle, listed start → … → start

## 3. Node Schema

```
TaskNode {
  id: string,         // canonical id, e.g. "M44-D1-T2"
  domain: string,     // domain dir basename, e.g. "m44-d1-task-graph-reader"
  wave: number,       // wave index from "## Wave N — …" heading; 0 if no heading seen yet
  title: string,      // task title (text after the id on the ### line)
  status: 'pending' | 'done' | 'skipped' | 'failed',
  touches: string[],  // file paths this task expects to write (resolved per §7)
  deps: string[],     // task ids this depends on (resolved per §3.1)
}
```

### 3.1 Dependency declaration in `tasks.md`

The parser recognizes:
```
- **Dependencies**: M44-D1-T2, M44-D7-T1
- **Dependencies**: none
- **Dependencies**: M44-D1-T5 (D1 complete), M44-D4-T4 (D4 complete)
```
Trailing parentheticals are stripped. Tokens that don't match `/[A-Z]\d+-D\d+-T\d+/` are dropped silently.

`Deps` (singular alias) is also recognized.

### 3.2 Touches declaration in `tasks.md`

The parser recognizes both forms:
```
- **Touches**: bin/foo.cjs, test/bar.test.js
- **Files touched**: bin/foo.cjs (new), test/bar.test.js
```
Backticks and trailing parentheticals (e.g. `(new)`) are stripped. An explicit empty list (`- **Touches**:`) is honored — the scope.md fallback only fires when the field is **absent entirely** (see §7).

## 4. Edge Schema

```
Edge {
  from: string,  // dependent task id
  to: string,    // dependency task id (must be DONE before `from` is ready)
}
```

`graph.edges` is a flat array of every dep edge across all domains (same edge may appear once per cross-domain pair). Edges that reference unknown task ids are still emitted — they exist as a record of the declaration so D4 can veto on the unknown reference.

## 5. Ready-Mask Semantics

`graph.ready` contains the ids of tasks that are eligible to run RIGHT NOW. A task `t` is in `graph.ready` iff:

1. `t.status === 'pending'`, AND
2. for every `d ∈ t.deps`: `byId[d]` exists AND `byId[d].status === 'done'`.

Tasks whose deps reference unknown ids are NOT ready. (D4 is the authority on emitting `dep_gate_veto` events for the unmet/unknown case; D1 just doesn't include them in `ready`.)

`done`, `skipped`, and `failed` tasks are never in `ready`. `skipped` deps do NOT satisfy dependents — only `done` does. (Rationale: a skipped task may have left work undone that the dependent assumed.)

## 6. Cycle Detection

`buildTaskGraph` MUST throw `TaskGraphCycleError` when a circular dependency is detected during graph construction. The thrown error carries `.cycle: string[]` listing the task ids forming the cycle, ordered start → … → start (the start id appears at both ends to make the loop visually explicit).

Implementation: iterative three-color (white/gray/black) DFS over `byId` keys (sorted for determinism). A back-edge to a `gray` node → cycle.

Cycles are non-recoverable. The caller must NOT swallow the throw and proceed with a partial graph — the partition is structurally invalid and must be fixed in `tasks.md` before any spawn can be planned.

## 7. Touch-List Fallback

For each task `t` whose `tasks.md` block did NOT declare a `**Touches**` (or `**Files touched**`) field:

1. Read `domains/<t.domain>/scope.md` and extract the bullet list under `## Files Owned`. Each bullet's first backticked path (or whitespace-delimited token containing `/` or `.`) becomes a touch entry.
2. If the resulting list is non-empty, set `t.touches = [...filesOwned]`.
3. If still empty (no `**Touches**` AND no `## Files Owned` entries), set `t.touches = []` and append a warning to `graph.warnings`.

Coarseness tradeoff: scope.md gives the WHOLE-DOMAIN file list, not per-task. This will cause D5 (file-disjointness prover) to refuse parallelism in cases a per-task list would have allowed. Acceptable: sequential fallback is always safe; the framework just runs slower. Improvement path: require `**Touches**` on every task in a future milestone.

An explicit empty `**Touches**:` line in `tasks.md` is honored as `[]` and does NOT trigger the fallback. (Empty was a deliberate declaration; absent was an oversight.)

## 7.5 Recognized Task Heading Shapes

The parser accepts two task-heading shapes. Future `gsd-t partition`/`plan`/`execute` output SHOULD emit Shape D (canonical); Shape C is retained for existing hand-authored tasks.md files using checkbox bullets.

### Shape D — canonical H3 heading (v1.0.0)

```
### M44-D1-T2 — Core parser
- **Status**: [x] done
- **Dependencies**: M44-D1-T1
- **Touches**: bin/gsd-t-task-graph.cjs
```

Status, deps, and touches come from `- **Field**:` bullets below the heading.

### Shape C — bullet-with-bold-id (v1.1.0)

```
- [ ] **M44-D9-T1** — bin/parallelism-report.cjs
  - touches: bin/parallelism-report.cjs, .gsd-t/contracts/parallelism-report-contract.md
  - deps: M44-D8-T3
```

Status comes from the `[ ]` / `[x]` / `[-]` / `[!]` checkbox in the task heading itself (§8). Dependencies and touches come from indented sub-bullets (`  - deps: …`, `  - touches: …`) — these are plain field names, not bolded. Field aliases (`dependencies`, `files touched`, `touched`) are also accepted.

### Warnings for unsupported shapes

If a `tasks.md` file exists but produces 0 tasks, the parser emits a warning identifying the most likely unsupported shape it saw: `### D1-T1` (legacy, no milestone prefix) or `## T-1:` (section headings). Callers MUST treat these as authoring bugs, not parser bugs — fix the tasks.md file to use Shape C or D.

## 8. Status Markers

| Marker | Status |
|--------|--------|
| `[ ]`  | `pending` |
| `[x]` / `[X]` | `done` |
| `[-]`  | `skipped` |
| `[!]`  | `failed` |

Unknown markers (e.g. `[?]`, `[~]`) are treated as `pending` and a warning is appended to `graph.warnings` of the form:
```
unknown status marker '[?]' on M44-D1-T7 — treating as pending
```

## 9. Warnings Channel

`graph.warnings: string[]` collects non-fatal anomalies discovered during parse. Current sources:

- Unknown status marker (§8)
- Missing touch-list with no scope.md fallback (§7)
- Duplicate task id across domains (first occurrence wins; subsequent entries dropped)
- Unreadable `tasks.md` file
- Missing `.gsd-t/domains/` directory (returns empty graph + this warning)

Warnings never cause a throw. Consumers MAY surface them (e.g. `gsd-t graph --output table` prints them after the table). Cycles are NOT warnings — they throw.

## 10. Performance Budget

`buildTaskGraph` MUST complete in **< 200 ms** for a 100-domain / 1000-task project on a modern laptop (M-series Mac or equivalent). Synchronous I/O only; no network, no async deferred work in the main path.

The current implementation is O(N + E) over tasks + edges with one `readFileSync` per `tasks.md` and at most one `readFileSync` per `scope.md` (cached). The 200 ms budget covers parse + cycle + ready-mask in one shot.

## 11. Read-Only Guarantee

D1 MUST NEVER write to any `tasks.md`, `scope.md`, or contract file during `buildTaskGraph` or `getReadyTasks`. This is the read-only invariant. State transitions (e.g., flipping `[ ]` → `[x]` after a task completes) are owned by `gsd-t-execute` / the supervisor — not D1.

## 12. Mode-Agnosticism

D1 has **zero awareness** of in-session vs unattended execution. It does not consume the context meter, does not call into the supervisor, does not branch on `--mode`. It produces a graph; downstream domains pick the gating math (D2, D6 own that).

## 13. CLI Surface (D1-T4)

```
gsd-t graph --output json    # prints the full graph as indented JSON
gsd-t graph --output table   # prints id | domain | wave | status | deps
```

Both forms run against `process.cwd()` and exit non-zero only on hard errors (cycle thrown, unreadable `.gsd-t/domains/`). Empty graph is exit-0 with an informational message.

The pre-existing `gsd-t graph index|status|query` (codebase entity graph) subcommands are unaffected — `--output` triggers the task-graph path; bare/unknown subcommand keeps the codebase-graph behaviour.

---

## Version History

- **v1.1.0** (2026-04-23) — Shape C recognized (`- [ ] **Mxx-Dx-Tx**` bullet with checkbox-in-heading). Status derives from the task-bullet checkbox; deps/touches come from indented sub-bullets. Targeted warnings emitted when `tasks.md` exists but produces 0 tasks (likely legacy `### D1-T1` or sectioned `## T-1:` shapes). No breaking changes to Shape D consumers. Unblocks `gsd-t parallel --dry-run` against the live `.gsd-t/domains/m44-d9-parallelism-observability/` domain, which used Shape C.
- **v1.0.0** (2026-04-22, D1-T2) — Full schema locked. Real parser, cycle detection, scope.md touch fallback. Downstream domains may now begin implementation.
- **v0.1.0** (2026-04-22, D1-T1) — Skeleton: interface + section headings only.
