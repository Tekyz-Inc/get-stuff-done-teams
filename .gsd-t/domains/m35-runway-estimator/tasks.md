# Tasks: m35-runway-estimator

## T1 — Implement `bin/runway-estimator.js` core (Wave 3)
**File**: `bin/runway-estimator.js`
**Acceptance**:
- Exports `estimateRunway({command, domain_type, remaining_tasks, projectDir})`
- Returns `{can_start: bool, current_pct: number, projected_end_pct: number, confidence: 'low'|'medium'|'high', recommendation: 'proceed'|'headless'|'clear-and-resume'}`
- Reads current CTX_PCT from `.gsd-t/.context-meter-state.json`
- Reads historical per-(command, domain_type) from `.gsd-t/token-metrics.jsonl`
- Confidence grading: ≥50→high, ≥10→medium, <10→low
- Conservative constant fallback: 4%/task for sonnet routine, 8%/task for opus
- Conservative skew: always over-estimate consumption when confidence is low

## T2 — Write `runway-estimator-contract.md` v1.0.0 (Wave 3)
**File**: `.gsd-t/contracts/runway-estimator-contract.md`
**Acceptance**:
- Version 1.0.0, Status: ACTIVE
- API signature, return shape, confidence grading rules, conservative skew policy documented
- Explicit "never prompts the user" guarantee
- Handoff protocol to m35-headless-auto-spawn
- Refusal output format documented (the ⛔ block from M35 definition)
- Consumers list

## T3 — Unit tests for runway-estimator (Wave 3)
**File**: `test/runway-estimator.test.js`
**Acceptance**:
- At least 20 tests
- Cover: empty history (constant fallback), insufficient history (low confidence), sufficient history (high confidence), over-estimate skew, refusal path, proceed path, confidence boundary conditions, conservative skew under ambiguity

## T4 — Wire Step 0 into 5 command files (Wave 3)
**Files**:
- `commands/gsd-t-execute.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-quick.md` (lightweight check)
- `commands/gsd-t-debug.md`
**Acceptance**:
- Each file has a new Step 0 "Runway Check" that invokes the estimator before any other step
- On refusal: output the ⛔ block and hand off to `bin/headless-auto-spawn.js` (stub available in Wave 3 — real implementation lands in m35-headless-auto-spawn Wave 3)
- On proceed: continue to Step 1 normally
- Existing Step 0 content (branch guard, task-counter retirement checks) moved to Step 0.5 or integrated cleanly

## T5 — Debug inter-iteration runway check + smoke test (Wave 3)
**Files**: `commands/gsd-t-debug.md`, `test/runway-estimator.test.js`
**Acceptance**:
- `gsd-t-debug.md` has a between-iteration check (before iteration N+1 spawns) that calls `estimateRunway`
- On refusal mid-loop: persist hypothesis + last fix + last test output, hand off to headless-debug-loop (integration with m35-headless-auto-spawn Task 3)
- Smoke test: fixture sets CTX_PCT to 80%, invokes a wave with remaining_tasks=5, asserts refusal + recommendation='headless'
- Smoke test passes in CI (or local `node --test`)
