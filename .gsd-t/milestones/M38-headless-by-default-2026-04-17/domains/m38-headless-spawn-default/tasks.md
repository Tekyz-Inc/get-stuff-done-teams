# Tasks: m38-headless-spawn-default (H1)

## Summary

Promote `bin/headless-auto-spawn.cjs` to the default subagent spawn primitive. Implement the `--watch` flag for opt-in in-context streaming. Convert all 7 subagent-spawning command files. Write `headless-default-contract.md` v1.0.0 to formalize the new pattern.

## Tasks

### Task H1-T1: Audit current spawn callsites + draft contract section
- **Files**: read `bin/headless-auto-spawn.cjs` (full), read `bin/check-headless-sessions.js` (full), read `bin/handoff-lock.cjs` (full); read all 7 target command files (`commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md`, `gsd-t-scan.md`, `gsd-t-verify.md`); update `.gsd-t/contracts/headless-default-contract.md` (v1.0.0 already drafted in partition — finalize §3 spawn primitive signature against actual `autoSpawnHeadless()` exports)
- **Contract refs**: headless-default-contract.md (this task finalizes it)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - For each of the 7 command files, write a one-line note in scratch (or in the contract appendix) listing every Task spawn callsite (Step number + brief description) — this is the conversion map for T2-T6
  - `headless-default-contract.md` §3 signature matches actual `autoSpawnHeadless()` exports
  - Contract status flips from DRAFT to ACTIVE

### Task H1-T2: Add `--watch` flag parser + propagation rules to bin/headless-auto-spawn.cjs
- **Files**: `bin/headless-auto-spawn.cjs` (extend), new `test/headless-default.test.js`
- **Contract refs**: headless-default-contract.md §2 (Propagation Rules table)
- **Dependencies**: BLOCKED by H1-T1 (contract finalized)
- **Acceptance criteria**:
  - `autoSpawnHeadless({command, args, projectDir, sessionContext, watch=false, spawnType})` accepts `watch` param + `spawnType` enum (`primary`/`validation`)
  - When `watch=true && spawnType==='primary'`: returns `{mode: 'in-context', sessionId: null}` and caller falls back to in-context Task pattern
  - When `watch=true && spawnType==='validation'`: logs `[headless-default] --watch ignored for validation spawn type: {type}` to stderr; proceeds headless
  - When `watch=false`: existing headless behavior unchanged
  - `test/headless-default.test.js` covers all 4 cells of the propagation matrix (primary+watch, primary+no-watch, validation+watch, validation+no-watch); 8+ tests
  - Existing `test/headless-auto-spawn.test.js` still passes (no regression)

### Task H1-T3: Convert commands/gsd-t-execute.md spawn callsites + add --watch flag handling
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: headless-default-contract.md §3 (spawn primitive), §2 (`--watch` semantics)
- **Dependencies**: BLOCKED by H1-T2 (`autoSpawnHeadless` signature live)
- **Acceptance criteria**:
  - All in-context Task spawn blocks for primary domain workers replaced with `autoSpawnHeadless({command, args, projectDir, sessionContext, spawnType: 'primary', watch: $WATCH_FLAG})` calls
  - All QA / Red Team / Design Verification / doc-ripple Task spawns replaced with `autoSpawnHeadless({..., spawnType: 'validation'})` (always headless)
  - `## Argument Parsing` section near top of file detects `--watch` from `$ARGUMENTS` and exports `WATCH_FLAG=true` (default false)
  - OBSERVABILITY LOGGING block preserved per project CLAUDE.md mandate
  - File still parses (no broken markdown headings); existing Step numbering preserved

### Task H1-T4: Convert commands/gsd-t-wave.md + gsd-t-integrate.md + gsd-t-quick.md
- **Files**: `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-quick.md`
- **Contract refs**: headless-default-contract.md
- **Dependencies**: BLOCKED by H1-T2; can run in parallel with H1-T3
- **Acceptance criteria**:
  - Same conversion pattern as H1-T3 applied to all 3 files
  - For `gsd-t-quick.md`: outer command stays interactive; inner subagent spawns headless; `--watch` propagates to inner subagent
  - For `gsd-t-wave.md`: each phase agent's spawn uses `spawnType: 'primary'`; phase QA/Red Team uses `spawnType: 'validation'`
  - For `gsd-t-integrate.md`: integration agent uses `spawnType: 'primary'`; integration QA uses `spawnType: 'validation'`
  - All 3 files parse; existing Step numbering preserved

### Task H1-T5: Convert commands/gsd-t-debug.md + gsd-t-scan.md + gsd-t-verify.md
- **Files**: `commands/gsd-t-debug.md`, `commands/gsd-t-scan.md`, `commands/gsd-t-verify.md`
- **Contract refs**: headless-default-contract.md
- **Dependencies**: BLOCKED by H1-T2; can run in parallel with H1-T3 + H1-T4
- **Acceptance criteria**:
  - For `gsd-t-debug.md`: outer interactive; fix-loop subagent spawns headless; `--watch` propagates
  - For `gsd-t-scan.md`: each dimension subagent spawns via `autoSpawnHeadless({spawnType: 'primary'})` — `--watch` propagates
  - For `gsd-t-verify.md`: verification subagents spawn headless via `spawnType: 'validation'` (always headless even with `--watch`); auto-invoke of complete-milestone preserved
  - All 3 files parse; existing Step numbering preserved
  - The "Run /clear" or any STOP-then-resume blocks in these files are NOT yet removed (Domain 2 strips Step 0.2 auto-pause language; H1 only converts spawn callsites)

### Task H1-T6: Implement --watch rejection in commands/gsd-t-unattended.md
- **Files**: `commands/gsd-t-unattended.md`, `bin/gsd-t-unattended.cjs` (minimal CLI flag check only — do NOT touch supervisor loop or meter callsites; those belong to Domain 2 + Domain 3)
- **Contract refs**: headless-default-contract.md §2 (`--watch` rejection by unattended)
- **Dependencies**: BLOCKED by H1-T2
- **Acceptance criteria**:
  - `commands/gsd-t-unattended.md` argument-parsing step detects `--watch` and exits with error message: "Unattended supervisor is detached by definition. `--watch` is incompatible. Run `/user:gsd-t-unattended-watch` from your interactive session to see live activity."
  - `bin/gsd-t-unattended.cjs` adds matching CLI-side check for `--watch` arg → exit code 2 with same message (defense in depth — both surfaces refuse)
  - Test added in `test/headless-default.test.js`: passing `--watch` to the unattended CLI exits non-zero with the rejection message

### Task H1-T7: Test suite green + commit Wave 1 Domain 1 checkpoint
- **Files**: run `npm test`; if pass, commit; update `.gsd-t/progress.md` Decision Log
- **Contract refs**: M38-CP1
- **Dependencies**: BLOCKED by H1-T1 through H1-T6
- **Acceptance criteria**:
  - `npm test` passes — baseline 1223 + new H1 tests (≈8+) = 1231+ pass; 7 stranded context-meter tests still failing (TD-102 — explicitly OWNED BY MR, M38 success criterion #10)
  - Commit message: `feat(M38-H1): headless-by-default spawn primitive + --watch flag`
  - Decision Log entry: "M38-CP1 reached — Domain H1 complete; spawn primitive promoted; `--watch` live in execute/wave/integrate/quick/debug/scan/verify; rejected by unattended; ready for MR"

## Execution Estimate

- Total tasks: 7
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks within domain: 6 (T2 → T7)
- Cross-domain blockers: NONE (Wave 1 first-mover)
- Estimated checkpoints: 1 (M38-CP1)
- Parallel-safe sub-groups: T3 + T4 + T5 can run in parallel after T2
