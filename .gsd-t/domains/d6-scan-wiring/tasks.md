# Tasks: d6-scan-wiring

## Summary
When all tasks complete: `/scan` builds the index on run-1 and reads-once-queries-after via the D5 query CLI on run-2 (warm), falls back to grep mode loudly on graph-unavailable, and reports both run wall-clocks (AC-4) in progress.md + CHANGELOG.

## Tasks

### Task 1: Scan-consumer contract
- **Files**: `.gsd-t/contracts/graph-scan-consumer-contract.md`
- **Contract refs**: graph-query-cli-contract (D5), graph-scan-consumer-contract (authored here)
- **Dependencies**: BLOCKED by d5-query-cli Task 1 (the query-cli envelope contract)
- **Acceptance criteria**:
  - Declares how /scan invokes the query CLI (run-1 build-if-absent, run-2 query-after), the announced grep-mode fallback rule on graph-unavailable, and the AC-4 dual-wall-clock measurement protocol

### Task 2: Wire scan command + workflow
- **Files**: `commands/gsd-t-scan.md`, `templates/workflows/gsd-t-scan.workflow.js`
- **Contract refs**: graph-scan-consumer-contract (Task 1), graph-query-cli-contract (D5)
- **Dependencies**: Requires Task 1 (within domain); BLOCKED by the Wave-2 build trio (d3+d4+d5) integrating
- **Acceptance criteria**:
  - run-1 builds the index if `store.exists()` is false; run-2 reads-once-queries-after via the query CLI ([RULE] scan-run2-reads-index-not-source)
  - Workflow stays runtime-native (M81 — delegates the query-CLI call to an inline `agent()` Bash helper; no require/fs)
  - Falls back to grep mode ANNOUNCED only on graph-unavailable (extends, does not replace, existing scan)

### Task 3: AC-4 measurement + report
- **Files**: `.gsd-t/spikes/ac4-scan-run2-speedup-results.md`, `test/m94-d6-scan-consumer.test.js`
- **Contract refs**: graph-scan-consumer-contract (Task 1)
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - Measures both run wall-clocks (run-1 build, run-2 warm) on the real Atos repo; records both with live-clock timestamp
  - progress.md + CHANGELOG.md updated with both wall-clocks (AC-4)
  - Test: scan queries the index when warm; falls back to announced grep mode on graph-unavailable

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0 (gated on Wave 2 integration)
- Blocked tasks (waiting on other domains): 1 (Task 1, on d5's query-cli contract; Task 2 on full Wave-2 trio)
- Estimated checkpoints: 1 (Wave-3 — the falsifiable payoff)
