# Tasks: token-budget-replacement

## Summary

Rewrite `bin/token-budget.js` internals to read real token counts from the Context Meter state file. Update the token-budget and context-observability contracts to v2.0.0. Remove every task-counter reference from command files and `bin/orchestrator.js`. Delete `bin/task-counter.cjs` and its tests. Satisfies CP3.

## Tasks

### Task 1: Update .gsd-t/contracts/token-budget-contract.md to v2.0.0
- **Files**: `.gsd-t/contracts/token-budget-contract.md`
- **Contract refs**: `context-meter-contract.md` — state file schema (data source)
- **Dependencies**: BLOCKED by context-meter-config Task 1 (CP1 — context-meter-contract.md finalized)
- **Acceptance criteria**:
  - Version bumped to 2.0.0 (already drafted during partition — this task polishes the final wording)
  - Session Budget Estimation section reads from context-meter state file, not env vars
  - Task Counter Retirement section present and accurate (references v2.75.10 milestone)
  - All references to `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` removed or explicitly marked as retired
  - Public API surface preserved — contract documents the same function signatures as v1.x (no caller breakage)

### Task 2: Update .gsd-t/contracts/context-observability-contract.md to v2.0.0
- **Files**: `.gsd-t/contracts/context-observability-contract.md`
- **Contract refs**: `context-meter-contract.md`
- **Dependencies**: BLOCKED by context-meter-config Task 1 (CP1)
- **Acceptance criteria**:
  - Version bumped to 2.0.0 (drafted during partition)
  - Ctx% source = `.gsd-t/.context-meter-state.json` `pct` field, not env vars
  - Plan Validation rule reads `modelWindowSize` from config, not env var
  - Rules 1–6 updated to reflect context-meter as source

### Task 3: Rewrite bin/token-budget.js internals (real-source primary, heuristic fallback)
- **Files**: `bin/token-budget.js`
- **Contract refs**: `token-budget-contract.md` v2.0.0, `context-meter-contract.md` — state file schema
- **Dependencies**: Requires Task 1, BLOCKED by context-meter-hook Task 4 (CP2 — state file format stable)
- **Acceptance criteria**:
  - Public API unchanged: `estimateCost`, `getSessionStatus`, `recordUsage`, `getDegradationActions`, `estimateMilestoneCost`, `getModelCostRatios` — all keep same signatures and return shapes
  - `getSessionStatus()` reads `.gsd-t/.context-meter-state.json` first:
    - If present and `timestamp` within last 5 minutes → returns `{ consumed: inputTokens, estimated_remaining: modelWindowSize - inputTokens, pct, threshold }` using real values
    - If absent or stale → falls back to historical heuristic (existing code path, preserved)
  - Threshold bands unchanged (`normal / warn / downgrade / conserve / stop`)
  - `recordUsage()` still writes to `.gsd-t/token-log.md` (no change)
  - Zero external deps (matches existing file)
  - No reference to `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` anywhere — grep the file post-edit to confirm

### Task 4: Rewrite bin/token-budget.test.js against new source
- **Files**: `bin/token-budget.test.js`
- **Contract refs**: `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires Task 3
- **Acceptance criteria**:
  - Removes env-var mocks, replaces with state-file fixture mocks (tempdir + fake `.gsd-t/.context-meter-state.json`)
  - Test: fresh state file → `getSessionStatus()` returns real pct
  - Test: stale state file → falls back to heuristic
  - Test: missing state file → falls back to heuristic
  - Test: each threshold band boundary
  - Test: `recordUsage` still writes token-log correctly
  - Test: `estimateMilestoneCost` still works (this path doesn't touch state file)
  - All existing tests that don't depend on env vars still pass
  - Run `npm test` — green

### Task 5: Rewrite bin/orchestrator.js task-budget gate to use getSessionStatus()
- **Files**: `bin/orchestrator.js`
- **Contract refs**: `token-budget-contract.md` v2.0.0 — Integration Points section
- **Dependencies**: Requires Task 3, BLOCKED by none else (orchestrator gate is internal coordination)
- **Acceptance criteria**:
  - Removes every `require('./task-counter.cjs')` and child-process call to `bin/task-counter.cjs`
  - The task-budget gate (currently `node bin/task-counter.cjs should-stop`) is replaced with an inline call to `require('./token-budget.js').getSessionStatus()` and checks `threshold === 'stop'`
  - Exit code semantics preserved: gate emits exit code 10 on stop (to maintain the existing caller contract from execute/wave commands)
  - On stop, the same checkpoint + `/clear` + `/user:gsd-t-resume` instruction is emitted (existing UX preserved)
  - No regression to orchestrator's design-build workflow (the separate uncommitted work stream must still function — read the current file before editing)
  - Task-increment call (`task-counter.cjs increment task`) is removed — not replaced (context-meter state is now the authoritative "progress in session" signal, so counting is unnecessary)

### Task 6: Remove task-counter from commands/gsd-t-execute.md
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires Task 5 (orchestrator is the actual gate now)
- **Acceptance criteria**:
  - Steps 0 / 3.5 / 5 no longer reference `bin/task-counter.cjs`
  - The pre-spawn gate in Step 2 still exists but now invokes `node -e "const {getSessionStatus} = require('./bin/token-budget.js'); const s = getSessionStatus(); if(s.threshold === 'stop') process.exit(10)"` (or equivalent)
  - Observability Logging block preserved (still logs to `.gsd-t/token-log.md`)
  - The `Tasks-Since-Reset` column in the token-log table is renamed to `Ctx%` (matches context-observability-contract.md v2.0.0 — the task counter is gone, Ctx% is the meaningful signal)
  - No remaining mention of `task-counter` in the file (grep-verify)
  - All other Step content (QA spawn, Design Verification, Red Team, stack rule injection, etc.) preserved exactly

### Task 7: Remove task-counter from commands/gsd-t-wave.md
- **Files**: `commands/gsd-t-wave.md`
- **Contract refs**: `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires Task 5
- **Acceptance criteria**:
  - Step 0 / phase-count gate no longer references task-counter
  - Phase-count gate replaced with the same getSessionStatus()-based check
  - Wave phase sequence preserved (partition → plan → impact → execute → test-sync → integrate → verify → complete)
  - No remaining mention of `task-counter` in the file

### Task 8: Remove task-counter from gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md
- **Files**: `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`
- **Contract refs**: `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires Task 5
- **Acceptance criteria**:
  - Grep-sweep across these three files — zero references to `task-counter`
  - Each file's observability logging block updated to log Ctx% from the state file instead of Tasks-Since-Reset
  - Existing QA / Red Team / Design Verification flows preserved exactly (surgical edits only)

### Task 9: Delete bin/task-counter.cjs and its tests
- **Files**: `bin/task-counter.cjs` (DELETE), `bin/task-counter.test.cjs` (DELETE if present), any other `task-counter*` artifact in the repo
- **Contract refs**: `token-budget-contract.md` v2.0.0 — Task Counter Retirement section
- **Dependencies**: Requires Tasks 5–8 (all callers removed first — do NOT leave a dangling reference)
- **Acceptance criteria**:
  - `bin/task-counter.cjs` deleted
  - Related test file deleted
  - Repo-wide grep for `task-counter` returns zero hits in code/tests/command files (documentation references in CHANGELOG / progress.md historical entries are allowed and expected — those describe history)
  - `npm test` still passes (confirms no test was secretly depending on the deleted file)
  - **CP3 is satisfied** by this task's completion → unblocks installer-integration Task 5 (PROJECT_BIN_TOOLS update)

### Task 10: Final grep sweep + green test suite
- **Files**: (verification only)
- **Contract refs**: all M34 contracts
- **Dependencies**: Requires Tasks 1–9
- **Acceptance criteria**:
  - `grep -r "task-counter" commands/ bin/ scripts/ templates/` returns zero results
  - `grep -r "CLAUDE_CONTEXT_TOKENS" commands/ bin/ scripts/ templates/` returns zero results
  - `npm test` passes with same or higher test count than the pre-M34 baseline (833), minus any task-counter.test.cjs tests that were deliberately retired
  - **CP4 is satisfied** by this task's completion → unblocks m34-docs-and-tests Wave 3
