# Integration Points

## Current State: Milestone 22 — GSD 2 Tier 1: Execution Quality (5 domains)

## Dependency Graph

```
context-observability Task 1
  └──▶ fresh-dispatch Task 1 (needs logging format defined)
  └──▶ fresh-dispatch Task 4 (needs scope validation format)

fresh-dispatch Task 1
  └──▶ fresh-dispatch Task 2 (solo pattern → team pattern)
  └──▶ fresh-dispatch Task 3 (solo pattern → wave/integrate)
  └──▶ goal-backward Task 1 (needs summary format for tracing)

fresh-dispatch Task 2
  └──▶ worktree-isolation Task 1 (team mode must have task-level dispatch)

worktree-isolation Task 1
  └──▶ worktree-isolation Task 2 (dispatch → merge protocol)
  └──▶ worktree-isolation Task 4 (dispatch → wave/integrate)

worktree-isolation Task 2
  └──▶ worktree-isolation Task 3 (merge → ownership validation)
  └──▶ adaptive-replan Task 1 (merge protocol must exist for replan integration)

fresh-dispatch Task 1 + worktree-isolation Task 2
  └──▶ adaptive-replan Task 1 (needs both summary format AND merge protocol)
```

## Shared File Analysis

**CRITICAL**: Multiple domains modify the same files. This REQUIRES sequential execution.

| File | Domains | Wave Assignment |
|------|---------|----------------|
| `commands/gsd-t-execute.md` | fresh-dispatch, worktree-isolation, adaptive-replan, context-observability | Wave 1→2→3→4 (sequential by domain) |
| `commands/gsd-t-wave.md` | fresh-dispatch, worktree-isolation, goal-backward, adaptive-replan, context-observability | Wave 1→2→3→4 (sequential by domain) |
| `commands/gsd-t-integrate.md` | fresh-dispatch, worktree-isolation, context-observability | Wave 1→2→3 (sequential by domain) |
| `commands/gsd-t-plan.md` | fresh-dispatch, context-observability | Wave 1→2 (sequential) |
| `commands/gsd-t-verify.md` | goal-backward only | Wave 3 (no conflict) |
| `commands/gsd-t-complete-milestone.md` | goal-backward only | Wave 3 (no conflict) |
| `commands/gsd-t-status.md` | context-observability only | Wave 1 (no conflict) |
| `commands/gsd-t-visualize.md` | context-observability only | Wave 1 (no conflict) |
| `commands/gsd-t-qa.md` | context-observability only | Wave 1 (no conflict) |

## Wave Execution Groups

### Wave 1 — context-observability (foundation)
- context-observability: Tasks 1-4
- **Rationale**: Defines the extended logging format needed by all other domains
- **Shared files**: Modifies execute, wave, integrate, status, visualize, qa, plan
- **Completes when**: All 4 tasks done, token-log format extended

### CHECKPOINT 1
- Verify: token-log.md format includes Domain, Task, Ctx% columns
- Verify: Alert thresholds (70%/85%) documented in commands
- Verify: Plan validation step added

### Wave 2 — fresh-dispatch (core mechanism)
- fresh-dispatch: Tasks 1-4
- **Rationale**: Defines task-level dispatch pattern consumed by worktree, replan, and goal-backward
- **Shared files**: Modifies execute, wave, integrate, plan (already modified by Wave 1 — sequential)
- **Completes when**: All 4 tasks done, task-level dispatch working in solo + team + wave

### CHECKPOINT 2
- Verify: Execute dispatches one subagent per TASK (not per domain)
- Verify: Task summaries saved to disk in contract format
- Verify: Plan command enforces single-context-window constraint

### Wave 3a — worktree-isolation (sequential — shares files with goal-backward)
- worktree-isolation: Tasks 1-4
- **Rationale**: Modifies execute (team mode + merge sections), wave (execute phase), integrate
- **Completes when**: All 4 tasks done

### CHECKPOINT 3a
- Verify: Execute team mode uses `isolation: "worktree"`
- Verify: Sequential merge protocol with per-domain rollback works
- Verify: File ownership validation via graph works

### Wave 3b — goal-backward (after worktree — both touch gsd-t-wave.md)
- goal-backward: Tasks 1-3
- **Rationale**: Modifies verify, complete-milestone, wave (verification phase). Must follow worktree-isolation because both touch gsd-t-wave.md.
- **Completes when**: All 3 tasks done

### CHECKPOINT 3b
- Verify: Goal-backward catches placeholder patterns
- Verify: Verify command includes goal-backward step after quality gates
- Verify: Complete-milestone blocks on CRITICAL/HIGH findings

### Wave 4 — adaptive-replan (integrates everything)
- adaptive-replan: Tasks 1-3
- **Rationale**: Depends on fresh-dispatch summaries + worktree merge protocol
- **Shared files**: Modifies execute, wave (already modified by Waves 1-3 — sequential)
- **Completes when**: All 3 tasks done

### CHECKPOINT 4 (Final)
- Verify: Replan check runs between domain completions
- Verify: Max 2 replan cycles enforced
- Verify: All 5 contracts satisfied
- Verify: All commands consistent

## Execution Order (for solo mode)
1. context-observability Tasks 1-4
2. CHECKPOINT 1: verify token-log format
3. fresh-dispatch Tasks 1-4
4. CHECKPOINT 2: verify task-level dispatch
5. worktree-isolation Tasks 1-4
6. CHECKPOINT 3a: verify worktree isolation
7. goal-backward Tasks 1-3
8. CHECKPOINT 3b: verify goal-backward
9. adaptive-replan Tasks 1-3
10. CHECKPOINT 4: final verification
11. INTEGRATION: verify all commands are consistent
