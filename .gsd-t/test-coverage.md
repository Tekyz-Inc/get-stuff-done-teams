# Test Coverage Report — 2026-03-24

## Summary
- Source files analyzed: 4 (global-sync-manager.js, gsd-t.js M27 functions, command files, doc-ripple logic)
- Unit/integration test files: 3 (global-sync-manager.test.js, global-rule-sync.test.js, doc-ripple.test.js)
- E2E test specs: 0 (N/A — CLI tool, no UI)
- Coverage gaps: 0
- Stale tests: 0
- Dead tests: 0
- Unit tests passing: 536/536
- E2E tests passing: N/A

## Coverage Status

### Well Covered
| Source                          | Test                             | Last Verified |
|---------------------------------|----------------------------------|---------------|
| bin/global-sync-manager.js      | test/global-sync-manager.test.js | 2026-03-24    |
| bin/gsd-t.js (syncGlobal*)      | test/global-rule-sync.test.js    | 2026-03-24    |
| bin/gsd-t.js (exportUniversal*) | test/global-rule-sync.test.js    | 2026-03-24    |
| doc-ripple threshold logic      | test/doc-ripple.test.js          | 2026-03-24    |
| doc-ripple blast radius         | test/doc-ripple.test.js          | 2026-03-24    |
| doc-ripple manifest format      | test/doc-ripple.test.js          | 2026-03-24    |
| doc-ripple content signals      | test/doc-ripple.test.js          | 2026-03-24    |

### Partial Coverage
| Source | Test | Gap |
|--------|------|-----|
| (none) |      |     |

### No Coverage
| Source | Risk Level | Reason |
|--------|------------|--------|
| (none) |            |        |

## Doc-Ripple Contract Coverage (M28)

All 7 FIRE conditions from doc-ripple-contract.md are tested:

| FIRE Condition | Test(s) | Status |
|---------------|---------|--------|
| Files span 3+ directories | threshold FIRE: "fires when files span 3+ directories" | COVERED |
| Contract file modified | threshold FIRE: "fires when a contract file is modified" | COVERED |
| Template file modified | threshold FIRE: "fires when a template file is modified" | COVERED |
| CLAUDE.md modified | threshold FIRE: "fires when CLAUDE.md is modified" | COVERED |
| Command file modified | threshold FIRE: "fires when a command file is modified" | COVERED |
| API endpoint/route in diff | threshold FIRE: "fires when diff contains API endpoint/route patterns" | COVERED |
| Convention keywords in diff | threshold FIRE: "fires when diff contains convention keywords" | COVERED |

All 3 SKIP conditions tested:

| SKIP Condition | Test(s) | Status |
|---------------|---------|--------|
| 1-2 dirs, implementation-only | threshold SKIP: 5 tests | COVERED |
| No special files modified | threshold SKIP: "skips for test-only changes" | COVERED |
| Convention keywords only in test files | threshold FIRE: "skips convention keywords if only in test files" | COVERED |

## Test Health Metrics

- Test-to-code ratio: 536 tests / 6 test files
- Doc-ripple tests: 56 (threshold: 12, content signals: 8, blast radius: 9, manifest: 8, classify: 8, dirs: 4, integration: 2, extra: 5)
- Filesystem tests: 338 lines (CLI, helpers, command counting)
- Critical paths covered: threshold logic, blast radius, manifest format, content-based signal detection
- Critical paths uncovered: none

## Generated Tasks

None — all coverage gaps addressed in this sync.

## Recommendations

No action required. All M28 deliverables have complete test coverage matching every contract condition.
