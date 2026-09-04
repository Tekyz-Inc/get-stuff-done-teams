# Milestone Complete: M115 — Test-Plan-First Requirements Interrogation

**Completed**: 2026-09-03 18:20 PDT
**Duration**: 2026-09-02 18:35 PDT → 2026-09-03 18:20 PDT
**Status**: VERIFIED-WITH-WARNINGS (warnings fixed before completion)
**Version**: 5.17.14 → 5.18.10

## What Was Built
`/gsd-t-test-plan`: before any code exists, enumerate every test case a milestone's requirements imply into a reviewable sequence-table document (Seq · setup/date · action · expected result · effect on saved data · source), using eight enumeration rules (E1 more than one of everything · E2 every ordering · E3 effect on saved data · E4 permissions per screen AND endpoint · E5 whole chain · E6 every state's exit and re-entry · E7 boundaries stated · E8 refusals). Every unfillable row is a requirements gap: sourced, decided-without-you (grouped for one-glance veto), or GAP; open rows go to ONE question round; three rounds or a repeated symptom HALTS. `--after` mode runs the same enumeration against built code and classifies each failure with cited evidence. The suite is generated from the plan and M83 traceability binds acceptance criteria to plan rows.

## Domains
| Domain | Tasks | Key Deliverables |
|---|---|---|
| enumerator-core (W1) | 4 | templates/prompts/test-plan-enumerator-subagent.md (generic, lending-library examples); A1 blind replay; contract frozen STABLE |
| plan-visibility (W2) | 5 | templates/TestPlan-spec.md mold; templates/prompts/test-plan-evidence-classifier.md (three arms, no default) |
| halt-convergence (W2) | 5 | bin/gsd-t-testplan-halt.cjs — round cap (3) + repeated-symptom cap (2) over the loop ledger, read-only |
| deterministic-gates (W3) | 5 | bin/gsd-t-testplan-lint.cjs (0/4/64, negative tests); plan-row binding in bin/gsd-t-traceability-gate.cjs (additive, M83/M87 byte-identical) |
| front-door-wiring (W3) | 6 | commands/gsd-t-test-plan.md, /gsd router case, both bin registries, CLI dispatch, verify-gate wiring (named skip), reference docs |
| verify (7 runs) | — | bin/gsd-t-testplan-rows.cjs — the ONE shared plan reader (both fence styles, exact six-cell rows, one classifier, one heading pattern) |

## Contracts
- .gsd-t/contracts/test-plan-first-contract.md — NEW, 1.0.0 → 1.1.0 STABLE (§7.1 plan location + Plan-Row field ratified at integrate)
- .gsd-t/contracts/integration-points.md — NEW (waves, 21-path disjointness table, halt points)

## Key Decisions
- The Wave-1 "3 of 3" blind replay was NOT blind (protocol carried the answer key). Re-run clean from a memory-free scratch dir: 2 of 3 outright, the third found as the gap (rate changes silently alter issued invoices) not the fix (closed months). David: proceed; condition 1 re-written to the gap's shape (⚠ Divergence). Bound 94/run → 180 per feature area.
- Three plan readers drifting apart (fences, width, classifier) → one shared reader, fixed once.
- The eight demo-video fallbacks became halts naming the remedy (none approved by name); the deterministic split is backlog #54.
- Doc-First Enforcement stays PARKED (pseudocode rewritten and committed).

## Issues Encountered
Opus 529 overload stalled partition overnight (finalizer null guard added); research pipeline polluted progress.md twice (TD-297); traceability --milestone scope mis-reported as "blocked" (TD-298); fallback scanner mis-read a backtick regex (TD-299); npm install -g twice left the old version on disk (cpua now verifies on disk, installs by tarball URL).

## Test Coverage
M115 tests: 120 (incl. 29 verify-finding regressions). Suite 3515 pass / 0 fail / 13 named skips. E2E 3/3 live.

## Git Tag
`v5.18.10`
