# Integration Points

## Current State: Milestone 25 — Telemetry Collection & Metrics Dashboard (PLANNED)

## Dependency Graph

```
metrics-collection Task 1 (event-schema extension) — INDEPENDENT
  └──▶ metrics-collection Task 2 (collector module)

metrics-collection Task 2 (collector module)
  └──▶ metrics-collection Task 3 (unit tests)
  └──▶ metrics-collection Task 4 (instrument execute)
  └──▶ metrics-collection Task 5 (instrument quick + debug)
  └──▶ metrics-rollup Task 1 (rollup module — reads task-metrics.jsonl)
  └──▶ metrics-rollup Task 5 (plan pre-mortem — reads task-metrics.jsonl)
  └──▶ metrics-dashboard Task 1 (/metrics endpoint — serves task-metrics.jsonl)
  └──▶ metrics-commands Task 1 (gsd-t-metrics — reads task-metrics.jsonl)

metrics-rollup Task 1 (rollup module)
  └──▶ metrics-rollup Task 2 (unit tests)
  └──▶ metrics-rollup Task 3 (complete-milestone integration)
  └──▶ metrics-rollup Task 4 (verify quality budget)
  └──▶ metrics-dashboard Task 1 (/metrics endpoint — serves rollup.jsonl)
  └──▶ metrics-commands Task 1 (gsd-t-metrics — reads rollup.jsonl)
  └──▶ metrics-commands Task 2 (status ELO — reads rollup.jsonl)

metrics-commands Task 1 (gsd-t-metrics command)
  └──▶ metrics-commands Task 3 (CLI command count)
  └──▶ metrics-commands Task 4 (4 reference files)

metrics-dashboard Task 1 (/metrics endpoint)
  └──▶ metrics-dashboard Task 2 (Chart.js panel)
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
- metrics-collection: Tasks 1-5
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/metrics-collector.js exists, tests pass, execute/quick/debug emit records

### CHECKPOINT 1
- GATE: metrics-collection Task 3 (tests pass) + Task 4-5 (commands instrumented)
- VERIFY: Lead confirms task-metrics.jsonl schema matches metrics-schema-contract.md
- VERIFY: Pre-flight check in execute reads historical metrics
- UNLOCKS: metrics-rollup Tasks 1, 5; metrics-dashboard Task 1; metrics-commands Task 1

### Wave 2 — metrics-rollup (aggregation layer)
- metrics-rollup: Tasks 1-5
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/metrics-rollup.js exists, tests pass, complete-milestone/verify/plan extended

### CHECKPOINT 2
- GATE: metrics-rollup Task 2 (tests pass) + Tasks 3-5 (commands extended)
- VERIFY: Lead confirms rollup.jsonl schema matches metrics-schema-contract.md
- VERIFY: ELO computation is deterministic (same input = same output)
- VERIFY: 4 heuristics produce structured findings at correct thresholds
- UNLOCKS: metrics-dashboard Task 1; metrics-commands Tasks 1, 2

### Wave 3 — metrics-dashboard + metrics-commands (parallel — no file overlap)
- metrics-dashboard: Tasks 1-2
- metrics-commands: Tasks 1-4
- **Shared files**: NONE — safe to run in parallel
- **Completes when**: Dashboard shows charts, gsd-t-metrics command works, status shows ELO, all reference files updated

### CHECKPOINT 3 (Final)
- VERIFY: GET /metrics returns combined task-metrics + rollup data
- VERIFY: Dashboard Chart.js panel renders trend lines and domain heatmap
- VERIFY: gsd-t-metrics command returns structured output with graceful fallback
- VERIFY: gsd-t-status displays ELO and key metrics
- VERIFY: All 4 reference files include gsd-t-metrics
- VERIFY: bin/gsd-t.js command count is 50
- VERIFY: All existing tests pass (329+) + new metrics tests pass

## Execution Order (for solo mode)

1. metrics-collection Task 1 (extend event-schema-contract)
2. metrics-collection Task 2 (create metrics-collector.js)
3. metrics-collection Task 3 (unit tests)
4. metrics-collection Task 4 (instrument execute)
5. metrics-collection Task 5 (instrument quick + debug)
6. CHECKPOINT 1: verify collector + command emission
7. metrics-rollup Task 1 (create metrics-rollup.js)
8. metrics-rollup Task 2 (unit tests)
9. metrics-rollup Task 3 (integrate complete-milestone)
10. metrics-rollup Task 4 (integrate verify)
11. metrics-rollup Task 5 (add plan pre-mortem)
12. CHECKPOINT 2: verify rollup + ELO + heuristics
13. metrics-dashboard Task 1 (/metrics endpoint) — parallel-safe with step 14-17
14. metrics-commands Task 1 (gsd-t-metrics command) — parallel-safe with step 13
15. metrics-dashboard Task 2 (Chart.js panel)
16. metrics-commands Task 2 (status ELO display)
17. metrics-commands Task 3 (CLI command count)
18. metrics-commands Task 4 (4 reference files)
19. CHECKPOINT 3: final verification
20. INTEGRATION: verify end-to-end data flow (collector -> rollup -> dashboard + commands)
