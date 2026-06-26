# Tasks: d2-treesitter-throughput-spike

## Summary
When all tasks complete: a measured Atos full-index build wall-clock (PASS under ~2 min or KILL/re-scope verdict) recorded in progress.md, and a STABLE `graph-parser-floor-contract.md` (entity/edge taxonomy + parse-harness/parallelism interface) that unblocks D3's indexer build.

## Tasks

### Task 1: Parser-floor contract (taxonomy from lessons)
- **Files**: `.gsd-t/contracts/graph-parser-floor-contract.md`
- **Contract refs**: graph-parser-floor-contract (authored here)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Declares the entity/edge taxonomy: imports, exports, functions, classes, requires, call-sites (the M20–M21 WHAT, salvaged as lessons from `bin/graph-parsers.js`, NOT lifted)
  - Declares the parse-harness + parallelism interface D3 consumes (per-file parse → entities + edges)
  - Marked STABLE once the throughput probe passes (or re-scoped if K2 kills)

### Task 2: Tree-sitter throughput probe
- **Files**: `bin/gsd-t-graph-ts-throughput.cjs`, `test/m94-k2-treesitter-throughput.test.js`
- **Contract refs**: graph-parser-floor-contract (Task 1)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - Full tree-sitter floor parse of the REAL Atos repo (`/Users/david/projects/HiloAviation/hilo-figma-atos`), wall-clock measured, parallelism strategy applied
  - PASS iff build under ~2 min; else KILL/re-scope verdict ([RULE] K2)
  - FAILS LOUD with `repo-not-found` if Atos repo absent (never a fake PASS)
  - Test (fixture-based, no Atos repo needed) asserts: verdict logic at/around the budget threshold, `repo-not-found` path, envelope shape

### Task 3: Result doc + progress.md
- **Files**: `.gsd-t/spikes/k2-treesitter-atos-throughput-results.md`
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - Records the real-repo build wall-clock + PASS/KILL verdict with live-clock timestamp
  - progress.md updated with the build wall-clock (AC-1)

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0 (Wave 1 — no cross-domain blockers; gates the Wave-2 trio jointly with d1)
- Estimated checkpoints: 1 (Wave-1 hard gate, jointly with d1)
