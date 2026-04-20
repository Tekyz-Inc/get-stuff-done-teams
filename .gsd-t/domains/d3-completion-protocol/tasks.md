# Tasks: d3-completion-protocol

## Summary
Contract-only domain. Ships the `completion-signal-contract.md` as the authoritative Done Signal definition + a pure `assertCompletion` helper that D1, D2, and D6 consume. Lands first (Wave 0) so every downstream domain can cite the contract.

## Tasks

### Task 1: Freeze completion-signal-contract.md v1.0.0
- **Files**: `.gsd-t/contracts/completion-signal-contract.md` (exists from partition — review + freeze)
- **Contract refs**: N/A (owns the contract)
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - All 5 Done Signal conditions are testable from the orchestrator side with no worker cooperation beyond committing normally
  - Retry policy is explicit: first fail → retry, second fail → halt
  - `assertCompletion` API signature matches what D1 and D2 will call
  - No ambiguity in "uncommitted changes in owned scope" — owned patterns come from tasks.md, not scope.md prose

### Task 2: Implement assertCompletion helper
- **Files**: `bin/gsd-t-completion-check.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/completion-signal-contract.md`
- **Dependencies**: Requires Task 1 (within domain)
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `assertCompletion({ taskId, projectDir, expectedBranch, taskStart, skipTest, ownedPatterns })` → `{ ok, missing, details }`
  - Uses `child_process.execSync` for git + npm test; catches non-zero exits and reports in `missing[]`
  - Returns ALL failing conditions, not just the first (operators need full picture)
  - Pure: no hidden global state, no network calls
  - Matches git commit message `^{taskId}(\b|:)` regex; lists commits found in `details.commits`

### Task 3: Unit tests for completion check
- **Files**: `test/m40-completion-protocol.test.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/completion-signal-contract.md`
- **Dependencies**: Requires Task 2 (within domain)
- **Wave**: 0
- **Acceptance criteria**:
  - Happy path: commit + progress entry + tests pass + no uncommitted → `ok: true, missing: []`
  - Each missing-artifact case produces the corresponding `missing[]` entry — 5 isolated cases
  - Branch-mismatch case: commit exists but on wrong branch → `missing: ["no_commit_on_branch"]`
  - `skip-test: true` path: test step skipped; other 4 checks still run
  - All tests pass under `node --test`; contribute to suite count delta

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting within domain): 2
- Estimated checkpoints: 1 (Task 1 contract-freeze blocks D1/D2 consumption)
