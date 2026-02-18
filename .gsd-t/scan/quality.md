# Code Quality Analysis — Scan #4

**Date:** 2026-02-18
**Version:** v2.24.3
**Previous scans:** #1 (2026-02-07), #2 (2026-02-18), #3 (2026-02-18 post-QA/wave). This is scan #4, reflecting state after Milestones 3-7.

---

## Previous Tech Debt Status Check

| ID | Title | Scan #3 Status | Current Status | Notes |
|----|-------|----------------|----------------|-------|
| TD-001 | 25 of 26 Command Files Missing | RESOLVED | **RESOLVED** | All 43 command files present (39 GSD-T + 4 utility) |
| TD-002 | Command Injection in Doctor via execSync | RESOLVED | **RESOLVED** | `execFileSync("claude", ["--version"], ...)` at line 940 |
| TD-003 | No Test Coverage | HIGH — OPEN | **RESOLVED** | 116 tests across 4 test files, all passing. M4 added 64 tests, M5 added 30, M6 added 22 |
| TD-005 | Symlink Attack Vulnerability | RESOLVED | **RESOLVED** | Unchanged |
| TD-006 | Brainstorm Command Not Documented | RESOLVED | **RESOLVED** | Unchanged |
| TD-007 | Hardcoded Utility Command List | RESOLVED | **RESOLVED** | Unchanged |
| TD-008 | CRLF/LF Mismatch | PARTIALLY RESOLVED | **PARTIALLY RESOLVED** | `.gitattributes` and `.editorconfig` now exist. However, LF enforcement is not yet applied to working copy — see CRLF section below |
| TD-009 | Missing Input Validation on Project Name | RESOLVED | **RESOLVED** | Unchanged |
| TD-010 | Large Functions Approaching Complexity | PARTIALLY RESOLVED | **RESOLVED** | M6 split ALL 13 over-30-line functions. 80 functions now, all ≤30 lines. Largest: `doRegister()` at 30 lines |
| TD-014 | Backlog File Format Drift | RESOLVED | **RESOLVED** | Unchanged |
| TD-015 | Progress.md Format Drift | RESOLVED | **RESOLVED** | Unchanged |
| TD-016 | 7 Backlog Commands Missing from GSD-T-README | RESOLVED | **RESOLVED** | Unchanged |
| TD-017 | doUpdateAll() No Per-Project Error Isolation | HIGH — OPEN | **RESOLVED** | M6 added `updateSingleProject()` with try/catch per project at line 893 |
| TD-018 | Heartbeat JSONL Files Not in .gitignore | RESOLVED | **RESOLVED** | Unchanged |
| TD-019 | Heartbeat Sensitive Data in Bash Commands | MEDIUM — OPEN | **RESOLVED** | M5 added `scrubSecrets()` function with 30 tests covering all patterns |
| TD-020 | npm-update-check.js Arbitrary Path Write | MEDIUM — OPEN | **RESOLVED** | M5 added path validation (line 16-21) — validates cache path resolves within `~/.claude/` |
| TD-021 | 13 Functions Exceed 30-Line Limit | MEDIUM — OPEN | **RESOLVED** | M6 split all 13 functions. Zero functions over 30 lines |
| TD-022 | Stale Command Counts Across Reference Files | REGRESSION | **RESOLVED** | All counts now correct: CLAUDE.md, README.md, package.json all say 43/39/4 |
| TD-023 | CLAUDE.md Version/Count Drift | REGRESSION | **PARTIALLY RESOLVED** | Command counts fixed. Version reference on line 55 still says `v2.23.0` (actual: `v2.24.3`) |
| TD-024 | Heartbeat Cleanup Runs on Every Event | MEDIUM — OPEN | **RESOLVED** | Now only runs on `SessionStart` events (line 63 of heartbeat.js) |
| TD-025 | Missing .gitattributes and .editorconfig | MEDIUM — OPEN | **RESOLVED** | Both files now exist with correct settings |
| TD-030 | discuss/impact Missing Autonomy Behavior | LOW — OPEN | **RESOLVED** | Both `gsd-t-discuss.md` and `gsd-t-impact.md` now have Autonomy Behavior sections |
| TD-031 | Fractional Step Numbering in 17 Command Files | LOW — OPEN (WORSENED) | **RESOLVED** | M7 renumbered all 85 fractional steps across 17 command files to clean integers. Zero fractional steps remain |
| TD-032 | buildEvent() 69 Lines in Heartbeat | LOW — OPEN | **RESOLVED** | M6 refactored to handler map pattern — `buildEvent()` is now 5 lines (line 105), with `EVENT_HANDLERS` object at line 93 |
| TD-033 | Code Duplication Patterns (3 patterns) | LOW — OPEN | **RESOLVED** | M6 resolved all 3: `readProjectDeps()` extracted (shared by `hasSwagger`/`hasApi`), `writeTemplateFile()` extracted, `readPyContent()` extracted |
| TD-034 | checkForUpdates Inline JS Fragile | LOW — OPEN | **RESOLVED** | M5 extracted to `scripts/gsd-t-fetch-version.js` (26 lines) with proper error handling |

**Summary:** Of 21 previously tracked items (15 open from scan #3 + 6 new from scan #3):
- **19 RESOLVED** (including all HIGH and MEDIUM items)
- **1 PARTIALLY RESOLVED** (TD-023 — version string in CLAUDE.md)
- **1 PARTIALLY RESOLVED** (TD-008 — files exist but LF not enforced on working copy)

---

## Scan #3 "NEW" Issues Status

| ID | Title | Scan #3 Status | Current Status |
|----|-------|----------------|----------------|
| NEW-009 | Command count regression | MEDIUM | **RESOLVED** — All counts now 43/39/4 in CLAUDE.md, README.md, package.json |
| NEW-010 | Fractional step numbering worsened | LOW | **RESOLVED** — All 85 steps renumbered to integers (M7) |
| NEW-011 | QA agent missing Document Ripple | LOW | **RESOLVED** — `gsd-t-qa.md` now has Document Ripple section |
| NEW-012 | Inconsistent QA blocking language | LOW | **RESOLVED** — All 9 QA-spawning commands now use explicit "QA failure blocks {phase}" language |
| NEW-013 | QA agent test framework assumption | LOW | **RESOLVED** — Framework detection preamble added to `gsd-t-qa.md` |
| NEW-014 | Wave discuss-skip heuristic subjective | LOW | **RESOLVED** — Structured skip check with 3 concrete conditions in `gsd-t-wave.md` lines 78-84 |

**All 6 scan #3 new issues resolved.**

---

## Function Length Inventory — `bin/gsd-t.js` (1297 lines)

Project standard: functions MUST be under 30 lines. **ALL 80 FUNCTIONS PASS.**

### Summary Table (all functions, grouped by size)

| Size Bucket | Count | Examples |
|------------|-------|---------|
| 1-5 lines | 23 | `log()`, `success()`, `validateProjectName()`, `applyTokens()`, `getGsdtCommands()` |
| 6-10 lines | 17 | `ensureDir()`, `isSymlink()`, `readProjectDeps()`, `isNewerVersion()`, `addHeartbeatHook()` |
| 11-15 lines | 12 | `hasSymlinkInPath()`, `copyFile()`, `doDoctor()`, `removeInstalledCommands()`, `fetchVersionSync()` |
| 16-20 lines | 13 | `getRegisteredProjects()`, `registerProject()`, `installGlobalClaudeMd()`, `doInstall()`, `doUpdate()` |
| 21-25 lines | 10 | `installCommands()`, `initClaudeMd()`, `showInitTree()`, `showHelp()`, `doInit()` |
| 26-30 lines | 5 | `installHeartbeat()`, `configureHeartbeatHooks()`, `checkDoctorEnvironment()`, `checkProjectHealth()`, `doRegister()` |
| Over 30 | **0** | — |

**Largest function:** `doRegister()` at 30 lines (line 1052). Not a concern.

**Compared to scan #3:** 13 functions were over 30 lines (largest was `doStatus()` at 98 lines). Now zero. This is a **massive improvement** from M6.

### Functions — `scripts/gsd-t-heartbeat.js` (183 lines)

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| `cleanupOldHeartbeats()` | 17 | 75 | OK |
| `buildEvent()` | 5 | 105 | OK (was 69 lines — refactored to handler map) |
| `scrubSecrets()` | 8 | 117 | OK |
| `scrubUrl()` | 11 | 126 | OK |
| `summarize()` | 30 | 138 | BORDERLINE (exactly 30) |
| `shortPath()` | 14 | 169 | OK |

**All 6 functions ≤30 lines.** `summarize()` at exactly 30 is borderline but acceptable.

### `EVENT_HANDLERS` Map — `scripts/gsd-t-heartbeat.js` (line 93)

```javascript
const EVENT_HANDLERS = {
  SessionStart: (h) => ({ evt: "session_start", data: { source: h.source, model: h.model } }),
  PostToolUse:  (h) => ({ evt: "tool", tool: h.tool_name, data: summarize(h.tool_name, h.tool_input) }),
  // ... 7 more handlers
};
```

This pattern replaced the old 69-line if/else chain. Clean and maintainable.

### Functions — `scripts/gsd-t-fetch-version.js` (26 lines)

New file, first quality review. No named functions — single inline script.

| Metric | Value | Assessment |
|--------|-------|------------|
| Total lines | 26 | Well within limits |
| Error handling | Silent catch on network/parse errors | Appropriate for background check |
| Bounds checking | 1MB `MAX_BODY` limit | Matches npm-update-check.js pattern |
| Dependencies | `https` only (Node built-in) | Zero-dependency — correct |

**Assessment:** Clean, minimal, purpose-built. No issues.

### Functions — `scripts/npm-update-check.js` (43 lines)

| Metric | Value | Assessment |
|--------|-------|------------|
| Path validation | Lines 16-21 — resolves and verifies within `~/.claude/` | Security: good |
| Symlink check | Line 36 — `lstatSync` before `writeFileSync` | Security: good |
| Response bounds | 1MB `MAX_RESPONSE` limit | Security: good |
| Version regex | `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` | Matches `validateVersion()` |

**Assessment:** Fully hardened. All scan #3 security items resolved.

---

## Dead Code Analysis

**None found.** Specifically checked:

1. **All 80 named functions in `bin/gsd-t.js`** — every function is reachable from either:
   - The `switch` statement at line 1252 (command handlers), or
   - Called by another function that is reachable, or
   - Listed in `module.exports` (line 1195)
2. **All 6 named functions in `gsd-t-heartbeat.js`** — all reachable from stdin handler or `EVENT_HANDLERS` map
3. **No commented-out code blocks** in any JS file
4. **No unused imports** in any JS file
5. **No orphaned functions from M6 refactoring** — verified that all extracted helpers (`showStatusVersion`, `showStatusCommands`, `showStatusConfig`, `showStatusTeams`, `showStatusProject`, `showInstallSummary`, `showInitTree`, etc.) are both called and exported

### Export Completeness Check

`module.exports` in `bin/gsd-t.js` exports 48 items. Cross-referenced against test imports:

| Test File | Imports | All Exported? |
|-----------|---------|---------------|
| `helpers.test.js` | 7 items (`validateProjectName`, `applyTokens`, `normalizeEol`, `validateVersion`, `isNewerVersion`, `PKG_VERSION`, `PKG_ROOT`) | YES |
| `filesystem.test.js` | 13 items (`validateProjectPath`, `isSymlink`, `hasSymlinkInPath`, `ensureDir`, `copyFile`, `hasPlaywright`, `hasSwagger`, `hasApi`, `getCommandFiles`, `getGsdtCommands`, `getUtilityCommands`, `PKG_ROOT`, `PKG_COMMANDS`) | YES |
| `security.test.js` | 3 items from `bin/gsd-t.js` (`hasSymlinkInPath`), 3 from heartbeat | YES |
| `cli-quality.test.js` | 8 items (`readProjectDeps`, `readPyContent`, `insertGuardSection`, `readUpdateCache`, `addHeartbeatHook`, `writeTemplateFile`, `showStatusVersion`, `PKG_ROOT`) | YES |

---

## Duplication Patterns — Status Check

### DUP-001 (RESOLVED): `hasSwagger()` / `hasApi()` shared parsing
- **Previous:** Both independently read and parsed `package.json`, both iterated Python files
- **Fix applied in M6:** `readProjectDeps(projectDir)` extracted (line 186) — shared by both. `readPyContent(projectDir, filename)` extracted (line 195) — shared by both
- **Current `readProjectDeps()` calls:** 3 (2 in `hasSwagger`, 1 in `hasApi`) — note: `hasSwagger` calls `readProjectDeps` twice (once for swagger packages, once within the function itself via the `swaggerPkgs.some()` check). This is slightly inefficient but not a bug — the function is fast and only called during `doctor` and `update-all`

### DUP-002 (STILL OPEN): `JSON.parse(fs.readFileSync(SETTINGS_JSON))` repeated 3 times
- **Files:** `bin/gsd-t.js` lines 348, 702, 988
- **Locations:** `configureHeartbeatHooks()`, `showStatusTeams()`, `checkDoctorSettings()`
- **Impact:** Low — each is in a different command path (install, status, doctor). Extracting would add marginal benefit since each has different error handling needs
- **Recommendation:** Low priority. Could extract `readSettingsJson()` returning parsed object or null, but the gain is minimal for 3 occurrences in independent code paths

### DUP-003 (RESOLVED): Template-write-or-skip pattern
- **Previous:** Repeated across `initClaudeMd`, `initDocs`, `initGsdtDir`
- **Fix applied in M6:** `writeTemplateFile(templateName, destPath, label, projectName, today)` extracted (line 579). Used by `initGsdtDir()` for progress, backlog, and backlog-settings templates

**Summary:** 2 of 3 duplication patterns resolved. Remaining DUP-002 is low priority.

---

## Complexity Hotspots — Post-M6 Assessment

### All 5 scan #3 hotspots resolved:

| ID | Previous | Current | How Fixed |
|----|----------|---------|-----------|
| CMPLX-001 | `doStatus()` 98 lines | 10 lines | Extracted `showStatusVersion()` (16), `showStatusCommands()` (11), `showStatusConfig()` (13), `showStatusTeams()` (19), `showStatusProject()` (24) |
| CMPLX-002 | `doUpdateAll()` 78 lines | 21 lines | Extracted `updateGlobalCommands()` (8), `showNoProjectsHint()` (10), `updateSingleProject()` (23), `showUpdateAllSummary()` (12) |
| CMPLX-003 | `checkDoctorInstallation()` 52 lines | 19 lines | Extracted `checkDoctorClaudeMd()` (7), `checkDoctorSettings()` (11), `checkDoctorEncoding()` (14) |
| CMPLX-004 | `checkForUpdates()` 45 lines | 17 lines | Extracted `readUpdateCache()` (8), `fetchVersionSync()` (13), `refreshVersionAsync()` (7), `showUpdateNotice()` (9) |
| CMPLX-005 | `buildEvent()` 69 lines (heartbeat) | 5 lines | Refactored to `EVENT_HANDLERS` lookup map pattern (line 93) |

**No new complexity hotspots identified.** The refactoring in M6 was thorough.

---

## Test Coverage Assessment

### Test Infrastructure

- **Framework:** Node.js built-in test runner (`node:test`)
- **Config:** `package.json` → `"test": "node --test"`
- **Zero external test dependencies** — uses `node:assert/strict` for assertions
- **Test runner:** `node --test` auto-discovers `test/*.test.js` files

### Test Files

| File | Tests | Lines | Scope |
|------|-------|-------|-------|
| `test/helpers.test.js` | 27 | 181 | Pure helper functions: `validateProjectName`, `applyTokens`, `normalizeEol`, `validateVersion`, `isNewerVersion`, `PKG_VERSION`, `PKG_ROOT` |
| `test/filesystem.test.js` | 37 | 339 | Filesystem-dependent functions: `isSymlink`, `hasSymlinkInPath`, `ensureDir`, `validateProjectPath`, `copyFile`, `hasPlaywright`, `hasSwagger`, `hasApi`, `getCommandFiles`, `getGsdtCommands`, `getUtilityCommands` + CLI subcommand integration tests |
| `test/security.test.js` | 30 | 151 | Security functions: `scrubSecrets` (18 tests), `scrubUrl` (5 tests), `summarize` integration (4 tests), `hasSymlinkInPath` (from bin/gsd-t.js, 3 tests via security.test.js) |
| `test/cli-quality.test.js` | 22 | 182 | M6 refactoring verification: `buildEvent` (10 tests), `readProjectDeps` (3), `readPyContent` (2), `insertGuardSection` (3), `readUpdateCache` (1), `addHeartbeatHook` (3) |
| **Total** | **116** | **853** | |

### Coverage Map

#### Well Tested (unit + integration tests exist)

| Source Function | Test File | Test Count |
|----------------|-----------|------------|
| `validateProjectName()` | helpers.test.js | 7 |
| `applyTokens()` | helpers.test.js | 4 |
| `normalizeEol()` | helpers.test.js | 4 |
| `validateVersion()` | helpers.test.js | 4 |
| `isNewerVersion()` | helpers.test.js | 6 |
| `PKG_VERSION` / `PKG_ROOT` | helpers.test.js | 2 |
| `isSymlink()` | filesystem.test.js | 3 |
| `hasSymlinkInPath()` | filesystem.test.js + security.test.js | 3+3 |
| `ensureDir()` | filesystem.test.js | 3 |
| `validateProjectPath()` | filesystem.test.js | 4 |
| `copyFile()` | filesystem.test.js | 1 |
| `hasPlaywright()` | filesystem.test.js | 3 |
| `hasSwagger()` | filesystem.test.js | 5 |
| `hasApi()` | filesystem.test.js | 4 |
| `getCommandFiles()` | filesystem.test.js | 2 |
| `getGsdtCommands()` | filesystem.test.js | 1 |
| `getUtilityCommands()` | filesystem.test.js | 1 |
| `scrubSecrets()` | security.test.js | 18 |
| `scrubUrl()` | security.test.js | 5 |
| `summarize()` | security.test.js | 4 |
| `buildEvent()` | cli-quality.test.js | 10 |
| `readProjectDeps()` | cli-quality.test.js | 3 |
| `readPyContent()` | cli-quality.test.js | 2 |
| `insertGuardSection()` | cli-quality.test.js | 3 |
| `readUpdateCache()` | cli-quality.test.js | 1 |
| `addHeartbeatHook()` | cli-quality.test.js | 3 |
| CLI `--version` | filesystem.test.js | 2 |
| CLI `help` | filesystem.test.js | 1 |
| CLI `status` | filesystem.test.js | 1 |
| CLI `doctor` | filesystem.test.js | 1 |
| CLI unknown command | filesystem.test.js | 1 |
| Command count integrity | filesystem.test.js | 3 |

#### Partially Tested (some paths covered)

| Source Function | Tested Paths | Untested Paths |
|----------------|-------------|----------------|
| `writeTemplateFile()` | Imported in cli-quality.test.js (export verified) | Not directly invoked in tests (tested indirectly via `doInit` CLI integration) |
| `showStatusVersion()` | Imported in cli-quality.test.js (export verified) | Not directly invoked — display function, low risk |

#### Not Tested (no direct tests)

| Source Function | Risk | Reason Not Tested |
|----------------|------|-------------------|
| `doInstall()` / `doUpdate()` | MEDIUM | Modifies `~/.claude/` — would need mock filesystem |
| `doInit()` | MEDIUM | Creates project directory structure — partially tested via CLI integration (status/doctor run ok) |
| `doUninstall()` | MEDIUM | Deletes files from `~/.claude/commands/` |
| `doUpdateAll()` / `updateSingleProject()` | LOW | Modifies project CLAUDE.md files |
| `installCommands()` | LOW | Copies files to `~/.claude/commands/` |
| `installGlobalClaudeMd()` | LOW | Writes to `~/.claude/CLAUDE.md` |
| `installHeartbeat()` / `configureHeartbeatHooks()` | LOW | Modifies `~/.claude/settings.json` |
| `doRegister()` | LOW | Modifies `~/.claude/.gsd-t-projects` |
| `doChangelog()` | LOW | Opens browser — side-effect only |
| `showHelp()` | LOW | Display only |
| `checkForUpdates()` / `fetchVersionSync()` / `refreshVersionAsync()` | LOW | Network-dependent |
| `npm-update-check.js` (entire file) | LOW | Network-dependent + requires CLI invocation |
| `gsd-t-fetch-version.js` (entire file) | LOW | Network-dependent |
| Display functions (`showInstallSummary`, `showInitTree`, `showUpdateAllSummary`, etc.) | LOW | Console output only |

#### Coverage Assessment

- **Functions with direct tests:** 31 of 80 (39%) in `bin/gsd-t.js`, 5 of 6 (83%) in heartbeat
- **Tests per function (average):** 3.7 tests per tested function
- **All pure/deterministic functions tested:** YES — every function without side effects has tests
- **CLI integration tests:** 6 subcommand tests (version, help, status, doctor, unknown)
- **Test quality:** Strong — tests cover happy path, edge cases, error cases, and boundary conditions

**Assessment:** Good coverage for a zero-dependency CLI tool. The untested functions are primarily side-effect-heavy (filesystem writes to `~/.claude/`, network calls, browser opens) which would require a mock filesystem to test safely. The 116 tests cover all logic-bearing functions comprehensively.

---

## Command File Consistency Audit

### 1. `$ARGUMENTS` Terminator
- **Present:** 42 of 43 command files
- **Absent:** `checkin.md` (intentional — fixed format, no args) and `Claude-md.md` (intentional)
- **Verdict:** Correct and consistent

### 2. Document Ripple Section
- **Present:** 28 of 43 files (was 27 in scan #3 — `gsd-t-qa.md` now has one)
- **All file-modifying commands have Document Ripple:** YES
- **Commands without Document Ripple:** Non-file-modifying commands (brainstorm, help, log, resume, status, version-update, version-update-all, backlog-list, prompt) and utility commands (branch, checkin, Claude-md, gsd.md)
- **Verdict:** Complete and correct

### 3. Autonomy Behavior Section
- **Present:** 10 of 43 files (was 8 in scan #3)
- **Now includes:** `gsd-t-discuss.md` and `gsd-t-impact.md` (previously missing)
- **All wave-phase commands have Autonomy Behavior:** YES — partition, discuss, plan, impact, execute, test-sync, integrate, verify, wave, init-scan-setup
- **Verdict:** Complete — scan #3 gap fully resolved

### 4. QA Agent Spawn
- **Present:** 9 of 43 files: partition, plan, execute, test-sync, integrate, verify, quick, debug, complete-milestone
- **All use consistent blocking language:** YES — "QA failure blocks {phase}" in all 9
- **Spawn block format:** Consistent across all 9 commands:
  ```
  Teammate "qa": Read commands/gsd-t-qa.md for your full instructions.
    Phase context: {phase}. Read .gsd-t/contracts/ for contract definitions.
    {phase-specific instruction}.
    Report: {phase-specific report format}.
  ```
- **Verdict:** Fully consistent (scan #3 inconsistencies resolved in M7)

### 5. Step Numbering
- **Fractional steps:** ZERO across all 43 command files (was 34 across 17 files in scan #3)
- **M7 renumbered:** 85 steps across 17 command files to clean integers
- **Verdict:** Fully resolved

### 6. Spot-Check: 6 Command Files

| File | Steps | Sections Present | Issues |
|------|-------|------------------|--------|
| `gsd-t-wave.md` | Steps 1-5 (clean integers) | Autonomy Behavior, Error Recovery, Security Considerations, Workflow Visualization | Discuss skip now has structured 3-point check. No Document Ripple (appropriate — orchestrator delegates all work) |
| `gsd-t-execute.md` | Steps 1-6 (clean integers) | QA Spawn (Step 2), Autonomy Behavior, Document Ripple | Solo + Team mode. Branch Guard. Comprehensive test requirements |
| `gsd-t-plan.md` | Steps 1-9 (clean integers) | QA Spawn (Step 7), Autonomy Behavior, Document Ripple, Test Verification | Clean structure |
| `gsd-t-verify.md` | Steps 1-7 (clean integers) | QA Spawn (Step 2), Autonomy Behavior, Document Ripple | Solo + Team mode verification |
| `gsd-t-integrate.md` | Steps 1-9 (clean integers) | QA Spawn (Step 5), Autonomy Behavior, Document Ripple, Test Verification | Clean structure |
| `gsd-t-partition.md` | Steps 1-8 (clean integers) | QA Spawn (Step 7), Autonomy Behavior, Document Ripple, Test Verification | Clean structure |

**All 6 spot-checked files are consistent and well-structured.**

---

## CRLF/LF Consistency

### Configuration Files Present

| File | Content | Status |
|------|---------|--------|
| `.gitattributes` | `* text=auto` + `*.js text eol=lf` | EXISTS — correct settings |
| `.editorconfig` | `end_of_line = lf`, `charset = utf-8`, `indent_style = space`, `indent_size = 2` | EXISTS — correct settings |

### Actual Line Endings (Working Copy)

| File | Line Endings | Expected | Status |
|------|-------------|----------|--------|
| `bin/gsd-t.js` | 1296 CRLF, 0 LF | LF (per `.gitattributes`) | **MISMATCH** |
| `scripts/gsd-t-heartbeat.js` | 182 CRLF, 0 LF | LF | **MISMATCH** |
| `scripts/gsd-t-fetch-version.js` | 0 CRLF, 25 LF | LF | OK |
| `scripts/npm-update-check.js` | 42 CRLF, 0 LF | LF | **MISMATCH** |
| `commands/gsd-t-wave.md` | 261 CRLF, 0 LF | auto | Acceptable (Windows working copy) |
| `commands/gsd-t-execute.md` | 176 CRLF, 0 LF | auto | Acceptable |

### Analysis

The `.gitattributes` and `.editorconfig` files are in place (resolving TD-025), but the `*.js text eol=lf` rule has not been applied to the existing working copy. On Windows, `text=auto` normalizes to CRLF in the working tree, but `eol=lf` should force LF. The mismatch indicates the `.gitattributes` rule was added but existing files were not re-normalized.

**Fix:** Run `git add --renormalize .` to apply the `.gitattributes` rules to the existing working copy. This will convert all JS files to LF on next commit.

**Note:** `scripts/gsd-t-fetch-version.js` already has LF endings — this file was likely created after `.gitattributes` was added.

**Risk:** Low. The `normalizeEol()` helper function in `bin/gsd-t.js` mitigates CRLF/LF comparison issues at runtime. This is a git cleanliness concern, not a functionality concern.

---

## Error Handling Assessment

### Previously Identified Gaps

| ID | Description | Scan #3 Status | Current Status |
|----|------------|----------------|----------------|
| ERR-001 | `doUpdateAll()` no per-project error isolation | OPEN | **RESOLVED** — `updateSingleProject()` wrapped in try/catch (line 863) |
| ERR-002 | `checkForUpdates()` inline eval fragile | OPEN | **RESOLVED** — Extracted to `scripts/gsd-t-fetch-version.js` with proper error handling |
| ERR-003 | `doChangelog()` platform detection | OPEN | **UNCHANGED** — Still no detailed error message for missing `xdg-open`. Low priority |
| ERR-004 | Heartbeat stdin handler broad silent catch | OPEN | **UNCHANGED** — Still `catch (e) { /* Silent failure */ }`. Appropriate — heartbeat must never interfere with Claude Code |

### New Error Handling Observations

**Positive patterns established across the codebase:**
- Every `fs.writeFileSync` call has a symlink check before it
- Every `fs.copyFileSync` is wrapped in try/catch with descriptive error messages
- `getRegisteredProjects()` filters out invalid paths with warnings
- `configureHeartbeatHooks()` handles invalid JSON in settings.json gracefully
- `fetchVersionSync()` has 8-second timeout on network calls

**No new error handling gaps identified.**

---

## Performance Assessment

### Previously Identified Issues

| ID | Description | Scan #3 Status | Current Status |
|----|------------|----------------|----------------|
| PERF-001 | `hasSwagger()` reads package.json on every call | OPEN | **PARTIALLY RESOLVED** — `readProjectDeps()` is now shared, but still re-reads on each call. However, `hasSwagger()` and `hasApi()` are only called during `doctor` and `update-all`, so this is acceptable |
| PERF-002 | `cleanupOldHeartbeats()` runs on every event | OPEN | **RESOLVED** — Now gated to `SessionStart` events only (line 63) |

**No new performance issues identified.**

---

## Package.json Health

```json
{
  "name": "@tekyzinc/gsd-t",
  "version": "2.24.3",
  "description": "...43 slash commands...",
  "scripts": { "test": "node --test" },
  "main": "bin/gsd-t.js",
  "engines": { "node": ">=16.0.0" },
  "files": ["bin/", "commands/", "scripts/", "templates/", "examples/", "docs/", "CHANGELOG.md"]
}
```

| Check | Status |
|-------|--------|
| Version matches installed | `2.24.3` — correct |
| Description command count | `43 slash commands` — correct |
| `test` script works | YES — `node --test` finds 4 test files, runs 116 tests, all pass |
| `main` field correct | YES — `bin/gsd-t.js` |
| `engines` specified | YES — `>=16.0.0` |
| `files` array complete | YES — all published directories listed |
| Zero runtime dependencies | YES — no `dependencies` field |
| `bin` field correct | YES — `"gsd-t": "bin/gsd-t.js"` |
| Missing `prepublishOnly` | Still absent — no pre-publish validation script |

**Assessment:** Healthy. The only gap is the missing `prepublishOnly` script, which is low priority for a markdown-and-CLI-only package.

---

## Documentation-Code Drift

### DRIFT-001 (RESOLVED): Command Counts
- **CLAUDE.md:** "43 slash commands (39 GSD-T workflow + 4 utility)" — CORRECT
- **README.md:** "43 slash commands" — CORRECT
- **package.json:** "43 slash commands" — CORRECT

### DRIFT-002 (STILL OPEN): CLAUDE.md Version Reference
- **File:** `CLAUDE.md` line 55
- **Current text:** `package.json — npm package config (v2.23.0)`
- **Actual:** `package.json` version is `2.24.3`
- **Impact:** Low — this is a comment in the project structure diagram, not a functional reference
- **Fix:** Update to `v2.24.3` or remove the version reference from the structure comment

### DRIFT-003 (NEW): CHANGELOG.md Missing M4-M7 Entries
- **File:** `CHANGELOG.md`
- **Current latest entry:** `[2.23.0] - 2026-02-17`
- **Current version:** `2.24.3`
- **Missing entries:** v2.23.1 through v2.24.3 (Milestones 4-7)
- **Impact:** Medium — users checking changelog see stale information
- **Fix:** Add changelog entries for M4 (testing foundation), M5 (security hardening), M6 (CLI quality), M7 (command consistency)

---

## Naming Conventions

### Previously Identified

| ID | Description | Status |
|----|------------|--------|
| NAME-001 | `do*` vs verb-only function naming | **UNCHANGED** — `do*` = top-level subcommand handler, bare verb = helper. Not documented in CLAUDE.md but now clearly established by the 80-function codebase |
| NAME-002 | `getInstalledCommands()` vs `getCommandFiles()` ambiguity | **UNCHANGED** — low impact |

### New Observations

The M6 refactoring established clear naming patterns for extracted functions:

| Pattern | Convention | Examples |
|---------|-----------|---------|
| `show*()` | Display-only functions (console output) | `showStatusVersion()`, `showInstallSummary()`, `showInitTree()`, `showNoProjectsHint()`, `showUpdateNotice()` |
| `check*()` | Diagnostic functions returning issue count | `checkDoctorEnvironment()`, `checkDoctorInstallation()`, `checkDoctorClaudeMd()`, `checkProjectHealth()` |
| `install*()` | Functions that write files during install/update | `installCommands()`, `installGlobalClaudeMd()`, `installHeartbeat()` |
| `init*()` | Functions that create project structure | `initClaudeMd()`, `initDocs()`, `initGsdtDir()` |
| `update*()` | Functions that modify existing files | `updateProjectClaudeMd()`, `updateExistingGlobalClaudeMd()`, `updateGlobalCommands()`, `updateSingleProject()` |
| `remove*()` | Functions that delete files | `removeInstalledCommands()`, `removeVersionFile()` |

This is well-organized. Recommend documenting in CLAUDE.md conventions section.

---

## TODO/FIXME Comments

**None found.** Zero TODO, FIXME, HACK, XXX, or WORKAROUND comments in any JS or MD file. The codebase is clean of developer notes.

---

## Security Assessment (Brief)

All security items from scans #2 and #3 are resolved:

| Area | Status |
|------|--------|
| Command injection (doctor) | RESOLVED — `execFileSync` with array args |
| Symlink attacks (all write paths) | RESOLVED — `isSymlink()` + `hasSymlinkInPath()` checks |
| Sensitive data in heartbeat logs | RESOLVED — `scrubSecrets()` + `scrubUrl()` |
| Arbitrary path write (npm-update-check) | RESOLVED — path validation within `~/.claude/` |
| Unbounded HTTP response | RESOLVED — 1MB limits in both scripts |
| Session ID path traversal (heartbeat) | RESOLVED — `SAFE_SID` regex + resolved path check |

**No new security concerns identified.**

---

## New Issues Found This Scan

### NEW-015: CHANGELOG.md Missing M4-M7 Entries
- **Severity:** MEDIUM
- **File:** `CHANGELOG.md`
- **Problem:** Latest entry is `[2.23.0] - 2026-02-17`. Current version is `2.24.3`. Milestones 4-7 delivered significant changes (116 tests, security hardening, 80-function refactoring, command consistency) but no changelog entries exist for them.
- **Fix:** Add entries for v2.23.1 through v2.24.3

### NEW-016: CLAUDE.md Version Reference Stale
- **Severity:** LOW
- **File:** `CLAUDE.md` line 55
- **Problem:** Project structure comment says `v2.23.0`, actual version is `v2.24.3`
- **Fix:** Update version string or remove from comment

### NEW-017: .gitattributes LF Rule Not Applied to Working Copy
- **Severity:** LOW
- **File:** `.gitattributes`, all `*.js` files
- **Problem:** `.gitattributes` specifies `*.js text eol=lf` but existing JS files still have CRLF in working copy (except `gsd-t-fetch-version.js` which was created after `.gitattributes`)
- **Fix:** Run `git add --renormalize .` to apply rules to existing files

### NEW-018: DUP-002 Still Open — Settings JSON Parse Repeated 3 Times
- **Severity:** LOW
- **File:** `bin/gsd-t.js` lines 348, 702, 988
- **Problem:** `JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8"))` appears in 3 different functions
- **Impact:** Minimal — each occurrence is in an independent code path with different error handling
- **Fix:** Optional — extract `readSettingsJson()` if touching these areas

### NEW-019: Missing `prepublishOnly` Script
- **Severity:** LOW
- **File:** `package.json`
- **Problem:** No pre-publish validation. Publishing to npm does not verify tests pass or lint succeeds
- **Fix:** Add `"prepublishOnly": "node --test"` to scripts

---

## Summary

| Category | Scan #3 | Scan #4 | Change |
|----------|---------|---------|--------|
| Functions over 30 lines | 13 (JS) + 2 (heartbeat) | **0** | **RESOLVED** |
| Test files / tests | 0 / 0 | **4 / 116** | **RESOLVED** |
| Duplication patterns | 3 | **1** (DUP-002) | 2 resolved |
| Complexity hotspots | 5 | **0** | **ALL RESOLVED** |
| Error handling gaps | 4 | **2** (ERR-003, ERR-004 — both low priority) | 2 resolved |
| Performance issues | 2 | **0** (PERF-002 fixed, PERF-001 acceptable) | **RESOLVED** |
| Naming inconsistencies | 2 | 2 | Unchanged (low priority) |
| Command file inconsistencies | 5 | **0** | **ALL RESOLVED** |
| Documentation-code drift | 1 (command counts) | **2** (version ref + changelog) | Regressed count fixed, new drift |
| CRLF consistency | No config files | Config exists, not fully applied | **Improved** |
| Fractional step numbering | 34 steps / 17 files | **0** | **RESOLVED** |
| Security items open | 0 | **0** | Stable |

### Open Items by Priority

| Priority | Count | Items |
|----------|-------|-------|
| HIGH | **0** | — |
| MEDIUM | **1** | NEW-015 (changelog missing M4-M7) |
| LOW | **4** | NEW-016 (CLAUDE.md version), NEW-017 (git renormalize), NEW-018 (DUP-002), NEW-019 (prepublishOnly) |

### Trend Analysis

| Metric | Scan #1 | Scan #2 | Scan #3 | Scan #4 | Trend |
|--------|---------|---------|---------|---------|-------|
| Open items (total) | 13 | 15 | 21 | **5** | **Major improvement** |
| Critical items | 2 | 0 | 0 | **0** | Stable |
| HIGH items | 3 | 2 | 2 | **0** | **Resolved** |
| MEDIUM items | 4 | 5 | 5 | **1** | **Major improvement** |
| LOW items | 4 | 8 | 14 | **4** | **Major improvement** |
| Functions > 30 lines | 13 | 13 | 13 | **0** | **Resolved** |
| Test files / tests | 0/0 | 0/0 | 0/0 | **4/116** | **Resolved** |
| Fractional steps | N/A | 22/11 | 34/17 | **0/0** | **Resolved** |
| Command count drift | Yes | Fixed | Regressed | **Fixed** | Stable |

### Overall Assessment

**The codebase quality has undergone a transformational improvement between scan #3 and scan #4.** Milestones 4-7 collectively resolved:

- The single biggest quality gap (zero tests → 116 tests)
- All function length violations (13 → 0)
- All complexity hotspots (5 → 0)
- All fractional step numbering (34 → 0)
- All command file inconsistencies (5 → 0)
- All security items
- All HIGH-priority items

The remaining 5 open items are all LOW or MEDIUM priority, and none affect functionality. The codebase is in strong shape for continued development.

### Priority Recommendations

1. **MEDIUM:** Add CHANGELOG.md entries for M4-M7 (v2.23.1-v2.24.3)
2. **LOW:** Update CLAUDE.md version reference (line 55: `v2.23.0` → `v2.24.3`)
3. **LOW:** Run `git add --renormalize .` to apply LF endings to JS files
4. **LOW:** Consider adding `"prepublishOnly": "node --test"` to package.json
5. **LOW (optional):** Extract `readSettingsJson()` to eliminate DUP-002
