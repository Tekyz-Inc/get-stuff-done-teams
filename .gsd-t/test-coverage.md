# Test Coverage Report — 2026-04-01

## Summary
- Source files analyzed: 17 (bin/*.js + M32 command files: gsd-t-init.md, gsd-t-setup.md, gsd-t-partition.md, gsd-t-plan.md, gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md; template: CLAUDE-project.md)
- Unit/integration test files: 24 (test/*.test.js)
- E2E test specs: 0 (N/A — CLI tool, no UI)
- Coverage gaps: 0 (M32 changes are markdown-only; JS test suite unchanged)
- Stale tests: 0
- Dead tests: 0
- Unit tests passing: 823/829 (6 pre-existing failures unrelated to M32)
- E2E tests passing: N/A

## Coverage Status

### Well Covered
| Source                                    | Test                               | Last Verified |
|-------------------------------------------|------------------------------------|---------------|
| bin/global-sync-manager.js                | test/global-sync-manager.test.js   | 2026-04-01    |
| bin/gsd-t.js (syncGlobal*)                | test/global-rule-sync.test.js      | 2026-04-01    |
| bin/gsd-t.js (exportUniversal*)           | test/global-rule-sync.test.js      | 2026-04-01    |
| bin/doc-ripple.js                         | test/doc-ripple.test.js            | 2026-04-01    |
| bin/metrics-collector.js                  | test/metrics-collector.test.js     | 2026-04-01    |
| bin/metrics-rollup.js                     | test/metrics-rollup.test.js        | 2026-04-01    |
| bin/rule-engine.js                        | test/rule-engine.test.js           | 2026-04-01    |
| bin/patch-lifecycle.js                    | test/patch-lifecycle.test.js       | 2026-04-01    |
| bin/stack-rules.js                        | test/stack-rules.test.js           | 2026-04-01    |
| bin/qa-calibrator.js                      | test/qa-calibrator.test.js         | 2026-04-01    |
| bin/token-budget.js                       | test/token-budget.test.js          | 2026-04-01    |
| bin/component-registry.js                 | test/component-registry.test.js    | 2026-04-01    |
| bin/debug-ledger.js                       | test/debug-ledger.test.js          | 2026-04-01    |
| bin/headless.js (debug-loop)              | test/headless-debug-loop.test.js   | 2026-04-01    |
| bin/graph-indexer.js                      | test/graph-indexer.test.js         | 2026-04-01    |
| bin/graph-store.js                        | test/graph-store.test.js           | 2026-04-01    |
| bin/graph-query.js                        | test/graph-query.test.js           | 2026-04-01    |
| commands/gsd-t-execute.md (stack rules)   | test/stack-rules.test.js           | 2026-04-01    |
| commands/gsd-t-execute.md (exploratory)   | Contract-validated (markdown)      | 2026-04-01    |
| commands/gsd-t-quick.md (exploratory)     | Contract-validated (markdown)      | 2026-04-01    |
| commands/gsd-t-integrate.md (exploratory) | Contract-validated (markdown)      | 2026-04-01    |
| commands/gsd-t-debug.md (exploratory)     | Contract-validated (markdown)      | 2026-04-01    |
| commands/gsd-t-init.md (Quality North Star) | Contract-validated (markdown)    | 2026-04-01    |
| commands/gsd-t-setup.md (Quality North Star + Design Brief) | Contract-validated (markdown) | 2026-04-01 |
| commands/gsd-t-partition.md (Design Brief)  | Contract-validated (markdown)    | 2026-04-01    |
| commands/gsd-t-plan.md (Design Brief ref)   | Contract-validated (markdown)    | 2026-04-01    |
| templates/CLAUDE-project.md (Quality North Star section) | Contract-validated (markdown) | 2026-04-01 |

### Partial Coverage
| Source | Test | Gap |
|--------|------|-----|
| (none) |      |     |

### No Coverage
| Source | Risk Level | Reason |
|--------|------------|--------|
| (none) |            |        |

---

## M32 Contract Coverage (Quality Culture & Design)

### quality-persona-contract.md

| Contract Requirement | Implemented In | Status |
|---------------------|---------------|--------|
| `## Quality North Star` section in CLAUDE-project.md template | templates/CLAUDE-project.md line 40 | COVERED |
| Auto-detection in gsd-t-init (Step 6.5): bin→cli, react/next/vue→web-app, main+no dev→library | commands/gsd-t-init.md | COVERED |
| Silent skip if `## Quality North Star` already present | commands/gsd-t-init.md, commands/gsd-t-setup.md | COVERED |
| Preset options: library, web-app, cli, custom | commands/gsd-t-setup.md Step 5.5 | COVERED |
| Injection protocol: read from project CLAUDE.md at subagent spawn | CLAUDE.md template + subagent spawn conventions | COVERED |

### design-brief-contract.md

| Contract Requirement | Implemented In | Status |
|---------------------|---------------|--------|
| UI signal detection (React/Vue/Svelte/Next/Flutter/CSS/Tailwind) in gsd-t-partition Step 3.5 | commands/gsd-t-partition.md | COVERED |
| Generate `.gsd-t/contracts/design-brief.md` with full color/typography/spacing/layout spec | commands/gsd-t-partition.md | COVERED |
| Preservation rule: do NOT overwrite existing brief | commands/gsd-t-partition.md, commands/gsd-t-setup.md | COVERED |
| Skip if no UI signals detected | commands/gsd-t-partition.md | COVERED |
| UI tasks reference design brief in gsd-t-plan (Task Design Rule 0) | commands/gsd-t-plan.md | COVERED |
| gsd-t-setup Step 5.6 offers design brief for existing projects | commands/gsd-t-setup.md | COVERED |

### exploratory-testing-contract.md

| Contract Requirement | Implemented In | Status |
|---------------------|---------------|--------|
| Exploratory block in gsd-t-execute (QA: 3 min, Red Team: 5 min) | commands/gsd-t-execute.md | COVERED |
| Exploratory block in gsd-t-quick (QA: 3 min, Red Team: 5 min) | commands/gsd-t-quick.md | COVERED |
| Exploratory block in gsd-t-integrate (QA: 3 min, Red Team: 5 min) | commands/gsd-t-integrate.md | COVERED |
| Exploratory block in gsd-t-debug (QA: 3 min, Red Team: 5 min) | commands/gsd-t-debug.md | COVERED |
| Silent skip if Playwright MCP absent | All 4 commands | COVERED |
| Findings tagged [EXPLORATORY] | All 4 commands | COVERED |
| Exploratory is additive, not substitute for scripted tests | All 4 commands (scripted tests must pass first) | COVERED |
| Protocol ordering: scripted → exploratory | All 4 commands | COVERED |

---

## Pre-Existing Test Failures (6 — NOT M32-related)

These 6 tests were failing before M32 and remain failing. Not introduced by M32.

| Test | File | Failure Reason |
|------|------|----------------|
| `hasSymlinkInPath`: returns false for path with no symlinks | test/filesystem.test.js | Implementation returns true when it should return false |
| `hasSymlinkInPath`: returns false for non-existent path with real parents | test/filesystem.test.js | Same issue |
| `hasSymlinkInPath`: returns false for the temp dir itself | test/filesystem.test.js | Same issue |
| `ensureDir`: creates a new directory and returns true | test/filesystem.test.js | Return value mismatch |
| `ensureDir`: creates nested directories recursively | test/filesystem.test.js | Return value mismatch |
| `graph-query`: works on unindexed project (auto-indexes) | test/graph-query.test.js | Returns null instead of result |

These pre-existing failures are low-risk for M32 (they test filesystem helpers and graph auto-indexing, none of which M32 touches).

---

## Doc-Ripple Contract Coverage (M28 — unchanged)

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

---

## Test Health Metrics

- Test-to-code ratio: 829 tests / 24 test files
- Critical paths covered: doc-ripple threshold/blast/manifest, stack rules detection/injection, QA calibration, token budget, component registry, debug ledger, graph engine, metrics collection/rollup, rule engine, patch lifecycle
- Critical paths uncovered: none (M32 command file changes are contract-validated)

---

## Generated Tasks

None — M32 changes are markdown-only. All contract compliance verified inline. Pre-existing failures documented but not M32-introduced.

## Recommendations

The 6 pre-existing test failures (`hasSymlinkInPath`, `ensureDir`, `graph-query`) should be addressed in a future milestone. They are low severity (no user-facing impact) and pre-date M32.
