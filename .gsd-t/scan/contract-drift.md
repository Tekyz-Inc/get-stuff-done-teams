# Contract Drift Analysis — Scan #4

**Scan Date:** 2026-02-18
**Package Version:** v2.24.3
**Scope:** All 9 contracts in `.gsd-t/contracts/` vs actual implementation
**Previous Scan:** Scan #3 at v2.23.0 (2026-02-18) — found 3 new items (1 High, 2 Medium)
**Milestones Since Last Scan:** M3 (Count Fix), M4 (Testing), M5 (Security), M6 (CLI Quality), M7 (Command Cleanup)

---

## Summary

| Contract | Status | Severity | Change from Scan #3 |
|----------|--------|----------|---------------------|
| command-interface-contract.md | STALE | Low | Unchanged — still backlog-only scope |
| file-format-contract.md | MATCHES | — | Unchanged |
| integration-points.md | STALE | Low | Unchanged — still M3-specific historical doc |
| backlog-file-formats.md | MATCHES | — | Unchanged |
| domain-structure.md | DRIFTED | Medium | NEW — orphaned domains not cleared |
| pre-commit-gate.md | MATCHES | — | Unchanged |
| progress-file-format.md | DRIFTED | Medium | NEW — status value and format drifts |
| wave-phase-sequence.md | DRIFTED | Low | NEW — missing Security/Integrity additions |
| qa-agent-contract.md | MATCHES | — | RESOLVED (was DRIFTED) |

**Cross-Reference File Agreement:** MATCHES — all files show 43/39/4 (was DRIFTED in scan #3)

---

## Scan #3 Items — Resolution Status

### RESOLVED: Command count 42 → 43 (was High)

**Fixed in M3 (Count Fix + QA Contract Alignment).**

Verified all files now show correct counts:
- `CLAUDE.md` line 13: "43 slash commands (39 GSD-T workflow + 4 utility)" — CORRECT
- `CLAUDE.md` line 34: "43 slash commands for Claude Code" — CORRECT
- `CLAUDE.md` line 35: "39 GSD-T workflow commands" — CORRECT
- `package.json` description: "43 slash commands" — CORRECT
- `README.md` line 21: "39 GSD-T commands + 4 utility commands (43 total)" — CORRECT
- `README.md` line 297: "43 slash commands" — CORRECT
- `README.md` line 298: "39 GSD-T workflow commands" — CORRECT
- `docs/architecture.md` line 25: "43 (39 GSD-T workflow + 4 utility)" — CORRECT
- `docs/infrastructure.md` line 74: "43 slash command files (39 GSD-T + 4 utility)" — CORRECT
- `docs/workflows.md` line 9: "43 commands" — CORRECT
- `docs/workflows.md` line 17: "43 commands available" — CORRECT
- `docs/requirements.md` line 10: "39 GSD-T workflow slash commands" — CORRECT
- `bin/gsd-t.js`: Dynamic counting via `getGsdtCommands().length` — CORRECT (auto-adapts)
- `commands/gsd-t-help.md`: Lists all 39 gsd-t-* + gsd — CORRECT
- `templates/CLAUDE-global.md`: Lists all 43 commands including qa — CORRECT
- `docs/GSD-T-README.md`: Lists all commands including qa — CORRECT

**Actual disk count (verified):**
- 43 .md files in `commands/`
- 39 starting with `gsd-t-` (GSD-T workflow)
- 4 utility: `gsd.md`, `branch.md`, `checkin.md`, `Claude-md.md`

**Status: CONFIRMED RESOLVED. No stale counts remain.**

### RESOLVED: QA agent contract missing test-sync phase (was Medium)

**Fixed in M3 (Task 2: TD-042).**

Verified:
- `commands/gsd-t-qa.md` now has a "During Test-Sync" section (lines 63-71) defining QA behavior: validate test-to-contract alignment, compare contract definitions against test files, write missing tests, run all contract tests, report results
- `.gsd-t/contracts/qa-agent-contract.md` line 12: phase context list now includes `"test-sync"` — reads: `"partition" | "plan" | "execute" | "test-sync" | "verify" | "quick" | "debug" | "integrate" | "complete"`
- `.gsd-t/contracts/qa-agent-contract.md` Output table now includes test-sync row: `| test-sync | Contract-test alignment report + gap fills |`

**Status: CONFIRMED RESOLVED.**

### RESOLVED: Orphaned domain files — doc-alignment (was Medium in scan #3)

**Fixed in M3 (Task 3: TD-043).**

Verified: `.gsd-t/domains/doc-alignment/` no longer exists. The `contract-doc-alignment` domain was archived to `.gsd-t/milestones/contract-doc-alignment/`.

**Status: CONFIRMED RESOLVED... BUT new orphaned domains found (see below).**

---

## 1. command-interface-contract.md — STALE (Low)

**Contract:** `.gsd-t/contracts/command-interface-contract.md`
**Compared against:** `commands/gsd-t-backlog-*.md` (7 files), all other command files

### Backlog Commands — MATCH

All 7 backlog commands exist with correct argument patterns. Promote flow classification matches: Milestone, Quick, Debug, Feature analysis. No drift in the covered scope.

### Contract Scope — STALE (unchanged from scan #3)

The contract only documents the 7 backlog commands and settings subcommands. It does NOT document any other command interfaces (qa, wave, execute, etc.). The title "Command Interface Contract" is misleading.

This was identified in scan #3 as low priority. No change since then. The contract is accurate for what it covers (backlog), but the name suggests broader scope.

**Fix approach:** Rename to `backlog-command-interface.md` for clarity.

---

## 2. file-format-contract.md — MATCHES

**Contract:** `.gsd-t/contracts/file-format-contract.md`
**Compared against:** `templates/backlog.md`, `templates/backlog-settings.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

### backlog.md Format — MATCHES
- Template (`templates/backlog.md`): contains only `# Backlog` heading — matches contract spec for empty file
- Live file (`.gsd-t/backlog.md`): single entry with correct format: `## 1. {title}`, pipe-delimited metadata, Added date, description

### backlog-settings.md Format — MATCHES
- Template (`templates/backlog-settings.md`): Types (5 standard), placeholder Apps, empty Categories, Defaults — matches contract
- Live file (`.gsd-t/backlog-settings.md`): Types (5), Apps (`gsd-t`), Categories (5 entries), Defaults with correct bold-key format

**No drift detected.**

---

## 3. integration-points.md — STALE (Low)

**Contract:** `.gsd-t/contracts/integration-points.md`
**Compared against:** Current project state

This contract still documents the M3 (Count Fix + QA Contract Alignment) integration order from 2026-02-18. It is purely historical documentation of a completed milestone. Milestones 4-7 have since completed without creating or updating this contract.

Per the domain-structure contract, `integration-points.md` is a per-milestone artifact that should document cross-domain dependencies for the CURRENT milestone. With no active milestone, this file is a leftover from M3.

**Impact:** Low. The file is harmless but could confuse consumers who expect it to describe current integration state.

**Fix approach:** Either clear to a placeholder state ("No active milestone — populated during partition phase") or archive with the M3 milestone artifacts.

---

## 4. backlog-file-formats.md — MATCHES

**Contract:** `.gsd-t/contracts/backlog-file-formats.md`
**Compared against:** `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

### backlog.md — MATCHES
Live entry format:
```
## 1. Agentic Workflow Architecture
- **Type:** feature | **App:** gsd-t | **Category:** architecture
- **Added:** 2026-02-13
- Evolve GSD-T commands...
```
All fields present: Position (integer), Title, Type, App, Category, Added (YYYY-MM-DD), Description. Matches contract exactly.

### backlog-settings.md — MATCHES
- Types: 5 standard types (bug, feature, improvement, ux, architecture) — matches contract
- Apps: `gsd-t` — matches contract
- Categories: 5 entries (cli, commands, templates, docs, contracts) — matches contract
- Defaults: `Default App: gsd-t`, `Auto-categorize: true` — matches contract bold-key format

**No drift detected.**

---

## 5. domain-structure.md — DRIFTED (Medium)

**Contract:** `.gsd-t/contracts/domain-structure.md`
**Compared against:** `.gsd-t/domains/`, `.gsd-t/milestones/`

### Lifecycle Violation: Domains Not Cleared After Archival

The domain-structure contract defines (line 119):
> "Cleared: After archival, `.gsd-t/domains/` is emptied for next milestone"

**Actual state of `.gsd-t/domains/`:**
- `.gsd-t/domains/.gitkeep` — correct placeholder
- `.gsd-t/domains/cli-quality/` — scope.md, constraints.md, tasks.md (from M6)
- `.gsd-t/domains/cmd-cleanup/` — scope.md, constraints.md, tasks.md (from M7)

Both M6 (CLI Quality Improvement) and M7 (Command File Cleanup) are marked COMPLETED in progress.md and have been archived to `.gsd-t/milestones/`:
- `.gsd-t/milestones/cli-quality-2026-02-19/` — contains scope.md, constraints.md, tasks.md
- `.gsd-t/milestones/cmd-cleanup-2026-02-19/` — contains scope.md, constraints.md, tasks.md

The milestone-completion archival copied domain files to milestones but did NOT delete the originals from `.gsd-t/domains/`. This violates the contract lifecycle.

**Impact:** Medium. Future `gsd-t-partition` may see stale domain files. `gsd-t-status` or `gsd-t-execute` reading `.gsd-t/domains/` will find residual domain data from completed milestones.

**Files affected:**
- `.gsd-t/domains/cli-quality/scope.md`
- `.gsd-t/domains/cli-quality/constraints.md`
- `.gsd-t/domains/cli-quality/tasks.md`
- `.gsd-t/domains/cmd-cleanup/scope.md`
- `.gsd-t/domains/cmd-cleanup/constraints.md`
- `.gsd-t/domains/cmd-cleanup/tasks.md`

**Fix approach:** Delete the 6 orphaned domain files. Verify `gsd-t-complete-milestone.md` performs cleanup (not just copy) during archival.

---

## 6. pre-commit-gate.md — MATCHES

**Contract:** `.gsd-t/contracts/pre-commit-gate.md`
**Compared against:** `templates/CLAUDE-global.md` Pre-Commit Gate section, project `CLAUDE.md`

All 6 check categories present and consistent:
1. Branch Check — matches across contract, global template, and project CLAUDE.md
2. Contract Checks (API, schema, Swagger, UI component) — matches
3. Scope and Documentation Checks — matches
4. Progress and Decision Tracking — matches
5. Debt and Convention Tracking — matches
6. Test Checks — matches

Project-specific extension in contract matches project CLAUDE.md (command file changes, template changes, wave flow changes, CLI installer testing).

The global template has additional sections not in the pre-commit-gate contract (Swagger/OpenAPI guard, Playwright guard) — these are CLAUDE.md template features, not pre-commit gate items. They are complementary, not conflicting.

**No drift detected.**

---

## 7. progress-file-format.md — DRIFTED (Medium)

**Contract:** `.gsd-t/contracts/progress-file-format.md`
**Compared against:** `.gsd-t/progress.md` (live), `templates/progress.md`

### Header Block — DRIFTED

**Contract specifies valid Status values:**
```
READY, INITIALIZED, DEFINED, PARTITIONED, DISCUSSED, PLANNED, IMPACT_ANALYZED,
EXECUTING, EXECUTED, TESTS_SYNCED, INTEGRATED, VERIFIED, VERIFY_FAILED, COMPLETED
```

**Live progress.md has:**
```
## Status: ACTIVE
```

`ACTIVE` is NOT a recognized status value in the contract. The current milestone (M7) is COMPLETED, and all work is done. Per the contract, the status should be `READY` (set by `gsd-t-complete-milestone` when idle) or `COMPLETED`.

**Impact:** Medium. Any command that reads `progress.md` status for state machine transitions (wave, resume, status) will not recognize `ACTIVE` and may fail or behave unpredictably. The wave integrity check specifically looks for recognized values.

### Current Milestone Section — DRIFTED

**Contract specifies:**
```markdown
## Current Milestone
{milestone name} | None — ready for next milestone
```
A simple heading with text content.

**Live progress.md has:**
```markdown
## Current Milestone

| # | Milestone | Status | Domains |
|---|-----------|--------|---------|
| 7 | Command File Cleanup | COMPLETED | cmd-cleanup |

**Goal**: ...
**Result**: ...
**Tech Debt Items**: ...
**Success Criteria**: ...
```

The live file uses a table format with additional metadata (Goal, Result, Tech Debt Items, Success Criteria) not defined in the contract. The contract expects a simple one-line format.

**Impact:** Low-Medium. Commands parsing "Current Milestone" section may not extract the milestone name correctly if they expect the simple format. However, this enriched format has been in use since at least M3, suggesting commands have adapted.

### Template — MATCHES
`templates/progress.md` matches the contract format:
```
## Current Milestone
None — ready for next milestone
```

### Completed Milestones Table — MATCHES
Table columns (Milestone, Version, Completed, Tag) match contract. No extra columns.

### All Other Sections — MATCH
- Domains table: correct columns (Domain, Status, Tasks, Completed)
- Contracts section: present (text format, acceptable per contract)
- Integration Checkpoints: present (text format, acceptable)
- Blockers: present with HTML comment placeholder
- Decision Log: append-only, timestamped entries
- Session Log: table format with Date, Session, What columns

### Decision Log Timestamp Format — MINOR DRIFT (unchanged from scan #3)
Some early entries use `YYYY-MM-DD:` format without `HH:MM`. Contract specifies `YYYY-MM-DD HH:MM:`. This is from git history reconstruction and is not worth fixing.

**Fix approach:**
1. Change `## Status: ACTIVE` to `## Status: READY` (or add `ACTIVE` to contract as a valid status)
2. Either update the contract to document the enriched "Current Milestone" table format, or simplify the live progress.md to match the contract's simple format
3. Recommended: update the contract — the enriched format provides useful metadata

---

## 8. wave-phase-sequence.md — DRIFTED (Low)

**Contract:** `.gsd-t/contracts/wave-phase-sequence.md`
**Compared against:** `commands/gsd-t-wave.md`

### Phase Sequence — MATCHES
Both define 9 phases in identical order:
```
PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

### Status Values — MATCH
All status transitions match between contract and wave command.

### Decision Gates — MATCH
Impact Analysis Gate (PROCEED / PROCEED WITH CAUTION / BLOCK), Verify Gate (2 attempts), Gap Analysis Gate — all identical.

### Discuss Skip — ENHANCED (not drift)

**Contract says:** "Skip when the path is clear, architecture is well-established, no open design questions."

**Wave command says (M7 enhancement):** Structured skip check with specific criteria:
- (a) Single domain milestone
- (b) No "OPEN QUESTION" items in Decision Log
- (c) Multi-domain: all cross-domain contracts exist

The wave command's structured skip is a refinement of the contract's general guidance. Not a violation — it's a more precise implementation of the same intent.

### Autonomy Behavior — MATCHES
Contract and wave agree on Level 3 auto-advance and Discuss always-pause.

### Error Recovery — MATCHES
All recovery paths match with 2-attempt limits.

### Missing from Contract: Security Considerations and Integrity Check

**Wave command has (added in M5 and M7):**
1. **Security Considerations section** (lines 205-231): Documents `bypassPermissions` mode, attack surface, mitigations, and recommendations
2. **Integrity Check** (Step 1, lines 13-22): Verifies progress.md contains required fields (Status, Milestone name, Domains table) before proceeding

**Contract does NOT document:**
- The `bypassPermissions` spawning mode
- The integrity check behavior
- Security considerations or attack surface

**Impact:** Low. These are implementation details that enhance the wave command's robustness. The contract defines the sequence and transition rules correctly. The security and integrity additions do not change the phase sequence or transition rules — they add pre-execution validation and documentation.

**Fix approach:** Add an "Implementation Notes" section to the contract documenting (1) agent-per-phase spawning with bypassPermissions, (2) integrity check before phase loop, (3) security considerations reference.

---

## 9. qa-agent-contract.md — MATCHES

**Contract:** `.gsd-t/contracts/qa-agent-contract.md`
**Compared against:** `commands/gsd-t-qa.md`, all 10 spawning commands

### Phase Context List — MATCHES (was DRIFTED in scan #3)

Contract now lists 9 phase contexts:
```
"partition" | "plan" | "execute" | "test-sync" | "verify" | "quick" | "debug" | "integrate" | "complete"
```

`commands/gsd-t-qa.md` has corresponding behavior sections for all 9 phases:
- During Partition (line 33)
- During Plan (line 42)
- During Execute (line 51)
- During Test-Sync (line 63)
- During Verify (line 73)
- During Quick (line 83)
- During Debug (line 93)
- During Integrate (line 103)
- During Complete-Milestone (line 111)

### Output Table — MATCHES
All 9 phases have output definitions in the contract, including test-sync:
```
| test-sync | Contract-test alignment report + gap fills |
```

### QA Spawn in Commands — VERIFIED
All 10 commands have QA spawn steps with "QA failure blocks" language:
1. `commands/gsd-t-partition.md` — "QA failure blocks partition completion"
2. `commands/gsd-t-plan.md` — "QA failure blocks plan completion"
3. `commands/gsd-t-execute.md` — "QA failure on any task blocks proceeding to the next task"
4. `commands/gsd-t-test-sync.md` — "QA failure blocks test-sync completion"
5. `commands/gsd-t-verify.md` — "QA failure blocks verification completion"
6. `commands/gsd-t-complete-milestone.md` — "QA failure blocks milestone completion"
7. `commands/gsd-t-quick.md` — "QA failure blocks the commit"
8. `commands/gsd-t-debug.md` — "QA failure blocks the commit"
9. `commands/gsd-t-integrate.md` — "QA failure blocks integration completion"
10. `commands/gsd-t-wave.md` — delegates to sub-agents (wave itself doesn't spawn QA directly)

### M7 Enhancements — VERIFIED
QA command file now includes (added in M7):
- **File-Path Boundaries** (lines 14-27): Defines what QA CAN and MUST NOT modify
- **Framework Detection** (lines 123-140): Multi-framework test generation support
- **Document Ripple** (lines 218-229): Post-test documentation update checklist

These enhancements are not in the contract but do not conflict with it. The contract defines the interface (inputs, outputs, communication, blocking rules). The command file's added detail is implementation guidance for the QA agent.

### Communication Protocol — MATCHES
Contract: `QA: {pass|fail} — {summary}. {N} contract tests, {N} passing, {N} failing.`
Command file: `QA: {PASS|FAIL} — {one-line summary}` with detailed breakdown.
Minor casing difference (pass/fail vs PASS/FAIL) but functionally equivalent.

**No drift detected.**

---

## Cross-Reference File Agreement — MATCHES

### Command Counts: All Correct (43/39/4)

**Verified across all reference files:**

| Source | Value | Correct? |
|--------|-------|----------|
| `CLAUDE.md` line 13 | "43 slash commands (39 GSD-T workflow + 4 utility)" | YES |
| `CLAUDE.md` line 34 | "43 slash commands for Claude Code" | YES |
| `CLAUDE.md` line 35 | "39 GSD-T workflow commands" | YES |
| `package.json` description | "43 slash commands" | YES |
| `README.md` line 21 | "39 GSD-T commands + 4 utility commands (43 total)" | YES |
| `README.md` line 297 | "43 slash commands" | YES |
| `README.md` line 298 | "39 GSD-T workflow commands" | YES |
| `docs/architecture.md` line 25 | "43 (39 GSD-T workflow + 4 utility)" | YES |
| `docs/infrastructure.md` line 74 | "43 slash command files (39 GSD-T + 4 utility)" | YES |
| `docs/workflows.md` lines 9/17 | "43 commands" | YES |
| `docs/requirements.md` line 10 | "39 GSD-T workflow slash commands" | YES |
| `commands/gsd-t-help.md` | Lists all 39 gsd-t-* + gsd | YES |
| `templates/CLAUDE-global.md` | Lists all 43 commands | YES |
| `docs/GSD-T-README.md` | Lists all commands including qa | YES |
| `bin/gsd-t.js` | Dynamic counting via `getGsdtCommands().length` | YES |

**Status: All counts agree. No stale references found.**

### Version Reference — STALE (Minor)

`CLAUDE.md` line 55 reads:
```
package.json           — npm package config (v2.23.0)
```
Actual `package.json` version is `2.24.3`. This is a stale version reference in the project structure comment.

---

## Residual Housekeeping Issues

### 1. Stale Version in CLAUDE.md Project Structure

**File:** `CLAUDE.md` line 55
**Current:** `package.json           — npm package config (v2.23.0)`
**Should be:** `package.json           — npm package config (v2.24.3)` (or remove the version entirely to avoid future staleness)

### 2. Undocumented Interfaces (Carried from Scan #2 and #3)

These remain unaddressed:

1. **gsd-t-init dual-path initialization** — both `bin/gsd-t.js` and `commands/gsd-t-init.md` create backlog files. No contract governs precedence.
   - **Files:** `bin/gsd-t.js`, `commands/gsd-t-init.md`

2. **gsd-t-scan output format** — scan produces files in `.gsd-t/scan/` with no contract defining the output format. `gsd-t-promote-debt` consumes these outputs without a formal interface.
   - **Files:** `.gsd-t/scan/*.md`, `commands/gsd-t-scan.md`, `commands/gsd-t-promote-debt.md`

3. **checkin version sync** — cross-file version synchronization (package.json, progress.md, CHANGELOG.md) has no contract.
   - **Files:** `commands/checkin.md`

---

## Priority Fix List

### High Priority

1. **Fix progress.md status value: ACTIVE → READY**
   - `ACTIVE` is not a recognized status in the progress-file-format contract
   - M7 is COMPLETED, no active milestone — status should be `READY`
   - **Files:** `.gsd-t/progress.md` line 5
   - **Risk:** Wave integrity check or resume may not recognize `ACTIVE`

### Medium Priority

2. **Delete orphaned domain files from `.gsd-t/domains/`**
   - `cli-quality/` (M6) and `cmd-cleanup/` (M7) domain files remain after archival
   - Both milestones are COMPLETED and archived to `milestones/`
   - Contract requires domains to be cleared after archival
   - **Files:** 6 files in `.gsd-t/domains/cli-quality/` and `.gsd-t/domains/cmd-cleanup/`

3. **Update progress-file-format contract for enriched Current Milestone format**
   - Live progress.md uses a table + metadata block for Current Milestone
   - Contract specifies simple text format: `{milestone name} | None — ready for next milestone`
   - Recommend updating contract to document the actual enriched format
   - **Files:** `.gsd-t/contracts/progress-file-format.md`

### Low Priority

4. **Add Security/Integrity notes to wave-phase-sequence contract**
   - Wave command has bypassPermissions, integrity check, and security sections not in contract
   - **Files:** `.gsd-t/contracts/wave-phase-sequence.md`

5. **Fix stale version reference in CLAUDE.md**
   - Line 55: "v2.23.0" should be "v2.24.3" (or remove version to avoid future staleness)
   - **Files:** `CLAUDE.md` line 55

6. **Rename command-interface-contract.md** (carried from scan #3)
   - Rename to `backlog-command-interface.md` to match actual scope
   - **Files:** `.gsd-t/contracts/command-interface-contract.md`

7. **Clear stale integration-points.md**
   - Contains M3-specific integration data, no active milestone exists
   - **Files:** `.gsd-t/contracts/integration-points.md`

8. **Document undocumented interfaces** (carried from scan #2 and #3)
   - init dual-path, scan output format, checkin version sync
   - **Files:** new contract files in `.gsd-t/contracts/`

---

## Comparison: Scan #3 vs Scan #4

| Item | Scan #3 | Scan #4 |
|------|---------|---------|
| Command count drift | DRIFTED (High) | RESOLVED by M3 |
| QA contract missing test-sync | DRIFTED (Medium) | RESOLVED by M3 |
| Orphaned domain files | DRIFTED (Medium) - doc-alignment | RESOLVED doc-alignment, NEW cli-quality + cmd-cleanup |
| progress.md ACTIVE status | Not detected | NEW (Medium) |
| progress.md enriched format | Not detected | NEW (Low-Medium) |
| Wave security/integrity | Not detected | NEW (Low) |
| command-interface scope | STALE (Low) | Unchanged (Low) |
| integration-points.md | STALE (Low) | Unchanged (Low) |
| Undocumented interfaces | Carried (Low) | Unchanged (Low) |
| CLAUDE.md stale version | Not detected | NEW (Low) |

**Net change:** 3 items resolved, 4 new items found, 4 carried forward unchanged.

---

*Contract drift scan #4 completed: 2026-02-18*
*Previous items: 3 resolved (High count fix, Medium QA test-sync, Medium orphaned domains)*
*New items found: 4 (1 High, 2 Medium, 1 Low)*
*Carried items: 4 Low priority (contract scope, stale integration-points, undocumented interfaces)*
*Total open items: 8 (1 High, 2 Medium, 5 Low)*
