# Tasks: metrics-collection

## Summary
Deliver the per-task telemetry writer module (`bin/metrics-collector.js`) and instrument the execute, quick, and debug commands to emit structured task-metrics records after each completed task. Extend event-schema-contract with `task_complete` event type.

## Tasks

### Task 1: Extend event-schema-contract with task_complete event type
- **Files**: `.gsd-t/contracts/event-schema-contract.md`
- **Contract refs**: event-schema-contract.md (extend Event Types table)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `task_complete` event type added to Event Types table with description and key fields
  - Event type documentation consistent with existing table format
  - No existing event types modified or removed

### Task 2: Create metrics-collector.js writer module
- **Files**: `bin/metrics-collector.js`
- **Contract refs**: metrics-schema-contract.md (task-metrics.jsonl schema)
- **Dependencies**: Requires Task 1 (event schema extended)
- **Acceptance criteria**:
  - Module exports: `collectTaskMetrics(data)` — writes one JSONL line to `.gsd-t/metrics/task-metrics.jsonl`
  - Module exports: `readTaskMetrics(filters)` — reads and filters task-metrics.jsonl (for pre-flight check)
  - Module exports: `getPreFlightWarnings(domain)` — returns warnings if domain first_pass_rate < 0.6 or avg fix_cycles > 2.0
  - Creates `.gsd-t/metrics/` directory on first write if missing
  - Validates all required fields per metrics-schema-contract.md before writing
  - `signal_weight` auto-derived from `signal_type` (enforced, not caller-supplied)
  - Zero external dependencies (Node.js built-ins only: fs, path)
  - All functions <= 30 lines
  - File under 200 lines total

### Task 3: Create metrics-collector unit tests
- **Files**: `test/metrics-collector.test.js`
- **Contract refs**: metrics-schema-contract.md (validates schema compliance)
- **Dependencies**: Requires Task 2 (module must exist)
- **Acceptance criteria**:
  - Tests: collectTaskMetrics writes valid JSONL line matching schema
  - Tests: field validation rejects missing required fields
  - Tests: signal_weight matches signal_type mapping
  - Tests: readTaskMetrics filters by domain, milestone
  - Tests: getPreFlightWarnings returns correct warnings for low first_pass_rate / high fix_cycles
  - Tests: directory creation on first write
  - All tests pass with `node --test`

### Task 4: Instrument gsd-t-execute.md with task-metrics emission
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: metrics-schema-contract.md (task-metrics.jsonl schema), event-schema-contract.md (task_complete event)
- **Dependencies**: Requires Task 2 (metrics-collector.js must exist)
- **Acceptance criteria**:
  - After each task completes in solo mode: emit task-metrics record via `node bin/metrics-collector.js`
  - After each task completes in team mode: emit task-metrics record via `node bin/metrics-collector.js`
  - Pre-flight intelligence check added before task dispatch: call getPreFlightWarnings, display inline warnings (non-blocking)
  - Signal type determined by task outcome: pass -> pass-through, rework -> fix-cycle, debug -> debug-invoked
  - Existing execute steps not removed or reordered — only ADD new steps
  - Duration and context_pct captured from observability logging vars

### Task 5: Instrument gsd-t-quick.md and gsd-t-debug.md with task-metrics emission
- **Files**: `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`
- **Contract refs**: metrics-schema-contract.md (task-metrics.jsonl schema)
- **Dependencies**: Requires Task 2 (metrics-collector.js must exist)
- **Acceptance criteria**:
  - gsd-t-quick.md: emit task-metrics record after task completion with appropriate signal_type
  - gsd-t-debug.md: emit task-metrics record after debug resolution with signal_type=debug-invoked
  - Existing command steps not removed or reordered — only ADD new steps
  - Both commands reference metrics-collector.js by path (no import, shell invocation)

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 1 (after Task 3 — verify schema compliance before instrumenting commands)
