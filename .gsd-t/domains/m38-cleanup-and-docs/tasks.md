# Tasks: m38-cleanup-and-docs (CD)

## Summary

Terminal domain. Delete the self-improvement loop (4 commands + 2 bin files + plumbing). Run the full Document Ripple across CLAUDE templates, project CLAUDE.md, all `docs/`, README, GSD-T-README, CHANGELOG, help.md. Delete 5 folded contracts. Bump version 3.11.11 → 3.12.10.

**Runs LAST in Wave 2** so docs reflect the final code shape from H1, MR, ES, RC.

## Tasks

### Task CD-T1: Audit deletion blast radius for self-improvement loop
- **Files**: read full `commands/gsd-t-optimization-apply.md`, `gsd-t-optimization-reject.md`, `gsd-t-reflect.md`, `gsd-t-audit.md`; `bin/qa-calibrator.js`, `bin/token-optimizer.js`; grep all callsites in `bin/`, `commands/`, `scripts/`, `templates/`, `docs/`
- **Contract refs**: headless-default-contract.md (gets the deleted contracts folded into it; CD-T9 deletes contracts)
- **Dependencies**: BLOCKED by MR-T8 (M38-CP2 / Wave 1 complete); CAN run in parallel with ES-T1 + RC-T1
- **Acceptance criteria**:
  - Scratch listing every callsite of the 6 deleted artifacts (4 commands + 2 bin files)
  - Confirmed callsites: `commands/gsd-t-complete-milestone.md` Step 14 (token-optimizer), `commands/gsd-t-backlog-list.md` `--file` flag (token-optimizer parseBacklog), `commands/gsd-t-status.md` Step 0.5 (optimization-backlog count), `commands/gsd-t-help.md` (4 entries)
  - Confirmed `bin/qa-calibrator.js` callers: zero outside the 4 deleted commands and itself (verify via grep)
  - Confirmed `bin/token-optimizer.js` callers: only the 4 deleted commands + complete-milestone Step 14 + backlog-list `--file`

### Task CD-T2: Remove optimizer/calibrator references from non-deleted commands
- **Files**: `commands/gsd-t-complete-milestone.md` (remove Step 14), `commands/gsd-t-backlog-list.md` (remove `--file` flag + Step 0), `commands/gsd-t-status.md` (remove Step 0.5 optimization count), `commands/gsd-t-resume.md` (remove any optimization-backlog references)
- **Contract refs**: NONE
- **Dependencies**: BLOCKED by CD-T1
- **Acceptance criteria**:
  - `complete-milestone.md` Step 14 (token-optimizer non-blocking invocation) is REMOVED; subsequent Step numbering renumbers cleanly
  - `backlog-list.md` `--file` flag handling block REMOVED; help/usage text updated
  - `status.md` Step 0.5 (optimization-backlog pending count) REMOVED; subsequent numbering preserved
  - `grep -r 'token-optimizer' commands/` returns empty for non-deleted commands
  - `grep -r 'optimization-backlog' commands/` returns empty for non-deleted commands
  - All 4 modified files still parse

### Task CD-T3: Delete the 4 self-improvement commands + 2 bin files
- **Files**: DELETE `commands/gsd-t-optimization-apply.md`, `commands/gsd-t-optimization-reject.md`, `commands/gsd-t-reflect.md`, `commands/gsd-t-audit.md`, `bin/qa-calibrator.js`, `bin/token-optimizer.js`; also delete corresponding test files (`test/qa-calibrator.test.js`, `test/token-optimizer.test.js`); remove from `bin/gsd-t.js` `PROJECT_BIN_TOOLS`; delete `.gsd-t/qa-miss-log.jsonl` if exists; delete `.gsd-t/optimization-backlog.md` if exists
- **Contract refs**: headless-default-contract.md §6 (Migration)
- **Dependencies**: BLOCKED by CD-T2 (callsites must be removed first)
- **Acceptance criteria**:
  - The 6 listed source files are deleted
  - The 2 test files are deleted
  - `bin/gsd-t.js` `PROJECT_BIN_TOOLS` no longer lists `qa-calibrator.js` or `token-optimizer.js`
  - `.gsd-t/qa-miss-log.jsonl` and `.gsd-t/optimization-backlog.md` removed if present
  - `npm test` green (the deleted test files no longer fail; baseline drops by ~37 tests: token-optimizer 19 + qa-calibrator ~18)

### Task CD-T4: Doc Ripple — templates/CLAUDE-global.md + CLAUDE-project.md
- **Files**: `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`
- **Contract refs**: headless-default-contract.md, context-meter-contract.md v1.3.0, unattended-event-stream-contract.md, unattended-supervisor-contract.md v1.1.0
- **Dependencies**: BLOCKED by CD-T3 + ES-T5 + RC-T5 (need final code shape from all Wave 2 domains)
- **Acceptance criteria**:
  - REMOVE entire `## Universal Auto-Pause Rule (MANDATORY)` section from CLAUDE-global.md (added by M37 — superseded by silent orchestrator action)
  - REWRITE `## Context Meter (M34, v2.75.10+)` section to reflect single-band model + headless-default routing
  - REMOVE three-band model description from `## Context Gate — No Silent Degradation (M35, v2.76.10+)` section; rewrite to point at headless-default as the primary mechanism
  - REMOVE references to deleted commands from any commands table
  - ADD `--watch` flag documentation
  - ADD brief description of the conversational router mode
  - Add `## Headless-by-Default Spawn (M38, v3.12.10+)` section explaining the architectural shift
  - Same scope applied to `templates/CLAUDE-project.md` where relevant
  - Apply markdown emoji-spacing rule throughout
  - Files still parse and tests don't break (templates are not loaded by tests; verify by manual diff)

### Task CD-T5: Doc Ripple — project CLAUDE.md
- **Files**: `CLAUDE.md` (project root)
- **Contract refs**: same as CD-T4
- **Dependencies**: BLOCKED by CD-T3 + ES-T5 + RC-T5
- **Acceptance criteria**:
  - REMOVE Universal Auto-Pause Rule references
  - UPDATE Context Meter description for single-band + headless-default
  - REMOVE references to deleted commands from any inline command tables
  - REMOVE the `task-counter.cjs` "real guard" prose under Observability Logging (TD-104 absorbed)
  - UPDATE Pre-Commit Gate checklist if any item references deleted commands
  - Add `--watch` flag mention; conversational router mention
  - File still parses

### Task CD-T6: Doc Ripple — docs/architecture.md + workflows.md + infrastructure.md + methodology.md
- **Files**: `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `docs/methodology.md`
- **Contract refs**: headless-default-contract.md, context-meter-contract.md v1.3.0, unattended-event-stream-contract.md, unattended-supervisor-contract.md v1.1.0
- **Dependencies**: BLOCKED by CD-T3 + ES-T5
- **Acceptance criteria**:
  - `architecture.md`: update Context Meter + token-budget sections to single-band; add `bin/event-stream.cjs` to architecture diagram + components; remove `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs`, `bin/qa-calibrator.js`, `bin/token-optimizer.js` from components; update Unattended Supervisor section to reference event stream
  - `workflows.md`: update spawn-time workflow descriptions to reflect headless-default; remove three-band degradation flow
  - `infrastructure.md`: replace 3-band threshold table with single-band; remove `gsd-t metrics --tokens|--halts|--context-window` CLI table; document event-cursor file and watch-tick reform; document `--watch` flag
  - `methodology.md`: add new section "From Universal Auto-Pause to Headless-by-Default (M38)" — 3-paragraph narrative explaining symptom-vs-cause framing; explicit "M37 right about symptom, wrong about elevation; M38 fixes cause" sentence
  - All 4 files still parse

### Task CD-T7: Doc Ripple — docs/requirements.md + docs/prd-harness-evolution.md
- **Files**: `docs/requirements.md`, `docs/prd-harness-evolution.md`
- **Contract refs**: same as CD-T6
- **Dependencies**: BLOCKED by CD-T6
- **Acceptance criteria**:
  - `requirements.md` adds new REQs: REQ-088 (headless-default spawn primitive), REQ-089 (`--watch` flag with propagation rules), REQ-090 (unattended event stream), REQ-091 (router conversational mode), REQ-092 (meter reduction to single-band), REQ-093 (self-improvement loop deletion); each with domain traceability
  - Existing REQ-079..087 (M36) and any M37-derived REQs marked retained
  - REQ-088..093 mapped in the Requirements Traceability table to the M38 domain tasks (per Step 4 of plan command)
  - `prd-harness-evolution.md` (if it has §3.7 or similar): mark M37 strengthening superseded by M38; reference new contracts

### Task CD-T8: Doc Ripple — README.md + GSD-T-README.md + CHANGELOG.md + help.md
- **Files**: `README.md`, `GSD-T-README.md`, `CHANGELOG.md`, `commands/gsd-t-help.md`, `package.json`, `bin/gsd-t.js`, `test/filesystem.test.js`
- **Contract refs**: NONE
- **Dependencies**: BLOCKED by CD-T6 + RC-T3 (RC owns the conversational entries deletion in help.md; CD owns the 4 self-improvement deletions); coordinate edit order — CD-T8 picks up after RC-T3 if RC ran first, or RC-T3 picks up after if CD ran first
- **Acceptance criteria**:
  - `README.md`: commands table loses 7 commands (4 self-improvement + 3 conversational); `--watch` flag mention added; commands count drops 61 → 54 (verify exact)
  - `GSD-T-README.md`: same scope as README; updated wave flow diagram if M38 changed it (it didn't structurally — same partition→plan→execute→test-sync→integrate→verify→complete)
  - `CHANGELOG.md`: new `[3.12.10] - 2026-04-XX` top-section entry covering Added (headless-default-contract, unattended-event-stream-contract, --watch flag, intent classifier, event-stream library), Changed (context-meter v1.3.0 single-band, supervisor v1.1.0 with event emission), Removed (4 self-improvement commands, 3 conversational commands, runway-estimator, token-telemetry, qa-calibrator, token-optimizer, three-band model, dead-meter detection, Universal Auto-Pause MANDATORY STOP), Migration (downstream propagation via update-all), with explicit note: "M37 right about symptom, wrong about elevation; M38 fixes cause"
  - `commands/gsd-t-help.md`: 4 self-improvement entries deleted (this task); 3 conversational entries deleted by RC-T3; net help.md drops 7 entries; `--watch` flag documentation added
  - `package.json`: version 3.11.11 → 3.12.10; description string command count updated (e.g., "61 slash commands" → "54 slash commands")
  - `bin/gsd-t.js`: command-counting logic updated; PROJECT_BIN_TOOLS already updated by MR-T5 + CD-T3
  - `test/filesystem.test.js`: command count assertion updated to final post-deletion count (this task lands the final number; RC-T4 commented its tentative count)
  - All files parse; `npm test` green

### Task CD-T9: Delete 5 folded contracts + finalize remaining
- **Files**: DELETE `.gsd-t/contracts/runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md`, `qa-calibration-contract.md`, `harness-audit-contract.md`
- **Contract refs**: headless-default-contract.md (already finalized in H1-T1; this task confirms the folded contracts are gone)
- **Dependencies**: BLOCKED by CD-T8 (docs no longer reference the deleted contracts)
- **Acceptance criteria**:
  - The 5 listed contract files are deleted
  - `grep -r 'runway-estimator-contract' .` returns nothing in live docs (allow CHANGELOG historical references)
  - `grep -r 'token-telemetry-contract' .` returns nothing in live docs
  - `grep -r 'headless-auto-spawn-contract' .` returns nothing in live docs (confirm headless-default-contract supersedes throughout)
  - `grep -r 'qa-calibration-contract' .` returns nothing in live docs
  - `grep -r 'harness-audit-contract' .` returns nothing in live docs
  - `headless-default-contract.md` v1.0.0 status remains ACTIVE
  - `context-meter-contract.md` v1.3.0 status ACTIVE
  - `unattended-event-stream-contract.md` v1.0.0 status ACTIVE
  - `unattended-supervisor-contract.md` v1.1.0 status ACTIVE

### Task CD-T10: Final test sweep + LOC delta tally + commit M38-CP5
- **Files**: run `npm test`; tally LOC delta vs M37 baseline; commit; update `.gsd-t/progress.md`
- **Contract refs**: M38-CP5; success criteria #11 (LOC delta ≥5,000)
- **Dependencies**: BLOCKED by CD-T1 through CD-T9 + ES-T5 + RC-T5
- **Acceptance criteria**:
  - `npm test` ALL GREEN — no stranded tests; full suite count documented in commit
  - LOC delta calculated: `git diff --stat M37-tag..HEAD | tail -1` lines deleted ≥ 5,000 (success criterion #11). If under 5,000, document the actual delta and the explanation in commit message and Decision Log
  - Commit message: `feat(M38): headless-by-default + meter reduction + watch tick reform — v3.12.10`
  - Decision Log entry: "M38-CP5 reached — Wave 2 + CD complete; ready for /user:gsd-t-verify → /user:gsd-t-complete-milestone → user-gated npm publish + version-update-all"

## Execution Estimate

- Total tasks: 10
- Independent tasks within domain: 1 (T1)
- Blocked tasks within domain: 9 (T2 through T10 mostly sequential with some parallel windows)
- Cross-domain blockers: 3 (BLOCKED by MR-T8 / M38-CP2; T4-T5 also wait on ES-T5 + RC-T5; T8 coordinates with RC-T3)
- Parallel-safe sub-groups within domain:
  - T1 can start after MR-T8 (parallel with ES-T1 + RC-T1)
  - T4 + T5 can run in parallel after CD-T3 + ES-T5 + RC-T5
  - T6 + T7 mostly sequential
- Estimated checkpoints: 1 (M38-CP5)
- Wave 2 sequence: ES-T1..T5 + RC-T1..T5 land first; CD picks up T4 onward AFTER both finish
