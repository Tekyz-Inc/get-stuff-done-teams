# Tech Debt Register — 2026-02-18

## Summary
- Critical items: 0
- High priority: 1
- Medium priority: 6
- Low priority: 15
- Total estimated effort: ~3-4 focused sessions

### Scan History
- **Scan #1** (2026-02-07): 13 items found, 9 resolved
- **Scan #2** (2026-02-18): 22 items total, 6 resolved via Contract & Doc Alignment milestone
- **Scan #3** (2026-02-18): 15 items from scan #2 still open, 1 regressed (TD-022), 1 worsened (TD-031), 10 new items found. Total open: 26

---

## Resolved Items

| ID | Title | Resolution |
|----|-------|------------|
| TD-001 | 25 of 26 Command Files Missing | RESOLVED — all commands present |
| TD-002 | Command Injection in Doctor via execSync | RESOLVED — uses execFileSync with array args |
| TD-005 | Symlink Attack Vulnerability | RESOLVED — isSymlink() check at all 18+ write sites |
| TD-006 | Brainstorm Command Not Documented | RESOLVED — added to all 4 reference files |
| TD-007 | Hardcoded Utility Command List | RESOLVED — convention-based detection |
| TD-009 | Missing Input Validation on Project Name | RESOLVED — validateProjectName() with regex |
| TD-011 | Version Comparison Uses String Equality | RESOLVED — isNewerVersion() semver comparison |
| TD-012 | Package.json Missing Metadata | RESOLVED — scripts.test and main fields added |
| TD-013 | Template Token Replacement Duplicated | RESOLVED — applyTokens() helper extracted |
| TD-014 | Backlog File Format Drift | RESOLVED — reformatted to contract spec (2026-02-18) |
| TD-015 | Progress.md Format Drift | RESOLVED — header order, milestones table, Blockers section fixed (2026-02-18) |
| TD-016 | 7 Backlog Commands Missing from GSD-T-README | RESOLVED — full section added (2026-02-18) |
| TD-018 | Heartbeat JSONL Files Not in .gitignore | RESOLVED — added pattern, removed tracked files (2026-02-18) |
| TD-023 | CLAUDE.md Version Drift | RESOLVED — version now correct at v2.23.0 (count drift tracked by TD-022) |
| TD-022 | Stale Command Counts — REGRESSED | RESOLVED — all counts updated 42→43, 38→39 across 4 files (2026-02-18, Milestone 3) |
| TD-042 | QA Agent Contract Missing test-sync Phase | RESOLVED — added During Test-Sync section + contract phase/output (2026-02-18, Milestone 3) |
| TD-043 | Orphaned Domain Files Not Archived | RESOLVED — archived to .gsd-t/milestones/contract-doc-alignment/ (2026-02-18, Milestone 3) |
| TD-003 | No Test Coverage | RESOLVED — 64 tests in test/ (27 helper + 37 filesystem/CLI), `npm test` passes (2026-02-18, Milestone 4) |

---

## High Priority
Items that should be addressed in the next 1-2 milestones.

### TD-017: doUpdateAll() No Per-Project Error Isolation
- **Category**: quality
- **Severity**: HIGH
- **Location**: `bin/gsd-t.js` lines 936-961
- **Description**: `doUpdateAll()` iterates registered projects but a throw in any project's update aborts remaining projects. Also 78 lines without sub-extraction.
- **Impact**: One bad project kills updates for all other projects.
- **Remediation**: Wrap per-project iteration in try/catch. Extract `updateSingleProject()` helper.
- **Effort**: small
- **Milestone candidate**: NO — fold into quality improvements
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

---

## Medium Priority
Items to plan for but not urgent.

### TD-019: Heartbeat Sensitive Data in Bash Commands
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-heartbeat.js` lines 85-186
- **Description**: Heartbeat logs first 150 chars of bash commands which may contain passwords, tokens, or secrets. Also logs WebFetch URLs (may have auth tokens in query strings).
- **Impact**: Sensitive data in heartbeat files. Mitigated by 7-day auto-cleanup and project-local storage.
- **Remediation**: Scrub common secret patterns (--password, --token, API_KEY=) before logging. Mask URL query parameters.
- **Effort**: small-medium
- **Milestone candidate**: NO — fold into security improvements
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-020: npm-update-check.js Arbitrary Path Write
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/npm-update-check.js` lines 11-12, 22
- **Description**: Cache file path from `process.argv[2]` is used without validation. Could write JSON to any user-writable file.
- **Remediation**: Validate path is within `~/.claude/` directory before writing.
- **Effort**: small
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-021: 13 Functions Exceed 30-Line Limit
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `bin/gsd-t.js` (13 functions), `scripts/gsd-t-heartbeat.js` (2 functions)
- **Description**: Project convention requires functions under 30 lines. 15 functions exceed this. Largest: doStatus (98), doUpdateAll (78), buildEvent (69), checkDoctorInstallation (52), initGsdtDir (50).
- **Remediation**: Extract sub-functions from the largest offenders.
- **Effort**: medium
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-022: Stale Command Counts Across Reference Files — REGRESSED
- **Category**: quality / contract drift
- **Severity**: MEDIUM
- **Location**: `CLAUDE.md`, `README.md`, `package.json`, `docs/architecture.md`, `docs/infrastructure.md`, `docs/workflows.md`, `docs/requirements.md`
- **Description**: **REGRESSED from RESOLVED.** Was fixed at 42/38 counts during scan #2. `gsd-t-qa.md` was added in Milestone 2 but counts were not updated from 42 to 43 (39 GSD-T + 4 utility). Pre-Commit Gate rule was not followed.
- **Impact**: 7+ files with ~15 stale count references. Misleading documentation.
- **Remediation**: Update all count references: 42→43, 38→39. Files: CLAUDE.md (3 locations), README.md (3 locations), package.json (1), docs/architecture.md (1), docs/infrastructure.md (3), docs/workflows.md (2), docs/requirements.md (1).
- **Effort**: small
- **Milestone candidate**: NO — quick fix
- **Promoted**: [x] — Milestone 3: Count Fix + QA Contract Alignment

### TD-024: Heartbeat Cleanup Runs on Every Event
- **Category**: performance
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-heartbeat.js` line 57
- **Description**: `cleanupOldHeartbeats()` calls `readdirSync` + multiple `lstatSync` on every hook event. PostToolUse fires hundreds of times per session.
- **Remediation**: Only run cleanup on `SessionStart` events.
- **Effort**: small
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-025: Missing .gitattributes and .editorconfig
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: Project root
- **Description**: No `.gitattributes` or `.editorconfig` to enforce line ending consistency. JS files use CRLF. Contributors on other platforms create LF files.
- **Remediation**: Add `.gitattributes` with `* text=auto` and `.editorconfig` with `end_of_line = lf`.
- **Effort**: small
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-035: Wave bypassPermissions Security Documentation (NEW — scan #3)
- **Category**: security (design concern)
- **Severity**: MEDIUM
- **Location**: `commands/gsd-t-wave.md:40`
- **Description**: Wave orchestrator spawns phase agents with `mode: "bypassPermissions"`. Each sub-agent can execute bash, write files, and perform git operations without user approval. If command files in `~/.claude/commands/` are tampered, all 9 wave agents execute modified instructions with full permissions.
- **Current mitigation**: Command files installed from npm, content comparison during update, `~/.claude/commands/` is user-owned, Destructive Action Guard in CLAUDE.md provides soft protection.
- **Remediation**: Document security implications of bypassPermissions in wave command and README. Consider `--confirm` flag for Level 1/2 autonomy.
- **Effort**: small (documentation), medium (technical controls)
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-042: QA Agent Contract Missing test-sync Phase (NEW — scan #3)
- **Category**: contract drift
- **Severity**: MEDIUM
- **Location**: `.gsd-t/contracts/qa-agent-contract.md`, `commands/gsd-t-qa.md`
- **Description**: qa-agent-contract.md lists only 8 phase contexts but 10 commands spawn QA. Missing: "test-sync" phase definition. When `gsd-t-test-sync` spawns QA with phase context "test-sync", the QA agent has no defined behavior for that phase.
- **Remediation**: Add "During Test-Sync" section to gsd-t-qa.md, add "test-sync" to contract's phase context list and Output table.
- **Effort**: small
- **Promoted**: [x] — Milestone 3: Count Fix + QA Contract Alignment

---

## Low Priority
Nice-to-haves and cleanup.

### TD-026: npm-update-check.js Missing Symlink Check
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/npm-update-check.js` line 22
- **Description**: `writeFileSync(cacheFile, ...)` does not check if cache file is a symlink.
- **Effort**: small
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-027: Unbounded HTTP Response in Update Fetch
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 1169, `scripts/npm-update-check.js` line 16-17
- **Description**: Both update fetch paths accumulate full HTTP response without size limit.
- **Effort**: small
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-028: ensureDir Does Not Validate Parent Symlinks
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` lines 102-112
- **Description**: Checks target dir for symlink but not parent path components.
- **Effort**: small
- **Promoted**: [x] — Milestone 5: Security Hardening

### TD-029: TOCTOU Race in Symlink Check + Write
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 114-120 and all callers
- **Description**: Time-of-check-time-of-use gap between `isSymlink()` and `writeFileSync`.
- **Effort**: medium
- **Promoted**: [ ]

### TD-030: discuss/impact Missing Autonomy Behavior Sections
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-discuss.md`, `commands/gsd-t-impact.md`
- **Description**: These wave-phase commands lack the explicit `### Autonomy Behavior` section that other phase commands have.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-031: Fractional Step Numbering — WORSENED (scan #3)
- **Category**: quality
- **Severity**: LOW
- **Location**: 17 command files (was 11 in scan #2)
- **Description**: **WORSENED.** QA spawn integration added 12 new fractional steps to 9 command files. Total: 34 fractional steps across 17 files (was 22 across 11). The debt is actively growing with each new feature integration.
- **Affected files**: gsd-t-partition.md, gsd-t-plan.md, gsd-t-execute.md, gsd-t-test-sync.md, gsd-t-verify.md, gsd-t-quick.md, gsd-t-debug.md, gsd-t-integrate.md, gsd-t-complete-milestone.md, gsd-t-milestone.md, gsd-t-init.md, gsd-t-impact.md, gsd-t-scan.md, gsd-t-promote-debt.md, gsd-t-project.md, gsd-t-feature.md, gsd-t-discuss.md
- **Effort**: small (but tedious — 17 files)
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-032: buildEvent() 69 Lines in Heartbeat
- **Category**: quality
- **Severity**: LOW
- **Location**: `scripts/gsd-t-heartbeat.js` lines 85-155
- **Description**: Long switch statement mapping 9 hook events. Each case is simple but function exceeds 30-line limit.
- **Effort**: small
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-033: Code Duplication Patterns
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js`
- **Description**: Three duplication patterns: (1) hasSwagger/hasApi share package.json parsing, (2) JSON.parse(settingsJson) repeated 3 times, (3) template-write-or-skip pattern repeated in 3 init functions.
- **Effort**: small-medium
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-034: checkForUpdates Inline JS Fragile
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 1169
- **Description**: Contains inline JavaScript as a string literal executed via execFileSync. Hard to read, impossible to unit test.
- **Effort**: small
- **Promoted**: [x] — Milestone 6: CLI Quality Improvement

### TD-036: QA Agent Unrestricted Test Execution Scope (NEW — scan #3)
- **Category**: security (design concern)
- **Severity**: LOW
- **Location**: `commands/gsd-t-qa.md:36-43, 165-167`
- **Description**: QA agent can execute arbitrary test commands, start/kill processes, and write test files without explicit boundary constraints beyond "never write feature code."
- **Remediation**: Add explicit file-path boundaries (e.g., only write in test directory and `.gsd-t/`). Add kill-only-my-processes pattern.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-037: Wave State Handoff No Integrity Verification (NEW — scan #3)
- **Category**: security (design concern)
- **Severity**: LOW
- **Location**: `commands/gsd-t-wave.md:107-116, 189`
- **Description**: Wave orchestrator reads `progress.md` between phases with no integrity check. A tampered file could cause phase skipping or re-running.
- **Remediation**: Consider git-status integrity check before trusting progress.md content.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-038: QA Agent Missing Document Ripple Section (NEW — scan #3)
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-qa.md`
- **Description**: QA agent writes test files but has no Document Ripple section. All other code-writing commands have this section.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-039: Inconsistent QA Blocking Language (NEW — scan #3)
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-plan.md` (Step 4.7), `commands/gsd-t-test-sync.md` (Step 1.5)
- **Description**: These 2 commands don't explicitly state "QA failure blocks {phase}" like the other 7 QA-spawning commands do.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-040: QA Agent Test Framework Assumption (NEW — scan #3)
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-qa.md` lines 104-121
- **Description**: Code examples assume `@playwright/test` exclusively. No guidance for Jest, Vitest, pytest, or other frameworks.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-041: Wave Discuss-Skip Heuristic Subjective (NEW — scan #3)
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-wave.md` lines 67-69
- **Description**: Skip condition for Discuss phase is qualitative ("Are there open architectural questions?") without machine-parseable signal. Lightweight orchestrator has insufficient context to evaluate reliably.
- **Effort**: small
- **Promoted**: [x] — Milestone 7: Command File Cleanup

### TD-043: Orphaned Domain Files Not Archived (NEW — scan #3)
- **Category**: housekeeping
- **Severity**: LOW
- **Location**: `.gsd-t/domains/doc-alignment/`
- **Description**: Domain files (scope.md, tasks.md, constraints.md) from Contract & Doc Alignment milestone were not archived when milestone was completed. Should have been moved to `.gsd-t/milestones/`.
- **Remediation**: Archive or delete the orphaned domain directory.
- **Effort**: trivial
- **Promoted**: [x] — Milestone 3: Count Fix + QA Contract Alignment

---

## Dependency Updates
No npm dependencies — nothing to update. Zero supply chain attack surface.

---

## Promoted Milestones

All suggestions promoted to formal milestones on 2026-02-18. See `.gsd-t/roadmap.md` for full details.

### PROMOTED: Count Fix + QA Contract Alignment → Milestone 3
Items: TD-022, TD-042, TD-043 | Priority: HIGH — before next npm publish

### PROMOTED: Testing Foundation → Milestone 4
Items: TD-003 | Priority: HIGH — before next feature milestone

### PROMOTED: Security Hardening → Milestone 5
Items: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035 | Priority: MEDIUM

### PROMOTED: CLI Quality Improvement → Milestone 6
Items: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034 | Priority: MEDIUM

### PROMOTED: Command File Cleanup → Milestone 7
Items: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041 | Priority: LOW

### COMPLETED: Contract & Doc Alignment (High) — 2026-02-18
Resolved: TD-014, TD-015, TD-016, TD-018, TD-022 (partially regressed), TD-023

### Not Promoted
- TD-029 (TOCTOU Race) — LOW, medium effort, diminishing returns for CLI tool. Revisit if security requirements change.

---

## Scan Metadata
- Latest scan: 2026-02-18 (scan #3)
- Previous scans: 2026-02-07 (scan #1), 2026-02-18 (scan #2)
- Files analyzed: 3 JS files (bin/gsd-t.js: 1300 lines, scripts/gsd-t-heartbeat.js: 202 lines, scripts/npm-update-check.js: 28 lines), 43 command files, 9 templates, docs, contracts
- Lines of code: ~1,530 JS + ~12,000+ markdown
- Languages: JavaScript, Markdown
- Scan mode: Team (5 parallel agents: architecture, business-rules, security, quality, contracts)
- Scan #3 changes: 1 regressed (TD-022), 1 worsened (TD-031), 10 new items, 0 resolved since scan #2
- Total open items: 26 (0 critical, 2 high, 8 medium, 16 low)

### Trend Analysis

| Metric | Scan #1 | Scan #2 | Scan #3 | Trend |
|--------|---------|---------|---------|-------|
| Open items | 13 | 15 | 26 | Increasing (new features add debt) |
| Critical items | 2 | 0 | 0 | Stable (good) |
| HIGH items | 3 | 2 | 2 | Stable |
| MEDIUM items | 4 | 5 | 8 | Increasing |
| LOW items | 4 | 8 | 16 | Increasing |
| Functions > 30 lines | 13 | 13 | 15 | No improvement |
| Test files | 0 | 0 | 0 | No improvement |
| Fractional steps | N/A | 22/11 files | 34/17 files | Worsening |
| Command count drift | Yes | Fixed | **Regressed** | Recurring failure mode |
| Security (open) | 5 | 6 | 9 | Increasing (3 new design concerns) |
