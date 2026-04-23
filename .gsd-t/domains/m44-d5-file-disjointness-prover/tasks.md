# Tasks: m44-d5-file-disjointness-prover

## Wave 2 — Gates

### M44-D5-T1 — Contract skeleton + module scaffold
- **Status**: [x] done (2026-04-22 · commit `dfcd4e4`)
- **Dependencies**: M44-D1-T5 (D1 complete — touch-list field in DAG nodes must be defined)
- **Acceptance criteria**:
  - `.gsd-t/contracts/file-disjointness-contract.md` exists with proof algorithm description, fallback chain, and event format (v0.1.0 skeleton)
  - `bin/gsd-t-file-disjointness.cjs` file exists and exports `proveDisjointness` stub
- **Files touched**: `.gsd-t/contracts/file-disjointness-contract.md` (new), `bin/gsd-t-file-disjointness.cjs` (new)

### M44-D5-T2 — Core disjointness prover implementation
- **Status**: [x] done (2026-04-22 · commit `pending`)
- **Dependencies**: M44-D5-T1
- **Acceptance criteria**:
  - `proveDisjointness({tasks, projectDir})` returns `{parallel: [...], sequential: [...], unprovable: [...]}` with correct partition for a synthetic 3-task fixture (two disjoint + one overlapping)
  - Touch-list source priority applied in order: explicit `touches:` field → scope.md "Files Owned" → git history heuristic → unprovable
  - `disjointness_fallback` event appended for each sequential/unprovable task with fields `{type, task_id, reason, ts}`
  - Contract finalized at v1.0.0
- **Files touched**: `bin/gsd-t-file-disjointness.cjs`, `.gsd-t/contracts/file-disjointness-contract.md`

### M44-D5-T3 — Unit test suite
- **Status**: [x] done (2026-04-22 · commit `eb1033b`)
- **Dependencies**: M44-D5-T2
- **Acceptance criteria**:
  - `test/m44-file-disjointness.test.js` covers: two tasks no overlap (parallel), two tasks sharing one file (sequential), unprovable task (sequential with reason="unprovable"), three-task set with one unprovable (unprovable→sequential, other two parallel if disjoint), scope.md fallback used when no explicit `touches:` field
  - All tests pass via `npm test`
- **Files touched**: `test/m44-file-disjointness.test.js` (new)

### M44-D5-T4 — Doc-ripple + tests-pass commit
- **Status**: [ ] pending
- **Dependencies**: M44-D5-T3
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 File-Disjointness Prover" requirement entry
  - `docs/architecture.md` updated to reflect `bin/gsd-t-file-disjointness.cjs` as a pre-spawn gate component
  - All existing tests still pass; Wave 2 D5 gate met (synthetic 2-task fixture with overlapping file falls back to sequential)
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `.gsd-t/progress.md`
