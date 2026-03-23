# Integration Points

## Current State: Milestone 25 — Telemetry Collection & Metrics Dashboard (4 domains)

## Dependency Graph

```
metrics-collection (all tasks)
  └──▶ metrics-rollup (all tasks) — reads task-metrics.jsonl
  └──▶ metrics-dashboard (all tasks) — serves task-metrics.jsonl via /metrics
  └──▶ metrics-commands (all tasks) — reads task-metrics.jsonl for gsd-t-metrics

metrics-rollup (all tasks)
  └──▶ metrics-dashboard (all tasks) — serves rollup.jsonl via /metrics
  └──▶ metrics-commands (all tasks) — reads rollup.jsonl, displays ELO in status
```

## Shared File Analysis

No files are modified by multiple domains. Each domain has exclusive ownership:

| File                                    | Owner               | Notes                        |
|-----------------------------------------|----------------------|------------------------------|
| `bin/metrics-collector.js`              | metrics-collection   | NEW                          |
| `.gsd-t/metrics/task-metrics.jsonl`     | metrics-collection   | NEW (read by rollup, dash, cmds) |
| `commands/gsd-t-execute.md`             | metrics-collection   | MODIFY (emit + pre-flight)   |
| `commands/gsd-t-quick.md`              | metrics-collection   | MODIFY (emit)                |
| `commands/gsd-t-debug.md`              | metrics-collection   | MODIFY (emit)                |
| `bin/metrics-rollup.js`                 | metrics-rollup       | NEW                          |
| `.gsd-t/metrics/rollup.jsonl`           | metrics-rollup       | NEW (read by dash, cmds)     |
| `commands/gsd-t-complete-milestone.md`  | metrics-rollup       | MODIFY (rollup + ELO)        |
| `commands/gsd-t-verify.md`             | metrics-rollup       | MODIFY (heuristics)          |
| `commands/gsd-t-plan.md`              | metrics-rollup       | MODIFY (pre-mortem)          |
| `scripts/gsd-t-dashboard-server.js`     | metrics-dashboard    | MODIFY (GET /metrics)        |
| `scripts/gsd-t-dashboard.html`          | metrics-dashboard    | MODIFY (Chart.js panel)      |
| `commands/gsd-t-metrics.md`             | metrics-commands     | NEW (50th command)           |
| `commands/gsd-t-status.md`             | metrics-commands     | MODIFY (ELO display)         |
| `bin/gsd-t.js`                         | metrics-commands     | MODIFY (command count)       |
| `README.md`                            | metrics-commands     | MODIFY (commands table)      |
| `GSD-T-README.md`                      | metrics-commands     | MODIFY (command reference)   |
| `templates/CLAUDE-global.md`           | metrics-commands     | MODIFY (commands table)      |
| `commands/gsd-t-help.md`              | metrics-commands     | MODIFY (help summaries)      |

## Wave Execution Groups

### Wave 1 — metrics-collection (foundation)
- metrics-collection: All tasks
- **Rationale**: Produces task-metrics.jsonl consumed by all other domains. Defines the schema contract, creates the collector module, and modifies execute/quick/debug to emit records.
- **Shared files**: None shared — exclusive ownership of collector, execute, quick, debug
- **Completes when**: bin/metrics-collector.js exists, command files emit records, tests pass

### CHECKPOINT 1
- Verify: bin/metrics-collector.js exports are testable
- Verify: task-metrics.jsonl schema matches metrics-schema-contract.md
- Verify: execute/quick/debug commands include emit step
- Verify: Pre-flight check in execute reads historical metrics

### Wave 2 — metrics-rollup (aggregation layer)
- metrics-rollup: All tasks
- **Rationale**: Reads task-metrics.jsonl (must exist from Wave 1). Produces rollup.jsonl with ELO computation and 4 detection heuristics.
- **Shared files**: None shared — exclusive ownership of rollup, complete-milestone, verify, plan
- **Completes when**: bin/metrics-rollup.js exists, rollup produces valid JSONL, heuristics flag correctly, tests pass

### CHECKPOINT 2
- Verify: rollup.jsonl schema matches metrics-schema-contract.md
- Verify: ELO computation is deterministic
- Verify: 4 heuristics produce structured findings
- Verify: complete-milestone includes rollup step
- Verify: verify includes quality budget check
- Verify: plan includes pre-mortem step

### Wave 3 — metrics-dashboard + metrics-commands (parallel — no file overlap)
- metrics-dashboard: All tasks
- metrics-commands: All tasks
- **Rationale**: Both are terminal consumers. Dashboard reads JSONL via HTTP, commands read JSONL from disk. No shared files between these two domains.
- **Completes when**: Dashboard shows charts, gsd-t-metrics command works, status shows ELO, all 4 reference files updated

### CHECKPOINT 3 (Final)
- Verify: GET /metrics returns combined task-metrics + rollup data
- Verify: Dashboard Chart.js panel renders trend lines
- Verify: gsd-t-metrics command returns structured output
- Verify: gsd-t-status displays ELO and key metrics
- Verify: All 4 reference files include gsd-t-metrics
- Verify: bin/gsd-t.js command count is 50
- Verify: All existing tests pass (329+)

## Execution Order (for solo mode)

1. metrics-collection (all tasks)
2. CHECKPOINT 1: verify collector + command emission
3. metrics-rollup (all tasks)
4. CHECKPOINT 2: verify rollup + ELO + heuristics
5. metrics-dashboard (all tasks) — can run parallel with step 6
6. metrics-commands (all tasks) — can run parallel with step 5
7. CHECKPOINT 3: final verification
8. INTEGRATION: verify end-to-end data flow
