# Tech Debt Register — 2026-02-18

## Summary
- Critical items: 0
- High priority: 0
- Medium priority: 0
- Low priority: 0 (+ 1 accepted risk: TD-029)
- Total open items: 0
- **Trend: All scan #5 items resolved through M9. Zero open tech debt. Codebase at peak health.**

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

(No open items. All tech debt resolved.)

---

## Scan Metadata
- Latest scan: 2026-02-18 (scan #5)
- Previous scans: 2026-02-07 (scan #1), 2026-02-18 (scan #2), 2026-02-18 (scan #3), 2026-02-18 (scan #4)
- Files analyzed: 4 JS files (bin/gsd-t.js: 1,298 lines, scripts/gsd-t-heartbeat.js: 181 lines, scripts/npm-update-check.js: 43 lines, scripts/gsd-t-fetch-version.js: 26 lines), 43 command files, 9 templates, 8 contracts, docs, tests
- Lines of code: ~1,548 JS + ~12,500+ markdown
- Languages: JavaScript, Markdown
- Scan mode: Team (5 parallel agents: architecture, business-rules, security, quality, contracts)
- Total functions: 87 (81 in bin/gsd-t.js, 6 in heartbeat), all ≤ 30 lines
- Total tests: 125 (27 helpers + 37 filesystem + 36 security + 25 cli-quality)
- Total exports: 54 (49 in bin/gsd-t.js + 5 in heartbeat)

### Trend Analysis

| Metric | Scan #1 | Scan #2 | Scan #3 | Scan #4 | Post-M8 | Scan #5 | Post-M9 | Trend |
|--------|---------|---------|---------|---------|---------|---------|---------|-------|
| Open items | 13 | 15 | 26 | 13 | 0 | 10 | 0 | All resolved |
| Critical items | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Stable (good) |
| HIGH items | 3 | 2 | 2 | 1 | 0 | 0 | 0 | Stable |
| MEDIUM items | 4 | 5 | 8 | 3 | 0 | 0 | 0 | Stable |
| LOW items | 4 | 8 | 16 | 9 | 0 (1 accepted) | 10 | 0 (1 accepted) | All resolved |
| Functions > 30 lines | 13 | 13 | 15 | 0 | 0 | 0 | 0 | Stable |
| Test files | 0 | 0 | 0 | 4 (116 tests) | 4 (116 tests) | 4 (116 tests) | 4 (125 tests) | +9 tests |
| Fractional steps | N/A | 22/11 | 34/17 | 0 | 0 | 0 | 0 | Stable |
| Command count drift | Yes | Fixed | Regressed | Fixed | Fixed | Fixed | Fixed | Stable |
| Security (open actionable) | 5 | 6 | 9 | 2 | 0 (1 accepted) | 1 (+ 1 accepted) | 0 (1 accepted) | All resolved |
| Contract drift items | N/A | N/A | 3 | 4 | 0 | 2 | 0 | All resolved |
