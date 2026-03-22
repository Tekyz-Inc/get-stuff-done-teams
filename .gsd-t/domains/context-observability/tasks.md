# Tasks: context-observability

## Summary
Add context window utilization tracking, token breakdown by domain/task/phase, and compaction proximity alerts to all subagent-spawning commands. Extend token-log.md format. Add context metrics to status and visualize. Add task scope validation to plan.

## Tasks

### Task 1: Extend token-log.md format and logging block
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: context-observability-contract.md (Extended Token Log Format)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - The OBSERVABILITY LOGGING block in execute Step 2/3 is updated to include Domain, Task, and Ctx% columns
  - Ctx% is calculated as `(CLAUDE_CONTEXT_TOKENS_USED / CLAUDE_CONTEXT_TOKENS_MAX) * 100`
  - If env vars unavailable, Ctx% is recorded as "N/A"
  - Token-log.md header includes the 3 new columns (backward compatible)
  - Alert thresholds are logged: >70% warning, >85% critical

### Task 2: Add context tracking to wave, integrate, qa commands
- **Files**: `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-qa.md`
- **Contract refs**: context-observability-contract.md (Extended Token Log Format)
- **Dependencies**: Requires Task 1 (uses same logging format)
- **Acceptance criteria**:
  - All three commands' OBSERVABILITY LOGGING blocks include Domain, Task, Ctx% columns
  - Same calculation and fallback logic as Task 1
  - Alert thresholds consistent across all commands

### Task 3: Add token breakdown display to status and visualize
- **Files**: `commands/gsd-t-status.md`, `commands/gsd-t-visualize.md`
- **Contract refs**: context-observability-contract.md (Token Breakdown Aggregation)
- **Dependencies**: Requires Task 1 (token-log.md format must exist)
- **Acceptance criteria**:
  - Status command reads token-log.md and displays aggregated token usage by domain and by phase
  - Visualize command includes context metrics in dashboard data
  - Domains with Ctx% > 70% are flagged with warning indicator
  - Graceful handling when token-log.md has no Domain/Task/Ctx% columns (older logs)

### Task 4: Add task scope validation to plan command
- **Files**: `commands/gsd-t-plan.md`
- **Contract refs**: context-observability-contract.md (Plan Validation), fresh-dispatch-contract.md (Plan Command Constraint)
- **Dependencies**: Requires Task 1 (threshold definitions)
- **Acceptance criteria**:
  - Plan Step 2 includes task scope validation: estimate context size per task
  - Tasks modifying >5 files or with >3 complex dependencies are flagged as candidates for splitting
  - Warning emitted if estimated scope exceeds 70% of context window
  - Auto-split suggestion provided with rationale

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0
