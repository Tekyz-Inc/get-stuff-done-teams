# Tasks: goal-backward

## Summary
Add post-gate behavior verification to verify and complete-milestone commands. Scan for placeholder implementations (console.log, TODO, hardcoded returns, static UI) and verify milestone goals are achieved end-to-end.

## Tasks

### Task 1: Add goal-backward verification step to verify command
- **Files**: `commands/gsd-t-verify.md`
- **Contract refs**: goal-backward-contract.md (Verification Flow, Placeholder Patterns, Findings Report Format)
- **Dependencies**: BLOCKED by fresh-dispatch Task 1 (verify needs to understand task-level summary format for tracing)
- **Acceptance criteria**:
  - New step added AFTER all existing quality gates pass (Step 5 or equivalent)
  - Step reads milestone goals from progress.md and requirements from requirements.md
  - For each critical requirement, traces requirement → code path → behavior using graph (if available)
  - Scans for all placeholder patterns from goal-backward-contract.md detection list
  - Produces findings report in the contract-specified format
  - CRITICAL and HIGH findings block verification (FAIL)
  - MEDIUM findings are warnings (logged but don't block)

### Task 2: Add goal-backward check to complete-milestone command
- **Files**: `commands/gsd-t-complete-milestone.md`
- **Contract refs**: goal-backward-contract.md (Verification Flow)
- **Dependencies**: Requires Task 1 (same verification logic, referenced from verify)
- **Acceptance criteria**:
  - Complete-milestone runs goal-backward verification before archiving
  - If CRITICAL/HIGH findings exist, milestone completion is blocked
  - User can override with explicit acknowledgment
  - Findings logged in progress.md Decision Log

### Task 3: Add goal-backward to wave verification phase
- **Files**: `commands/gsd-t-wave.md`
- **Contract refs**: goal-backward-contract.md (Verification Flow)
- **Dependencies**: Requires Task 1 (references verify command's implementation)
- **Acceptance criteria**:
  - Wave's verification phase includes goal-backward step
  - Same blocking behavior as standalone verify
  - Wave reports goal-backward findings in its phase summary

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by fresh-dispatch Task 1)
- Estimated checkpoints: 0
