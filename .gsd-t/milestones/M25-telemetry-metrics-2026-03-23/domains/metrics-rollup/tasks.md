# Tasks: metrics-rollup

## Summary
Deliver the milestone-level aggregation module (`bin/metrics-rollup.js`) that reads task-metrics.jsonl, computes rollup statistics and process ELO, runs 4 detection heuristics, and integrates rollup into complete-milestone, verify, and plan commands.

## Tasks

### Task 1: Create metrics-rollup.js aggregation module
- **Files**: `bin/metrics-rollup.js`
- **Contract refs**: metrics-schema-contract.md (rollup.jsonl schema, ELO computation, heuristic types)
- **Dependencies**: BLOCKED by metrics-collection Task 2 (must read task-metrics.jsonl schema)
- **Acceptance criteria**:
  - Module exports: `generateRollup(milestone, version)` — reads task-metrics.jsonl, computes rollup, appends to rollup.jsonl
  - Module exports: `computeELO(eloBefore, taskSignals)` — deterministic ELO calculation per contract formula
  - Module exports: `runHeuristics(currentRollup, previousRollup)` — returns array of heuristic_flags
  - Module exports: `readRollups(filters)` — reads and filters rollup.jsonl entries
  - Creates `.gsd-t/metrics/rollup.jsonl` on first write if missing
  - 4 heuristics implemented: first-pass-failure-spike, rework-rate-anomaly, context-overflow-correlation, duration-regression
  - trend_delta computed by comparing to previous milestone rollup (null if first)
  - domain_breakdown array populated from task-metrics grouping
  - ELO starting value: 1000, K-factor: 32 (per contract)
  - Zero external dependencies (Node.js built-ins only)
  - All functions <= 30 lines
  - File under 200 lines total

### Task 2: Create metrics-rollup unit tests
- **Files**: `test/metrics-rollup.test.js`
- **Contract refs**: metrics-schema-contract.md (validates rollup schema + ELO formula + heuristics)
- **Dependencies**: Requires Task 1 (module must exist)
- **Acceptance criteria**:
  - Tests: generateRollup produces valid rollup.jsonl entry matching schema
  - Tests: computeELO returns correct values for known inputs (starting 1000, all-pass, mixed signals)
  - Tests: ELO is deterministic (same input = same output)
  - Tests: all 4 heuristics trigger at correct thresholds
  - Tests: trend_delta null for first milestone, populated for subsequent
  - Tests: domain_breakdown correctly groups by domain
  - All tests pass with `node --test`

### Task 3: Integrate rollup into gsd-t-complete-milestone.md
- **Files**: `commands/gsd-t-complete-milestone.md`
- **Contract refs**: metrics-schema-contract.md (rollup.jsonl schema, ELO display)
- **Dependencies**: Requires Task 1 (metrics-rollup.js must exist)
- **Acceptance criteria**:
  - New step added: "Generate Metrics Rollup" — runs `node bin/metrics-rollup.js` for current milestone
  - ELO score displayed in milestone completion summary (elo_before -> elo_after, delta)
  - Trend comparison displayed if previous milestone exists (first_pass_rate_delta, avg_duration_delta)
  - Heuristic anomalies displayed as warnings if any detected
  - Existing complete-milestone steps not removed or reordered — only ADD new steps
  - Step placement: after archive, before git tag

### Task 4: Integrate quality budget check into gsd-t-verify.md
- **Files**: `commands/gsd-t-verify.md`
- **Contract refs**: metrics-schema-contract.md (heuristic types)
- **Dependencies**: Requires Task 1 (metrics-rollup.js must exist)
- **Acceptance criteria**:
  - New quality gate added: "Metrics Quality Budget Check"
  - Reads task-metrics.jsonl for current milestone, checks: first_pass_rate >= 0.6, no HIGH severity heuristic flags
  - Quality budget violation is a WARNING (non-blocking) — does not fail verify
  - Displays quality metrics summary inline
  - Existing verify gates not removed or reordered — only ADD new gate

### Task 5: Add pre-mortem step to gsd-t-plan.md
- **Files**: `commands/gsd-t-plan.md`
- **Contract refs**: metrics-schema-contract.md (task-metrics.jsonl, pre-flight check)
- **Dependencies**: BLOCKED by metrics-collection Task 2 (reads task-metrics.jsonl)
- **Acceptance criteria**:
  - New step added between Step 1 and Step 2: "Pre-Mortem: Historical Failure Analysis"
  - Reads task-metrics.jsonl for domain-level failure patterns from previous milestones
  - If domain has first_pass_rate < 0.6 historically, adds warning to plan output
  - Non-blocking — informs task design, does not prevent planning
  - Existing plan steps not removed or reordered — only ADD new step (renumber subsequent)

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 2 (Task 1, Task 5 — both blocked by metrics-collection Task 2)
- Estimated checkpoints: 1 (after Task 2 — verify ELO correctness before command integration)
