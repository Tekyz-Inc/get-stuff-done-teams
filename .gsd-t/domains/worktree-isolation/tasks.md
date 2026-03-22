# Tasks: worktree-isolation

## Summary
Add worktree isolation to execute team mode and wave parallel execution — each domain agent runs in its own git worktree via Agent tool's `isolation: "worktree"`. Implement sequential atomic merge with contract validation and per-domain rollback.

## Tasks

### Task 1: Add worktree dispatch to execute team mode
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: worktree-isolation-contract.md (Worktree Lifecycle, Creation)
- **Dependencies**: BLOCKED by fresh-dispatch Task 2 (team mode must have task-level dispatch before adding worktree)
- **Acceptance criteria**:
  - Execute Step 3 Team Mode spawns each domain teammate with `isolation: "worktree"` on the Agent tool
  - Each domain agent works in its own isolated filesystem copy
  - Existing team mode rules (read contracts, commit per task, message lead) are preserved
  - Teammate prompt includes instruction to work within the worktree

### Task 2: Add sequential merge protocol
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: worktree-isolation-contract.md (Merge Protocol)
- **Dependencies**: Requires Task 1 (worktree dispatch must exist)
- **Acceptance criteria**:
  - After all domain agents complete, execute orchestrator performs sequential merge:
    merge domain A branch → run tests → merge domain B branch → run tests
  - If tests fail after a merge, that domain's merge is rolled back
  - Contract validation runs between merges (verify domain didn't break others' contracts)
  - Merge order follows dependency order from integration-points.md

### Task 3: Add file ownership validation and worktree cleanup
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: worktree-isolation-contract.md (File Ownership Validation), graph-query-contract.md
- **Dependencies**: Requires Task 2 (merge protocol must exist)
- **Acceptance criteria**:
  - After each merge, graph query validates files modified are within domain's scope.md
  - Violations are flagged immediately (domain modified files outside its ownership)
  - All worktrees are cleaned up after execution completes (success or failure)
  - Orphaned worktree detection and cleanup documented

### Task 4: Add worktree support to wave and integrate
- **Files**: `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`
- **Contract refs**: worktree-isolation-contract.md (Worktree Lifecycle)
- **Dependencies**: Requires Task 2 (merge protocol established in execute)
- **Acceptance criteria**:
  - Wave command's parallel execution phase uses worktree isolation
  - Integrate command's merge step uses the sequential merge protocol
  - Both reference worktree-isolation-contract.md for lifecycle management

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by fresh-dispatch Task 2)
- Estimated checkpoints: 1 (after Task 2 — merge protocol established)
