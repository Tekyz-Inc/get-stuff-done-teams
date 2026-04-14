# Tasks: m35-runway-estimator

## Summary

Implement `bin/runway-estimator.js` with confidence-weighted projection from token-telemetry history, create `runway-estimator-contract.md` v1.0.0, write a comprehensive unit test suite (≥20 tests), wire Step 0 runway checks into 5 command files, and add a debug inter-iteration check with a smoke test. This domain depends on m35-token-telemetry Wave 1 for its data source.

## Contract References

- `.gsd-t/contracts/runway-estimator-contract.md` — v1.0.0 (NEW, created in T2)
- `.gsd-t/contracts/token-telemetry-contract.md` — v1.0.0 (read-only — defines `.gsd-t/token-metrics.jsonl` schema that T1 reads)
- `.gsd-t/contracts/token-budget-contract.md` — v3.0.0 (read-only — defines `STOP_THRESHOLD_PCT = 85` that T1 compares against)
- `.gsd-t/contracts/headless-auto-spawn-contract.md` — v1.0.0 (read-only reference — T4 hands off to headless-auto-spawn on refusal)

---

## Tasks

### Task 1: Implement `bin/runway-estimator.js` core

- **Files**:
  - `bin/runway-estimator.js` (create)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (JSONL schema), `.gsd-t/contracts/token-budget-contract.md` v3.0.0 (`STOP_THRESHOLD_PCT = 85`)
- **Dependencies**: BLOCKED BY m35-token-telemetry Task 1 (contract must exist for JSONL field names), BLOCKED BY m35-degradation-rip-out Task 2 (token-budget-contract v3.0.0 must exist for stop threshold)
- **Acceptance criteria**:
  - Exports `estimateRunway({command, domain_type, remaining_tasks, projectDir})` → `{can_start: bool, current_pct: number, projected_end_pct: number, confidence: 'low'|'medium'|'high', recommendation: 'proceed'|'headless'|'clear-and-resume'}`
  - Reads current CTX_PCT from `.gsd-t/.context-meter-state.json` — the `context_window_pct` or equivalent field that M34's PostToolUse hook writes
  - Queries `.gsd-t/token-metrics.jsonl` for historical records matching `{command, domain_type}` pair; falls back to `{command}` aggregate if pair has < 10 records; falls back to constant if command has < 10 records
  - Confidence grading: `high` ≥ 50 matching records, `medium` ≥ 10, `low` < 10
  - Conservative constant fallback: `4%/task` for sonnet-default phases, `8%/task` for opus-default phases
  - Conservative skew: when confidence is `low`, multiply projected consumption by 1.25 (25% over-estimate)
  - `projected_end_pct = current_pct + (estimated_pct_per_task * remaining_tasks)`
  - `can_start = projected_end_pct < 85` (STOP_THRESHOLD_PCT from token-budget-contract v3.0.0)
  - `recommendation`: `'proceed'` when can_start=true; `'headless'` when can_start=false (auto-spawn capable); `'clear-and-resume'` only as last-resort fallback if headless-auto-spawn itself is unavailable
  - Graceful degradation: missing `.context-meter-state.json` → assume current_pct=0, log a warning

### Task 2: Write `runway-estimator-contract.md` v1.0.0

- **Files**:
  - `.gsd-t/contracts/runway-estimator-contract.md` (create)
- **Contract refs**: Self; cross-references `token-telemetry-contract.md`, `token-budget-contract.md`, `headless-auto-spawn-contract.md`
- **Dependencies**: Requires Task 1 (contract must match the implemented API exactly)
- **Acceptance criteria**:
  - Version `1.0.0`, Status: `ACTIVE`
  - `estimateRunway` API signature and return shape fully documented (all fields, types, nullable status)
  - Confidence grading rules documented (50/10 thresholds)
  - Conservative skew policy documented (1.25x multiplier at low confidence, constant fallback values)
  - Explicit "never prompts the user" guarantee — on refusal, always hands off to headless-auto-spawn
  - Refusal output format documented (the exact ⛔ block from M35-definition.md Part C)
  - Handoff protocol: how T4's Step 0 calls `autoSpawnHeadless()` when `can_start=false`
  - Consumers list: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-quick.md`

### Task 3: Unit tests for `bin/runway-estimator.js`

- **Files**:
  - `test/runway-estimator.test.js` (create)
- **Contract refs**: `.gsd-t/contracts/runway-estimator-contract.md` v1.0.0 (T2 output)
- **Dependencies**: Requires Task 1, Requires Task 2 (tests validate the documented contract)
- **Acceptance criteria**:
  - At least 20 unit tests (target: 20-25) covering:
    - Empty `.gsd-t/token-metrics.jsonl` → constant fallback used, confidence=low
    - Missing `.gsd-t/token-metrics.jsonl` file → same as empty
    - 5 records for `{command, domain_type}` → insufficient, falls back to command aggregate
    - 15 records for command → confidence=medium, uses historical mean
    - 55 records for `{command, domain_type}` → confidence=high, uses sharpest match
    - Conservative skew: low confidence result is 1.25x the raw projection
    - Refusal path: projected_end_pct ≥ 85 → `can_start=false`, `recommendation='headless'`
    - Proceed path: projected_end_pct < 85 → `can_start=true`, `recommendation='proceed'`
    - Confidence boundary conditions: exactly 10 records → medium, exactly 50 → high, 9 → low, 49 → medium
    - Missing `.context-meter-state.json` → current_pct=0, warning logged
    - Sonnet phase constant fallback: 4%/task
    - Opus phase constant fallback: 8%/task
    - Multi-task projection: 5 remaining_tasks at 4% each → 20% projected consumption
    - clear-and-resume recommendation only when headless-auto-spawn unavailable

### Task 4: Wire Step 0 runway check into 5 command files

- **Files**:
  - `commands/gsd-t-execute.md` (modify — add Step 0 Runway Check)
  - `commands/gsd-t-wave.md` (modify — add Step 0 Runway Check)
  - `commands/gsd-t-integrate.md` (modify — add Step 0 Runway Check)
  - `commands/gsd-t-quick.md` (modify — add Step 0 lightweight Runway Check)
  - `commands/gsd-t-debug.md` (modify — add Step 0 Runway Check)
- **Contract refs**: `.gsd-t/contracts/runway-estimator-contract.md` v1.0.0, `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0
- **Dependencies**: Requires Task 2 (contract must exist); BLOCKED BY m35-headless-auto-spawn Task 1 (T4 calls `autoSpawnHeadless()` on refusal — that module must exist); BLOCKED BY m35-degradation-rip-out Task 3 (those files also modified in Wave 2; T4 here is Wave 3 — degradation sweep will already be done)
- **Note**: These same 5 files were also modified by degradation-rip-out T3 (Wave 2) and model-selector-advisor T5 (Wave 2) — all prior modifications complete before Wave 3 starts
- **Acceptance criteria**:
  - Each of the 5 files has a new "Step 0: Runway Check" section before the current Step 1
  - Step 0 content:
    ```bash
    node -e "const r=require('./bin/runway-estimator.js'); const result=r.estimateRunway({command:'{cmd}',domain_type:'{type}',remaining_tasks:{N},projectDir:'.'}); if(!result.can_start){console.log('⛔ Insufficient runway...\nAuto-spawning headless...');require('./bin/headless-auto-spawn.js').autoSpawnHeadless({command:'{cmd}',args:[],continue_from:'.'});process.exit(0);}"
    ```
  - On refusal: prints the ⛔ block (current_pct, projected_end_pct, confidence, confidence-basis) then calls `autoSpawnHeadless()` and exits cleanly
  - On proceed: exits the Step 0 check and continues to Step 1 normally
  - Existing Step 0 content from prior waves (branch guard) remains intact — rename it to Step 0.1 or integrate it after the runway check
  - `gsd-t-quick.md` gets a lightweight check with `remaining_tasks=1` (single task)

### Task 5: Debug inter-iteration runway check + smoke test

- **Files**:
  - `commands/gsd-t-debug.md` (modify — add between-iteration runway check)
  - `test/runway-estimator.test.js` (modify — add smoke test)
- **Contract refs**: `.gsd-t/contracts/runway-estimator-contract.md` v1.0.0, `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0
- **Dependencies**: Requires Task 4 (debug.md already has Step 0 from T4; T5 adds the between-iteration check deeper in the file); BLOCKED BY m35-headless-auto-spawn Task 3 (debug mid-loop handoff requires headless-auto-spawn's debug handoff path)
- **Acceptance criteria**:
  - `commands/gsd-t-debug.md` has a between-iteration check (before spawning iteration N+1) that calls `estimateRunway({command:'gsd-t-debug', remaining_tasks:1})`
  - On refusal mid-loop: persists current hypothesis + last fix diff + last test output to `.gsd-t/debug-ledger.jsonl` (M29 existing ledger), then calls `autoSpawnHeadless({command:'gsd-t-debug', args:['--resume', 'iteration-N+1']})`, then exits the debug loop cleanly with a message: "Runway exceeded mid-loop — headless debug picking up at iteration N+1"
  - On proceed: spawns iteration N+1 normally
  - Smoke test in `test/runway-estimator.test.js` (appended): fixture sets context-meter-state to 80% CTX_PCT, calls `estimateRunway({command:'gsd-t-wave', domain_type:'bin-script', remaining_tasks:5})`, asserts `can_start=false` and `recommendation='headless'`
  - Smoke test is a pure unit test (no file system writes, fixture-based) that passes with `node --test test/runway-estimator.test.js`

---

## Execution Estimate

- Total tasks: 5
- Independent tasks (no blockers): 0 (all depend on prior wave outputs)
- Blocked tasks (waiting on other domains): 2 (T1 blocked by m35-token-telemetry T1 + degradation-rip-out T2; T4 blocked by m35-headless-auto-spawn T1; T5 blocked by m35-headless-auto-spawn T3)
- Estimated checkpoints: 1 (Wave 3 gate — all T1-T5 must complete before Wave 4)

## Wave Assignment

- **Wave 3**: Tasks 1, 2, 3, 4, 5 (all Wave 3 — sequentially within the domain: T1→T2→T3→T4→T5; T4 and T5 require headless-auto-spawn Wave 3 outputs to run concurrently)
