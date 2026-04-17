# Tasks: m38-meter-reduction (MR)

## Summary

Strip the context meter to its irreducible core. Delete `bin/runway-estimator.cjs` + `bin/token-telemetry.cjs/.js`. Collapse three-band model to single-band in `bin/token-budget.cjs`. Remove dead-meter detection / stale band. Strip per-spawn token brackets, runway-gate Step 0, and Step 0.2 MANDATORY STOP language across ~11 command files. Update `bin/gsd-t-unattended.cjs` meter callsites. Rewrite the 7 stranded context-meter tests (TD-102). Update `context-meter-contract.md` to v1.3.0.

## Tasks

### Task MR-T1: Audit deletion blast radius + finalize context-meter-contract.md v1.3.0
- **Files**: read full files: `bin/token-budget.cjs`, `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs`, `bin/token-telemetry.js`, `scripts/gsd-t-context-meter.js`, `scripts/context-meter/threshold.js`, `scripts/context-meter/transcript-parser.js`, `bin/gsd-t-unattended.cjs`, `bin/gsd-t-unattended-safety.js`; grep all callsites; update `.gsd-t/contracts/context-meter-contract.md` to v1.3.0
- **Contract refs**: context-meter-contract.md (this task finalizes v1.3.0)
- **Dependencies**: BLOCKED by H1-T7 (M38-CP1) — Wave 1 sequential
- **Acceptance criteria**:
  - Written-out blast-radius scratch listing every file + line that imports `runway-estimator`, `token-telemetry`, `bandFor`, `BANDS`, `getDegradationActions`, `dead-meter`, `stale`, `STOP_THRESHOLD_PCT`, `WARN_THRESHOLD_PCT`
  - `context-meter-contract.md` v1.3.0 ACTIVE: drops three-band, dead-meter detection, stale band, Universal Auto-Pause elevation; collapses BANDS to single-band {`normal`, `threshold`}; documents threshold-cross silent orchestrator handoff to `autoSpawnHeadless()`
  - Decision: confirm `bin/check-headless-sessions.js`, `bin/model-selector.js`, `bin/advisor-integration.js` stay (cut only token-telemetry references inside them)

### Task MR-T2: Rewrite bin/token-budget.cjs to single-band + delete getDegradationActions
- **Files**: `bin/token-budget.cjs` (rewrite), `test/token-budget.test.js` (rewrite)
- **Contract refs**: context-meter-contract.md v1.3.0
- **Dependencies**: BLOCKED by MR-T1
- **Acceptance criteria**:
  - `BANDS = { normal: {min:0, max: thresholdPct}, threshold: {min: thresholdPct, max:100} }` — only two entries
  - `bandFor(pct)` returns `'normal'` or `'threshold'` only — no `warn`/`stop`/`downgrade`/`conserve`/`dead-meter`/`stale`
  - `getSessionStatus()` return shape: `{pct, threshold, deadReason: undefined}` — keep `deadReason: undefined` for backward callsite tolerance, will fully drop in v3.13
  - Delete `getDegradationActions` export entirely
  - Delete dead-meter detection code paths
  - `test/token-budget.test.js` rewritten for single-band; the 7 prior `getDegradationActions` tests deleted; new tests for `bandFor` two-state behavior; test count delta documented in commit
  - `npm test` for token-budget green

### Task MR-T3: Simplify scripts/gsd-t-context-meter.js + threshold.js
- **Files**: `scripts/gsd-t-context-meter.js`, `scripts/context-meter/threshold.js`, `scripts/gsd-t-context-meter.test.js` (rewrite the 7 stranded tests — TD-102)
- **Contract refs**: context-meter-contract.md v1.3.0
- **Dependencies**: BLOCKED by MR-T2
- **Acceptance criteria**:
  - `scripts/context-meter/threshold.js` `BANDS` collapsed to single-band; `bandFor` returns `normal`/`threshold` only
  - `scripts/context-meter/threshold.js` `buildAdditionalContext(pct, threshold)` returns SHORT silent marker (e.g., `next-spawn-headless:true`) NOT the M37 6-line MANDATORY STOP banner. Spec exact return shape in contract.
  - `scripts/gsd-t-context-meter.js` strips dead-meter / stale-band branches; preserves PostToolUse hook + measurement + atomic state write
  - `scripts/gsd-t-context-meter.test.js` — the 7 previously failing tests are REWRITTEN (not deleted) to assert the v1.3.0 single-band privacy invariant; M38 success criterion #10 satisfied
  - `npm test` green for context-meter test file

### Task MR-T4: Update bin/gsd-t-unattended.cjs + bin/gsd-t-unattended-safety.js meter callsites
- **Files**: `bin/gsd-t-unattended.cjs`, `bin/gsd-t-unattended-safety.js`, `bin/gsd-t-unattended-safety.cjs` (if exists), corresponding test files
- **Contract refs**: context-meter-contract.md v1.3.0; unattended-supervisor-contract.md (no schema change in this task — Domain 3 bumps to v1.1.0 later)
- **Dependencies**: BLOCKED by MR-T2
- **Acceptance criteria**:
  - Every `require('./bin/runway-estimator.cjs')` and `require('./bin/token-telemetry.cjs')` in the supervisor + safety files is REMOVED
  - Any reference to `bandFor === 'warn'/'stop'/'dead-meter'/'stale'` collapsed to `bandFor === 'threshold'`
  - Supervisor loop's pre-worker meter check (if any) becomes a soft signal — does not halt; logs and proceeds (the orchestrator-side `autoSpawnHeadless` redirect handles overflow)
  - Existing supervisor tests (~42 tests in `test/unattended-supervisor.test.js` + ~18 in safety) pass after callsite updates
  - Smoke check: `node bin/gsd-t-unattended.cjs --help` returns clean output

### Task MR-T5: Delete bin/runway-estimator.cjs + bin/token-telemetry.cjs/.js + their tests
- **Files**: DELETE `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs`, `bin/token-telemetry.js`, `test/runway-estimator.test.js`, `test/token-telemetry.test.js`; update `bin/gsd-t.js` `PROJECT_BIN_TOOLS` array (remove the 3 deleted bin entries) + any `gsd-t metrics --tokens|--halts|--context-window` CLI subcommand handlers
- **Contract refs**: context-meter-contract.md v1.3.0; headless-default-contract.md §6 Migration (folds runway-estimator-contract + token-telemetry-contract into headless-default-contract — but the contract DELETIONS happen in CD-T9, this task only deletes the implementations)
- **Dependencies**: BLOCKED by MR-T4 (supervisor must not require these)
- **Acceptance criteria**:
  - The 5 listed files are DELETED
  - `bin/gsd-t.js` `PROJECT_BIN_TOOLS` no longer lists the 3 deleted bin files
  - `bin/gsd-t.js` `doMetrics()` `--tokens` / `--halts` / `--context-window` subcommand branches REMOVED (or replaced with a one-line "metrics removed in v3.12.10 — context meter is no longer telemetry-instrumented" stub)
  - `npm test` green: tests for deleted files don't exist anymore; baseline test count drops by ~30 (token-telemetry 16 + runway-estimator ~14 = ~30)
  - `node bin/gsd-t.js doctor` does not error (the doctor used to check for these files)

### Task MR-T6: Sweep command files — strip per-spawn token brackets
- **Files**: `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-doc-ripple.md`, `gsd-t-partition.md`, `gsd-t-discuss.md`, `gsd-t-plan.md`, `gsd-t-verify.md`, `gsd-t-test-sync.md` (~11 files)
- **Contract refs**: context-meter-contract.md v1.3.0; headless-default-contract.md
- **Dependencies**: BLOCKED by MR-T5 (callsites must be deleted before stripping their grep targets); must run AFTER H1-T3/T4/T5 (those land spawn-pattern conversion in the same files)
- **Acceptance criteria**:
  - Every `## Per-Spawn Token Bracket` section + its `T0=$(...)` / `T1=$(...)` shim bash blocks are REMOVED from all 11 files
  - The original `## OBSERVABILITY LOGGING` block STAYS (project CLAUDE.md mandate; it's distinct from the M35 token bracket)
  - `bin/token-telemetry.js#recordSpawn` references in command files: NONE remain — `grep -r 'recordSpawn' commands/` returns empty
  - `grep -r 'token-telemetry' commands/` returns empty
  - All 11 files still parse; Step numbering preserved

### Task MR-T7: Sweep command files — strip Step 0 runway gate + Step 0.2 auto-pause
- **Files**: `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md` (the 5 commands that had M37 Step 0.2 added)
- **Contract refs**: context-meter-contract.md v1.3.0
- **Dependencies**: BLOCKED by MR-T6
- **Acceptance criteria**:
  - Each `## Step 0: Runway Gate` block (added by M35) is REMOVED from each of the 5 files
  - Each `## Step 0.2: Auto-Pause Rule` block (added by M37) is REMOVED from each of the 5 files
  - Subsequent step numbering renumbers cleanly (Step 1 stays Step 1; Step 0 / 0.2 vacancies don't leave numeric gaps that confuse readers)
  - Every reference to `runway-estimator.cjs` in command files: NONE remain — `grep -r 'runway-estimator' commands/` returns empty
  - Every reference to "MANDATORY STOP" auto-pause from M37: NONE remain — `grep -r 'MANDATORY STOP' commands/` returns empty (allow exceptions in CLAUDE template if Domain 5 hasn't run yet — but commands MUST be clean here)

### Task MR-T8: Test suite green + commit Wave 1 Domain 2 checkpoint (M38-CP2)
- **Files**: run `npm test`; if pass, commit; update `.gsd-t/progress.md` Decision Log
- **Contract refs**: M38-CP2
- **Dependencies**: BLOCKED by MR-T1 through MR-T7
- **Acceptance criteria**:
  - `npm test` ALL GREEN (the 7 stranded context-meter tests are now rewritten + passing per MR-T3) — M38 success criterion #10 met
  - Test count: baseline 1223 - 30 (deleted runway/telemetry tests) + 8+ (H1-T2 new tests) + 7 (rewritten meter tests pass instead of fail) ≈ 1208+ pass; net is roughly 1208-1215 depending on exact deltas
  - Commit message: `feat(M38-MR): collapse meter to single-band; delete runway-estimator + token-telemetry`
  - Decision Log entry: "M38-CP2 reached — Wave 1 complete; meter reduced; supervisor callsites updated; ready for Wave 2 (ES + RC + CD parallel)"
  - Net LOC delta: contribute to ≥5,000 line removal goal; tally and report in commit message

## Execution Estimate

- Total tasks: 8
- Independent tasks within domain: 0 (all sequential: T1→T2→T3→T4→T5→T6→T7→T8)
- Cross-domain blockers: 1 (BLOCKED by H1-T7 / M38-CP1)
- Estimated checkpoints: 1 (M38-CP2)
- Parallel-safe sub-groups: NONE (sequential within domain to manage shared-file edits)
