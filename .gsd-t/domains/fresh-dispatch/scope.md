# Domain: fresh-dispatch

## Purpose
Implement task-level fresh context dispatch — each individual task within a domain gets its own subagent with a fresh context window containing only the minimum required context.

## Owned Files
- `commands/gsd-t-execute.md` (modifications to dispatch logic)
- `commands/gsd-t-wave.md` (modifications to execute phase dispatch)
- `commands/gsd-t-integrate.md` (modifications to integration dispatch)
- `commands/gsd-t-plan.md` (add single-context-window constraint)

## Key Responsibilities
1. Task-level dispatch coordinator: one subagent per task (not per domain)
2. Context builder: scope.md + contracts + graph + single task + prior summaries → subagent prompt
3. Summary capture: save task completion summary to disk after each task
4. Summary forwarding: pass prior task summaries (not full context) to next task agent
5. Plan command constraint: validate tasks fit in one context window, auto-split if >70%

## Contracts Consumed
- graph-query-contract.md (for graph context per task)
- domain-structure.md (for scope.md format)
- pre-commit-gate.md

## Contracts Produced
- fresh-dispatch-contract.md

## Constraints
- Each task subagent must receive ONLY: scope.md, relevant contracts, single task, graph context, prior summaries
- Context utilization per task: target <25%
- Compaction must never trigger during task execution
- Prior task summaries: 10-20 lines max per task
- Must work with existing Agent tool — no custom engine
