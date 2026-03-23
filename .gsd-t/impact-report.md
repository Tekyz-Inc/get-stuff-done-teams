# Impact Analysis — 2026-03-23

## Summary
- Breaking changes: 0
- Requires updates: 5
- Safe changes: 12
- Unknown: 0
- **Recommendation**: PROCEED

## Planned Changes

| File                                         | Change Type | Description                                                    |
|----------------------------------------------|-------------|----------------------------------------------------------------|
| `bin/metrics-collector.js`                   | create      | Per-task telemetry writer module                               |
| `bin/metrics-rollup.js`                      | create      | Milestone rollup aggregation, ELO, heuristics                  |
| `test/metrics-collector.test.js`             | create      | Unit tests for metrics-collector                               |
| `test/metrics-rollup.test.js`                | create      | Unit tests for metrics-rollup                                  |
| `commands/gsd-t-metrics.md`                  | create      | New 50th command — metrics display                             |
| `.gsd-t/metrics/task-metrics.jsonl`          | create      | Per-task telemetry output (runtime, not committed)             |
| `.gsd-t/metrics/rollup.jsonl`                | create      | Milestone rollup output (runtime, not committed)               |
| `.gsd-t/contracts/event-schema-contract.md`  | modify      | Add `task_complete` event type row                             |
| `commands/gsd-t-execute.md`                  | modify      | Add task-metrics emit step + pre-flight check                  |
| `commands/gsd-t-quick.md`                    | modify      | Add task-metrics emit step                                     |
| `commands/gsd-t-debug.md`                    | modify      | Add task-metrics emit step                                     |
| `commands/gsd-t-complete-milestone.md`       | modify      | Add rollup generation step + ELO display                       |
| `commands/gsd-t-verify.md`                   | modify      | Add quality budget check gate                                  |
| `commands/gsd-t-plan.md`                     | modify      | Add pre-mortem historical failure step                         |
| `commands/gsd-t-status.md`                   | modify      | Add ELO + quality budget section                               |
| `scripts/gsd-t-dashboard-server.js`          | modify      | Add GET /metrics endpoint + readMetricsData export             |
| `scripts/gsd-t-dashboard.html`              | modify      | Add Chart.js metrics panel (trend line + heatmap)              |
| `bin/gsd-t.js`                               | modify      | No code change needed — count is dynamic from filesystem       |
| `README.md`                                  | modify      | Add gsd-t-metrics to commands table, update count 49->50       |
| `GSD-T-README.md`                            | modify      | Add gsd-t-metrics to detailed command reference                |
| `templates/CLAUDE-global.md`                 | modify      | Add gsd-t-metrics to commands table                            |
| `commands/gsd-t-help.md`                     | modify      | Add gsd-t-metrics to help summaries                            |
| `scripts/gsd-t-event-writer.js`              | modify      | Add `task_complete` to VALID_EVENT_TYPES allowlist              |

---

## 🔴 Breaking Changes

None.

All planned changes are additive: new files, new steps appended to existing commands, new endpoint added alongside existing ones. No existing interfaces, return types, or behaviors are modified.

---

## 🟡 Requires Updates

### IMP-010: Dashboard server line budget constraint
- **Change**: Adding GET /metrics endpoint + readMetricsData to `scripts/gsd-t-dashboard-server.js`
- **Affected**: `scripts/gsd-t-dashboard-server.js` (currently 154 lines, budget ~46 lines per task spec)
- **Action**: Implementation must stay under 200 lines total. The readMetricsData function + route handler + module.exports update should fit in ~20-30 lines. Monitor line count during execution.
- **Blocking**: NO — manageable within budget

### IMP-011: Module exports addition to dashboard server
- **Change**: Adding `readMetricsData` to the existing `module.exports` object at line 125
- **Affected**: `test/dashboard-server.test.js` — existing tests import from this module
- **Action**: Existing tests will still pass (additive export). New tests should verify the new export. Confirm existing test imports are not affected by the addition.
- **Blocking**: NO — additive change, existing tests unaffected

### IMP-012: Command count references in documentation
- **Change**: Adding 50th command (gsd-t-metrics) changes count from 49 to 50 in 4+ files
- **Affected**: `README.md` (lines 23, 314), `GSD-T-README.md`, `templates/CLAUDE-global.md`, `CLAUDE.md` (project), `package.json` description
- **Action**: All count references must be updated atomically in the metrics-commands domain Task 4. Also check `CLAUDE.md` project file header which says "49 slash commands" — this needs updating too.
- **Blocking**: NO — documentation update, done during execution

### IMP-013: Event writer has hardcoded allowlist for event types
- **Change**: Adding `task_complete` event type to event-schema-contract.md
- **Affected**: `scripts/gsd-t-event-writer.js` line 22 — `VALID_EVENT_TYPES` Set has hardcoded allowlist; `test/event-stream.test.js` — may assert valid event types
- **Action**: MUST add `"task_complete"` to the `VALID_EVENT_TYPES` Set in `scripts/gsd-t-event-writer.js` during metrics-collection Task 1 (alongside contract update). Without this, event emission will fail validation with exit code 1.
- **Blocking**: NO — straightforward addition during execution

### IMP-014: Plan command step renumbering
- **Change**: Adding pre-mortem step between Step 1 and Step 2 of `commands/gsd-t-plan.md`
- **Affected**: `commands/gsd-t-plan.md` — all subsequent steps need renumbering
- **Action**: Renumber Step 2+ to Step 3+ after inserting the new step. Verify no other commands reference plan steps by number.
- **Blocking**: NO — straightforward renumbering

---

## 🟢 Safe Changes

- `bin/metrics-collector.js`: New file, no consumers yet — zero downstream risk
- `bin/metrics-rollup.js`: New file, no consumers yet — zero downstream risk
- `test/metrics-collector.test.js`: New test file — additive only
- `test/metrics-rollup.test.js`: New test file — additive only
- `commands/gsd-t-metrics.md`: New command file — no existing consumers
- `.gsd-t/metrics/task-metrics.jsonl`: New runtime data file — created on first write
- `.gsd-t/metrics/rollup.jsonl`: New runtime data file — created on first write
- `commands/gsd-t-execute.md`: Additive steps only — existing steps preserved
- `commands/gsd-t-quick.md`: Additive steps only — existing steps preserved
- `commands/gsd-t-debug.md`: Additive steps only — existing steps preserved
- `commands/gsd-t-complete-milestone.md`: Additive step — existing flow preserved
- `commands/gsd-t-verify.md`: Additive non-blocking gate — existing gates preserved

---

## ⚪ Unknown Impact

None. All changes are well-defined with clear boundaries.

---

## Contract Status

| Contract                      | Status           | Notes                                                        |
|-------------------------------|------------------|--------------------------------------------------------------|
| metrics-schema-contract.md    | OK               | New contract, fully defined — implementation follows it      |
| event-schema-contract.md      | UPDATE NEEDED    | Add `task_complete` event type (metrics-collection Task 1)   |
| dashboard-server-contract.md  | OK               | GET /metrics already specified — implementation follows it   |
| wave-phase-sequence.md        | OK               | No phase order changes                                       |
| pre-commit-gate.md            | OK               | No gate changes                                              |

---

## Test Impact

| Test File                        | Status    | Action Needed                                              |
|----------------------------------|-----------|-------------------------------------------------------------|
| `test/dashboard-server.test.js`  | WILL PASS | Existing tests unaffected; new /metrics tests needed        |
| `test/event-stream.test.js`      | WILL PASS | May need update if event_type allowlist exists              |
| `test/cli-quality.test.js`       | WILL PASS | Dynamic command counting — adapts automatically             |
| `test/headless.test.js`          | WILL PASS | No headless interface changes                               |
| `test/graph-*.test.js`           | WILL PASS | No graph module changes                                     |
| `test/scan.test.js`              | WILL PASS | No scan module changes                                      |
| `test/helpers.test.js`           | WILL PASS | No helper changes                                           |
| `test/filesystem.test.js`        | WILL PASS | No filesystem util changes                                  |
| `test/security.test.js`          | WILL PASS | No security changes                                         |
| `test/verify-gates.js`           | WILL PASS | Additive gate — existing gates unchanged                    |
| `test/metrics-collector.test.js` | NEW       | Created in metrics-collection domain Task 3                 |
| `test/metrics-rollup.test.js`    | NEW       | Created in metrics-rollup domain Task 2                     |

**Baseline**: 329/329 tests currently pass. Target: 329+ tests pass after M25.

---

## Recommended Execution Order

1. **Wave 1 — metrics-collection**: Create `bin/metrics-collector.js`, extend event-schema-contract, write unit tests, instrument execute/quick/debug commands. Foundation layer — all other domains depend on this.
2. **Wave 2 — metrics-rollup**: Create `bin/metrics-rollup.js`, write unit tests, integrate into complete-milestone/verify/plan commands. Depends on task-metrics.jsonl schema from Wave 1.
3. **Wave 3 — metrics-dashboard + metrics-commands** (parallel): Dashboard server endpoint + Chart.js panel; new gsd-t-metrics command + status update + reference file updates. Both are terminal consumers with no shared files.

This matches the execution order already defined in progress.md.

---

## Generated Tasks

No remediation tasks needed. All 5 "Requires Updates" items are addressable during normal execution within their respective domain tasks.

Pre-execution checklist for awareness:
- [ ] IMP-010: Monitor dashboard server line count during metrics-dashboard Task 1
- [ ] IMP-012: Update command count in CLAUDE.md project file alongside the 4 reference files
- [ ] IMP-013: Check event-writer.js validation logic during metrics-collection Task 1
