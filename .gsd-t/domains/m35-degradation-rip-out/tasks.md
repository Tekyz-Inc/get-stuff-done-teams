# Tasks: m35-degradation-rip-out

## Summary

Rip out the silent `downgrade` and `conserve` threshold bands from `bin/token-budget.js`, replace the public API with a clean three-band model (`normal`/`warn`/`stop`), update the contract to v3.0.0, sweep all command-file consumers, and rewrite the PRD and templates to reflect the new principle. This is the foundational M35 change — all other domains build on the new API shape.

## Contract References

- `.gsd-t/contracts/token-budget-contract.md` — v3.0.0 (REWRITE, was v2.0.0)
- `.gsd-t/contracts/fresh-dispatch-contract.md` — read-only reference

---

## Tasks

### Task 1: Rewrite `getDegradationActions()` and retune thresholds

- **Files**:
  - `bin/token-budget.js` (modify)
  - `test/token-budget.test.js` (modify)
- **Contract refs**: `.gsd-t/contracts/token-budget-contract.md` (will be rewritten in T2 — execute T1 first, then T2 formalizes the contract to match)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `getDegradationActions()` (or its successor) returns `{band: 'normal'|'warn'|'stop', pct: number, message: string}` only — no `modelOverride`, no `skipPhases`, no `checkpoint` side-channel
  - `downgrade` and `conserve` branches deleted from the function body
  - `applyModelOverride()` helper deleted if it exists
  - Any `skipPhases` list constants deleted
  - Threshold constants retuned: `WARN_THRESHOLD_PCT = 70`, `STOP_THRESHOLD_PCT = 85`
  - `getSessionStatus()` return shape's `threshold` field narrowed to union `'normal'|'warn'|'stop'`
  - `test/token-budget.test.js` updated: tests for `downgrade`/`conserve` branches deleted, new tests for three-band model added (test each band, test threshold boundaries at 69/70/71/84/85/86)
  - Full test suite green (941+ baseline maintained after deletes + adds)

### Task 2: Rewrite `token-budget-contract.md` to v3.0.0

- **Files**:
  - `.gsd-t/contracts/token-budget-contract.md` (overwrite)
- **Contract refs**: Self (this task IS the contract rewrite — must match the T1 implementation exactly)
- **Dependencies**: Requires Task 1 (contract must match implemented API)
- **Acceptance criteria**:
  - Version bumped to `3.0.0`, Status: `ACTIVE`, Previous: `2.0.0 REPLACED`
  - Three-band model documented with semantics: `normal` (proceed), `warn` (informational, log only), `stop` (halt cleanly, hand off to runway estimator)
  - `WARN_THRESHOLD_PCT = 70`, `STOP_THRESHOLD_PCT = 85` documented as named constants
  - Explicit "Non-Goals" section: this contract never returns model overrides, phase-skip lists, or anything weakening quality gates
  - Migration notes section: v2.0.0 callers must collapse `downgrade`→`warn`, `conserve`→`stop`, drop `modelOverrides` field from response handling
  - `getSessionStatus()` return shape documented with narrowed threshold union
  - Consumers list includes: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-doc-ripple.md`
  - Option X (clean break, no compat shim) explicitly documented in the contract

### Task 3: Sweep command files — replace Token Budget Check blocks

- **Files**:
  - `commands/gsd-t-execute.md` (modify)
  - `commands/gsd-t-wave.md` (modify)
  - `commands/gsd-t-quick.md` (modify)
  - `commands/gsd-t-integrate.md` (modify)
  - `commands/gsd-t-debug.md` (modify)
  - `commands/gsd-t-doc-ripple.md` (modify)
- **Contract refs**: `.gsd-t/contracts/token-budget-contract.md` v3.0.0
- **Dependencies**: Requires Task 2 (contract must be finalized before updating callers)
- **Acceptance criteria**:
  - Every "Token Budget Check" block in the 6 files replaced with a three-band handler: call `getSessionStatus()`, handle `normal` (proceed), `warn` (log to token-log.md, proceed), `stop` (halt cleanly, output stop message, exit phase)
  - No references to `downgrade`, `conserve`, `modelOverride`, `skipPhases` in any of the 6 command files
  - `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" commands/gsd-t-execute.md commands/gsd-t-wave.md commands/gsd-t-quick.md commands/gsd-t-integrate.md commands/gsd-t-debug.md commands/gsd-t-doc-ripple.md` returns zero hits
  - All 6 files remain valid markdown with correct Step numbering and working subagent spawn patterns
  - Existing OBSERVABILITY LOGGING blocks in each file are preserved unmodified
  - Note: These same files also get Model Assignment blocks (m35-model-selector-advisor T5) and runway-estimator Step 0 wires (m35-runway-estimator T4) in later waves — coordinate: T3 only touches the Token Budget Check blocks, leaves Step numbering stable

### Task 4: PRD §3.7 rewrite + CLAUDE template sweep

- **Files**:
  - `docs/prd-harness-evolution.md` (modify §3.7 section only)
  - `templates/CLAUDE-global.md` (modify "Token-Aware Orchestration" section)
  - `templates/CLAUDE-project.md` (modify "Token-Aware Orchestration" section)
- **Contract refs**: `.gsd-t/contracts/token-budget-contract.md` v3.0.0
- **Dependencies**: Requires Task 3 (command-file sweep must be complete so docs accurately describe live behavior)
- **Acceptance criteria**:
  - `docs/prd-harness-evolution.md` §3.7 title changed to "Pre-Flight Runway + Pause-Resume (replaces Token-Aware Orchestration)"
  - PRD §3.7 narrative explicitly calls out that M31's "graduated degradation" framing was wrong and M35 eliminates silent degradation entirely
  - PRD §3.7 forward-references all 5 M35 contracts (token-budget-contract v3.0.0, model-selection-contract v1.0.0, runway-estimator-contract v1.0.0, token-telemetry-contract v1.0.0, headless-auto-spawn-contract v1.0.0) — contracts themselves land in their respective domains
  - Both templates' "Token-Aware Orchestration" section renamed to "Runway-Protected Execution" and rewritten — zero `downgrade`/`conserve` references in either template
  - `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" docs/prd-harness-evolution.md templates/CLAUDE-global.md templates/CLAUDE-project.md` returns zero hits
  - Note: `docs/prd-harness-evolution.md` is also touched by m35-docs-and-tests T4 in Wave 5 for final consistency pass — T4 here is the initial rewrite; T4 there is the verification-and-polish step

---

## Execution Estimate

- Total tasks: 4
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 0 (all intra-domain sequential)
- Estimated checkpoints: 1 (T2 completion gates Wave 2 work in this domain and unlocks m35-model-selector-advisor T2+, m35-token-telemetry T3+)

## Wave Assignment

- **Wave 1**: Task 1, Task 2 (foundational — must complete before any other domain touches command files or contracts)
- **Wave 2**: Task 3, Task 4 (sweep — depends on T1+T2)
