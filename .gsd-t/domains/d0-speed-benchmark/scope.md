# Domain: d0-speed-benchmark

## Responsibility
Build the go/no-go benchmark that compares orchestrator wall-clock against in-session wall-clock on a single shared workload. This domain is the kill-switch: if orchestrator is not at least as fast as in-session on the same tasks, M40 halts before D4/D5 (UI) are built. No sunk-cost.

## Owned Files/Directories
- `bin/gsd-t-benchmark-orchestrator.js` — driver: runs a fixed workload through D1 + D2 minimal slice, records wall-clock + per-task timings
- `test/m40-speed-benchmark.test.js` — automated assertion: orchestrator_ms <= insession_ms * 1.05 (5% tolerance band)
- `test/fixtures/m40-benchmark-workload/` — frozen workload used for both sides of the benchmark (4–6 tiny independent tasks designed to be parallelism-sensitive)
- `docs/m40-benchmark-report.md` — produced by the benchmark run, includes raw numbers, methodology, and go/no-go verdict

## NOT Owned (do not modify)
- `bin/gsd-t-orchestrator.js` (D1)
- `bin/gsd-t-task-brief.js` (D2)
- anything under `scripts/gsd-t-agent-dashboard*` (D4/D5)
- `commands/gsd-t-execute.md` — stays the in-session comparator, unchanged

## Gate Semantics
- D0 MUST complete before D4 or D5 execute-phase tasks start.
- D0 FAIL verdict → milestone halts at Wave 0; only D1/D2/D3 remain shipped as generic primitives. D4/D5 are deferred.
- D0 PASS verdict → Wave 2 (D1 full) + Wave 3 (D4+D5) unlock.
