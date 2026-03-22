# Tasks: fresh-dispatch

## Summary
Convert execute command from domain-level to task-level dispatch — each individual task gets its own fresh subagent. Add context builder logic, summary capture/forwarding, and the "single context window" constraint to the plan command.

## Tasks

### Task 1: Define task-level dispatch pattern in execute solo mode
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: fresh-dispatch-contract.md (Task Dispatch Payload, Task Summary Format)
- **Dependencies**: BLOCKED by context-observability Task 1 (logging format must be defined first)
- **Acceptance criteria**:
  - Execute Step 3 Solo Mode is restructured: domain subagent becomes a "domain task-dispatcher" that spawns one subagent PER TASK
  - Each task subagent prompt includes ONLY: domain scope.md, relevant contracts, single task from tasks.md, graph context (if available), prior task summaries (max 5, most recent)
  - After each task subagent returns, summary is saved to `.gsd-t/domains/{domain}/task-{id}-summary.md`
  - Prior task summaries are 10-20 lines max each
  - Domain task-dispatcher stays lightweight — sequences tasks and passes summaries
  - OBSERVABILITY LOGGING runs per task subagent (not per domain)

### Task 2: Update execute team mode for task-level dispatch
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: fresh-dispatch-contract.md (Task Dispatch Payload)
- **Dependencies**: Requires Task 1 (solo mode pattern established first)
- **Acceptance criteria**:
  - Team mode teammates each run the task-dispatcher pattern (one subagent per task within their domain)
  - Teammate prompt instructions updated to reflect task-level dispatch
  - Summary capture works the same as solo mode

### Task 3: Update wave and integrate for task-level dispatch
- **Files**: `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`
- **Contract refs**: fresh-dispatch-contract.md (Task Dispatch Payload)
- **Dependencies**: Requires Task 1 (pattern from execute is reused)
- **Acceptance criteria**:
  - Wave command's execute phase uses task-level dispatch pattern from execute
  - Integrate command's domain dispatch uses task-level dispatch pattern
  - Both commands reference fresh-dispatch-contract.md for payload format

### Task 4: Add single-context-window constraint to plan command
- **Files**: `commands/gsd-t-plan.md`
- **Contract refs**: fresh-dispatch-contract.md (Plan Command Constraint), context-observability-contract.md (Plan Validation)
- **Dependencies**: BLOCKED by context-observability Task 4 (scope validation format defined there)
- **Acceptance criteria**:
  - Plan Step 2 Task Design Rules include: "A task must fit in one context window"
  - Plan validates task scope during generation: files to modify, complexity, dependencies
  - Tasks exceeding 70% estimated context are automatically split with explanation
  - Split heuristic documented: >5 files or >3 complex dependencies → split candidate

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 2 (Task 1 + Task 4 blocked by context-observability)
- Estimated checkpoints: 1 (after Task 1 — pattern established for reuse)
