# Contract: Fresh Context Dispatch (Task-Level)

## Version: 1.0.0
## Status: DRAFT
## Owner: fresh-dispatch domain
## Consumers: execute, wave, integrate, plan commands

---

## Purpose

Defines the interface for task-level fresh context dispatch — how each individual task is packaged and dispatched to its own subagent with minimal context.

## Task Dispatch Payload

Each task subagent receives exactly this context (and nothing else):

```
{
  "domain": "{domain-name}",
  "task": {
    "id": "{task-number}",
    "description": "{task description from tasks.md}",
    "files": ["{file1}", "{file2}"],
    "dependencies": ["{completed-task-ids}"]
  },
  "scope": "{contents of domain scope.md}",
  "contracts": ["{relevant contract contents}"],
  "graph_context": "{graph query results for task's files — if available}",
  "prior_summaries": [
    { "task_id": "{N-1}", "summary": "{10-20 line summary}" },
    { "task_id": "{N-2}", "summary": "{10-20 line summary}" }
  ],
  "failure_entries": ["{relevant Decision Log entries for this domain}"]
}
```

## Task Summary Format

After each task completes, the subagent produces a summary saved to disk:

```
## Task {id} Summary — {domain-name}
- **Status**: PASS | FAIL
- **Files modified**: {list}
- **Constraints discovered**: {any new constraints or surprises — used by adaptive-replan}
- **Tests**: {pass/fail count if applicable}
- **Notes**: {10-20 lines max — key decisions, patterns established, warnings}
```

Summaries are saved to: `.gsd-t/domains/{domain-name}/task-{id}-summary.md`

## Rules

1. Each task gets its own fresh subagent — context is NOT shared between tasks
2. Prior task summaries are passed as text (10-20 lines each), not full context
3. Maximum 5 prior summaries forwarded (most recent) — older summaries are on disk if needed
4. Context utilization per task must stay below 25% of the context window
5. If a task fails, its summary still records what was attempted and why it failed
6. The dispatch coordinator (domain-level) stays lightweight — it sequences tasks and passes summaries

## Plan Command Constraint

The `plan` command MUST enforce: **"A task must fit in one context window."**

- Estimated context for a task = scope.md + contracts + graph context + task description + prior summaries
- If estimated scope exceeds 70% of context window, the task MUST be split
- Split heuristic: count files to modify, complexity of changes, number of dependencies
- Tasks with >5 files to modify are candidates for splitting

## Breaking Changes

Any change to the dispatch payload format or summary format is a breaking change. Bump contract version and update all consumers.
