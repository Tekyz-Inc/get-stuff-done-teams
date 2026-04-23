# Domain: m44-d1-task-graph-reader

## Responsibility

Parse `.gsd-t/domains/*/tasks.md` files and cross-domain dependency declarations; emit a validated DAG (directed acyclic graph) of independently-executable task slices. This DAG is the shared input that D2, D4, D5, and D6 all consume. D1 is mode-agnostic — it knows nothing about [in-session] vs [unattended]; it only produces a graph.

The graph includes:
- Task nodes (id, domain, wave, title, status, touches list)
- Dependency edges (M44-Dx-Ty depends on M44-Dx-Tz)
- Ready mask (which tasks have all deps in DONE state)

## Inputs

- `.gsd-t/domains/*/tasks.md` — parsed for task stubs, status markers, dependency declarations
- Optional: explicit `touches:` field on task stubs (list of file paths this task is expected to write)
- `.gsd-t/domains/*/scope.md` — parsed for "Files Owned" section as a fallback touch-list source when `touches:` is absent

## Outputs

- In-memory DAG object exported from `bin/gsd-t-task-graph.cjs` — nodes, edges, ready mask
- Optional serialized form: `gsd-t graph --output json` prints the DAG as JSON for debugging
- `.gsd-t/contracts/task-graph-contract.md` — new contract (v1.0.0) defining the DAG node/edge schema

## Files Owned

- `bin/gsd-t-task-graph.cjs` — NEW. Exports `buildTaskGraph({projectDir})` → `{nodes, edges, ready, byId}`. Also exports `getReadyTasks(graph)` → array of task nodes with no unmet deps. Zero external deps.
- `test/m44-task-graph.test.js` — NEW. Unit tests: parse from synthetic fixture files, DAG cycle detection, ready-mask correctness, touches fallback from scope.md.
- `.gsd-t/contracts/task-graph-contract.md` — NEW. Defines node schema, edge schema, ready-mask semantics, cycle-detection behavior (throws), missing-dep behavior (warns + marks dep as unresolvable).

## Files Read-Only

- `.gsd-t/domains/*/tasks.md` — consumed but never written by D1
- `.gsd-t/domains/*/scope.md` — read for fallback touch-list only
- No contracts are bumped by D1 (D1 only creates a new contract)

## Out of Scope

- Executing tasks (D2's job)
- Validating dep ordering at spawn time (D4's job)
- Proving file disjointness (D5's job)
- Economics decisions (D6's job)
- Any mode-specific logic ([in-session] vs [unattended] awareness)
- Writing back to tasks.md (D1 is read-only at all times)
