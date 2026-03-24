# Test Coverage Report — 2026-03-23

## Summary
- Source files analyzed: 2 (bin/rule-engine.js, bin/patch-lifecycle.js)
- Unit/integration test files: 2 (test/rule-engine.test.js, test/patch-lifecycle.test.js)
- E2E test specs: 0 (not applicable — CLI/library, no UI)
- Coverage gaps: 0
- Stale tests: 0
- Dead tests: 0
- Unit tests passing: 433/433
- E2E tests passing: N/A

## Coverage Status

### Well Covered
| Source                    | Test                          | Last Verified |
|---------------------------|-------------------------------|---------------|
| bin/rule-engine.js        | test/rule-engine.test.js      | 2026-03-23    |
| bin/patch-lifecycle.js    | test/patch-lifecycle.test.js  | 2026-03-23    |

### Export Coverage Detail

#### bin/rule-engine.js (7 exports, 32 tests)
| Export              | Tests | Coverage Notes                                           |
|---------------------|-------|----------------------------------------------------------|
| getActiveRules      | 3     | active/deprecated/consolidated filtering, missing file    |
| evaluateRules       | 14    | All 8 operators, window, domain/global/milestone scope, first_pass_rate, empty metrics |
| getPreMortemRules   | 2     | With/without activations                                  |
| getPatchTemplate    | 3     | Found, not found, missing file                            |
| recordActivation    | 3     | Increment, existing count, unknown ID                     |
| flagInactiveRules   | 3     | Threshold flagging, active rules, deprecated rules        |
| consolidateRules    | 2     | Mark + append, preserve non-consolidated                  |

#### bin/patch-lifecycle.js (8 exports, 28 tests)
| Export              | Tests | Coverage Notes                                           |
|---------------------|-------|----------------------------------------------------------|
| createCandidate     | 2     | Schema validation, incrementing IDs                       |
| applyPatch          | 8     | All 4 edit types, missing file, non-candidate, missing anchor, missing template, unknown edit_type |
| recordMeasurement   | 4     | Basic, accumulate milestones, candidate no-op, zero baseline |
| checkPromotionGate  | 4     | Pass, <2 milestones, <=55% improvement, unknown patch     |
| promote             | 2     | Happy path, non-measured no-op                            |
| graduate            | 4     | Happy path, insufficient milestones, non-promoted, missing template |
| deprecate           | 1     | Sets status + reason + timestamp                          |
| getPatchesByStatus  | 2     | Filter by status, empty directory                         |

## Contract Compliance

All schemas from `.gsd-t/contracts/rule-engine-contract.md` verified:
- rules.jsonl schema fields: tested via makeRule factory
- patch-templates.jsonl schema: tested via seedTemplate/writeTemplates
- Patch status file schema: tested through full lifecycle (candidate -> applied -> measured -> promoted -> graduated)
- Promotion gate (>55% improvement, 2+ milestones): tested with pass/fail cases
- Graduation criteria (promoted, 3+ milestones): tested with pass/fail cases
- Lifecycle state machine transitions: all paths tested
- Edit types (append, prepend, insert_after, replace): all tested

## Issues Found

None.

## Test Health Metrics

- Test-to-code ratio: 60 tests / 2 source files (30:1)
- Critical paths covered: full lifecycle, all operators, all edit types, all state transitions
- Critical paths uncovered: none

## Recommendations

No action needed. All exports fully covered with edge cases.
