# Contract Drift Analysis — Scan #3

**Scan Date:** 2026-02-18
**Scope:** All 9 contracts in `.gsd-t/contracts/` vs actual implementation
**Previous Scan:** Scan #2 (2026-02-18) — all drift items resolved via Contract & Doc Alignment milestone

---

## Summary

| Contract | Status | Severity | Change from Scan #2 |
|----------|--------|----------|---------------------|
| command-interface-contract.md | DRIFTED | Medium | NEW — was MATCHES |
| file-format-contract.md | MATCHES | — | RESOLVED (was DRIFTED) |
| integration-points.md | MATCHES | — | Unchanged |
| backlog-file-formats.md | MATCHES | — | RESOLVED (was DRIFTED) |
| domain-structure.md | MATCHES | — | Unchanged |
| pre-commit-gate.md | MATCHES | — | Unchanged |
| progress-file-format.md | MATCHES | — | RESOLVED (was DRIFTED) |
| wave-phase-sequence.md | MATCHES | — | Unchanged |
| qa-agent-contract.md | DRIFTED | Medium | NEW contract, first audit |

**Cross-Reference File Agreement:** DRIFTED (High) — command count 42 is stale, actual is 43

---

## Previously Resolved Items — Verification

### VERIFIED RESOLVED: backlog.md format drift (was High)
- `.gsd-t/backlog.md` now uses integer positions (`## 1.` not `## B1.`)
- Metadata uses pipe-delimited single line: `**Type:** feature | **App:** gsd-t | **Category:** architecture`
- App field present, no extra Priority/Description labels
- **Status: CONFIRMED RESOLVED**

### VERIFIED RESOLVED: progress.md format drift (was High)
- Header order is now correct: `## Project:`, `## Version:`, `## Status:`, `## Date:` (lines 3-6)
- `## Blockers` section present with HTML comment placeholder (line 27-28)
- Completed Milestones table no longer has `#` column
- **Status: CONFIRMED RESOLVED**

### VERIFIED RESOLVED: file-format-contract.md drift (was Medium)
- Live `.gsd-t/backlog.md` format matches the contract specification
- Templates unchanged and still match
- **Status: CONFIRMED RESOLVED**

### VERIFIED RESOLVED: GSD-T-README.md missing backlog commands (was High)
- `docs/GSD-T-README.md` lines 120-130 now contain full Backlog Management section with all 7 commands
- **Status: CONFIRMED RESOLVED**

### VERIFIED RESOLVED: Command count disagreements (was High)
- `CLAUDE.md` line 13: "42 slash commands (38 GSD-T workflow + 4 utility)" — was 41/37, now fixed
- `CLAUDE.md` line 34: "42 slash commands" — was 41, now fixed
- `CLAUDE.md` line 35: "38 GSD-T workflow commands" — was 37, now fixed
- `docs/architecture.md` line 25: "42 (38 GSD-T workflow + 4 utility)" — was 41 (37 + 4), now fixed
- `docs/infrastructure.md` line 74: "42 slash command files (38 GSD-T + 4 utility)" — was 41, now fixed
- `docs/workflows.md` line 9: "42 commands" — was 41, now fixed
- **Status: CONFIRMED RESOLVED... BUT see new drift below**

---

## 1. command-interface-contract.md — DRIFTED (Medium)

**Contract:** `.gsd-t/contracts/command-interface-contract.md`
**Compared against:** `commands/gsd-t-backlog-*.md` (7 files), `commands/gsd-t-qa.md`

### Backlog Commands — MATCH

All 7 backlog commands exist with correct argument patterns:
- `commands/gsd-t-backlog-add.md` — arguments match contract
- `commands/gsd-t-backlog-list.md` — arguments match contract
- `commands/gsd-t-backlog-move.md` — arguments match contract
- `commands/gsd-t-backlog-promote.md` — arguments match contract
- `commands/gsd-t-backlog-edit.md` — arguments match contract
- `commands/gsd-t-backlog-remove.md` — arguments match contract
- `commands/gsd-t-backlog-settings.md` — subcommands match contract

Promote flow classification matches: Milestone, Quick, Debug, Feature analysis.

### Contract Scope — DRIFTED

The `command-interface-contract.md` only documents the 7 backlog commands and their settings subcommands. It does NOT document any other command interfaces (qa, wave, execute, etc.). The contract title "Command Interface Contract" suggests it should cover all commands, but it only covers backlog.

**Impact:** Low — the contract functions as a backlog-specific interface spec. However, the contract name is misleading. The `gsd-t-qa.md` command was added in Milestone 2 but has no entry in this contract despite being a new command with a defined interface.

**Fix approach:** Either (a) rename to `backlog-command-interface.md` for clarity, or (b) extend to document all command interfaces including qa.

---

## 2. file-format-contract.md — MATCHES

**Contract:** `.gsd-t/contracts/file-format-contract.md`
**Compared against:** `templates/backlog.md`, `templates/backlog-settings.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

- Templates match contract format
- Live `.gsd-t/backlog.md` entry format matches: integer positions, pipe-delimited metadata, Added date, description
- Live `.gsd-t/backlog-settings.md` matches: Types, Apps, Categories, Defaults sections with correct structure

**No drift detected.**

---

## 3. integration-points.md — MATCHES

**Contract:** `.gsd-t/contracts/integration-points.md`
**Compared against:** Completed milestone state

This contract documents the Milestone 2 (QA Agent) integration order. The milestone completed successfully:
- contract-test-gen domain completed
- qa-agent-spec domain completed: `commands/gsd-t-qa.md` exists
- command-integration domain completed: All 10 commands have QA spawn steps

Historical documentation. No active drift.

---

## 4. backlog-file-formats.md — MATCHES

**Contract:** `.gsd-t/contracts/backlog-file-formats.md`
**Compared against:** `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

### backlog.md — MATCHES
Single entry uses correct format:
```
## 1. Agentic Workflow Architecture
- **Type:** feature | **App:** gsd-t | **Category:** architecture
- **Added:** 2026-02-13
- Evolve GSD-T commands...
```
Matches contract specification exactly.

### backlog-settings.md — MATCHES
- Types: 5 standard types present
- Apps: `gsd-t` present
- Categories: 5 entries present
- Defaults: `Default App: gsd-t`, `Auto-categorize: true`

**No drift detected.**

---

## 5. domain-structure.md — MATCHES

**Contract:** `.gsd-t/contracts/domain-structure.md`
**Compared against:** `.gsd-t/domains/`

Domains directory contains `.gitkeep` — no active domains. Project status is READY with no active milestone. This is correct per contract lifecycle: "Cleared: After archival, `.gsd-t/domains/` is emptied for next milestone."

Note: Residual domain files from Milestone 3 (doc-alignment) exist:
- `.gsd-t/domains/doc-alignment/` — contains scope.md, tasks.md, constraints.md

This is a minor housekeeping issue (should have been archived with milestone completion), but does not constitute contract drift since the domain files themselves follow the correct format.

**No drift detected.**

---

## 6. pre-commit-gate.md — MATCHES

**Contract:** `.gsd-t/contracts/pre-commit-gate.md`
**Compared against:** `templates/CLAUDE-global.md` Pre-Commit Gate section, project `CLAUDE.md`

All 6 check categories present and identical:
1. Branch Check — identical
2. Contract Checks (API, schema, UI component) — identical
3. Scope and Documentation Checks — identical
4. Progress and Decision Tracking — identical
5. Debt and Convention Tracking — identical
6. Test Checks — identical

Project-specific extension example in contract matches project CLAUDE.md.

**No drift detected.**

---

## 7. progress-file-format.md — MATCHES

**Contract:** `.gsd-t/contracts/progress-file-format.md`
**Compared against:** `.gsd-t/progress.md` (live), `templates/progress.md`

### Header Block — MATCHES
Live file order: Project, Version, Status, Date — matches contract.

### Completed Milestones Table — MATCHES
Table columns: Milestone, Version, Completed, Tag — matches contract (no extra `#` column).

### Blockers Section — PRESENT
`## Blockers` section exists with HTML comment placeholder. Matches contract.

### All Other Sections — MATCH
- Current Milestone: "None — ready for next milestone"
- Domains: placeholder text
- Contracts: placeholder text
- Integration Checkpoints: placeholder text
- Decision Log: entries present with timestamps
- Session Log: table format matches

### Minor Note
Some early Decision Log entries (from git history reconstruction) lack `HH:MM` timestamps, using only `YYYY-MM-DD` format. The contract specifies `YYYY-MM-DD HH:MM`. This is documented as intentional from reconstruction and does not warrant remediation.

**No drift detected.**

---

## 8. wave-phase-sequence.md — MATCHES

**Contract:** `.gsd-t/contracts/wave-phase-sequence.md`
**Compared against:** `commands/gsd-t-wave.md`

### Phase Sequence — MATCHES
Both define 9 phases in identical order:
```
PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

### Status Values — MATCH
All 9 status transitions (PARTITIONED through COMPLETED) match between contract and wave command.

### Architecture Change: Agent-Per-Phase
The wave command now uses an agent-per-phase spawning model (each phase gets a fresh context window via Task tool). The contract does not describe this implementation detail — it defines the sequence and transition rules. The wave command's implementation is consistent with the contract's requirements even though the execution model differs from the original inline approach.

### Decision Gates — MATCH
- Impact Analysis Gate: PROCEED / PROCEED WITH CAUTION / BLOCK — identical
- Verify Gate: remediate and re-verify (up to 2 attempts) — identical
- Gap Analysis Gate (within Complete): implemented in `commands/gsd-t-complete-milestone.md` Step 1.5

### Discuss Skip Rule — MATCHES
Contract: "Discuss is the ONLY skippable phase."
Wave: "Check: Are there open architectural questions or multiple viable approaches? If NO: Skip to Plan"

### Autonomy Behavior — MATCHES
Contract and wave agree on Level 3 auto-advance behavior and Discuss always-pause rule.

### Error Recovery — MATCHES
Impact blocks, test failures during execute, verify failures — all have matching remediation flows with 2-attempt limits.

**No drift detected.**

---

## 9. qa-agent-contract.md — DRIFTED (Medium)

**Contract:** `.gsd-t/contracts/qa-agent-contract.md`
**Compared against:** `commands/gsd-t-qa.md`, all 10 spawning commands

### Phase Context List — DRIFTED

**Contract says** QA agent receives phase context:
```
"partition" | "plan" | "execute" | "verify" | "quick" | "debug" | "integrate" | "complete"
```
That is 8 phase contexts.

**CLAUDE-global template says** 10 commands must spawn QA:
```
partition, plan, execute, verify, complete-milestone, quick, debug, integrate, test-sync, wave
```

**Actual commands with QA spawn:** 10 commands have "Spawn QA Agent" steps:
1. `commands/gsd-t-partition.md` — Step 4.7: Spawn QA Agent (phase: partition)
2. `commands/gsd-t-plan.md` — Step 4.7: Spawn QA Agent (phase: plan)
3. `commands/gsd-t-execute.md` — Step 1.5: Spawn QA Agent (phase: execute)
4. `commands/gsd-t-verify.md` — Step 1.5: Spawn QA Agent (phase: verify)
5. `commands/gsd-t-complete-milestone.md` — Step 7.6: Spawn QA Agent (phase: complete)
6. `commands/gsd-t-quick.md` — Step 2.5: Spawn QA Agent (phase: quick)
7. `commands/gsd-t-debug.md` — Step 2.5: Spawn QA Agent (phase: debug)
8. `commands/gsd-t-integrate.md` — Step 4.5: Spawn QA Agent (phase: integrate)
9. `commands/gsd-t-test-sync.md` — Step 1.5: Spawn QA Agent (phase: test-sync)
10. `commands/gsd-t-wave.md` — references QA internally (delegated to execute agent)

**Drift:** The qa-agent-contract.md's Input section lists only 8 phase contexts but 10 commands spawn QA. Missing from contract:
- **test-sync** — spawns QA with phase context "test-sync" but contract has no "During Test-Sync" behavior section
- **wave** — listed in CLAUDE-global as a spawner but contract does not list it (acceptable since wave delegates to sub-agents)

The `gsd-t-qa.md` command file itself also only defines behavior for 8 phases (matching the contract), with no "During Test-Sync" section.

**Impact:** When `gsd-t-test-sync` spawns QA with phase context "test-sync", the QA agent has no defined behavior for that phase. It will fall through to undefined behavior.

**Fix approach:**
1. Add "During Test-Sync" section to `commands/gsd-t-qa.md` defining QA behavior during test sync
2. Add `"test-sync"` to the phase context list in `qa-agent-contract.md`
3. Add test-sync row to the Output table in `qa-agent-contract.md`

### Output Table — DRIFTED (minor)

**Contract Output table lists:**
| Phase | Output |
|-------|--------|
| partition | Contract test skeleton files |
| plan | Acceptance test scenario files |
| execute | Test execution results + edge case tests |
| verify | Full test audit report |
| quick | Regression/feature tests for the quick change |
| debug | Regression test for the bug being fixed |
| integrate | Cross-domain integration test results |
| complete | Final gate report |

Missing: `test-sync` phase output definition.

### Consumer Count — DRIFTED (minor)

Contract says: "Consumers: command-integration domain (all 10 commands)"
But the contract's Input section only lists 8 phase contexts. The "10 commands" claim is correct (10 commands do spawn QA), but the contract's own specification only covers 8 of them.

### QA Command File vs Contract — MATCHES (for covered phases)

For all 8 phases that ARE defined:
- `commands/gsd-t-qa.md` phase behaviors match the contract's output table
- Communication protocol matches: `QA: {PASS|FAIL} — {summary}`
- Blocking rules match: QA failure blocks phase completion
- Contract-to-test mapping rules match between contract and command file

---

## Cross-Reference File Agreement — DRIFTED (High)

### Command Count: 42 is Stale — Actual is 43

The `gsd-t-qa.md` command file was added in Milestone 2 (QA Agent) but the total command count was never updated from 42 to 43.

**Actual count (verified):**
- `gsd-t-*.md` files: **39** (was 38 before gsd-t-qa.md was added)
- Utility files (gsd.md, branch.md, checkin.md, Claude-md.md): **4**
- **Total: 43 command files**

| Source | Claims | Correct? |
|--------|--------|----------|
| `package.json` description | "42 slash commands" | WRONG — 43 |
| `README.md` line 21 | "38 GSD-T commands + 4 utility commands (42 total)" | WRONG — 39 + 4 = 43 |
| `README.md` lines 286-287 | "42 slash commands" / "38 GSD-T workflow commands" | WRONG — 43 / 39 |
| `CLAUDE.md` line 13 | "42 slash commands (38 GSD-T workflow + 4 utility)" | WRONG — 43 (39 + 4) |
| `CLAUDE.md` lines 34-35 | "42 slash commands" / "38 GSD-T workflow commands" | WRONG — 43 / 39 |
| `docs/architecture.md` line 25 | "42 (38 GSD-T workflow + 4 utility)" | WRONG — 43 (39 + 4) |
| `docs/infrastructure.md` line 40 | `# Should be 42` | WRONG — should be 43 |
| `docs/infrastructure.md` line 61 | "Slash commands (42 files)" | WRONG — 43 |
| `docs/infrastructure.md` line 74 | "42 slash command files (38 GSD-T + 4 utility)" | WRONG — 43 (39 + 4) |
| `docs/workflows.md` line 9 | "42 commands" | WRONG — 43 |
| `docs/workflows.md` line 17 | "42 commands available" | WRONG — 43 |
| `docs/requirements.md` line 10 | "38 GSD-T workflow slash commands" | WRONG — 39 |
| `commands/gsd-t-help.md` | Lists 39 gsd-t-* commands + gsd | CORRECT (implicitly) |
| `templates/CLAUDE-global.md` commands table | Lists all commands including qa | CORRECT (implicitly) |
| `docs/GSD-T-README.md` | Lists all commands including qa | CORRECT (implicitly) |
| `bin/gsd-t.js` | Dynamically reads directory — no hardcoded count | CORRECT (auto-adapts) |

**Root cause:** When `gsd-t-qa.md` was added during Milestone 2, the Pre-Commit Gate rule "Did I add or remove a command? YES → Update all 4 reference files + package.json version + command counting" was not fully executed. The command was correctly listed in all reference tables (help, README, GSD-T-README, CLAUDE-global) but the numeric count claims were not updated from 42 to 43.

### Command Table Completeness

All 4 reference files now list all commands including qa and all 7 backlog commands:
- `README.md` — all 43 commands listed (39 gsd-t-* + gsd + branch + checkin + Claude-md)
- `docs/GSD-T-README.md` — all gsd-t-* commands + gsd listed, utility commands intentionally excluded
- `commands/gsd-t-help.md` — all gsd-t-* commands + gsd listed
- `templates/CLAUDE-global.md` — all 43 commands listed in Commands Reference table

**No missing commands in any reference table.** The drift is purely in the numeric count claims.

### Classification Note

The split "38 GSD-T workflow + 4 utility" (now 39 + 4) counts `gsd.md` as a utility since it lacks the `gsd-t-` prefix. `gsd-t-qa.md` is classified correctly as a GSD-T workflow command.

---

## Residual Housekeeping Issues

### 1. Orphaned Domain Files

`.gsd-t/domains/doc-alignment/` still contains scope.md, tasks.md, and constraints.md from the Contract & Doc Alignment milestone. These should have been archived to `.gsd-t/milestones/` when the milestone was completed. Not a contract drift, but a process gap.

**Files:** `.gsd-t/domains/doc-alignment/scope.md`, `.gsd-t/domains/doc-alignment/tasks.md`, `.gsd-t/domains/doc-alignment/constraints.md`

### 2. Undocumented Interfaces (Carried from Scan #2)

These remain unaddressed from the previous scan:

1. **gsd-t-init dual-path initialization** — both `bin/gsd-t.js` and `commands/gsd-t-init.md` create backlog files. No contract governs which takes precedence or how to keep them in sync.
   - **Files:** `bin/gsd-t.js` lines 608-623, `commands/gsd-t-init.md`

2. **gsd-t-scan output format** — scan produces files in `.gsd-t/scan/` with no contract defining the output format. `gsd-t-promote-debt` consumes these outputs without a formal interface.
   - **Files:** `.gsd-t/scan/*.md`, `commands/gsd-t-scan.md`, `commands/gsd-t-promote-debt.md`

3. **checkin version sync** — cross-file version synchronization (package.json, progress.md, CHANGELOG.md) has no contract.
   - **Files:** `commands/checkin.md`

---

## Priority Fix List

### High Priority

1. **Update command count from 42 to 43 across all reference files**
   - `package.json` description: "42" → "43"
   - `README.md`: "38 GSD-T commands + 4 utility commands (42 total)" → "39 GSD-T commands + 4 utility commands (43 total)"
   - `README.md` repo structure: "42 slash commands" → "43", "38 GSD-T" → "39"
   - `CLAUDE.md`: "42 slash commands (38 GSD-T workflow + 4 utility)" → "43 slash commands (39 GSD-T workflow + 4 utility)"
   - `CLAUDE.md` project structure: "42 slash commands" → "43", "38 GSD-T workflow commands" → "39"
   - `docs/architecture.md`: "42 (38 GSD-T workflow + 4 utility)" → "43 (39 GSD-T workflow + 4 utility)"
   - `docs/infrastructure.md`: all "42" references → "43", "38 GSD-T" → "39"
   - `docs/workflows.md`: "42 commands" → "43"
   - `docs/requirements.md`: "38 GSD-T" → "39"
   - **Files affected:** 7 files, ~15 line changes total

### Medium Priority

2. **Add test-sync phase to qa-agent-contract.md and gsd-t-qa.md**
   - Add `"test-sync"` to the phase context list in contract Input section
   - Add "During Test-Sync" section to `commands/gsd-t-qa.md` with appropriate behavior
   - Add test-sync row to contract Output table
   - **Files affected:** `commands/gsd-t-qa.md`, `.gsd-t/contracts/qa-agent-contract.md`

3. **Clean up orphaned domain files**
   - Archive `.gsd-t/domains/doc-alignment/` to `.gsd-t/milestones/` or delete
   - **Files affected:** `.gsd-t/domains/doc-alignment/*`

### Low Priority

4. **Clarify command-interface-contract.md scope**
   - Either rename to `backlog-command-interface.md` or extend to cover all command interfaces
   - **Files affected:** `.gsd-t/contracts/command-interface-contract.md`

5. **Document undocumented interfaces** (carried from scan #2)
   - Create contracts for init dual-path, scan output formats, and checkin version sync
   - **Files affected:** new contract files in `.gsd-t/contracts/`

---

*Contract drift scan #3 completed: 2026-02-18*
*Previous resolved items: 5/5 confirmed resolved*
*New items found: 3 (1 High, 2 Medium)*
*Carried items: 3 Low priority undocumented interfaces*
