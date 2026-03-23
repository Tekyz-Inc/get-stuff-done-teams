# Domain: metrics-rollup

## Responsibility
Aggregate per-task metrics into milestone-level rollups. Compute process ELO score. Run 4 detection heuristics for anomaly flagging. Integrate rollup into complete-milestone and verify commands.

## Owned Files/Directories
- `bin/metrics-rollup.js` — NEW: reads task-metrics.jsonl, produces rollup.jsonl, computes ELO, runs heuristics
- `.gsd-t/metrics/rollup.jsonl` — NEW: milestone-level aggregation output (created by rollup)
- `commands/gsd-t-complete-milestone.md` — MODIFY: add rollup step + ELO display + trend comparison
- `commands/gsd-t-verify.md` — MODIFY: add quality budget check + heuristic anomaly flags
- `commands/gsd-t-plan.md` — MODIFY: add pre-mortem step (cross-reference historical failure data)
- `test/metrics-rollup.test.js` — NEW: unit tests for metrics-rollup.js

## NOT Owned (do not modify)
- `bin/metrics-collector.js` — owned by metrics-collection domain
- `.gsd-t/metrics/task-metrics.jsonl` — written by metrics-collection domain (read-only here)
- `scripts/gsd-t-dashboard-server.js` — owned by metrics-dashboard domain
- `scripts/gsd-t-dashboard.html` — owned by metrics-dashboard domain
- `commands/gsd-t-metrics.md` — owned by metrics-commands domain
