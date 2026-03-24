# Test Coverage Report — 2026-03-24

## Summary
- Source files analyzed: 3 (global-sync-manager.js, gsd-t.js M27 functions, command files)
- Unit/integration test files: 2 (global-sync-manager.test.js, global-rule-sync.test.js)
- E2E test specs: 0 (N/A — CLI tool, no UI)
- Coverage gaps: 0
- Stale tests: 0
- Dead tests: 0
- Unit tests passing: 481/481
- E2E tests passing: N/A

## Coverage Status

### Well Covered
| Source                          | Test                             | Last Verified |
|---------------------------------|----------------------------------|---------------|
| bin/global-sync-manager.js      | test/global-sync-manager.test.js | 2026-03-24    |
| bin/gsd-t.js (syncGlobal*)      | test/global-rule-sync.test.js    | 2026-03-24    |
| bin/gsd-t.js (exportUniversal*) | test/global-rule-sync.test.js    | 2026-03-24    |

### Partial Coverage
| Source | Test | Gap |
|--------|------|-----|
| (none) |      |     |

### No Coverage
| Source | Risk Level | Reason |
|--------|------------|--------|
| (none) |            |        |

---

## Contract Compliance (M27: cross-project-sync-contract.md)

| Contract Requirement                               | Test Coverage | Status |
|----------------------------------------------------|---------------|--------|
| global-rules.jsonl schema (all 11 fields)          | writeGlobalRule tests verify all fields | PASS   |
| global_id uniqueness                               | assigns incremental global_id test      | PASS   |
| Trigger fingerprint dedup                          | deduplicates by trigger fingerprint     | PASS   |
| promotion_count starts at 1                        | writeGlobalRule schema test             | PASS   |
| is_universal at promotion_count >= 3               | sets is_universal test                  | PASS   |
| is_npm_candidate at promotion_count >= 5           | sets is_npm_candidate test              | PASS   |
| propagated_to no duplicates                        | does not duplicate propagated_to        | PASS   |
| global-rollup.jsonl dedup by project+milestone     | updates existing entry test             | PASS   |
| global-signal-distributions.jsonl one per project  | overwrites entry for same project       | PASS   |
| Signal rate normalization (sum=1)                  | normalizes signal rates test            | PASS   |
| Propagation: qualifying = universal OR count >= 2  | qualifying rules test                   | PASS   |
| Candidate injection: status=active, count=0        | syncGlobalRulesToProject test           | PASS   |
| No re-injection of existing local rules            | does not re-inject test                 | PASS   |
| Global ELO from latest rollup                      | getGlobalELO test                       | PASS   |
| Project rankings sorted by elo descending          | getProjectRankings test                 | PASS   |
| Domain-type comparison across projects             | getDomainTypeComparison tests           | PASS   |
| NPM export only for is_npm_candidate=true          | exportUniversalRulesForNpm tests        | PASS   |

---

## Export Coverage (global-sync-manager.js — 11 public exports)

| Export                          | Tests | Status  |
|---------------------------------|-------|---------|
| readGlobalRules                 | 2     | COVERED |
| writeGlobalRule                 | 10    | COVERED |
| readGlobalRollups               | 1     | COVERED |
| writeGlobalRollup               | 3     | COVERED |
| readGlobalSignalDistributions   | 1     | COVERED |
| writeGlobalSignalDistribution   | 2     | COVERED |
| compareSignalDistributions      | 3     | COVERED |
| getDomainTypeComparison         | 3     | COVERED |
| checkUniversalPromotion         | 3     | COVERED |
| getGlobalELO                    | 2     | COVERED |
| getProjectRankings              | 3     | COVERED |

## gsd-t.js M27 Functions (3 new exports)

| Export                          | Tests | Status  |
|---------------------------------|-------|---------|
| syncGlobalRulesToProject        | 4     | COVERED |
| syncGlobalRules                 | 3     | COVERED |
| exportUniversalRulesForNpm      | 2     | COVERED |

---

## Test Health Metrics

- Test-to-code ratio: 2 test files / 2 source files (1:1)
- Total new tests: 10 (481 total, up from 471)
- Critical paths covered: global rule propagation, dedup, universal promotion, cross-project sync, candidate injection
- Critical paths uncovered: none

---

## Recommendations

No action required. All M27 exports have test coverage. All contract requirements are verified by tests.
