# Tech Debt Register — 2026-02-18

## Summary
- Critical items: 0
- High priority: 1 (TD-066: untestable new scripts)
- Medium priority: 5 (TD-067 through TD-071: contract drift + doc staleness + security)
- Low priority: 7 (TD-072 through TD-079: cleanup)
- Total open items: 13 (TD-079 addressed in this scan's doc updates)
- Accepted risk: 1 (TD-029 TOCTOU)
- **Trend: Scan #6 post-M10-M13. 14 new items from 4 milestones of feature work. No critical items. Main concern: new scripts (gsd-t-tools, gsd-t-statusline) are untestable without module.exports changes.**

### Scan History
- **Scan #1** (2026-02-07): 13 items found, 9 resolved
- **Scan #2** (2026-02-18): 22 items total, 6 resolved via Contract & Doc Alignment milestone
- **Scan #3** (2026-02-18): 15 items from scan #2 still open, 1 regressed (TD-022), 1 worsened (TD-031), 10 new items found. Total open: 26
- **Milestone 5** (2026-02-18): 6 items resolved via Security Hardening (TD-019, TD-020, TD-026, TD-027, TD-028, TD-035)
- **Milestone 6** (2026-02-19): 7 items resolved via CLI Quality Improvement (TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034)
- **Milestone 7** (2026-02-19): 8 items resolved via Command File Cleanup (TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041)
- **Scan #4** (2026-02-18): 25 of 26 previous items resolved. TD-029 still open. 12 new items found. Total open: 13
- **Milestone 8** (2026-02-18): 12 items resolved via Housekeeping + Contract Sync (TD-044, TD-045, TD-046, TD-047, TD-048, TD-049, TD-050, TD-051, TD-052, TD-053, TD-054, TD-055). TD-029 accepted as risk. Total open: 0
- **Scan #5** (2026-02-18): 0 previous items open. 10 new LOW items found (7 quality, 1 security, 2 contract drift). Total open: 10
- **Milestone 9** (2026-02-18): 10 items resolved via Cleanup Sprint (TD-056, TD-057, TD-058, TD-059, TD-060, TD-061, TD-062, TD-063, TD-064, TD-065). Total open: 0
- **Milestones 10-13** (2026-02-18): Token Efficiency, Execution Quality, Planning Intelligence, Tooling & UX. Zero open debt going in. 14 new items discovered post-scan.
- **Scan #6** (2026-02-18): 0 previous items open. 14 new items (TD-066 through TD-079): 0 critical, 1 high, 5 medium, 7 low. Post-M10-M13 analysis.

---

## Resolved Items

| ID | Title | Resolution |
|----|-------|------------|
| TD-001 | 25 of 26 Command Files Missing | RESOLVED — all commands present |
| TD-002 | Command Injection in Doctor via execSync | RESOLVED — uses execFileSync with array args |
| TD-003 | No Test Coverage | RESOLVED — 116 tests in 4 files, all passing (M4) |
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
| TD-019 | Heartbeat Sensitive Data in Bash Commands | RESOLVED — scrubSecrets() + scrubUrl() with 27 tests (M5) |
| TD-020 | npm-update-check.js Arbitrary Path Write | RESOLVED — validates cache path within ~/.claude/ (M5) |
| TD-022 | Stale Command Counts — REGRESSED | RESOLVED — all counts correct at 43/39/4 across all files (M3) |
| TD-023 | CLAUDE.md Version Drift | PARTIALLY RESOLVED — counts fixed, version reference stale (tracked as TD-048) |
| TD-024 | Heartbeat Cleanup Runs on Every Event | RESOLVED — only fires on SessionStart (M6) |
| TD-025 | Missing .gitattributes and .editorconfig | RESOLVED — both exist with correct settings (M6) |
| TD-026 | npm-update-check.js Missing Symlink Check | RESOLVED — lstatSync before writeFileSync (M5) |
| TD-027 | Unbounded HTTP Response in Update Fetch | RESOLVED — 1MB limit in all fetch paths (M5) |
| TD-028 | ensureDir Does Not Validate Parent Symlinks | RESOLVED — hasSymlinkInPath() walks parents (M5) |
| TD-030 | discuss/impact Missing Autonomy Behavior | RESOLVED — sections added to both commands (M7) |
| TD-031 | Fractional Step Numbering — WORSENED | RESOLVED — 85 steps renumbered across 17 files, zero fractional (M7) |
| TD-032 | buildEvent() 69 Lines in Heartbeat | RESOLVED — handler map pattern, 5 lines (M6) |
| TD-033 | Code Duplication Patterns (3 types) | RESOLVED — readProjectDeps, writeTemplateFile, readPyContent extracted (M6). Note: DUP-002 (settings JSON 3x) tracked separately as TD-050 |
| TD-034 | checkForUpdates Inline JS Fragile | RESOLVED — extracted to gsd-t-fetch-version.js (M6) |
| TD-035 | Wave bypassPermissions Security Documentation | RESOLVED — Security section in wave + README (M5) |
| TD-036 | QA Agent Unrestricted Test Execution Scope | RESOLVED — file-path boundary CAN/MUST NOT lists (M7) |
| TD-037 | Wave State Handoff No Integrity Verification | RESOLVED — three-field integrity check in wave Step 1 (M7) |
| TD-038 | QA Agent Missing Document Ripple Section | RESOLVED — Document Ripple section added (M7) |
| TD-039 | Inconsistent QA Blocking Language | RESOLVED — standardized across all 10 QA-spawning commands (M7) |
| TD-040 | QA Agent Test Framework Assumption | RESOLVED — multi-framework detection + generation table (M7) |
| TD-041 | Wave Discuss-Skip Heuristic Subjective | RESOLVED — structured three-condition deterministic check (M7) |
| TD-042 | QA Agent Contract Missing test-sync Phase | RESOLVED — During Test-Sync section + contract updated (M3) |
| TD-043 | Orphaned Domain Files Not Archived | RESOLVED — archived to milestones/ (M3) |
| TD-044 | progress.md Status Value Not Recognized | RESOLVED — status now uses contract values (M8) |
| TD-045 | CHANGELOG.md Missing M4-M7 Entries | RESOLVED — v2.23.1-v2.24.3 entries added (M8) |
| TD-046 | Orphaned Domain Files from M6/M7 | RESOLVED — deleted during M8 partition (M8) |
| TD-047 | progress-file-format Contract Needs Enrichment | RESOLVED — enriched format documented in contract (M8) |
| TD-048 | CLAUDE.md Version Reference Stale | RESOLVED — removed hardcoded version, references package.json (M8) |
| TD-049 | .gitattributes LF Not Applied | RESOLVED — git add --renormalize applied (M8) |
| TD-050 | Settings JSON Parsed 3 Times | RESOLVED — readSettingsJson() helper extracted (M8) |
| TD-051 | Missing prepublishOnly Script | RESOLVED — prepublishOnly: npm test added (M8) |
| TD-052 | Notification Messages Unfiltered | RESOLVED — scrubSecrets() applied to notification messages (M8) |
| TD-053 | wave-phase-sequence Contract Missing Additions | RESOLVED — integrity check + security documented (M8) |
| TD-054 | command-interface-contract.md Scope Mismatch | RESOLVED — renamed to backlog-command-interface.md (M8) |
| TD-055 | integration-points.md Stale Data | RESOLVED — updated to reflect current state (M8) |
| TD-056 | summarize() Case Fallthrough Opportunity | RESOLVED — combined Read/Edit/Write cases using fallthrough (M9) |
| TD-057 | PKG_EXAMPLES Dead Code | RESOLVED — removed unused constant (M9) |
| TD-058 | Dead Imports in test/cli-quality.test.js | RESOLVED — removed writeTemplateFile and showStatusVersion imports (M9) |
| TD-059 | readSettingsJson() Exported But Untested | RESOLVED — 3 tests added in cli-quality.test.js (M9) |
| TD-060 | shortPath() Exported But Untested | RESOLVED — 6 tests added in security.test.js (M9) |
| TD-061 | checkForUpdates() Redundant Condition | RESOLVED — simplified to direct if/else-if (M9) |
| TD-062 | techdebt.md SEC-N16 Note Factually Wrong | RESOLVED — corrected during scan #5 (M9) |
| TD-063 | Notification Title Unscrubbed (SEC-N17) | RESOLVED — scrubSecrets() applied to h.title (M9) |
| TD-064 | Wave Integrity Check Contract Divergence | RESOLVED — contract updated to match implementation (M9) |
| TD-065 | Duplicate Format Contracts | RESOLVED — deleted file-format-contract.md (M9) |

---

## High Priority
(No open items)

---

## Medium Priority
(No open items)

---

## Low Priority

### TD-029: TOCTOU Race in Symlink Check + Write — ACCEPTED RISK
- **Category**: security
- **Severity**: LOW
- **Status**: ACCEPTED RISK (M8)
- **Location**: `bin/gsd-t.js` line 118-137 and all callers
- **Description**: Time-of-check-time-of-use gap between `isSymlink()` and `writeFileSync()`. An attacker could replace a regular file with a symlink in the microsecond window between check and write.
- **Impact**: Theoretical — requires local access, precise timing, and race against single-threaded Node.js.
- **Rationale for acceptance**:
  1. Node.js is single-threaded — the window between `lstatSync` and `writeFileSync` is a single function call with no await/yield point
  2. This is a CLI installer running with user permissions, writing to user-owned directories (`~/.claude/`)
  3. On Windows (primary dev platform), creating symlinks requires admin privileges — the attacker would already have higher privileges than the user
  4. Node.js does not expose `O_NOFOLLOW` in a cross-platform way, so a true fix would require platform-specific code or a native addon, adding complexity with no practical security benefit
  5. The `isSymlink()` check catches the static case (symlink already exists), which is the realistic attack vector
- **Effort**: medium (for marginal benefit)
- **Promoted**: [x] Reviewed in M8, accepted as risk

(All other items resolved. See Resolved Items table above.)

---

## Informational Notes (No Action Required)

### SEC-N16: scrubSecrets Regex Global Flag — CORRECTED
- All 4 `scrubSecrets()` regex patterns (`SECRET_FLAGS`, `SECRET_SHORT`, `SECRET_ENV`, `BEARER_HEADER`) at lines 112-115 of `scripts/gsd-t-heartbeat.js` use the `/gi` flag (global + case-insensitive). Since they are only used with `String.prototype.replace()` (never `.test()` or `.exec()`), the mutable `lastIndex` state is not a concern. If future code calls `.test()` or `.exec()` on these regex objects, it could cause intermittent failures due to stateful `lastIndex` — a latent risk to be aware of but no action required today.

### SEC-N13/N14: gsd-t-fetch-version.js Validation
- The script doesn't validate HTTP status codes or version string format before outputting. However, the caller (`fetchVersionSync()` in bin/gsd-t.js) validates the response via `validateVersion()`, making this safe. No action required.

### SEC-N18: Prototype Pollution via EVENT_HANDLERS Lookup
- `EVENT_HANDLERS[hook.hook_event_name]` performs a property lookup using attacker-influenced input. If `hook_event_name` were `"__proto__"` or `"constructor"`, the lookup returns a truthy non-function value, but `handler(hook)` throws TypeError caught by outer try/catch. Fails safely — no exploit path, no state corruption.

### SEC-N19: Error Messages May Expose Path Information
- Several error handlers in `bin/gsd-t.js` expose `e.message` in console output, which can include full file paths. Standard CLI error reporting behavior — output goes to user's own terminal, not shared files or network.

---

## Dependency Updates
No npm dependencies — nothing to update. Zero supply chain attack surface.

---

## Promoted Milestones

All previous promotions are from scan #3 era. All have been completed.

### COMPLETED: Count Fix + QA Contract Alignment → Milestone 3 (v2.23.1)
Items: TD-022, TD-042, TD-043

### COMPLETED: Testing Foundation → Milestone 4 (v2.24.0)
Items: TD-003

### COMPLETED: Security Hardening → Milestone 5 (v2.24.1)
Items: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035

### COMPLETED: CLI Quality Improvement → Milestone 6 (v2.24.2)
Items: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034

### COMPLETED: Command File Cleanup → Milestone 7 (v2.24.3)
Items: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041

### COMPLETED: Housekeeping + Contract Sync → Milestone 8 (v2.24.4)
Items: TD-044, TD-045, TD-046, TD-047, TD-048, TD-049, TD-050, TD-051, TD-052, TD-053, TD-054, TD-055
TD-029 accepted as risk (see Low Priority section).

---

## Suggested Tech Debt Milestones

### COMPLETED: Cleanup Sprint → Milestone 9 (v2.24.5)
Items: TD-056, TD-057, TD-058, TD-059, TD-060, TD-061, TD-062, TD-063, TD-064, TD-065

---

## Suggested Tech Debt Milestones

(No open items from scan #5. All tech debt from M1-M9 resolved.)

---

## Scan #6 Findings — Post-M10-M13 (2026-02-18)

**Scan #6 Summary:**
- Scan date: 2026-02-18
- Version: 2.28.10
- Previous open items: 0 (all resolved after M9)
- New items found: 13 (0 critical, 1 high, 5 medium, 7 low)
- Items from previous scans that regressed: 0
- Test baseline: 125/125 passing

---

## High Priority (Scan #6)

### TD-066: gsd-t-tools.js and gsd-t-statusline.js have no module.exports — untestable
- **Category**: quality
- **Severity**: HIGH
- **Location**: `scripts/gsd-t-tools.js`, `scripts/gsd-t-statusline.js`
- **Description**: Both new scripts added in M13 execute immediately when required (no require.main guard, no module.exports). This is inconsistent with all other scripts (bin/gsd-t.js has 54 exports, gsd-t-heartbeat.js has 5 exports). gsd-t-tools.js contains state-mutating functions (stateSet writes to progress.md) that have zero test coverage as a result. gsd-t-statusline.js contains display logic (contextBar color thresholds) that is untested.
- **Impact**: stateSet corrupts progress.md with no regression safety net. Any bug in the 12 functions of gsd-t-tools.js or 4 functions of gsd-t-statusline.js will not be caught by the test suite.
- **Remediation**: Add `if (require.main === module) { /* CLI dispatch */ }` guard and `module.exports = { ... }` at bottom of both files. Add test file `test/tools.test.js` with ~20 tests covering all exported functions.
- **Effort**: medium
- **Milestone candidate**: YES — fold into a "Script Testability" milestone or standalone small milestone
- **Promoted**: [ ]

---

## Medium Priority (Scan #6)

### TD-067: qa-agent-contract.md still lists partition and plan as QA phases (M10 regression)
- **Category**: quality (contract drift)
- **Severity**: MEDIUM
- **Location**: `.gsd-t/contracts/qa-agent-contract.md` lines 12 and output table
- **Description**: M10 removed QA agent spawning from partition and plan phases. The qa-agent-contract.md still lists "partition" and "plan" in the phase context input and output table. Contract and reality conflict.
- **Impact**: Any agent reading the contract to understand QA behavior will expect QA output from partition/plan that never arrives. Creates confusion and may cause wave-level validation checks to wait for QA output that never comes.
- **Remediation**: Remove "partition" and "plan" from the phase context list (line 12) and mark those rows in the output table as "removed in M10". Update "Consumers" section to reflect current 8-phase list.
- **Effort**: small
- **Milestone candidate**: NO — fold into next housekeeping milestone
- **Promoted**: [ ]

### TD-068: Living docs not updated after M10-M13 (4 docs, major staleness)
- **Category**: quality (documentation)
- **Severity**: MEDIUM
- **Location**: `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `docs/requirements.md`
- **Description**: All four living docs still show "Last Updated: Post-M9" or "Scan #5". Four complete milestones of work (M10-M13) are entirely absent from living documentation. Missing: gsd-t-tools.js, gsd-t-statusline.js in architecture.md and infrastructure.md; CONTEXT.md flow and continue-here flow in workflows.md; wave groupings, deferred-items.md, spot-check in workflows.md and architecture.md; updated command count (43→45) in architecture.md; updated test count (116→125) in infrastructure.md.
- **Impact**: Violates the "No Re-Research" rule — agents reading living docs for context get stale information and may make incorrect decisions. The docs scan produced by this scan (Step 5) will fix this.
- **Remediation**: Update all four docs as part of this scan's Step 5. (Scheduled: done in this scan.)
- **Effort**: small
- **Milestone candidate**: NO — addressed in this scan's Step 5
- **Promoted**: [ ]

### TD-069: wave-phase-sequence.md missing M11/M12 additions (spot-check, CONTEXT.md)
- **Category**: quality (contract drift)
- **Severity**: MEDIUM
- **Location**: `.gsd-t/contracts/wave-phase-sequence.md`
- **Description**: Three significant wave behaviors added in M11-M12 are not documented in the contract: (1) Between-phase spot-check (M11) — 3-field verification after each phase agent completes; (2) Per-task commit requirement (M11) — feat({domain}/task-{N}) format; (3) CONTEXT.md as discuss→plan state handoff (M12). The contract accurately describes M7 additions (integrity check, discuss-skip heuristic) but stops there.
- **Impact**: Agents reading the contract to understand wave behavior miss critical M11-M12 features.
- **Remediation**: Add "Spot-Check (M11)" section documenting the 3 fields and re-spawn behavior. Add "Per-Task Commits (M11)" to Execute phase definition. Add "State Handoff: CONTEXT.md (M12)" to the Discuss→Plan transition.
- **Effort**: small
- **Milestone candidate**: NO — fold into next housekeeping milestone
- **Promoted**: [ ]

### TD-070: progress-file-format contract missing M11-M13 state artifacts
- **Category**: quality (contract drift)
- **Severity**: MEDIUM
- **Location**: `.gsd-t/contracts/progress-file-format.md`
- **Description**: Three new state files introduced in M11-M13 are not described in the progress-file-format contract: (1) `.gsd-t/deferred-items.md` (M11) — log of unresolved issues from execute/quick/debug; (2) `.gsd-t/CONTEXT.md` (M12) — discuss phase output with Locked Decisions; (3) `.gsd-t/continue-here-{timestamp}.md` (M13) — pause/resume checkpoint files. None have documented format contracts or lifecycle rules.
- **Impact**: Tool authors and agents have no authoritative format reference for these new files. gsd-t-health.md doesn't check for them. No cleanup rules defined.
- **Remediation**: Add sections to progress-file-format.md documenting each file's format, who creates it, who reads it, and when it should be deleted.
- **Effort**: small
- **Milestone candidate**: NO — fold into next housekeeping milestone
- **Promoted**: [ ]

### TD-071: gsd-t-tools.js stateSet() allows markdown structure injection
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-tools.js` line 43
- **Description**: `stateSet(key, value)` writes value directly into progress.md without sanitizing newlines. A value containing `\n## Section\n` successfully injects a new markdown section, corrupting the file structure. Verified with Node.js test. See security.md SEC-N20 for details.
- **Impact**: Corrupted progress.md causes all GSD-T commands that read state to malfunction. In a pipeline that calls gsd-t-tools.js with user-controlled input, this is exploitable.
- **Remediation**: Add `value = String(value).replace(/[\r\n]/g, ' ')` before the replace operation in stateSet. Add test to verify newlines are stripped.
- **Effort**: small
- **Milestone candidate**: NO — fold into security-focused item in next milestone
- **Promoted**: [ ]

---

## Low Priority (Scan #6)

### TD-072: gsd-t-tools.js templateScope/templateTasks lack path traversal validation
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/gsd-t-tools.js` lines 111-121
- **Description**: domain argument used directly in path.join without validating it stays within .gsd-t/domains/. See SEC-N21.
- **Impact**: Low — requires malicious caller. path.join normalizes traversal but doesn't block it entirely.
- **Remediation**: Add `if (!p.startsWith(path.join(gsdDir, 'domains'))) return { error: 'Invalid domain name' }`
- **Effort**: small
- **Milestone candidate**: NO — fold into next security item
- **Promoted**: [ ]

### TD-073: gsd-t-tools.js uses execSync instead of execFileSync
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/gsd-t-tools.js` lines 92, 97, 104
- **Description**: preCommitCheck() uses execSync with hardcoded strings. Consistent with main codebase pattern would be execFileSync with array args. See SEC-N22.
- **Impact**: Low — no user input in current command strings. Risk is future cargo-culting.
- **Remediation**: Replace with execFileSync(['git', 'branch', '--show-current'], ...).
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

### TD-074: gsd-t-tools.js findProjectRoot() returns cwd on failure (inconsistent with statusline)
- **Category**: quality
- **Severity**: LOW
- **Location**: `scripts/gsd-t-tools.js` line 16
- **Description**: Falls back to process.cwd() when no .gsd-t/ found. gsd-t-statusline.js correctly returns null. Operations run silently in wrong directory. See SEC-N23 and AC-2.
- **Impact**: Low — developer tool; user would notice empty state results.
- **Remediation**: Return null; add null check at call site with clear error JSON.
- **Effort**: small
- **Milestone candidate**: NO — fold into TD-066 fix (add module.exports + fix this simultaneously)
- **Promoted**: [ ]

### TD-075: deferred-items.md not initialized by gsd-t-init or checked by gsd-t-health
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`
- **Description**: All three commands reference .gsd-t/deferred-items.md as a log file for unresolved issues. This file is created ad-hoc by wave agents but never by gsd-t-init, not listed in gsd-t-health checks, and has no documented format contract.
- **Impact**: Orphaned file with no cleanup mechanism. No format defined, so tooling can't parse it.
- **Remediation**: (1) Add deferred-items.md to gsd-t-init template creation; (2) add to gsd-t-health checks; (3) add format spec to progress-file-format.md (consolidate with TD-070).
- **Effort**: small
- **Milestone candidate**: NO — fold into TD-070
- **Promoted**: [ ]

### TD-076: gsd-t-health --repair assumes templates exist without checking
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-health.md` Step 5
- **Description**: Repair reads from templates/ without first verifying they exist. A partial install could produce empty or missing template reads that fail silently.
- **Impact**: Low — partial installs are rare. gsd-t-install or doctor would catch this first.
- **Remediation**: Add template existence check before repair; suggest `gsd-t install` if missing.
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

### TD-077: continue-here files accumulate without cleanup
- **Category**: quality
- **Severity**: LOW
- **Location**: `commands/gsd-t-pause.md`, `commands/gsd-t-resume.md`, `commands/gsd-t-health.md`
- **Description**: Multiple /pause invocations without /resume create multiple continue-here files. gsd-t-health does not flag orphaned continue-here files. gsd-t-resume reads only the most recent.
- **Impact**: Low — cosmetic issue. Developer must manually delete stale files.
- **Remediation**: (1) Add .gsd-t/continue-here-*.md glob check to gsd-t-health; (2) warn if >1 file exists; (3) optionally clean up in gsd-t-resume after consumption.
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

### TD-078: Doctor does not check utility scripts are installed
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` — checkDoctorInstallation()
- **Description**: checkDoctorInstallation() verifies command files are installed but does not check that gsd-t-tools.js and gsd-t-statusline.js are in ~/.claude/scripts/. If the scripts directory is missing these files (partial install, manual cleanup), doctor reports PASS incorrectly.
- **Impact**: Low — installUtilityScripts() is called during install and update, so this only affects unusual partial-install scenarios.
- **Remediation**: Add check for each UTILITY_SCRIPTS file in checkDoctorInstallation().
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

### TD-079: docs/infrastructure.md stale command and test counts
- **Category**: quality
- **Severity**: LOW
- **Location**: `docs/infrastructure.md` line 43
- **Description**: "ls commands/*.md | wc -l  # Should be 43" — actual is 45. Test count in Testing section shows 116 — actual is 125. gsd-t-tools.js and gsd-t-statusline.js not in Scripts table.
- **Impact**: Low — developer reference doc; confusing for new contributors.
- **Remediation**: Update counts and add new scripts to table. (Addressed in this scan's Step 5.)
- **Effort**: small
- **Milestone candidate**: NO — addressed in this scan's Step 5
- **Promoted**: [ ]

### TD-080: Log file archiving and summarization not implemented
- **Category**: quality
- **Severity**: LOW
- **Location**: `.gsd-t/token-log.md`, `.gsd-t/qa-issues.md`
- **Description**: `token-log.md` and `qa-issues.md` grow unboundedly — every Task subagent call appends a row. There is no mechanism to rotate, archive, or summarize these logs when they become large. Over a long-lived project, these files could accumulate thousands of rows, making them unwieldy to read or diff.
- **Impact**: Low currently (new feature), but grows over time. Large log files slow context loading and git diffs.
- **Remediation**: Add to `gsd-t-complete-milestone`: (1) archive current log contents to `.gsd-t/milestones/{name}/token-log-{date}.md` and `.gsd-t/milestones/{name}/qa-issues-{date}.md`, (2) reset log files to header-only, (3) optionally produce a summary (top commands by duration, top qa issue categories). Consider adding a `gsd-t-tools.js logs summary` subcommand that reads both files and outputs aggregate stats.
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

---

## Scan #6 Metadata

- Scan date: 2026-02-18
- Version scanned: 2.28.10
- Previous scan: Scan #5 at v2.24.4 (2026-02-18)
- Files analyzed: 6 JS files (bin/gsd-t.js: 1,438 lines, scripts/gsd-t-heartbeat.js: 180 lines, scripts/npm-update-check.js: 43 lines, scripts/gsd-t-fetch-version.js: 26 lines, scripts/gsd-t-tools.js: 163 lines NEW, scripts/gsd-t-statusline.js: 94 lines NEW), 45 command files, 9 templates, 8 contracts, docs, tests
- Lines of code: ~1,944 JS + ~14,000+ markdown (est.)
- Languages: JavaScript, Markdown
- Scan mode: Lead agent with parallel analysis (5 dimensions)
- Total functions: 87 (bin/gsd-t.js) + 6 (heartbeat) + 12 (gsd-t-tools) + 4 (gsd-t-statusline) = 109 total, all ≤ 30 lines
- Total tests: 125 (27 helpers + 37 filesystem + 36 security + 25 cli-quality)
- New items found: 14 (TD-066 through TD-079)
- Critical: 0, High: 1, Medium: 5, Low: 7 (including TD-079 addressed in this scan)

### Updated Trend Analysis

| Metric | Scan #1 | Scan #5 | Post-M9 | Scan #6 | Trend |
|--------|---------|---------|---------|---------|-------|
| Open items | 13 | 10 | 0 | 14 | New items from M10-M13 |
| Critical items | 2 | 0 | 0 | 0 | Stable (good) |
| HIGH items | 3 | 0 | 0 | 1 | gsd-t-tools testability |
| MEDIUM items | 4 | 0 | 0 | 5 | Contracts + docs + security |
| LOW items | 4 | 10 | 0 | 7 | Cleanup items |
| Functions > 30 lines | 13 | 0 | 0 | 0 | Stable |
| Test files | 0 | 4 (116 tests) | 4 (125 tests) | 4 (125 tests) | Stable |
| New JS scripts without tests | 0 | 0 | 0 | 2 | gsd-t-tools, gsd-t-statusline |
| Contract drift items | N/A | 2 | 0 | 4 | M10-M13 not reflected |
| Security (open actionable) | 5 | 0 (1 accepted) | 0 (1 accepted) | 2 (+ 1 accepted) | stateSet injection + traversal |
