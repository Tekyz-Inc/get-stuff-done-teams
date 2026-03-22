# Tasks: adaptive-replan

## Summary
Add post-domain replanning check to execute command — after each domain completes, read its summary for new constraints, check remaining domain plans, and revise if needed. Max 2 replan cycles with user pause guard.

## Tasks

### Task 1: Add post-domain replan check to execute orchestrator
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: adaptive-replan-contract.md (Replan Check Flow, Constraint Categories), fresh-dispatch-contract.md (Task Summary Format — "Constraints discovered" field)
- **Dependencies**: BLOCKED by fresh-dispatch Task 1 (summary format must include "Constraints discovered" field) AND worktree-isolation Task 2 (merge protocol must exist — replan integrates between merges)
- **Acceptance criteria**:
  - After each domain subagent returns, execute orchestrator reads the domain's completion summary
  - Extracts "Constraints discovered" section from summary
  - If constraints exist: reads remaining domains' tasks.md, checks for invalidated assumptions
  - If invalidated assumptions found: revises affected tasks.md files on disk
  - Revision includes the contract-specified format (Trigger, Constraint, Changes, Rationale)
  - Replan cycle counter tracked — max 2 cycles per execute run
  - If counter > 2: STOP and pause for user input
  - All replan decisions logged in progress.md Decision Log

### Task 2: Add replan integration to wave command
- **Files**: `commands/gsd-t-wave.md`
- **Contract refs**: adaptive-replan-contract.md (Replan Check Flow)
- **Dependencies**: Requires Task 1 (replan logic established in execute)
- **Acceptance criteria**:
  - Wave's execute phase includes the replan check between domains
  - Same max 2 cycle guard applies
  - Wave reports any replan actions in its phase summary

### Task 3: Add graph-enhanced constraint impact assessment
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: adaptive-replan-contract.md, graph-query-contract.md
- **Dependencies**: Requires Task 1 (base replan logic must exist)
- **Acceptance criteria**:
  - When constraints are discovered, graph is queried to assess which remaining domains are affected
  - `getImporters` used to find domains that depend on changed modules
  - `getDomainBoundaryViolations` used to check if constraint changes affect domain boundaries
  - If graph unavailable, falls back to checking all remaining domains' tasks.md (less precise but functional)

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by fresh-dispatch Task 1 + worktree-isolation Task 2; full chain: context-obs T1 → fresh-dispatch T1 → T2 → worktree T1 → T2 → adaptive-replan T1)
- Estimated checkpoints: 1 (after Task 1 — replan logic established)
