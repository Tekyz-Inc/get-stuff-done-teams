# Tech Debt Register — Updated 2026-03-19 (Scan #10)

## Summary (Current — post Scan #10)
- Critical items: 1 (TD-097)
- High priority: 3 (TD-081, TD-082, TD-083) — carried
- Medium priority: 13 (TD-066–071, TD-084–089, TD-095, TD-098)
- Low priority: 18 (TD-072–080, TD-090–094, TD-096, TD-099, TD-100, TD-101)
- Total open items: 35
- Accepted risk: 1 (TD-029 TOCTOU)
- **Trend (Scan #10): Post-M20/M21 (Graph Engine). 6 new files (1,726 lines), 70 new tests, 3 new test files. 1 NEW CRITICAL: command injection in graph-query.js grep fallback (TD-097/SEC-C01). 3 new items total (1 critical, 1 medium, 2 low). Graph-enhanced scan found issues grep-only missed: SEC-C01 injection, absolute-path contract violation, worktree contamination in CGC indexing. Cleanup sprint overdue — 35 open items.**

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
- **Milestones 14-17** (2026-03-04 to 2026-03-09): Real-Time Agent Dashboard, Execution Intelligence Layer, Scan Visual Output. 15 new debt items discovered.
- **Scan #7** (2026-03-09): 15 items carried from Scan #6. 14 new items (TD-080 through TD-094): 0 critical, 3 high, 7 medium, 5 low. Post-M14-M17. Total open: 29.
- **Scan #8** (2026-03-09): 29 carried. 2 new items (TD-095, TD-096 — dashboard CDN security). Total open: 31.
- **Scan #9** (2026-03-09): 31 carried. 0 new items (no code changes since Scan #8). Total open: 31.
- **Milestones 20-21** (2026-03-18 to 2026-03-19): Graph Engine + Graph-Powered Commands. 6 new files, 70 new tests, 21 commands enhanced with graph queries.
- **Scan #10** (2026-03-19): 31 carried. 4 new items (TD-097 through TD-101): 1 critical, 0 high, 1 medium, 2 low. Graph-enhanced scan. Total open: 35.

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

---

## Scan #9 Findings — Post-M17 + dashboard fix/revert (2026-03-09)

**Scan #9 Summary:**
- Scan date: 2026-03-09
- Version: 2.34.10
- Previous open items: 15 (TD-066 through TD-080 from Scans #6-8, all still unresolved)
- Commits since Scan #7/8: 2 (dashboard tooltip fix + revert — net zero functional change)
- New items found: 4 (TD-081 through TD-084)
- Items resolved: 0
- Test baseline: 205/205 passing

---

## Medium Priority (Scan #9)

### TD-081: gsd-t-dashboard.html loads 5 CDN resources without SRI hashes — supply chain risk
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-dashboard.html` lines 6-10
- **Description**: The dashboard HTML loads React 17, ReactDOM 17, dagre 0.8.5, ReactFlow 11.11.4, and ReactFlow CSS from `https://unpkg.com` without Subresource Integrity (SRI) hashes. A compromise of any of these npm packages on unpkg would execute arbitrary JS in the dashboard browser tab with full DOM access to the SSE event stream (containing agent reasoning, trace IDs, command names). This is architecturally inconsistent with scan-report.html which is fully self-contained.
- **Impact**: If any of the 4 library npm packages are compromised, all GSD-T users who open the dashboard would run the malicious code.
- **Remediation**: (1) Add `integrity="sha384-..."` SRI attributes to all CDN `<script>` and `<link>` tags, OR (2) Bundle libraries inline (matching scan-report.html pattern), OR (3) Add `Content-Security-Policy` header in dashboard-server.js.
- **Effort**: medium (bundling), small (SRI hashes)
- **Milestone candidate**: YES — fold into a "Dashboard Security & Polish" milestone
- **Promoted**: [ ]

---

## Low Priority (Scan #9)

### TD-082: gsd-t-dashboard.html has no Content-Security-Policy
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard.html`, `scripts/gsd-t-dashboard-server.js`
- **Description**: The dashboard HTML page has no CSP meta tag and the server does not set a CSP response header. Without CSP, browser-side XSS vectors (if any) have no additional mitigation layer. React escapes template variables but the absence of CSP is a defense-in-depth gap.
- **Remediation**: Add `Content-Security-Policy` header in `gsd-t-dashboard-server.js` response.
- **Effort**: small
- **Milestone candidate**: NO — fold into TD-081 remediation
- **Promoted**: [ ]

### TD-083: Dashboard tooltip hidden behind sidebar — UX bug, fix was reverted
- **Category**: quality (UX)
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard.html`
- **Description**: The node hover tooltip in the agent graph uses CSS `position:fixed` and can be obscured by the sidebar when hovering nodes near the right edge. A fix was attempted (commit d4567cf: React portal to render tooltip above sidebar z-index layer) but was reverted (commit 3daeebb). The revert reason is unrecorded. The UX defect remains in the shipped code.
- **Impact**: Low — tooltip is inaccessible for some graph nodes near the sidebar. No functional regression, only UX.
- **Remediation**: Re-implement tooltip fix using a different approach (e.g., absolute-position tooltip within graph container, or z-index elevation on .gsd-t CSS class).
- **Effort**: small
- **Milestone candidate**: NO — fold into next dashboard polish sprint
- **Promoted**: [ ]

### TD-084: gsd-t-dashboard.html React app has no automated UI tests
- **Category**: quality
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard.html`, `test/`
- **Description**: The 199-line React application (event feed, agent graph, SSE parsing, node rendering) has no automated test coverage beyond `dashboard-server.test.js` (which only tests that the server serves the HTML file correctly). The tooltip regression (TD-083) was caught only by manual testing. There are no Playwright or browser-based tests to catch UI regressions.
- **Impact**: Any future UI change could silently break rendering without any test failure. The test suite would pass even if the dashboard is completely broken.
- **Remediation**: Add a Playwright E2E test that: (1) starts the dashboard server, (2) opens the dashboard URL, (3) verifies the graph area renders, (4) optionally feeds a mock SSE event and verifies a node appears.
- **Effort**: medium
- **Milestone candidate**: NO — fold into "Dashboard Security & Polish" milestone with TD-081
- **Promoted**: [ ]

---

## Scan #9 Metadata

- Scan date: 2026-03-09
- Version scanned: 2.34.10
- Previous scan: Scan #7/8 at v2.34.10 (2026-03-09)
- Changes since last scan: 2 commits — gsd-t-dashboard.html fix + revert (net zero)
- Files analyzed: 9 JS files (bin/), 9 scripts (scripts/), 48 command files, 9 templates, 13 contracts, 8 test files
- Total tests: 205 passing
- New items found: 4 (TD-081 through TD-084) — 0 critical, 0 high, 1 medium, 3 low
- Items resolved: 0
- Previously open items carried: 15 (TD-066 through TD-080)
- Total open items: 19

### Updated Trend Analysis

| Metric | Scan #6 | Scan #7 | Scan #9 | Trend |
|--------|---------|---------|---------|-------|
| Open items | 14 | 15 | 19 | Accumulating (no cleanup milestones run since M9) |
| Critical items | 0 | 0 | 0 | Stable |
| HIGH items | 1 | 1 | 1 | Stable (TD-066 still open) |
| MEDIUM items | 5 | 5 | 6 | +1 (TD-081 dashboard CDN) |
| LOW items | 7 | 9 | 12 | Growing |
| Functions > 30 lines | 0 | 0 | 0 | Stable |
| Test files | 4 (125 tests) | 8 (205 tests) | 8 (205 tests) | Stable |
| New scripts without tests | 2 | 4 | 4 | Stable (untestable pattern recurring) |
| Contract drift items | 4 | 3 HIGH drifts | 3 HIGH drifts | Stable — not worsening, not improving |
| Security (open actionable) | 2 | 6 | 8 | Growing — execSync pattern + new CDN risk |
| New JS scripts without tests | 0 | 0 | 0 | 2 | gsd-t-tools, gsd-t-statusline |
| Contract drift items | N/A | 2 | 0 | 4 | M10-M13 not reflected |
| Security (open actionable) | 5 | 0 (1 accepted) | 0 (1 accepted) | 2 (+ 1 accepted) | stateSet injection + traversal |

---

## Scan #7 Findings — Post-M14-M17 (2026-03-09)

**Scan #7 Summary:**
- Scan date: 2026-03-09
- Version: 2.34.10
- Previous open items: 15 (TD-066 through TD-080 — all still open from Scan #6)
- New items found: 9 (TD-081 through TD-089)
- Items resolved since Scan #6: 0 (no dedicated debt-reduction milestone ran between M14-M17)
- Critical: 0, High: 3, Medium: 7, Low: 5

**Trend note:** Debt is accumulating across feature milestones without a cleanup sprint. TD-066 (untestable scripts) has been open for 4+ milestones and now has 2 more scripts in the same pattern (TD-081, TD-082). The execSync-with-interpolation security pattern has appeared in 3 new files.

---

## High Priority (Scan #7)

### TD-081: gsd-t-update-check.js has no module.exports — untestable + auto-update logic uncovered
- **Category**: quality + security
- **Severity**: HIGH
- **Location**: `scripts/gsd-t-update-check.js`
- **Description**: Script executes immediately when required. No module.exports. Contains auto-update logic that installs new versions of GSD-T globally. This is the most impactful untestable script yet — a bug could silently install wrong versions or corrupt the global install. Same anti-pattern as TD-066 (tools.js/statusline.js).
- **Impact**: A bug in the auto-update logic (wrong version comparison, failed cleanup) would affect every user on every session start. Zero regression safety net.
- **Remediation**: Add module.exports + require.main guard. Add tests for: version comparison, cache TTL logic, update flow (mock execSync). Consolidate with TD-066 fix.
- **Effort**: medium
- **Milestone candidate**: YES — consolidate with TD-066 into "Script Testability Sprint" milestone
- **Promoted**: [ ]

### TD-082: SEC-N28 — gsd-t-update-check.js version string from npm registry passed to execSync without validation
- **Category**: security
- **Severity**: HIGH
- **Location**: `scripts/gsd-t-update-check.js` lines 61-64
- **Description**: `latest` variable from npm registry response (`JSON.parse(d).version`) is concatenated into `execSync('npm install -g @tekyzinc/gsd-t@' + latest)` shell command. No semver format validation before use. A malicious/MITM registry response could inject shell commands.
- **Impact**: Shell injection on every auto-update for any user with a stale cache. Requires MITM or malicious npm registry. Low probability but high impact.
- **Remediation**: Validate with `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` before use. Use `execFileSync('npm', ['install', '-g', '@tekyzinc/gsd-t@' + latest])`.
- **Effort**: small
- **Milestone candidate**: YES — fold into next security hardening or Script Testability milestone
- **Promoted**: [ ]

### TD-083: Contract drift — 2 new HIGH-priority gaps
- **Category**: quality (contract drift)
- **Severity**: HIGH
- **Location**: `.gsd-t/contracts/event-schema-contract.md`, `.gsd-t/contracts/scan-diagrams-contract.md`
- **Description**: (1) event-schema-contract.md lists `session_start` and `session_end` event types, but these are NOT in VALID_EVENT_TYPES in gsd-t-event-writer.js — callers using these types get exit code 1 silently. (2) scan-diagrams-contract.md specifies 'mcp' as the first renderer (Rule 7), but scan-renderer.js has zero MCP code — contract promises behavior that doesn't exist.
- **Impact**: (1) Any command file instructed to write session_start events is silently failing. (2) Documentation tells users MCP rendering is available when it is not.
- **Remediation**: (1) Either add session_start/end to VALID_EVENT_TYPES or remove from contract. (2) Either implement MCP rendering chain or remove from contract RendererName enum and delete Rule 7.
- **Effort**: small (contract-only fix) to medium (implement MCP)
- **Milestone candidate**: YES — fold contract-only fix into next housekeeping milestone
- **Promoted**: [ ]

---

## Medium Priority (Scan #7)

### TD-084: SEC-N29/N30 — scan-export.js and scan-renderer.js use execSync with string interpolation
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `bin/scan-export.js` lines 21-29, `bin/scan-renderer.js` lines 26, 43
- **Description**: Both files use `execSync('tool "' + path + '"')` pattern instead of `execFileSync` with array args. scan-export.js: pandoc/md-to-pdf commands include htmlPath (from user-controlled opts.projectRoot). scan-renderer.js: mmdc/d2 commands include tmpIn/tmpOut from os.tmpdir() (lower risk, system-controlled).
- **Impact**: MEDIUM — scan-export htmlPath could be attacker-controlled if projectRoot is from untrusted input.
- **Remediation**: Use `execFileSync('pandoc', [htmlPath, '-o', outputPath])` etc. consistent with gsd-t.js pattern.
- **Effort**: small
- **Milestone candidate**: NO — fold into next security sprint
- **Promoted**: [ ]

### TD-085: Dashboard server does not watch new JSONL files after date rollover
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-dashboard-server.js` handleEvents() + getNewestJsonl()
- **Description**: Server only watches the JSONL file that was newest at startup. When UTC date changes (midnight), new `YYYY-MM-DD.jsonl` file is created — server never picks it up. Dashboard shows no new events after midnight until server restart.
- **Impact**: Significant for overnight sessions or long-running dashboards. Events are silently lost from the dashboard stream.
- **Remediation**: Use `fs.watch(eventsDir)` to detect new file creation. On new `.jsonl` file: unwatch old file, start watching new file.
- **Effort**: small
- **Milestone candidate**: NO — fold into a Dashboard Quality milestone or next cleanup sprint
- **Promoted**: [ ]

### TD-086: DC-NEW-01 — tryKroki() in scan-renderer.js is dead code (dormant async function)
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `bin/scan-renderer.js` lines 53-77
- **Description**: tryKroki() is defined as an async function returning a Promise but renderDiagram() is synchronous and explicitly skips it (line 85 comment: "skip in sync rendering path"). The function exists, adds 25 lines of untested code, and poses a data-sensitivity risk if activated (SEC-N32). It is never called.
- **Impact**: Dead code bloat. False contract impression (contract lists 'kroki' as valid renderer).
- **Remediation**: Either (a) implement async render chain and wire up Kroki with opt-in flag, or (b) remove tryKroki() and update RendererName enum in scan-diagrams-contract.md to remove 'kroki'.
- **Effort**: small
- **Milestone candidate**: NO — fold into next scan/cleanup sprint
- **Promoted**: [ ]

### TD-087: CONV-NEW-03 — Command count mismatch (48 actual vs 46 in CLAUDE.md)
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `CLAUDE.md`, `README.md`, `GSD-T-README.md`, `commands/gsd-t-help.md`
- **Description**: `ls commands/*.md` = 48 files. CLAUDE.md Overview section says "46 slash commands (42 GSD-T workflow + 4 utility)". README.md and GSD-T-README.md likely also show stale count. Two new commands added in M14-M17 (likely gsd-t-prd.md and gsd-t-reflect.md) not reflected in counts.
- **Impact**: Confuses users and violates pre-commit gate ("Did I add or remove a command? YES → Update bin/gsd-t.js command counting logic").
- **Remediation**: Audit exact count. Update CLAUDE.md, README.md, GSD-T-README.md, gsd-t-help.md command summaries, and bin/gsd-t.js counting logic.
- **Effort**: small
- **Milestone candidate**: NO — pre-commit gate violation; fix immediately
- **Promoted**: [ ]

### TD-088: Living docs not updated post-M14-M17 (4 docs, major staleness again)
- **Category**: quality (documentation)
- **Severity**: MEDIUM
- **Location**: `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `docs/requirements.md`
- **Description**: All four living docs are again stale after 4 more milestones. Missing: gsd-t-dashboard-server.js, gsd-t-event-writer.js, gsd-t-auto-route.js, gsd-t-update-check.js in architecture/infrastructure.md; dashboard workflow, event stream workflow, auto-route flow in workflows.md; REQ-024 through REQ-030 marked implemented in requirements.md; updated command count (45→48) and test count (125→205) in architecture.md and infrastructure.md.
- **Impact**: Violates "No Re-Research" rule. Agents reading docs get stale information.
- **Remediation**: Update all four docs as part of this scan's Step 5.
- **Effort**: small
- **Milestone candidate**: NO — addressed in this scan's Step 5
- **Promoted**: [ ]

### TD-089: progress-file-format contract still missing M11-M13 artifacts (carried from TD-070)
- **Category**: quality (contract drift)
- **Severity**: MEDIUM
- **Location**: `.gsd-t/contracts/progress-file-format.md`
- **Status**: CARRIED — TD-070 from Scan #6, still unresolved after 4 milestones
- See TD-070 for full details.

---

## Low Priority (Scan #7)

### TD-090: SEC-N31 — Dashboard SSE endpoint has no authentication
- **Category**: security (informational/low risk)
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard-server.js` lines 90-96, SSE_HEADERS
- **Description**: GET /events streams all historical events to any local caller. `Access-Control-Allow-Origin: *`. No token check. Localhost-only server so risk is local.
- **Remediation**: Document localhost-only assumption. Consider opt-in token if ever used in shared environments.
- **Effort**: small
- **Milestone candidate**: NO — informational
- **Promoted**: [ ]

### TD-091: SEC-N32 — tryKroki() would send codebase analysis to external kroki.io
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/scan-renderer.js` lines 53-77
- **Description**: If Kroki were enabled, Mermaid diagram source (containing entity names, endpoint paths, service names) would be POSTed to external `kroki.io`. Currently dormant (never called in sync path).
- **Remediation**: Add data-sensitivity warning comment. Require opt-in flag before enabling.
- **Effort**: trivial
- **Milestone candidate**: NO — informational
- **Promoted**: [ ]

### TD-092: scan-report.html written to project root instead of .gsd-t/scan/
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/scan-report.js` line 93
- **Description**: `outputPath = path.join(opts.projectRoot || process.cwd(), 'scan-report.html')`. Report is written to the project root, not to `.gsd-t/scan/` where all other scan outputs live. This pollutes the project root.
- **Impact**: LOW — user can move the file, but it's unexpected placement.
- **Remediation**: Change default output to `path.join(opts.projectRoot, '.gsd-t', 'scan', 'scan-report.html')`.
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

### TD-093: Wave-phase-sequence.md and qa-agent-contract.md drift (carried from TD-067, TD-069)
- **Category**: quality (contract drift)
- **Severity**: LOW (carried, no escalation)
- **Location**: `.gsd-t/contracts/qa-agent-contract.md`, `.gsd-t/contracts/wave-phase-sequence.md`
- **Status**: CARRIED — TD-067 and TD-069 from Scan #6. Now 4+ milestones old. Demoting from MEDIUM to LOW due to age — no known active harm.
- **Remediation**: Small fixes, fold into any housekeeping sprint.
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-094: Dashboard PID file has no format contract or health check
- **Category**: quality
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard-server.js` lines 120-121, 137
- **Description**: `.gsd-t/dashboard.pid` written by --detach mode. No format contract. gsd-t-health does not check for stale PID files. If server crashes before cleanup, stale PID remains indefinitely.
- **Remediation**: (1) Add dashboard.pid check to gsd-t-health; (2) add PID file format to progress-file-format contract; (3) validate PID is still live before --stop uses it.
- **Effort**: small
- **Milestone candidate**: NO — fold into next cleanup sprint
- **Promoted**: [ ]

---

## Scan #7 Metadata

- Scan date: 2026-03-09
- Version scanned: 2.34.10
- Previous scan: Scan #6 at v2.28.10 (2026-02-18)
- Files analyzed: ~19 JS files (~4,208 lines), 48 command files, 9 templates, 13 contracts
- Lines of code: ~4,208 JS + ~16,000+ markdown (est.)
- Languages: JavaScript, Markdown
- Total tests: 205/205 passing (7 test files + verify-gates.js)
- New scripts without module.exports: 3 (gsd-t-tools.js, gsd-t-statusline.js, gsd-t-update-check.js) — all untested
- New items found: 9 (TD-081 through TD-089 new; TD-090 through TD-094 new LOW items)
- Critical: 0, High: 3, Medium: 7 (including 2 carried promoted), Low: 5

### Updated Trend Analysis

| Metric | Scan #1 | Scan #5 | Scan #6 | Scan #7 | Trend |
|--------|---------|---------|---------|---------|-------|
| Open items | 13 | 10 | 14 | 29 | Accumulating — no cleanup sprints post-M9 |
| Critical items | 2 | 0 | 0 | 0 |  Stable |
| HIGH items | 3 | 0 | 1 | 3 |  Growing — execSync + testability |
| MEDIUM items | 4 | 0 | 5 | 13 |  Growing — contract drift accumulating |
| LOW items | 4 | 10 | 7 | 13 |  Growing |
| Test files | 0 | 4 (116) | 4 (125) | 8 (205) |  Strong growth |
| JS scripts without tests | 0 | 0 | 2 | 3 |  Still growing |
| Contract drift items | N/A | 2 | 4 | 6 |  Growing — 2 new HIGH drift items |
| Security (open actionable) | 5 | 0 | 2 | 6 |  Growing — execSync pattern spreading |

### Key Insight
M14-M17 added excellent test coverage (+80 tests) for new features but left the existing debt backlog untouched. The test discipline for new features is strong; the debt discipline is weak. A dedicated cleanup/housekeeping milestone is overdue.

---

## Suggested Tech Debt Milestones (Scan #7)

### Suggested: Script Testability Sprint (HIGH — combines TD-066, TD-081, TD-082)
Items: TD-066 (gsd-t-tools.js/gsd-t-statusline.js), TD-081 (gsd-t-update-check.js), TD-082 (SEC-N28 version injection)
Estimated effort: medium (3-4 days)
Should be prioritized: NEXT — before any more untestable scripts accumulate

### Suggested: Contract Alignment Sprint (MEDIUM — combines TD-083, TD-087, TD-089, TD-093)
Items: TD-083 (event-schema + scan-diagrams drift), TD-087 (command count), TD-089 (progress-file-format), TD-093 (wave-phase-sequence + qa-agent-contract)
Estimated effort: small (1-2 days)
Can be scheduled: ALONGSIDE Script Testability Sprint (no code conflicts)

### Suggested: Security Cleanup Sprint (MEDIUM — combines TD-084, TD-082)
Items: TD-082 (version injection), TD-084 (execSync interpolation in scan-export + scan-renderer)
Estimated effort: small (1 day)
Can be scheduled: FOLD INTO Script Testability Sprint (same files, same review)

---

## Scan #8 Findings — Post-M17 Dashboard Fix/Revert (2026-03-09)

**Scan #8 Summary:**
- Scan date: 2026-03-09
- Version: 2.34.10
- Commits since Scan #7: 2 (tooltip fix + revert — net zero change)
- Previous open items: 29 (TD-066 through TD-094 — all still open)
- New items found: 2 (TD-095, TD-096 — dashboard CDN findings)
- Items resolved since Scan #7: 0
- Critical: 0, High: 0, Medium: 1, Low: 1

---

## Medium Priority (Scan #8)

### TD-095: gsd-t-dashboard.html loads 5 CDN resources without Subresource Integrity (SRI) hashes
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `scripts/gsd-t-dashboard.html` lines 6-10
- **Description**: Dashboard HTML loads React 17, ReactDOM 17, dagre 0.8.5, ReactFlow 11.11.4, and ReactFlow CSS from `https://unpkg.com`. None have `integrity="sha384-..."` SRI attributes. If any of these packages are compromised on npm/unpkg, the dashboard immediately loads malicious JS with full DOM access. The SSE event stream (containing agent reasoning, trace IDs, command names) would be accessible to the malicious script.
- **Impact**: Supply chain attack vector. Low probability but high impact — affects all users who open the dashboard.
- **Remediation**: (1) Add SRI hash attributes to all 5 CDN resources. (2) OR bundle libraries inline (consistent with scan-report.html). (3) OR add Content-Security-Policy header in dashboard-server.js.
- **Effort**: small (SRI) or medium (bundling)
- **Milestone candidate**: YES — fold into a Dashboard Security/Quality milestone
- **Promoted**: [ ]

---

## Low Priority (Scan #8)

### TD-096: gsd-t-dashboard.html has no Content-Security-Policy
- **Category**: security
- **Severity**: LOW
- **Location**: `scripts/gsd-t-dashboard.html` + `scripts/gsd-t-dashboard-server.js`
- **Description**: No CSP meta tag in the HTML, no CSP response header from the server. Without CSP, any XSS vector could execute arbitrary JS.
- **Impact**: LOW — React's JSX escaping mitigates most XSS. Dashboard only processes events from local JSONL files.
- **Remediation**: Add `Content-Security-Policy` header in dashboard-server.js: `"default-src 'self' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com"`.
- **Effort**: trivial
- **Milestone candidate**: NO — fold into TD-095 fix
- **Promoted**: [ ]

---

## Scan #8 Metadata

- Scan date: 2026-03-09
- Version scanned: 2.34.10
- Previous scan: Scan #7 at v2.34.10 (2026-03-09)
- Net code changes: 0 (fix + revert)
- New items found: 2 (TD-095, TD-096)
- Total open items: 31

---

## Scan #9 Summary (2026-03-09)

**Scan #9 Summary:**
- Scan date: 2026-03-09
- Version: 2.34.10
- Previous open items: 31 (TD-066 through TD-096 — all still open)
- New items found: 0 — no code changes since Scan #8
- Items resolved since Scan #8: 0
- Test baseline confirmed: 205/205 passing
- Schema extraction: no ORM/DB detected (expected — methodology tool)

**Key findings carried into this scan:**
- HIGH (3): TD-081 (update-check untestable), TD-082 (execSync version injection), TD-083 (contract drift — event-schema/scan-diagrams)
- MEDIUM (12): TD-066 through TD-071, TD-084 through TD-089, TD-095 — including execSync pattern in 3 new files and living docs staleness
- LOW (16): TD-072 through TD-080, TD-090 through TD-094, TD-096

**Recommended next action:** Schedule "Script Testability + Contract Alignment Sprint" milestone combining TD-066, TD-081, TD-082, TD-083, TD-087 — highest ROI, small/medium effort.

---

## Scan #9 Metadata

- Scan date: 2026-03-09
- Version scanned: 2.34.10
- Previous scan: Scan #8 at v2.34.10 (2026-03-09)
- Files analyzed: ~19 JS files (~4,208 lines), 48 command files, 9 templates, 13 contracts
- Languages: JavaScript, Markdown
- Total tests: 205/205 passing
- New items found: 0
- Total open items: 31

---

## Scan #10 Findings — Post-M20/M21 Graph Engine (2026-03-19)

**Scan #10 Summary:**
- Scan date: 2026-03-19
- Version: 2.38.10
- Previous open items: 31 (all carried from Scan #9)
- New items found: 4 (TD-097 through TD-101): 1 critical, 0 high, 1 medium, 2 low
- Items resolved: 0
- Test baseline: 294/294 passing
- Graph-enhanced: Yes — used CGC (1,439 functions, 153 files, 41 modules) + native (275 entities)
- Scan mode: Lead agent, 5-dimension analysis (architecture, business-rules, security, quality, contracts)

---

## Critical Priority (Scan #10)

### TD-097: graph-query.js grepQuery() — command injection via params.entity (SEC-C01)
- **Category**: security
- **Severity**: CRITICAL
- **Location**: `bin/graph-query.js` lines 305-306, 321-322
- **Description**: The grep fallback provider in graph-query.js uses `execSync` with string interpolation of `params.entity` and `params.file` directly into shell commands: `grep -rn "${name}(" ...`. An entity name containing shell metacharacters (`;`, `|`, `$()`, backticks) achieves arbitrary command execution. The grep provider is priority 3 (lowest) so is only active when both CGC and native providers are unavailable — but this IS exercised when no graph index exists (first run on any project, or corrupted index).
- **Impact**: Shell command injection. Any GSD-T command that calls `query('getCallers', { entity: userInput })` through the grep fallback can execute arbitrary commands.
- **Remediation**: Replace `execSync(cmd)` with `execFileSync('grep', ['-rn', name + '(', '--include=*.js', '--include=*.ts', '--include=*.py', projectRoot], { encoding: 'utf8', timeout: 5000 })`. Add input validation: `if (!/^[\w.\-/]+$/.test(name)) return [];`
- **Effort**: small
- **Milestone candidate**: YES — fix immediately, do not wait for milestone
- **Promoted**: [ ]

---

## Medium Priority (Scan #10)

### TD-098: graph-query-contract.md Rule 6 violated — absolute paths in results
- **Category**: quality (contract drift)
- **Severity**: MEDIUM
- **Location**: `bin/graph-query.js`, `bin/graph-cgc.js`
- **Description**: Contract Rule 6 states "All file paths in results MUST be relative to project root." Reality: CGC provider returns absolute paths in entity IDs and file fields. Native provider uses absolute paths in entity `id` field (e.g., `C:\Users\david\GSD-T\bin\graph-cgc.js:48:startCgcServer`). Entity ID determinism (Rule 7) is also affected — same entity gets different IDs on different machines.
- **Impact**: Commands consuming graph results that expect relative paths will produce incorrect output. Entity IDs are non-portable across machines.
- **Remediation**: In graph-query.js `query()` function, normalize all returned entity paths to relative (using `path.relative(projectRoot, entity.file)`) before returning. Or fix in each provider's result normalization.
- **Effort**: small
- **Milestone candidate**: NO — fold into next graph maintenance milestone
- **Promoted**: [ ]

---

## Low Priority (Scan #10)

### TD-099: graph-store.js ensureDir() missing symlink protection (SEC-M04)
- **Category**: security
- **Severity**: LOW
- **Location**: `bin/graph-store.js` lines 22-26
- **Description**: `fs.mkdirSync(dir, { recursive: true })` and `fs.writeFileSync(fp, ...)` in graph-store.js have no symlink protection. Unlike bin/gsd-t.js which has `isSymlink()` + `hasSymlinkInPath()` checks at all write sites, graph-store writes to .gsd-t/graph/ without validation.
- **Impact**: Low — graph data is non-sensitive (function names, file paths). Requires prior symlink placement by attacker.
- **Remediation**: Reuse `isSymlink()` / `hasSymlinkInPath()` from gsd-t.js, or extract to shared utility.
- **Effort**: small
- **Milestone candidate**: NO — fold into next security sprint
- **Promoted**: [ ]

### TD-100: graph-overlay.js — no dedicated test file
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/graph-overlay.js`
- **Description**: The overlay module (195 lines, 8 exported functions: buildOverlay, buildDomainMap, mapDomains, mapContracts, mapRequirements, mapTests, mapDebt, detectSurfaces) has no dedicated test file. Functions are tested indirectly through graph-indexer.test.js integration tests, but no unit tests for individual mapping functions.
- **Impact**: Low — overlay functions work correctly (verified via graph queries), but edge cases in domain mapping, contract matching, and surface detection are untested.
- **Remediation**: Create `test/graph-overlay.test.js` with unit tests for each mapping function.
- **Effort**: small
- **Milestone candidate**: NO — fold into next testing sprint
- **Promoted**: [ ]

### TD-101: graph-cgc-contract.md MCP tool names don't match implementation
- **Category**: quality (contract drift)
- **Severity**: LOW
- **Location**: `.gsd-t/contracts/graph-cgc-contract.md` MCP Communication section
- **Description**: Contract shows conceptual tool names (`search_codebase`, `get_dependencies`, `find_similar`). Implementation uses actual CGC API tool names (`analyze_code_relationships`, `find_dead_code`, `find_code`, `find_most_complex_functions`, etc.). Minor contract drift.
- **Impact**: Low — contract communicates intent correctly even if tool names are conceptual.
- **Remediation**: Update contract MCP Communication section to show actual tool names used in graph-cgc.js.
- **Effort**: small
- **Milestone candidate**: NO — fold into next contract alignment
- **Promoted**: [ ]

---

## Scan #10 Metadata

- Scan date: 2026-03-19
- Version scanned: 2.38.10
- Previous scan: Scan #9 at v2.34.10 (2026-03-09)
- Files analyzed: 27 JS files (4,888 lines), 11 test files (2,943 lines), 49 command files, 10 templates, 16 contracts
- Languages: JavaScript, Markdown
- Total tests: 294/294 passing
- New items found: 4 (TD-097 through TD-101): 1 critical, 0 high, 1 medium, 2 low
- Items resolved: 0
- Previously open items carried: 31
- Total open items: 35
- Graph providers used: CGC (primary), Native (275 entities), Grep (fallback)
- Graph queries run: getStats, findDeadCode, findDuplicates, findComplexFunctions, findCircularDeps, getDomainBoundaryViolations, getEntitiesByDomain

### Updated Trend Analysis

| Metric                    | Scan #6  | Scan #9  | Scan #10 | Trend                                    |
|---------------------------|----------|----------|----------|------------------------------------------|
| Open items                | 14       | 31       | 35       | Growing — no cleanup milestones since M9 |
| Critical items            | 0        | 0        | 1        | NEW — SEC-C01 grep injection             |
| HIGH items                | 1        | 3        | 3        | Stable                                   |
| MEDIUM items              | 5        | 12       | 13       | +1 (path contract drift)                 |
| LOW items                 | 7        | 16       | 18       | +2 (symlink + overlay tests)             |
| JS files                  | 6        | 19       | 27       | +8 (graph engine)                        |
| JS lines                  | 1,944    | ~4,208   | 4,888    | +680 (graph engine)                      |
| Test files                | 4 (125)  | 8 (205)  | 11 (294) | +3 files, +89 tests                      |
| Functions > 30 lines      | 0        | 0        | 0        | Stable (all within limit)                |
| Contract drift items      | 4        | 6        | 8        | +2 (graph contracts)                     |
| Security (open actionable)| 2        | 8        | 10       | +2 (graph injection + symlink)           |
| Circular dependencies     | unknown  | unknown  | 0        | First verified via graph                 |
| Domain violations         | unknown  | unknown  | 0        | First verified via graph                 |

## Suggested Tech Debt Milestones (Scan #10)

### Suggested: Critical Security Fix (Immediate)
Combines: TD-097
Estimated effort: small (30 min)
Should be prioritized: IMMEDIATELY — before any other work

### Suggested: Graph Quality Sprint
Combines: TD-098, TD-100, TD-101
Estimated effort: small-medium (2-3 hours)
Can be scheduled: After critical fix

### Suggested: execSync Elimination Sprint
Combines: TD-097, TD-082 (SEC-H01), TD-083 (SEC-H02), TD-084 (SEC-H03), SEC-M01, SEC-M03
Estimated effort: medium (half day)
Should be prioritized: BEFORE next feature milestone — all 6 execSync-with-interpolation instances in one sweep

### Suggested: Script Testability + Contract Alignment
Combines: TD-066, TD-067, TD-069, TD-070, TD-071, TD-074, TD-099
Estimated effort: medium (half day)
Can be scheduled: After security sprint

