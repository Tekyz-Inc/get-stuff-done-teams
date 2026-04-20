# Test Coverage Report — 2026-04-20 (M40 test-sync)

## Summary
- Source files analyzed (M40 scope): 9
- Unit/integration test files (M40): 16
- E2E test specs: N/A (CLI package — no playwright.config.*)
- Coverage gaps: 0
- Stale tests: 0
- Dead tests: 0
- Unit tests passing: **1421/1421**
- E2E tests passing: N/A

## Coverage Status

### ✅ Well Covered (M40 scope)

| Source | Test | Last Verified |
|--------|------|---------------|
| `bin/gsd-t-orchestrator.js` | `m40-orchestrator-main.test.js` + `m40-orchestrator-integration.test.js` + `m40-orchestrator-stream-feed-wiring.test.js` | 2026-04-20 |
| `bin/gsd-t-orchestrator-config.cjs` | `m40-orchestrator-config.test.js` | 2026-04-20 |
| `bin/gsd-t-orchestrator-queue.cjs` | `m40-orchestrator-queue.test.js` | 2026-04-20 |
| `bin/gsd-t-orchestrator-worker.cjs` | `m40-orchestrator-worker.test.js` | 2026-04-20 |
| `bin/gsd-t-orchestrator-recover.cjs` | `m40-recovery.test.js` (24 tests) | 2026-04-20 |
| `bin/gsd-t-completion-check.cjs` | `m40-completion-protocol.test.js` | 2026-04-20 |
| `bin/gsd-t-benchmark-orchestrator.js` | `m40-speed-benchmark.test.js` + `m40-benchmark-workload-fixture.test.js` | 2026-04-20 |
| `scripts/gsd-t-stream-feed-server.js` | `m40-stream-feed-server.test.js` | 2026-04-20 |
| `scripts/gsd-t-stream-feed.html` | `m40-stream-feed-ui.test.js` (12 tests, DOM string inspection) | 2026-04-20 |
| `scripts/gsd-t-token-aggregator.js` | `m40-token-aggregator.test.js` (12 tests) | 2026-04-20 |
| `templates/prompts/m40-task-brief.md` | `m40-task-brief.test.js` + `m40-task-brief-template.test.js` + `m40-task-brief-compactor.test.js` | 2026-04-20 |

### ⚠️ Partial Coverage
None.

### ❌ No Coverage
None.

---

## Contract Coverage Audit

| Contract | Covering Tests |
|----------|---------------|
| `stream-json-sink-contract.md` v1.1.0 | m40-stream-feed-server.test.js, m40-orchestrator-stream-feed-wiring.test.js, m40-stream-feed-ui.test.js, m40-token-aggregator.test.js |
| `wave-join-contract.md` | m40-orchestrator-integration.test.js, m40-orchestrator-main.test.js |
| `completion-signal-contract.md` | m40-completion-protocol.test.js, m40-recovery.test.js |
| `metrics-schema-contract.md` | m40-token-aggregator.test.js |

---

## Issues Found

### Stale Tests
None.

### Dead Tests
None.

### Failing Tests
None. Full suite 1421/1421 pass.

---

## Test Health Metrics

- M40 test-to-code ratio: 16 tests / 9 source files = 1.78 (healthy)
- Recovery module: 24 assertions (D6 comprehensive)
- Stream-feed UI: 12 assertions (DOM string inspection, zero browser required)
- Token-aggregator: 12 assertions (stream-json usage parsing + log rewriting)
- Orchestrator integration: SIGINT-mid-wave + 2nd-fail-halt + 3-wave success scenarios covered
- Critical paths covered: task-boundary frames, wave-boundary frames, workerPid attribution, SIGINT handling, second-fail-halt, stream-json usage parsing, recovery (fresh/terminal/resume modes), ambiguous-task flagging, archiveState round-trip
- Critical paths uncovered: none identified for M40

---

## Generated Tasks

### High Priority (blocking)
None — all M40 tests pass, zero gaps.

### Medium Priority
None.

### Low Priority
None.

---

## Recommendations

M40 test coverage is complete and healthy. Every source file in the M40 scope has at least one test file. Every contract in the M40 scope (stream-json-sink, wave-join, completion-signal, metrics-schema) has covering test(s). Recovery work (D6) landed 24 new assertions with dependency injection — zero real `assertCompletion` or `process.kill` calls in tests. Proceed to integrate → verify.
