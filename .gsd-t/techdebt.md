# Tech Debt Register — 2026-02-18

## Summary
- Critical items: 0
- High priority: 1
- Medium priority: 5
- Low priority: 9
- Total estimated effort: ~2-3 focused sessions

### Previous Scan Resolution Rate
9 of 13 original items resolved since first scan (2026-02-07). 4 partially or still open.
Additionally, 5 items from second scan resolved via Contract & Doc Alignment milestone (2026-02-18).

---

## Resolved Items (from 2026-02-07 scan)

| ID | Title | Resolution |
|----|-------|------------|
| TD-001 | 25 of 26 Command Files Missing | RESOLVED — all 42 commands present |
| TD-002 | Command Injection in Doctor via execSync | RESOLVED — uses execFileSync with array args |
| TD-005 | Symlink Attack Vulnerability | RESOLVED — isSymlink() check at all 18+ write sites |
| TD-006 | Brainstorm Command Not Documented | RESOLVED — added to all 4 reference files |
| TD-007 | Hardcoded Utility Command List | RESOLVED — convention-based detection |
| TD-009 | Missing Input Validation on Project Name | RESOLVED — validateProjectName() with regex |
| TD-011 | Version Comparison Uses String Equality | RESOLVED — isNewerVersion() semver comparison |
| TD-012 | Package.json Missing Metadata | RESOLVED — scripts.test and main fields added |
| TD-013 | Template Token Replacement Duplicated | RESOLVED — applyTokens() helper extracted |

---

## High Priority
Items that should be addressed in the next 1-2 milestones.

### TD-003: No Test Coverage (STILL OPEN — original scan)
- **Category**: quality
- **Severity**: HIGH
- **Location**: Project-wide
- **Description**: Zero test files exist. `package.json` has `"test": "node --test"` but no test files. The CLI has 52+ functions across 1300 lines with zero automated tests.
- **Impact**: Regressions go undetected. Refactoring is risky. Every code change is validated only by manual testing.
- **Remediation**: Add test suite using Node.js built-in test runner. Target 20+ tests covering: install, update, init, status, doctor, uninstall, and all helper functions.
- **Effort**: medium
- **Milestone candidate**: YES — standalone milestone
- **Promoted**: [ ]

### TD-014: Backlog File Format Drift from Contract — RESOLVED
- **Resolution**: Reformatted backlog.md to match contract (integer positions, App field, pipe-delimited metadata). Fixed 2026-02-18.

### TD-015: Progress.md Format Drift from Contract — RESOLVED
- **Resolution**: Fixed header order (Project/Version/Status/Date), removed # column from milestones table, added ## Blockers section. Fixed 2026-02-18.

### TD-016: 7 Backlog Commands Missing from GSD-T-README — RESOLVED
- **Resolution**: Added Backlog Management section with all 7 commands to GSD-T-README.md. Fixed 2026-02-18.

### TD-017: doUpdateAll() No Per-Project Error Isolation
- **Category**: quality
- **Severity**: HIGH
- **Location**: `bin/gsd-t.js` lines 936-961
- **Description**: `doUpdateAll()` iterates registered projects but a throw in any project's update (e.g., permission denied on CLAUDE.md) aborts remaining projects. Also 78 lines without sub-extraction.
- **Impact**: One bad project kills updates for all other projects.
- **Remediation**: Wrap per-project iteration in try/catch. Extract `updateSingleProject()` helper.
- **Effort**: small
- **Milestone candidate**: NO — fold into quality improvements
- **Promoted**: [ ]

---

## Medium Priority
Items to plan for but not urgent.

### TD-018: Heartbeat JSONL Files Not in .gitignore — RESOLVED
- **Resolution**: Added pattern to .gitignore, removed 2 tracked files with git rm --cached. Fixed 2026-02-18.

### TD-019: Heartbeat Sensitive Data in Bash Commands
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-heartbeat.js` lines 85-186
- **Description**: Heartbeat logs first 150 chars of bash commands which may contain passwords, tokens, or secrets. Also logs WebFetch URLs (may have auth tokens in query strings).
- **Impact**: Sensitive data in heartbeat files. Mitigated by 7-day auto-cleanup and project-local storage.
- **Remediation**: Scrub common secret patterns (--password, --token, API_KEY=) before logging. Mask URL query parameters.
- **Effort**: small-medium
- **Milestone candidate**: NO — fold into security improvements
- **Promoted**: [ ]

### TD-020: npm-update-check.js Arbitrary Path Write
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/npm-update-check.js` lines 11-12, 22
- **Description**: Cache file path from `process.argv[2]` is used without validation. Could write JSON to any user-writable file. Low practical risk since caller always passes hardcoded path.
- **Remediation**: Validate path is within `~/.claude/` directory before writing.
- **Effort**: small
- **Milestone candidate**: NO — fold into security improvements
- **Promoted**: [ ]

### TD-021: 13 Functions Exceed 30-Line Limit
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `bin/gsd-t.js` (13 functions), `scripts/gsd-t-heartbeat.js` (2 functions)
- **Description**: Project convention requires functions under 30 lines. 13 functions in the CLI exceed this: doStatus (98), doUpdateAll (78), checkDoctorInstallation (52), initGsdtDir (50), doInit (47), checkForUpdates (45), configureHeartbeatHooks (42), installGlobalClaudeMd (41), doUninstall (39), doInstall (37), updateProjectClaudeMd (34), hasSwagger (32), installCommands (30). Plus buildEvent (69) in heartbeat.
- **Impact**: Harder to test, maintain, and understand.
- **Remediation**: Extract sub-functions from the largest offenders (doStatus, doUpdateAll, checkDoctorInstallation).
- **Effort**: medium
- **Milestone candidate**: NO — fold into quality improvements
- **Promoted**: [ ]

### TD-022: Stale Command Counts Across Reference Files — RESOLVED
- **Resolution**: All reference files updated to 42 total (38 GSD-T + 4 utility) during scan living doc updates. Fixed 2026-02-18.

### TD-023: CLAUDE.md Version/Count Drift — RESOLVED
- **Resolution**: CLAUDE.md updated to 42/38 counts and v2.21.1 version during scan. Fixed 2026-02-18.

### TD-024: Heartbeat Cleanup Runs on Every Event
- **Category**: performance
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-heartbeat.js` line 57
- **Description**: `cleanupOldHeartbeats()` calls `readdirSync` + multiple `lstatSync` on every hook event. PostToolUse fires hundreds of times per session, each triggering full directory scan.
- **Impact**: Unnecessary filesystem overhead on every Claude Code tool invocation.
- **Remediation**: Only run cleanup on `SessionStart` events instead of every event.
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-025: Missing .gitattributes and .editorconfig (TD-008 follow-up)
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: Project root
- **Description**: No `.gitattributes` or `.editorconfig` to enforce line ending consistency. JS files use CRLF (Windows origin). Contributors on macOS/Linux will create LF files. `normalizeEol()` mitigates functional impact but not git noise.
- **Impact**: Noisy git diffs when cross-platform contributors edit files.
- **Remediation**: Add `.gitattributes` with `* text=auto` and `.editorconfig` with `end_of_line = lf`.
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

---

## Low Priority
Nice-to-haves and cleanup.

### TD-026: npm-update-check.js Missing Symlink Check
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/npm-update-check.js` line 22
- **Description**: `writeFileSync(cacheFile, ...)` does not check if cache file is a symlink. Main CLI has symlink protection but background script does not.
- **Effort**: small
- **Promoted**: [ ]

### TD-027: Unbounded HTTP Response in Update Fetch
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 1169, `scripts/npm-update-check.js` line 16-17
- **Description**: Both update fetch paths accumulate full HTTP response without size limit. Timeout mitigation limits attack window.
- **Effort**: small
- **Promoted**: [ ]

### TD-028: ensureDir Does Not Validate Parent Symlinks
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` lines 102-112
- **Description**: Checks target dir for symlink but not parent path components. If `~/.claude` were a symlink, mkdirSync would follow it.
- **Effort**: small
- **Promoted**: [ ]

### TD-029: TOCTOU Race in Symlink Check + Write
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 114-120 and all callers
- **Description**: Time-of-check-time-of-use gap between `isSymlink()` and `writeFileSync`. Requires local access and precise timing to exploit.
- **Effort**: medium
- **Promoted**: [ ]

### TD-030: discuss/impact Missing Autonomy Behavior Sections
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-discuss.md`, `commands/gsd-t-impact.md`
- **Description**: These wave-phase commands lack the explicit `### Autonomy Behavior` section that other phase commands have. Discuss mentions pausing inline but doesn't follow the standard format.
- **Effort**: small
- **Promoted**: [ ]

### TD-031: Fractional Step Numbering in 11 Command Files
- **Category**: quality
- **Severity**: LOW
- **Location**: `gsd-t-milestone.md`, `gsd-t-partition.md`, `gsd-t-plan.md`, `gsd-t-init.md`, `gsd-t-complete-milestone.md`, `gsd-t-integrate.md`, `gsd-t-impact.md`, `gsd-t-scan.md`, `gsd-t-promote-debt.md`, `gsd-t-project.md`, `gsd-t-feature.md`
- **Description**: Steps like `Step 4.5`, `Step 5.5`, `Step 7.7` indicate incremental additions without renumbering.
- **Effort**: small
- **Promoted**: [ ]

### TD-032: buildEvent() 69 Lines in Heartbeat
- **Category**: quality
- **Severity**: LOW
- **Location**: `scripts/gsd-t-heartbeat.js` lines 85-155
- **Description**: Long switch statement mapping 9 hook events. Each case is simple but function exceeds 30-line limit.
- **Effort**: small
- **Promoted**: [ ]

### TD-033: Code Duplication Patterns
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js`
- **Description**: Three duplication patterns: (1) hasSwagger/hasApi share package.json parsing, (2) JSON.parse(settingsJson) repeated 3 times, (3) template-write-or-skip pattern repeated in 3 init functions.
- **Effort**: small-medium
- **Promoted**: [ ]

### TD-034: checkForUpdates Inline JS Fragile
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` line 1169
- **Description**: Contains inline JavaScript as a string literal executed via execFileSync. Hard to read, impossible to unit test, fragile.
- **Effort**: small
- **Promoted**: [ ]

---

## Dependency Updates
No npm dependencies — nothing to update. Zero supply chain attack surface.

---

## Suggested Tech Debt Milestones

### Suggested: Testing Foundation (High)
Combines: TD-003
Estimated effort: 2 sessions
Should be prioritized: BEFORE next feature milestone
Description: Add Node.js built-in test runner suite. 20+ tests covering CLI subcommands, helper functions, detection functions, and integration paths.

### COMPLETED: Contract & Doc Alignment (High) — 2026-02-18
Resolved: TD-014, TD-015, TD-016, TD-018, TD-022, TD-023

### Suggested: Security Hardening (Medium)
Combines: TD-019, TD-020, TD-026, TD-027, TD-028
Estimated effort: 1 session
Can be scheduled: BEFORE next npm publish
Description: Bash command scrubbing, npm-update-check path validation, symlink checks, HTTP response limits.

### Suggested: CLI Quality Improvement (Medium)
Combines: TD-017, TD-021, TD-024, TD-025, TD-033, TD-034
Estimated effort: 1-2 sessions
Can be scheduled: AFTER contract alignment
Description: Per-project error isolation, function decomposition, heartbeat perf fix, .gitattributes, deduplication, inline JS extraction.

### Suggested: Command File Cleanup (Low)
Combines: TD-030, TD-031, TD-032
Estimated effort: 0.5 session
Can be scheduled: During next maintenance window
Description: Add Autonomy Behavior sections, renumber fractional steps, refactor buildEvent.

---

## Scan Metadata
- Scan date: 2026-02-18
- Previous scan: 2026-02-07
- Files analyzed: 94 tracked files
- Lines of code: ~1,530 JS + ~10,000+ markdown
- Languages: JavaScript, Markdown
- Scan mode: Team (5 parallel agents: architecture, business-rules, security, quality, contracts)
- Previous items resolved: 9 of 13
- New items found: 21
- Total open items: 15 (0 critical, 1 high, 5 medium, 9 low) — 7 resolved by Contract & Doc Alignment milestone
