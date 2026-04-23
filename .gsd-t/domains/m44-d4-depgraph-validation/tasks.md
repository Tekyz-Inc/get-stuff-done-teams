# Tasks: m44-d4-depgraph-validation

## Wave 2 — Gates

### M44-D4-T1 — Contract skeleton + module scaffold
- **Status**: [x] done (2026-04-22 · commit `5c3844a`)
- **Dependencies**: M44-D1-T5 (D1 complete — DAG emitter must exist)
- **Acceptance criteria**:
  - `.gsd-t/contracts/depgraph-validation-contract.md` exists with veto semantics, event format, and non-throwing guarantee (v0.1.0 skeleton)
  - `bin/gsd-t-depgraph-validate.cjs` file exists and exports `validateDepGraph` stub
- **Files touched**: `.gsd-t/contracts/depgraph-validation-contract.md` (new), `bin/gsd-t-depgraph-validate.cjs` (new)

### M44-D4-T2 — Core validator implementation
- **Status**: [x] done (2026-04-22 · commit `__T2_SHA__`)
- **Dependencies**: M44-D4-T1
- **Acceptance criteria**:
  - `validateDepGraph({graph, projectDir})` returns `{ready: [...], vetoed: [...]}` where `vetoed` contains all tasks with at least one unmet dependency
  - Each veto appends a `dep_gate_veto` event to `.gsd-t/events/YYYY-MM-DD.jsonl` with fields `{type, task_id, domain, unmet_deps[], ts}`
  - All-deps-done task is included in `ready`; task with one unmet dep is in `vetoed`
  - Contract finalized at v1.0.0
- **Files touched**: `bin/gsd-t-depgraph-validate.cjs`, `.gsd-t/contracts/depgraph-validation-contract.md`

### M44-D4-T3 — Unit test suite
- **Status**: [ ] pending
- **Dependencies**: M44-D4-T2
- **Acceptance criteria**:
  - `test/m44-depgraph-validate.test.js` covers: all deps done (full ready set), one dep unmet (that task vetoed, others unaffected), three-task chain with only first done (only second ready, third vetoed), empty graph (returns empty ready set), unknown dep reference (treated as unmet)
  - All tests pass via `npm test`
- **Files touched**: `test/m44-depgraph-validate.test.js` (new)

### M44-D4-T4 — Doc-ripple + tests-pass commit
- **Status**: [ ] pending
- **Dependencies**: M44-D4-T3
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 Dep-Graph Validation" requirement entry
  - `docs/architecture.md` updated to reflect `bin/gsd-t-depgraph-validate.cjs` as a pre-spawn gate component
  - All existing tests still pass; Wave 2 D4 gate met (synthetic 2-task fixture: task with unmet dep is vetoed, independent task is ready)
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `.gsd-t/progress.md`
