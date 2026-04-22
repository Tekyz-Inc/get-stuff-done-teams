# Tasks: m44-d1-task-graph-reader

## Wave 1 — Foundation

### M44-D1-T1 — Contract skeleton + task-graph module scaffold
- **Status**: [ ] pending
- **Dependencies**: none
- **Acceptance criteria**:
  - `.gsd-t/contracts/task-graph-contract.md` exists with node schema, edge schema, and ready-mask semantics (may be incomplete stubs at this stage)
  - `bin/gsd-t-task-graph.cjs` file exists and exports `buildTaskGraph` and `getReadyTasks` (stubs with TODO bodies are acceptable)
  - The contract version is v0.1.0 (skeleton; v1.0.0 is locked after T2)
- **Files touched**: `bin/gsd-t-task-graph.cjs` (new), `.gsd-t/contracts/task-graph-contract.md` (new)

### M44-D1-T2 — Core parser: tasks.md + scope.md → DAG
- **Status**: [ ] pending
- **Dependencies**: M44-D1-T1
- **Acceptance criteria**:
  - `buildTaskGraph({projectDir})` correctly parses all `.gsd-t/domains/*/tasks.md` files present in the repo
  - Produces a graph with correct nodes (id, domain, wave, title, status, touches), edges (dependency arcs), and ready mask (tasks with all deps DONE)
  - Cycle detection throws `TaskGraphCycleError` with cycle path on a synthetic circular fixture
  - Touch-list falls back to domain scope.md "Files Owned" when `touches:` is absent on a task stub
  - Contract bumped to v1.0.0
- **Files touched**: `bin/gsd-t-task-graph.cjs`, `.gsd-t/contracts/task-graph-contract.md`

### M44-D1-T3 — Unit test suite
- **Status**: [ ] pending
- **Dependencies**: M44-D1-T2
- **Acceptance criteria**:
  - `test/m44-task-graph.test.js` covers: single-domain parse, multi-domain parse with cross-domain dep edges, cycle detection throws, ready-mask correct after marking a dep DONE, `touches: []` fallback path, unknown status marker warning
  - All tests pass via `npm test`
- **Files touched**: `test/m44-task-graph.test.js` (new)

### M44-D1-T4 — CLI debugging subcommand (`gsd-t graph`)
- **Status**: [ ] pending
- **Dependencies**: M44-D1-T3
- **Acceptance criteria**:
  - `gsd-t graph --output json` prints the full DAG as indented JSON to stdout
  - `gsd-t graph --output table` prints a human-readable table (id | domain | wave | status | deps) for each task node
  - Runs against the real repo and produces non-empty output
- **Files touched**: `bin/gsd-t.js` (add `graph` subcommand routing)

### M44-D1-T5 — Doc-ripple + tests-pass commit
- **Status**: [ ] pending
- **Dependencies**: M44-D1-T4
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 Task-Graph Reader" requirement entry
  - `docs/architecture.md` updated to reflect `bin/gsd-t-task-graph.cjs` as a new component
  - All existing tests still pass (full `npm test` suite green)
  - Wave 1 gate criteria met (DAG from synthetic 2-task fixture verified, D7 may still be in-flight — D1 gate is independent)
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `.gsd-t/progress.md` (decision log entry)
