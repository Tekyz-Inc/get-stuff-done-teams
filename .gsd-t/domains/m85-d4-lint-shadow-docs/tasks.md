# Tasks: m85-d4-lint-shadow-docs

## Summary
Ship the drift-enforcing lint, the measured shadow verdict, and the full doc ripple — all citing the measured number, all write-disjoint from every M85 source file.

## Tasks

### Task 1: M71-family tier-policy lint (Headline)
- **Files**: `test/m85-workflow-tier-policy-lint.test.js` (NEW)
- **Contract refs**: `model-tier-policy-contract.md`
- **Dependencies**: BLOCKED by m85-d1-tier-policy-module Task 1 (needs the policy module/contract to assert against)
- **Acceptance criteria**:
  - Reads all 8 `templates/workflows/*.workflow.js` (read-only) + the policy module/contract.
  - Asserts every workflow `model:` literal is a member of the policy tier set.
  - Asserts the 5 designated stages resolve to fable AND competition producers stay opus.
  - **Mandatory negative test**: a deliberately-drifted literal FAILS the lint (AC a).
  - `npm test` green (the negative case is an intentional in-test failure assertion, not a suite failure).

### Task 2: Run the gsd-t-audit shadow probe + record MEASURED verdict
- **Files**: `.gsd-t/progress.md`
- **Contract refs**: feedback_measure_dont_claim
- **Dependencies**: BLOCKED by m85-d3 Task 4 (stages must actually run on fable) — the measured insertion follows the shadow probe completing
- **Acceptance criteria**:
  - Runs gsd-t-audit: 1 Fable single-draft vs 3-Opus competition+judge on an eligible phase.
  - Records in progress.md: quality comparison + token/cost delta + explicit conclusion — a NUMBER, not a claim (AC e).

### Task 3: Full doc ripple
- **Files**: `templates/CLAUDE-global.md`, `/Users/david/.claude/CLAUDE.md`, `CLAUDE.md`, `README.md`, `commands/gsd-t-help.md`, `.gsd-t/contracts/model-selection-contract.md`, `.gsd-t/progress.md`
- **Contract refs**: `model-selection-contract.md`, `model-tier-policy-contract.md`
- **Dependencies**: Requires Task 2 (within domain) — verdict citation lands after measurement
- **Acceptance criteria**:
  - Model Display sections in `templates/CLAUDE-global.md` and live `~/.claude/CLAUDE.md` updated identically (FABLE tier + shipped policy).
  - Project `CLAUDE.md`, `README.md`, `commands/gsd-t-help.md` reflect the new tier/policy.
  - `model-selection-contract.md` minor version bump + cross-ref to `model-tier-policy-contract.md`, citing the measured verdict.
  - progress.md: Decision Log entry + version-bump narrative 4.3.10 → 4.4.10.
  - All updated in ONE pass (Document Ripple Completion Gate).
