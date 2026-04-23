# Domain: m44-d5-file-disjointness-prover

## Responsibility

Before any parallel spawn, prove that no two concurrently-scheduled tasks share write targets. If two tasks would both write the same file, they CANNOT run in parallel — D5 removes them from the parallel set and moves them to a sequential queue.

Sources for the expected touch-list of a task (priority order):
1. Explicit `touches:` field on the task stub in `tasks.md`
2. "Files Owned" section in the domain's `scope.md`
3. Git history for tasks with similar names/domains (heuristic fallback)

If a task's touch-list cannot be determined (no `touches:` field, no scope.md owned files, no git history match), D5 marks it as "unprovable" and it falls back to sequential automatically — no error, no prompt.

## Inputs

- D1 DAG object (task nodes with `touches` field populated by D1's fallback logic)
- Domain `scope.md` files (for owned-file fallback)
- Git history (`git log --name-only`) for heuristic touch-list inference

## Outputs

- Disjointness result: `{parallel: [...taskPairs], sequential: [...taskPairs], unprovable: [...tasks]}`
- `disjointness_fallback` events in `.gsd-t/events/YYYY-MM-DD.jsonl` for each task moved to sequential
- `bin/gsd-t-file-disjointness.cjs` — exported `proveDisjointness({tasks, projectDir})` → result object
- `.gsd-t/contracts/file-disjointness-contract.md` — new contract (v1.0.0) defining proof algorithm and fallback semantics

## Files Owned

- `bin/gsd-t-file-disjointness.cjs` — NEW. Exports `proveDisjointness({tasks, projectDir})`. Zero external deps.
- `test/m44-file-disjointness.test.js` — NEW. Tests: two tasks with no overlap (parallel-ok), two tasks sharing one file (moved to sequential), unprovable task (no touch-list source), three-task set with one unprovable (unprovable goes sequential, other two parallel if disjoint).
- `.gsd-t/contracts/file-disjointness-contract.md` — NEW. Defines algorithm, fallback chain, event format.

## Files Read-Only

- `bin/gsd-t-task-graph.cjs` (D1 output, `touches` field) — consumed
- `.gsd-t/domains/*/scope.md` — read for "Files Owned" fallback
- Git history (read via `child_process.execSync('git log ...')`) — read-only
- `.gsd-t/events/YYYY-MM-DD.jsonl` — written to (fallback events appended)

## Out of Scope

- Dep-graph ordering (D4)
- Economics decisions (D6)
- Merge conflict resolution — D5 prevents the situation by ensuring disjoint writes; resolution is never needed
- Read-only file conflicts — D5 only checks write targets (reads can overlap freely)
- Cross-domain contracts as touch-list sources (those are consumed by D1 for the scope.md fallback; D5 uses D1's already-populated `touches` field)
