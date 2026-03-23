# Domain: metrics-collection

## Responsibility
Collect per-task structured telemetry during execution. Provides the `bin/metrics-collector.js` writer module and modifies execute/quick/debug commands to emit task-metrics records. Extends the event-schema-contract with a `task_complete` event type.

## Owned Files/Directories
- `bin/metrics-collector.js` — NEW: reads event stream + token-log, writes task-metrics.jsonl
- `.gsd-t/metrics/task-metrics.jsonl` — NEW: per-task telemetry output (created by collector)
- `.gsd-t/contracts/event-schema-contract.md` — MODIFY: add `task_complete` event type
- `commands/gsd-t-execute.md` — MODIFY: add task-metrics emit step after each task
- `commands/gsd-t-quick.md` — MODIFY: add task-metrics emit step
- `commands/gsd-t-debug.md` — MODIFY: add task-metrics emit step
- `test/metrics-collector.test.js` — NEW: unit tests for metrics-collector.js

## NOT Owned (do not modify)
- `bin/metrics-rollup.js` — owned by metrics-rollup domain
- `scripts/gsd-t-dashboard-server.js` — owned by metrics-dashboard domain
- `scripts/gsd-t-dashboard.html` — owned by metrics-dashboard domain
- `commands/gsd-t-metrics.md` — owned by metrics-commands domain
- `commands/gsd-t-status.md` — owned by metrics-commands domain
- `commands/gsd-t-complete-milestone.md` — owned by metrics-rollup domain
