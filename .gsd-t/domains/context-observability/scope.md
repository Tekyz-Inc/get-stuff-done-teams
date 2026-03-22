# Domain: context-observability

## Purpose
Track context window utilization per subagent, provide token breakdown by domain/task/phase, and warn before compaction triggers. Replace the cost-focused "budget ceilings" concept with context-aware monitoring.

## Owned Files
- `commands/gsd-t-execute.md` (context tracking after each subagent)
- `commands/gsd-t-wave.md` (context tracking integration)
- `commands/gsd-t-integrate.md` (context tracking)
- `commands/gsd-t-status.md` (display token breakdown)
- `commands/gsd-t-visualize.md` (display context metrics)
- `commands/gsd-t-qa.md` (context tracking)
- `commands/gsd-t-plan.md` (task scope validation — warn if >70% context)

## Key Responsibilities
1. Context window % tracking: log peak utilization per subagent via CLAUDE_CONTEXT_TOKENS_USED / CLAUDE_CONTEXT_TOKENS_MAX
2. Extended token-log.md format: add Domain, Task, Ctx% columns
3. Compaction proximity alerts: warn at 70%, critical at 85%
4. Token breakdown by scope: aggregate by domain, task, phase
5. Status/visualize integration: display context metrics in status output
6. Plan validation: warn if task scope suggests >70% context utilization

## Contracts Consumed
- pre-commit-gate.md
- domain-structure.md (domain names for aggregation)

## Contracts Produced
- context-observability-contract.md

## Constraints
- NOT cost enforcement — no dollar amounts, no monthly budget limits
- Uses existing CLAUDE_CONTEXT_TOKENS_USED / CLAUDE_CONTEXT_TOKENS_MAX environment variables
- Extends existing token-log.md format (backward compatible — new columns appended)
- Alerts are informational (70% warning) and actionable (85% = task too large, split it)
- Dashboard-ready data format for visualize and headless query (M23)
