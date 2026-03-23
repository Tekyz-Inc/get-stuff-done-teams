# Contract: Context Observability

## Version: 1.0.0
## Status: DRAFT
## Owner: context-observability domain
## Consumers: execute, wave, integrate, status, visualize, qa, plan commands

---

## Purpose

Defines the data format and alerting thresholds for context window utilization tracking, token breakdown by scope, and compaction proximity warnings.

## Extended Token Log Format

Extends existing `.gsd-t/token-log.md` with new columns (backward compatible):

```markdown
| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |
```

New columns:
- **Domain**: Which domain this subagent belongs to (e.g., "auth", "payments"). Empty for non-domain commands.
- **Task**: Which task within the domain (e.g., "task-3"). Empty for domain-level or non-domain commands.
- **Ctx%**: Peak context window utilization as percentage. Calculated as: `(CLAUDE_CONTEXT_TOKENS_USED / CLAUDE_CONTEXT_TOKENS_MAX) * 100`

## Alert Thresholds

| Threshold | Level | Action |
|-----------|-------|--------|
| Ctx% > 70% | WARNING | Log: "⚠️ Task approaching compaction threshold. Consider splitting in plan." |
| Ctx% > 85% | CRITICAL | Log: "🔴 Compaction likely triggered. Task MUST be split." |
| Compacted = true | INFO | Log: "📊 Compaction detected — fresh dispatch failed for this task." |

Alerts are logged to token-log.md Notes column AND displayed to user inline.

## Token Breakdown Aggregation

Status and visualize commands display aggregated token usage:

```markdown
## Token Usage by Domain
| Domain         | Tokens | Tasks | Avg/Task | Peak Ctx% |
|----------------|--------|-------|----------|-----------|
| auth           | 12,400 | 4     | 3,100    | 14%       |
| payments       | 28,600 | 7     | 4,086    | 18%       |
| notifications  | 45,200 | 3     | 15,067   | 52% ⚠️    |

## Token Usage by Phase
| Phase     | Tokens | Subagents |
|-----------|--------|-----------|
| partition | 2,100  | 1         |
| plan      | 3,400  | 1         |
| execute   | 86,200 | 14        |
| verify    | 5,800  | 2         |
```

## Plan Validation

During `gsd-t-plan`, for each task:
1. Estimate context size: scope.md + contracts + graph + task + prior summaries
2. If estimate > 70% of CLAUDE_CONTEXT_TOKENS_MAX → warn and suggest splitting
3. Heuristic: tasks modifying >5 files OR with >3 complex dependencies are candidates

## Rules

1. Context tracking is informational — it never blocks execution (alerts only)
2. Uses CLAUDE_CONTEXT_TOKENS_USED and CLAUDE_CONTEXT_TOKENS_MAX environment variables
3. If env vars unavailable, Ctx% is recorded as "N/A" (graceful degradation)
4. Backward compatible with existing token-log.md — new columns appended, old entries unaffected
5. Aggregation is computed on-read by status/visualize — no separate aggregation file
6. NOT cost enforcement — no dollar amounts, no monthly budget tracking

## Breaking Changes

Changes to the token-log column format or alert thresholds are breaking. Bump version.
