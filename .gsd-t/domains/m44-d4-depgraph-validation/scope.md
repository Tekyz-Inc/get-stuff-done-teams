# Domain: m44-d4-depgraph-validation

## Responsibility

Pre-spawn validator that confirms task dependencies are honored before the orchestrator fans out. When a task has declared dependencies on other tasks, D4 checks that ALL dependency tasks are in DONE status before allowing the dependent task to be included in a parallel spawn batch.

If a dependency is unmet, D4:
1. Removes the dependent task from the "ready for parallel" set
2. Logs a `dep_gate_veto` event to `.gsd-t/events/YYYY-MM-DD.jsonl`
3. Returns the reduced task set to D2 for dispatching

D4 never throws a hard error for unmet deps — it reduces the ready set. The caller (D2) decides whether to spawn a smaller batch or fall back to sequential.

## Inputs

- D1 DAG object (`buildTaskGraph` result from `bin/gsd-t-task-graph.cjs`)
- Task state from `.gsd-t/domains/*/tasks.md` (read-only; status markers)

## Outputs

- Validated ready-task set: array of task nodes whose dependencies are all DONE
- `dep_gate_veto` events in `.gsd-t/events/YYYY-MM-DD.jsonl` for each removed task
- `bin/gsd-t-depgraph-validate.cjs` — exported `validateDepGraph({graph, projectDir})` → `{ready, vetoed}`
- `.gsd-t/contracts/depgraph-validation-contract.md` — new contract (v1.0.0) defining veto behavior

## Files Owned

- `bin/gsd-t-depgraph-validate.cjs` — NEW. Exports `validateDepGraph({graph, projectDir})`.
- `test/m44-depgraph-validate.test.js` — NEW. Tests: all deps done → full ready set; one dep unmet → that task vetoed; circular (already caught by D1) edge case; empty graph.
- `.gsd-t/contracts/depgraph-validation-contract.md` — NEW. Defines veto semantics, event format, and the non-throwing guarantee.

## Files Read-Only

- `bin/gsd-t-task-graph.cjs` (D1 output) — consumed
- `.gsd-t/domains/*/tasks.md` — status markers read for dep resolution
- `.gsd-t/events/YYYY-MM-DD.jsonl` — written to (veto events appended), but not owned (the event schema is owned by the event-schema-contract)

## Out of Scope

- File disjointness checking (D5)
- Economics decisions (D6)
- CW headroom checking (D2)
- Writing back to tasks.md (D4 is read-only on task files)
- Handling cross-milestone dependencies (M44 scope: same-milestone deps only)
