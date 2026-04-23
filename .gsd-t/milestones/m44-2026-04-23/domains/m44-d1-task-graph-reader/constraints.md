# Constraints: m44-d1-task-graph-reader

## Hard Rules

1. Zero external runtime dependencies. `bin/gsd-t-task-graph.cjs` is a CommonJS module with no `require()` calls to packages outside Node.js built-ins.
2. Cycle detection is mandatory. A circular dependency in the task graph MUST throw a `TaskGraphCycleError` with the cycle path listed. Never silently produce an infinite loop or partial graph.
3. Read-only at all times. D1 never writes to any tasks.md or scope.md file. It only reads them.
4. Missing `touches:` field on a task stub is not an error. Fall back to the domain's `scope.md` "Files Owned" section. If neither source provides a touch-list, set `touches: []` and log a warning — D5 will handle the "unprovable" case.
5. Unknown status markers (not `[ ] pending`, `[x] done`, `[-] skipped`, `[!] failed`) are treated as `pending` with a logged warning.
6. `buildTaskGraph` must complete in < 200ms for a 100-domain / 1000-task project. Parsing is synchronous; no async I/O inside the main build path.
7. The contract file `.gsd-t/contracts/task-graph-contract.md` MUST be created in D1-T1 (skeleton) and finalized in D1-T2 (full schema). Downstream domains (D2, D4, D5, D6) must not start implementation until D1-T2 ships the contract.

## Mode Awareness

D1 is **mode-agnostic**. It produces a graph; it has no concept of CW headroom, [in-session] vs [unattended], or spawn mechanics. All mode-specific behavior lives in D2, D6.

## Tradeoffs Acknowledged

- Touch-list fallback from scope.md is coarse-grained (whole domain's file list, not per-task). This will cause false disjointness failures (D5 falls back to sequential) more often than a per-task `touches:` field would. Acceptable: sequential fallback is always safe; the framework just runs slower. Improvement path: require `touches:` on tasks in future milestone.
- Serializing the DAG to disk on every invocation would slow down the hot path. D1 keeps the DAG in-memory and lets callers serialize if needed (e.g., the `gsd-t graph --output json` debugging subcommand).

## Out-of-scope clarifications

- D1 does NOT parse milestone-level wave numbers from `partition.md`. Wave numbers live in `tasks.md` per-task. `partition.md` is the human-readable plan; `tasks.md` is the machine-readable one.
- D1 does NOT resolve domain contracts to infer file ownership. Contracts are consumed by D5 independently.
