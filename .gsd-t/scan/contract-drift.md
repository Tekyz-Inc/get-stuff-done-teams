# Contract Drift Analysis

**Scan Date:** 2026-02-18
**Scope:** All 8 contracts in `.gsd-t/contracts/` vs actual implementation

---

## Summary

| Contract | Status | Severity |
|----------|--------|----------|
| command-interface-contract.md | MATCHES | — |
| file-format-contract.md | DRIFTED | Medium |
| integration-points.md | MATCHES | — |
| backlog-file-formats.md | DRIFTED | High |
| domain-structure.md | MATCHES | — |
| pre-commit-gate.md | MATCHES | — |
| progress-file-format.md | DRIFTED | High |
| wave-phase-sequence.md | MATCHES | — |

**Cross-Reference File Agreement:** DRIFTED (High)

---

## 1. command-interface-contract.md — MATCHES

**Contract:** `.gsd-t/contracts/command-interface-contract.md`
**Compared against:** `commands/gsd-t-backlog-*.md` (7 files)

All 7 backlog commands exist as defined:
- `commands/gsd-t-backlog-add.md` — arguments match contract (`"<title>" [--desc "..."] [--type ...] [--app ...] [--category ...]`)
- `commands/gsd-t-backlog-list.md` — arguments match contract (`[--type ...] [--app ...] [--category ...] [--top N]`)
- `commands/gsd-t-backlog-move.md` — arguments match contract (`<from-position> <to-position>`)
- `commands/gsd-t-backlog-promote.md` — arguments match contract (`<position>`)
- `commands/gsd-t-backlog-edit.md` — arguments match contract (`<position> [--title "..."] [--desc "..."] [--type ...] [--app ...] [--category ...]`)
- `commands/gsd-t-backlog-remove.md` — arguments match contract (`<position> [--reason "..."]`)
- `commands/gsd-t-backlog-settings.md` — subcommands match contract (list, add-type, remove-type, add-app, remove-app, add-category, remove-category, default-app)

**Promote flow classification** matches: Milestone, Quick, Debug, Feature analysis — all 4 present in `commands/gsd-t-backlog-promote.md` Step 4.

**No drift detected.**

---

## 2. file-format-contract.md — DRIFTED

**Contract:** `.gsd-t/contracts/file-format-contract.md`
**Compared against:** `templates/backlog.md`, `templates/backlog-settings.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

### Templates — MATCH contract

- `templates/backlog.md`: Contains only `# Backlog` heading. Matches contract rule: "No entries = file contains only the `# Backlog` heading."
- `templates/backlog-settings.md`: Format matches contract exactly (Types, Apps, Categories, Defaults sections with correct structure). Uses `{app1}`, `{app2}` placeholders for Apps.

### Live files — DRIFTED

**`.gsd-t/backlog.md` drift:**

The contract specifies entry format:
```
## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

Where `{N}` is a sequential integer (1, 2, 3...).

The actual backlog uses a different ID scheme:
```
## B1. Agentic Workflow Architecture
- **Type**: Feature
- **Category**: Architecture
- **Priority**: Low
- **Description**: Evolve GSD-T commands...
- **Added**: 2026-02-13
```

**Specific drifts:**
1. **Position prefix**: Uses `B1` instead of `1` — violates "Position is the sequential number" rule
2. **Missing App field**: No `**App:**` in the metadata — contract requires it
3. **Extra Priority field**: `**Priority**: Low` is not in the contract format
4. **Extra Description label**: Uses `**Description**:` instead of bare `- {description}`
5. **Field order**: Type, Category, Priority, Description, Added — contract specifies Type | App | Category on one line, then Added, then description
6. **Field separators**: Uses newlines per field instead of pipe-delimited `Type | App | Category` on one line
7. **Colon style**: Uses `**Type**:` instead of `**Type:**` (space after colon vs before colon)

**Impact:** Any command reading/writing the backlog with the contract format will fail to parse the live file. The `gsd-t-backlog-list`, `gsd-t-backlog-move`, `gsd-t-backlog-edit`, and `gsd-t-backlog-remove` commands all expect the contract format.

**Fix approach:** Rewrite `.gsd-t/backlog.md` to match the contract format, or update the contract to match the current format. Recommend rewriting the live file since the commands are coded to the contract.

---

## 3. integration-points.md — MATCHES

**Contract:** `.gsd-t/contracts/integration-points.md`
**Compared against:** Actual integration state

This contract describes the build-time integration order for the Backlog Management System milestone. Since that milestone is completed and archived, the integration points are historical documentation. The actual integration was executed correctly:
- Templates were created first (backlog.md, backlog-settings.md)
- Commands were created second (7 command files)
- Integration files were updated third (init, status, help, CLAUDE-global, README)

All 5 integration targets exist and contain backlog references:
- `commands/gsd-t-init.md` — references backlog files
- `commands/gsd-t-status.md` — listed as consumer in backlog-file-formats contract
- `commands/gsd-t-help.md` — lists all 7 backlog commands
- `templates/CLAUDE-global.md` — lists all 7 backlog commands in Commands Reference table
- `README.md` — lists all 7 backlog commands in Commands Reference

**No drift detected.**

---

## 4. backlog-file-formats.md — DRIFTED

**Contract:** `.gsd-t/contracts/backlog-file-formats.md`
**Compared against:** `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`

### backlog-settings.md — MATCHES

The live `.gsd-t/backlog-settings.md` matches the contract format exactly:
- Types section: 5 standard types (bug, feature, improvement, ux, architecture)
- Apps section: `gsd-t` (project-specific)
- Categories section: 5 entries (cli, commands, templates, docs, contracts)
- Defaults section: `**Default App:** gsd-t`, `**Auto-categorize:** true`

### backlog.md — DRIFTED (same issues as file-format-contract.md above)

**Same drifts as Contract #2:**
- Position uses `B1` prefix instead of integer `1`
- Missing `**App:**` field
- Extra `**Priority:**` field not in contract
- Extra `**Description**:` label not in contract
- Metadata fields on separate lines instead of pipe-delimited single line
- Different colon placement in bold field names

**Validation rules affected:**
- Rule 1 (Type must be in settings): Cannot validate — field format differs
- Rule 2 (App must be in settings): Cannot validate — field missing entirely
- Rule 3 (Category must be in settings): Format differs but value is present
- Rule 4 (Position must be valid): Cannot validate — non-numeric position prefix

---

## 5. domain-structure.md — MATCHES

**Contract:** `.gsd-t/contracts/domain-structure.md`
**Compared against:** `.gsd-t/domains/`

The domains directory contains only `.gitkeep` — no active domains. This is correct: the project status is `READY` (no active milestone), so domains should be empty per the contract lifecycle rules:

> "Cleared: After archival, `.gsd-t/domains/` is emptied for next milestone"

The contract format definitions (scope.md, tasks.md, constraints.md) are structural templates — they define what files should exist when domains ARE active. The Milestone 1 domains were correctly archived to `.gsd-t/milestones/`.

**No drift detected.**

---

## 6. pre-commit-gate.md — MATCHES

**Contract:** `.gsd-t/contracts/pre-commit-gate.md`
**Compared against:** `templates/CLAUDE-global.md` Pre-Commit Gate section

The contract documents 6 check categories:
1. Branch Check
2. Contract Checks (API, schema, UI component)
3. Scope and Documentation Checks (files, requirements, architecture)
4. Progress and Decision Tracking (timestamped entries)
5. Debt and Convention Tracking
6. Test Checks

The CLAUDE-global.md Pre-Commit Gate section at line 240 contains all 6 categories with matching items:
- Branch check: identical
- API/schema/component contract updates: identical
- Scope.md, requirements.md, architecture.md updates: identical
- Decision Log format (`- YYYY-MM-DD HH:MM:`): identical
- Tech debt and convention tracking: identical
- Test verification and E2E specs: identical

The project-specific extension example in the contract matches the project CLAUDE.md's Pre-Commit Gate section.

**No drift detected.**

---

## 7. progress-file-format.md — DRIFTED

**Contract:** `.gsd-t/contracts/progress-file-format.md`
**Compared against:** `.gsd-t/progress.md` (live), `templates/progress.md`

### Header Block — DRIFTED

**Contract defines order:**
```
## Project: {project name}
## Version: {Major.Minor.Patch}
## Status: {valid status}
## Date: {YYYY-MM-DD}
```

**Template has order:**
```
## Project: {Project Name}
## Version: 0.1.0
## Status: READY
## Date: {Date}
```

**Live file has order:**
```
## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: READY
## Date: 2026-02-10
## Version: 2.21.1
```

**Drift:** The live file has `Status` and `Date` before `Version`, while the contract and template both put `Version` second. The live file order is `Project, Status, Date, Version` — contract order is `Project, Version, Status, Date`.

### Completed Milestones Table — DRIFTED

**Contract defines:**
```
| Milestone | Version | Completed | Tag |
```

**Template matches contract:**
```
| Milestone | Version | Completed | Tag |
```

**Live file has:**
```
| # | Milestone | Version | Completed | Tag |
```

**Drift:** The live file added a `#` column (row number) not present in the contract or template.

### Blockers Section — MISSING from live file

**Contract defines:**
```
## Blockers
### {Blocker description}
- **Found**: {YYYY-MM-DD}
- **Attempted**: {what was tried}
- **Status**: investigating | waiting | resolved
```

**Template has:** Blockers section with HTML comment placeholder.

**Live file:** Section is entirely absent. The live progress.md jumps from `## Integration Checkpoints` directly to `## Decision Log` with no `## Blockers` section in between.

### Decision Log — MINOR DRIFT

**Contract defines format:**
```
- {YYYY-MM-DD HH:MM}: {what was done} — {brief context or result}
```

**Live file:** Some entries follow this format, but earlier entries (from git history reconstruction) use simpler formats:
```
- 2026-02-07: Existing codebase analyzed — npm package with CLI installer...
```
These lack the `HH:MM` time component. This is a minor drift since the reconstruction note explains the format difference.

### Other sections — MATCH

- `## Current Milestone`: Matches contract (`None — ready for next milestone`)
- `## Domains`: Matches contract placeholder (`(populated during partition phase)`)
- `## Contracts`: Matches contract placeholder
- `## Integration Checkpoints`: Matches contract placeholder
- `## Session Log`: Matches contract table format

**Fix approach:**
1. Reorder header fields to match contract: Project, Version, Status, Date
2. Remove `#` column from Completed Milestones table (or update contract to include it)
3. Add missing `## Blockers` section with HTML comment placeholder

---

## 8. wave-phase-sequence.md — MATCHES

**Contract:** `.gsd-t/contracts/wave-phase-sequence.md`
**Compared against:** `commands/gsd-t-wave.md`

**Phase sequence matches:**
```
PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

Both the contract and `gsd-t-wave.md` define the same 9 phases in the same order:
1. Partition → PARTITIONED
2. Discuss → DISCUSSED (skippable)
3. Plan → PLANNED
4. Impact → IMPACT_ANALYZED
5. Execute → EXECUTED
6. Test Sync → TESTS_SYNCED
7. Integrate → INTEGRATED
8. Verify → VERIFIED
9. Complete → COMPLETED

**Decision gates match:**
- Impact Analysis Gate: PROCEED / PROCEED WITH CAUTION / BLOCK — identical
- Verify Gate: Pass or remediate (up to 2 attempts) — identical

**Autonomy behavior matches:**
- Level 3: Auto-advance, stop for Destructive Guard, Impact BLOCK, errors after 2 attempts, Discuss
- Level 1-2: Pause for user input
- Both sources agree

**Error recovery matches:**
- Impact blocks, test failures during execute, verify failures — all have matching remediation flows with 2-attempt limits

**Visual flow diagram matches** between contract and wave command (identical ASCII art).

**No drift detected.**

---

## Cross-Reference File Agreement — DRIFTED (High)

The 4 reference files that must stay in sync are:
1. `README.md`
2. `docs/GSD-T-README.md`
3. `commands/gsd-t-help.md`
4. `templates/CLAUDE-global.md`

Plus the project `CLAUDE.md`.

### Command Count Disagreements

| Source | Claim | Actual (42 files) |
|--------|-------|--------------------|
| `package.json` description | "42 slash commands" | CORRECT |
| `README.md` line 21 | "39 GSD-T commands + 3 utility commands" | WRONG — 38 gsd-t-* + 1 gsd.md + 3 utility = 42, but gsd.md is the router, not clearly classified |
| `README.md` line 285 | "42 slash commands" | CORRECT |
| `README.md` line 286 | "38 GSD-T workflow commands" | CORRECT (gsd-t-*.md count) |
| `CLAUDE.md` line 13 | "42 slash commands (38 GSD-T workflow + 4 utility)" | WRONG — 38 + 4 = 42 but gsd.md is not a "utility" in the same sense as branch/checkin/Claude-md |
| `CLAUDE.md` line 34 | "41 slash commands for Claude Code" | WRONG — actual is 42 |
| `CLAUDE.md` line 35 | "37 GSD-T workflow commands" | WRONG — actual is 38 gsd-t-*.md files |
| `docs/architecture.md` line 22 | "41 (37 GSD-T workflow + 4 utility)" | WRONG — actual is 42 (38 + 4) |
| `docs/workflows.md` line 15 | "41 commands available" | WRONG — actual is 42 |
| `docs/infrastructure.md` line 65 | "41 slash command files" | WRONG — actual is 42 |

**Root cause:** Multiple stale counts. The `gsd-t-triage-and-merge.md` command (added in v2.21.0) brought the count from 41 to 42, and the `gsd-t-scan.md` seems to have been missed in earlier counts. Several reference files still show 41 or 37 instead of 42 or 38.

### GSD-T-README.md — Missing Backlog Section

`docs/GSD-T-README.md` has ZERO mentions of any backlog command. The entire Backlog Management section is missing from this reference file while all other 3 reference files include it:

- `README.md` — Backlog Management section with all 7 commands: PRESENT
- `commands/gsd-t-help.md` — BACKLOG section with all 7 commands: PRESENT
- `templates/CLAUDE-global.md` — All 7 backlog commands in Commands Reference table: PRESENT
- `docs/GSD-T-README.md` — NO backlog commands listed: **MISSING**

This violates the Pre-Commit Gate rule: "Did I add or remove a command? YES → Update all 4 reference files."

### Command List Completeness

| Command | README.md | GSD-T-README.md | gsd-t-help.md | CLAUDE-global.md |
|---------|-----------|-----------------|---------------|------------------|
| gsd | Yes | Yes | Yes | Yes |
| gsd-t-help | Yes | Yes | Yes | Yes |
| gsd-t-prompt | Yes | Yes | Yes | Yes |
| gsd-t-brainstorm | Yes | Yes | Yes | Yes |
| gsd-t-setup | Yes | Yes | Yes | Yes |
| gsd-t-init | Yes | Yes | Yes | Yes |
| gsd-t-init-scan-setup | Yes | Yes | Yes | Yes |
| gsd-t-project | Yes | Yes | Yes | Yes |
| gsd-t-feature | Yes | Yes | Yes | Yes |
| gsd-t-scan | Yes | Yes | Yes | Yes |
| gsd-t-gap-analysis | Yes | Yes | Yes | Yes |
| gsd-t-promote-debt | Yes | Yes | Yes | Yes |
| gsd-t-populate | Yes | Yes | Yes | Yes |
| gsd-t-milestone | Yes | Yes | Yes | Yes |
| gsd-t-partition | Yes | Yes | Yes | Yes |
| gsd-t-discuss | Yes | Yes | Yes | Yes |
| gsd-t-plan | Yes | Yes | Yes | Yes |
| gsd-t-impact | Yes | Yes | Yes | Yes |
| gsd-t-execute | Yes | Yes | Yes | Yes |
| gsd-t-test-sync | Yes | Yes | Yes | Yes |
| gsd-t-integrate | Yes | Yes | Yes | Yes |
| gsd-t-verify | Yes | Yes | Yes | Yes |
| gsd-t-complete-milestone | Yes | Yes | Yes | Yes |
| gsd-t-wave | Yes | Yes | Yes | Yes |
| gsd-t-status | Yes | Yes | Yes | Yes |
| gsd-t-resume | Yes | Yes | Yes | Yes |
| gsd-t-quick | Yes | Yes | Yes | Yes |
| gsd-t-debug | Yes | Yes | Yes | Yes |
| gsd-t-log | Yes | Yes | Yes | Yes |
| gsd-t-version-update | Yes | Yes | Yes | Yes |
| gsd-t-version-update-all | Yes | Yes | Yes | Yes |
| gsd-t-triage-and-merge | Yes | Yes | Yes | Yes |
| gsd-t-backlog-add | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-list | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-move | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-edit | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-remove | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-promote | Yes | **NO** | Yes | Yes |
| gsd-t-backlog-settings | Yes | **NO** | Yes | Yes |
| branch | Yes | No (not expected) | No (not expected) | Yes |
| checkin | Yes | No (not expected) | No (not expected) | Yes |
| Claude-md | Yes | No (not expected) | No (not expected) | Yes |

---

## Undocumented Interfaces

### 1. UNDOCUMENTED — gsd-t-init ↔ backlog file creation

`bin/gsd-t.js` function `initGsdtDir()` copies `templates/backlog.md` and `templates/backlog-settings.md` verbatim (no token replacement). The `commands/gsd-t-init.md` also creates these files. This dual initialization path is not documented in any contract. If the template format changes, both paths must be updated.

**Files:** `bin/gsd-t.js` lines 608-623, `commands/gsd-t-init.md`

### 2. UNDOCUMENTED — gsd-t-status ↔ progress.md parsing

`gsd-t-status` reads and displays progress.md data. The `progress-file-format.md` contract lists `gsd-t-status` as a consumer, but there's no contract specifying what fields status reads or how it renders them. Changes to progress.md format could silently break status display.

### 3. UNDOCUMENTED — checkin ↔ version bumping ↔ package.json

The `commands/checkin.md` command auto-bumps version in `package.json`, `.gsd-t/progress.md`, and `CHANGELOG.md`. This cross-file version synchronization has no contract. The version format is documented in `progress-file-format.md` but the synchronization rules (which files, bump semantics) are only in the command file itself.

### 4. UNDOCUMENTED — gsd-t-scan ↔ scan output formats

Scan produces files in `.gsd-t/scan/` (architecture.md, business-rules.md, security.md, quality.md) but there's no contract defining these output formats. Other commands (like `gsd-t-promote-debt`) consume scan outputs without a formal interface contract.

---

## Priority Fix List

### High Priority

1. **Fix `.gsd-t/backlog.md` format** to match `backlog-file-formats.md` contract — current format will cause command failures
   - Remove `B` prefix from positions
   - Consolidate Type/App/Category onto pipe-delimited single line
   - Remove extra Priority and Description labels
   - Add missing App field

2. **Fix `.gsd-t/progress.md` format** to match `progress-file-format.md` contract
   - Reorder header: Project, Version, Status, Date
   - Add missing `## Blockers` section
   - Remove `#` column from Completed Milestones (or update contract)

3. **Add backlog commands to `docs/GSD-T-README.md`** — 7 commands entirely missing from this reference file

### Medium Priority

4. **Fix command counts** across all reference files — standardize on 42 total (38 gsd-t-* + 1 gsd.md + 3 utility) with consistent classification
   - `CLAUDE.md`: Fix "41 slash commands" → 42, "37 GSD-T" → 38
   - `docs/architecture.md`: Fix "41 (37 + 4)" → "42 (38 + 4)"
   - `docs/workflows.md`: Fix "41 commands" → 42
   - `docs/infrastructure.md`: Fix "41 slash command files" → 42

### Low Priority

5. **Document undocumented interfaces** — create contracts for init dual-path, scan output formats, and checkin version sync

---

*Contract drift scan completed: 2026-02-18*
