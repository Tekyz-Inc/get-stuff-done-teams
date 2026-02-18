# Code Quality Analysis — Scan #5

**Date:** 2026-02-18
**Version:** v2.24.4
**Previous scans:** #1 (2026-02-07), #2 (2026-02-18), #3 (2026-02-18 post-QA/wave), #4 (2026-02-18 post-M7). This is scan #5, reflecting state after Milestone 8 (Housekeeping + Contract Sync).

---

## Previous Tech Debt Status Check

All 55 tracked items (TD-001 through TD-055) are now RESOLVED. TD-029 (TOCTOU race) is ACCEPTED RISK. See `.gsd-t/techdebt.md` for the complete resolved-items table.

**Scan #4 open items (5) — all resolved by M8:**

| ID | Scan #4 Status | Current Status | Resolution |
|----|----------------|----------------|------------|
| NEW-015 (TD-045) | MEDIUM — CHANGELOG missing M4-M7 | **RESOLVED** | Entries added for v2.23.1-v2.24.3 (M8) |
| NEW-016 (TD-048) | LOW — CLAUDE.md version stale | **RESOLVED** | Hardcoded version removed, references package.json (M8) |
| NEW-017 (TD-049) | LOW — .gitattributes LF not applied | **RESOLVED** | `git add --renormalize .` applied (M8). Index has LF, working copy has CRLF (expected on Windows) |
| NEW-018 (TD-050) | LOW — DUP-002 settings JSON 3x | **RESOLVED** | `readSettingsJson()` extracted (M8, line 1106 of `bin/gsd-t.js`) |
| NEW-019 (TD-051) | LOW — missing prepublishOnly | **RESOLVED** | `"prepublishOnly": "npm test"` added to `package.json` (M8) |

---

## File Inventory

| File | Lines | Functions | Exports | Change Since Scan #4 |
|------|-------|-----------|---------|---------------------|
| `bin/gsd-t.js` | 1299 | 81 | 49 | +2 lines, +1 function (`readSettingsJson`), +1 export |
| `scripts/gsd-t-heartbeat.js` | 183 | 6 | 5 | +2 lines (scrubSecrets applied to Notification message) |
| `scripts/npm-update-check.js` | 43 | 0 (inline) | 0 | No change |
| `scripts/gsd-t-fetch-version.js` | 26 | 0 (inline) | 0 | No change |
| **Total JS** | **1551** | **87** | **54** | |

| Test File | Tests | Lines | Change Since Scan #4 |
|-----------|-------|-------|---------------------|
| `test/helpers.test.js` | 27 | 181 | No change |
| `test/filesystem.test.js` | 37 | 339 | No change |
| `test/security.test.js` | 30 | 151 | No change |
| `test/cli-quality.test.js` | 22 | 182 | No change |
| **Total Tests** | **116** | **853** | No change |

### Command Files

| Category | Count | Source |
|----------|-------|--------|
| Total .md files in `commands/` | 43 | `getCommandFiles()` verified |
| GSD-T commands (`gsd-t-*.md`) | 39 | `getGsdtCommands()` verified |
| Utility commands | 4 | `branch.md`, `checkin.md`, `Claude-md.md`, `gsd.md` |

All counts match CLAUDE.md, README.md, and package.json description.

---

## Function Length Inventory

**Project standard: functions MUST be <= 30 lines. ALL 87 FUNCTIONS PASS.**

### `bin/gsd-t.js` — 81 functions

| Size Bucket | Count | Examples |
|-------------|-------|---------|
| 1-5 lines | 23 | `log()`, `success()`, `validateProjectName()`, `applyTokens()`, `getGsdtCommands()`, `readSettingsJson()` |
| 6-10 lines | 17 | `ensureDir()`, `isSymlink()`, `readProjectDeps()`, `isNewerVersion()`, `addHeartbeatHook()` |
| 11-15 lines | 12 | `hasSymlinkInPath()`, `copyFile()`, `doDoctor()`, `removeInstalledCommands()`, `fetchVersionSync()` |
| 16-20 lines | 14 | `getRegisteredProjects()`, `registerProject()`, `installGlobalClaudeMd()`, `doInstall()`, `doUpdate()`, `checkForUpdates()` |
| 21-25 lines | 10 | `installCommands()`, `initClaudeMd()`, `showInitTree()`, `showHelp()`, `doInit()` |
| 26-30 lines | 5 | `installHeartbeat(29)`, `configureHeartbeatHooks(23)`, `checkDoctorEnvironment(26)`, `checkProjectHealth(26)`, `doRegister(30)` |
| Over 30 | **0** | — |

**Borderline functions (28-30 lines):**
- `doRegister()` — 30 lines (L1047-1076). Exactly at limit.
- `installHeartbeat()` — 29 lines (L314-342). Safe.

### `scripts/gsd-t-heartbeat.js` — 6 functions

| Function | Lines | Location | Status |
|----------|-------|----------|--------|
| `cleanupOldHeartbeats()` | 17 | L75-91 | OK |
| `buildEvent()` | 5 | L105-109 | OK |
| `scrubSecrets()` | 8 | L117-124 | OK |
| `scrubUrl()` | 11 | L126-136 | OK |
| `summarize()` | 30 | L138-167 | BORDERLINE (exactly 30) |
| `shortPath()` | 14 | L169-182 | OK |

**`summarize()` at exactly 30 lines** — contains a 10-case switch statement. If a new tool type is added, this function will exceed the limit. See NEW-020 below.

---

## Dead Code Analysis

### Found: 1 item

**`PKG_EXAMPLES` constant — unused.**
- **File:** `bin/gsd-t.js` line 39
- **Definition:** `const PKG_EXAMPLES = path.join(PKG_ROOT, "examples");`
- **References:** Zero (only the definition line)
- **Impact:** Negligible — 1 line of dead code, no functional impact
- **Fix:** Remove the line

### Verified clean:
- All 81 named functions in `bin/gsd-t.js` are reachable (called by another function, referenced from `switch` in main, or in `module.exports`)
- All 6 named functions in `gsd-t-heartbeat.js` are reachable
- No commented-out code blocks in any JS file
- No orphaned imports

---

## Duplication Patterns

### DUP-001 (RESOLVED): `hasSwagger()` / `hasApi()` shared parsing
Resolved in M6 with `readProjectDeps()` and `readPyContent()`.

### DUP-002 (RESOLVED): Settings JSON parsed 3 times
Resolved in M8 with `readSettingsJson()` (line 1106). All 3 call sites now use the shared helper: `configureHeartbeatHooks()` (L345), `showStatusTeams()` (L698), `checkDoctorSettings()` (L984).

### DUP-003 (RESOLVED): Template-write-or-skip pattern
Resolved in M6 with `writeTemplateFile()`.

### DUP-004 (NEW — LOW): `summarize()` case fallthrough opportunity
- **File:** `scripts/gsd-t-heartbeat.js` lines 141-146
- **Pattern:** Three switch cases (`Read`, `Edit`, `Write`) return identical `{ file: shortPath(input.file_path) }`
- **Impact:** 4 lines of duplication within a single function (cosmetic)
- **Fix:** Use case fallthrough:
  ```javascript
  case "Read":
  case "Edit":
  case "Write":
    return { file: shortPath(input.file_path) };
  ```
  This would also reclaim 4 lines, bringing `summarize()` from 30 to 26 lines — adding headroom for future tool types.

### DUP-005 (NEW — LOW): Python file iteration repeated
- **File:** `bin/gsd-t.js` lines 208-210 and 218-221
- **Pattern:** Both `hasSwagger()` and `hasApi()` independently loop over `["requirements.txt", "pyproject.toml"]` calling `readPyContent()`
- **Impact:** Minimal — these functions are only called during `doctor` and `update-all` commands
- **Note:** Previously tracked as part of DUP-001 in scan #3. The `readPyContent()` extraction reduced but did not eliminate the duplication of the loop pattern. The remaining duplication is acceptable — abstracting further would over-engineer for 2 occurrences.

---

## Complexity Analysis

### No hotspots

All scan #3 and #4 complexity hotspots remain resolved. The M8 `readSettingsJson()` extraction simplified 3 call sites.

### Redundant condition in `checkForUpdates()`

- **File:** `bin/gsd-t.js` line 1098-1103
- **Code:**
  ```javascript
  const isStale = !cached || (Date.now() - cached.timestamp) > 3600000;
  if (!cached && isStale) {         // line 1099
    fetchVersionSync();
  } else if (isStale) {             // line 1101
    refreshVersionAsync();
  }
  ```
- **Issue:** When `!cached` is true, `isStale` is trivially true (since `isStale = !cached || ...`). So `!cached && isStale` is equivalent to just `!cached`. The code works correctly but the condition is redundant/misleading.
- **Impact:** Zero — purely readability
- **Fix:** Simplify to `if (!cached) { ... } else if (isStale) { ... }` or add a comment explaining the intent

---

## Error Handling Assessment

### Previously tracked gaps

| ID | Description | Status |
|----|------------|--------|
| ERR-001 | `doUpdateAll()` no per-project error isolation | **RESOLVED** (M6) |
| ERR-002 | `checkForUpdates()` inline eval fragile | **RESOLVED** (M6) |
| ERR-003 | `doChangelog()` no detailed error for missing `xdg-open` | **UNCHANGED** — Low priority |
| ERR-004 | Heartbeat stdin handler broad silent catch | **UNCHANGED** — Appropriate (heartbeat must never interfere with Claude Code) |

### Positive patterns

- Every `fs.writeFileSync` call has a symlink check before it (18+ sites)
- Every `fs.copyFileSync` is wrapped in try/catch with descriptive error messages
- `getRegisteredProjects()` filters out invalid paths with warnings
- `configureHeartbeatHooks()`, `showStatusTeams()`, `checkDoctorSettings()` all use `readSettingsJson()` which handles parse errors gracefully
- `fetchVersionSync()` has 8-second timeout on network calls
- `npm-update-check.js` validates cache path within `~/.claude/` and bounds HTTP responses to 1MB

**No new error handling gaps identified.**

---

## Test Coverage Assessment

### Test Infrastructure

- **Framework:** Node.js built-in test runner (`node:test`)
- **Config:** `package.json` → `"test": "node --test"`, `"prepublishOnly": "npm test"`
- **Zero external test dependencies** — uses `node:assert/strict`
- **Test results:** 116 tests, 25 suites, all passing, 0 failures

### Coverage Map — Directly Tested Functions

| Source | Function | Test File | Tests |
|--------|----------|-----------|-------|
| `bin/gsd-t.js` | `validateProjectName()` | helpers.test.js | 7 |
| `bin/gsd-t.js` | `applyTokens()` | helpers.test.js | 4 |
| `bin/gsd-t.js` | `normalizeEol()` | helpers.test.js | 4 |
| `bin/gsd-t.js` | `validateVersion()` | helpers.test.js | 4 |
| `bin/gsd-t.js` | `isNewerVersion()` | helpers.test.js | 6 |
| `bin/gsd-t.js` | `PKG_VERSION` / `PKG_ROOT` | helpers.test.js | 2 |
| `bin/gsd-t.js` | `isSymlink()` | filesystem.test.js | 3 |
| `bin/gsd-t.js` | `hasSymlinkInPath()` | filesystem.test.js + security.test.js | 6 |
| `bin/gsd-t.js` | `ensureDir()` | filesystem.test.js | 3 |
| `bin/gsd-t.js` | `validateProjectPath()` | filesystem.test.js | 4 |
| `bin/gsd-t.js` | `copyFile()` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | `hasPlaywright()` | filesystem.test.js | 3 |
| `bin/gsd-t.js` | `hasSwagger()` | filesystem.test.js | 5 |
| `bin/gsd-t.js` | `hasApi()` | filesystem.test.js | 4 |
| `bin/gsd-t.js` | `getCommandFiles()` | filesystem.test.js | 2 |
| `bin/gsd-t.js` | `getGsdtCommands()` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | `getUtilityCommands()` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | `readProjectDeps()` | cli-quality.test.js | 3 |
| `bin/gsd-t.js` | `readPyContent()` | cli-quality.test.js | 2 |
| `bin/gsd-t.js` | `insertGuardSection()` | cli-quality.test.js | 3 |
| `bin/gsd-t.js` | `readUpdateCache()` | cli-quality.test.js | 1 |
| `bin/gsd-t.js` | `addHeartbeatHook()` | cli-quality.test.js | 3 |
| `bin/gsd-t.js` | Command counts (43/39/4) | filesystem.test.js | 3 |
| `bin/gsd-t.js` | CLI `--version` / `-v` | filesystem.test.js | 2 |
| `bin/gsd-t.js` | CLI `help` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | CLI `status` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | CLI `doctor` | filesystem.test.js | 1 |
| `bin/gsd-t.js` | CLI unknown command | filesystem.test.js | 1 |
| `heartbeat.js` | `scrubSecrets()` | security.test.js | 18 |
| `heartbeat.js` | `scrubUrl()` | security.test.js | 5 |
| `heartbeat.js` | `summarize()` | security.test.js | 4 |
| `heartbeat.js` | `buildEvent()` | cli-quality.test.js | 10 |

### Not Directly Tested — Exported Functions

These are exported in `module.exports` but have no dedicated tests. Categorized by risk:

**MEDIUM risk (side-effect-heavy, would benefit from mock-filesystem tests):**

| Function | Why Not Tested | Impact If Broken |
|----------|---------------|-----------------|
| `doInstall()` / `doUpdate()` | Modifies `~/.claude/` globally | Install/update fails |
| `doInit()` | Creates project directory structure | New project scaffolding fails |
| `doUninstall()` | Deletes from `~/.claude/commands/` | Uninstall fails |
| `installCommands()` | Copies files to `~/.claude/commands/` | Command installation fails |
| `installGlobalClaudeMd()` | Writes to `~/.claude/CLAUDE.md` | Config update fails |

**LOW risk (display-only, network-dependent, or tested indirectly):**

| Function | Category |
|----------|----------|
| `showInstallSummary()` | Display only |
| `showInitTree()` | Display only |
| `showNoProjectsHint()` | Display only |
| `showUpdateAllSummary()` | Display only |
| `showStatusVersion()` | Display only (imported in cli-quality.test.js but never invoked) |
| `showStatusCommands()` | Display only |
| `showStatusConfig()` | Display only |
| `showStatusTeams()` | Display only |
| `showStatusProject()` | Display only |
| `showHelp()` | Display only |
| `doChangelog()` | Browser open side-effect |
| `doRegister()` | File write to `~/.claude/.gsd-t-projects` |
| `updateSingleProject()` | Project CLAUDE.md modification |
| `updateGlobalCommands()` | Delegates to `doInstall()` |
| `updateProjectClaudeMd()` | File write (tested partially via `insertGuardSection`) |
| `createProjectChangelog()` | File write |
| `doUpdateAll()` | Orchestrator (delegates to tested functions) |
| `installHeartbeat()` | File copy + settings.json modification |
| `configureHeartbeatHooks()` | Settings.json modification (tested partially via `addHeartbeatHook`) |
| `removeInstalledCommands()` | File deletion |
| `removeVersionFile()` | File deletion |
| `checkDoctorEnvironment()` | Diagnostic (tested indirectly via CLI `doctor`) |
| `checkDoctorInstallation()` | Diagnostic (tested indirectly via CLI `doctor`) |
| `checkDoctorClaudeMd()` | Diagnostic |
| `checkDoctorSettings()` | Diagnostic |
| `checkDoctorEncoding()` | Diagnostic |
| `checkDoctorProject()` | Diagnostic |
| `checkProjectHealth()` | Diagnostic |
| `getInstalledCommands()` | Filesystem read |
| `getInstalledVersion()` | File read |
| `getRegisteredProjects()` | File read + validation |
| `readSettingsJson()` | File read + JSON parse (NEW in M8, no tests) |
| `fetchVersionSync()` | Network call |
| `refreshVersionAsync()` | Async network call |
| `writeTemplateFile()` | File write (imported in cli-quality.test.js but never invoked) |
| `saveInstalledVersion()` | Not exported, not tested |
| `registerProject()` | Not exported, not tested |
| `updateExistingGlobalClaudeMd()` | Not exported, tested indirectly |
| `appendGsdtToClaudeMd()` | Not exported, tested indirectly |

**Heartbeat — not tested:**

| Function | Category |
|----------|----------|
| `shortPath()` | Exported but no tests (path shortening utility) |
| `cleanupOldHeartbeats()` | Not exported, not tested (filesystem cleanup) |

### Dead imports in test files

| File | Dead Import | Issue |
|------|------------|-------|
| `test/cli-quality.test.js` | `writeTemplateFile` | Imported on L21, never called in any test |
| `test/cli-quality.test.js` | `showStatusVersion` | Imported on L22, never called in any test |

### Coverage summary

| Metric | Value |
|--------|-------|
| Functions with direct unit tests | 32 of 87 (37%) |
| Pure/deterministic functions tested | 100% |
| CLI integration tests | 6 subcommand tests |
| Tests per tested function (avg) | 3.6 |
| Heartbeat functions tested | 4 of 6 (67%) |
| Test quality | Strong — covers happy path, edge cases, error cases, boundaries |

**Assessment:** Good coverage for a zero-dependency CLI tool. All logic-bearing pure functions are tested. The untested 55 functions are primarily side-effect-heavy (filesystem writes, network calls, display-only) and would require mock filesystem infrastructure to test safely. The 116 existing tests provide a solid regression safety net.

---

## CRLF/LF Consistency

| File | Index (git) | Working Copy | Status |
|------|-------------|-------------|--------|
| `bin/gsd-t.js` | LF | CRLF | Expected on Windows with `eol=lf` |
| `scripts/gsd-t-heartbeat.js` | LF | CRLF | Expected on Windows |
| `scripts/gsd-t-fetch-version.js` | LF | LF | OK |
| `scripts/npm-update-check.js` | LF | CRLF | Expected on Windows |

Git index has LF for all JS files per `.gitattributes` rule `*.js text eol=lf`. Working copy CRLF on Windows is expected behavior — git normalizes to LF on commit. **This is fully resolved (TD-049).**

---

## Naming Conventions

### Established patterns (well-organized):

| Pattern | Convention | Examples |
|---------|-----------|---------|
| `do*()` | Top-level CLI subcommand handler | `doInstall()`, `doUpdate()`, `doInit()`, `doStatus()`, `doUninstall()`, `doDoctor()`, `doRegister()`, `doChangelog()`, `doUpdateAll()` |
| `show*()` | Display-only functions (console output) | `showStatusVersion()`, `showInstallSummary()`, `showInitTree()`, `showNoProjectsHint()`, `showUpdateNotice()`, `showHelp()`, `showUpdateAllSummary()` |
| `check*()` | Diagnostic functions returning issue count | `checkDoctorEnvironment()`, `checkDoctorInstallation()`, `checkDoctorClaudeMd()`, `checkDoctorSettings()`, `checkDoctorEncoding()`, `checkDoctorProject()`, `checkProjectHealth()`, `checkForUpdates()` |
| `install*()` | Functions that write files during install/update | `installCommands()`, `installGlobalClaudeMd()`, `installHeartbeat()` |
| `init*()` | Functions that create project structure | `initClaudeMd()`, `initDocs()`, `initGsdtDir()` |
| `update*()` | Functions that modify existing files | `updateProjectClaudeMd()`, `updateExistingGlobalClaudeMd()`, `updateGlobalCommands()`, `updateSingleProject()` |
| `remove*()` | Functions that delete files | `removeInstalledCommands()`, `removeVersionFile()` |
| `get*()` | Pure data retrieval | `getCommandFiles()`, `getGsdtCommands()`, `getUtilityCommands()`, `getInstalledCommands()`, `getInstalledVersion()`, `getRegisteredProjects()` |
| `read*()` | File read + parse | `readProjectDeps()`, `readPyContent()`, `readSettingsJson()`, `readUpdateCache()` |
| `validate*()` | Input validation returning boolean | `validateProjectName()`, `validateVersion()`, `validateProjectPath()` |
| `has*()` | Feature detection returning boolean | `hasPlaywright()`, `hasSwagger()`, `hasApi()`, `hasSymlinkInPath()` |
| `is*()` | State check returning boolean | `isSymlink()`, `isNewerVersion()` |

### Minor inconsistencies (unchanged from scan #4):

| ID | Description | Impact |
|----|------------|--------|
| NAME-001 | `do*` vs verb-only function naming | Established convention now. `do*` = CLI subcommand, bare verb = helper |
| NAME-002 | `getInstalledCommands()` vs `getCommandFiles()` naming ambiguity | Low — semantically clear in context (installed = user's ~/.claude, command = package's commands/) |

---

## TODO/FIXME Comments

**None found.** Zero TODO, FIXME, HACK, XXX, or WORKAROUND comments in any JS file.

---

## Documentation-Code Drift

### DRIFT-001 (RESOLVED): Command Counts
All counts match: 43 total, 39 GSD-T, 4 utility across CLAUDE.md, README.md, and package.json.

### DRIFT-002 (RESOLVED): CLAUDE.md Version Reference
M8 changed line 55 from `package.json — npm package config (v2.23.0)` to `package.json — npm package config (see package.json for version)`.

### DRIFT-003 (RESOLVED): CHANGELOG.md Missing M4-M7 Entries
M8 added entries for v2.23.1 through v2.24.4.

### DRIFT-004 (NEW): techdebt.md SEC-N16 Note Inaccurate
- **File:** `.gsd-t/techdebt.md` line 116
- **Current text:** "scrubSecrets() regex patterns don't use the /g flag"
- **Actual:** All 4 regex constants (`SECRET_FLAGS`, `SECRET_SHORT`, `SECRET_ENV`, `BEARER_HEADER`) at lines 112-115 of `scripts/gsd-t-heartbeat.js` use the `/gi` flag (global + case-insensitive)
- **Impact:** Informational note is factually wrong. The code is correct — the `/g` flag causes `String.prototype.replace()` to replace ALL matches, which is the desired behavior
- **Fix:** Correct the note or remove it

---

## Security Assessment (Brief)

All actionable security items remain resolved. TD-029 (TOCTOU race) accepted as risk with documented rationale.

| Area | Status |
|------|--------|
| Command injection (doctor) | RESOLVED — `execFileSync` with array args |
| Symlink attacks (all write paths) | RESOLVED — `isSymlink()` + `hasSymlinkInPath()` checks |
| Sensitive data in heartbeat logs | RESOLVED — `scrubSecrets()` + `scrubUrl()` (M8 added notification scrubbing) |
| Arbitrary path write (npm-update-check) | RESOLVED — path validation within `~/.claude/` |
| Unbounded HTTP response | RESOLVED — 1MB limits |
| Session ID path traversal (heartbeat) | RESOLVED — `SAFE_SID` regex + resolved path check |
| TOCTOU race in symlink check | ACCEPTED RISK (TD-029) — see techdebt.md |

### Regex global flag note
The 4 `scrubSecrets` regex patterns at `scripts/gsd-t-heartbeat.js` lines 112-115 are module-level constants with `/gi` flags. Since they are only used with `String.prototype.replace()` (never `.test()` or `.exec()`), the mutable `lastIndex` state is not a concern. If any future code calls `.test()` or `.exec()` on these regex objects, it would cause intermittent failures due to stateful `lastIndex`. This is not a bug today but is a latent risk to be aware of.

---

## New Issues Found This Scan

### NEW-020: `summarize()` at exactly 30 lines — case fallthrough opportunity
- **Severity:** LOW
- **File:** `scripts/gsd-t-heartbeat.js` lines 138-167
- **Problem:** Function is at the 30-line limit. Three switch cases (`Read`, `Edit`, `Write`) have identical return values and should use case fallthrough. Adding any new tool type will exceed the limit.
- **Fix:** Combine identical cases:
  ```javascript
  case "Read":
  case "Edit":
  case "Write":
    return { file: shortPath(input.file_path) };
  ```
  This saves 4 lines, bringing the function to 26 lines and adding headroom.

### NEW-021: `PKG_EXAMPLES` constant is dead code
- **Severity:** LOW
- **File:** `bin/gsd-t.js` line 39
- **Problem:** `const PKG_EXAMPLES = path.join(PKG_ROOT, "examples");` is defined but never referenced anywhere
- **Fix:** Remove the line

### NEW-022: Dead imports in `test/cli-quality.test.js`
- **Severity:** LOW
- **File:** `test/cli-quality.test.js` lines 21-22
- **Problem:** `writeTemplateFile` and `showStatusVersion` are imported but never used in any test
- **Fix:** Either remove the imports or add tests that exercise these functions

### NEW-023: `readSettingsJson()` exported but untested
- **Severity:** LOW
- **File:** `bin/gsd-t.js` line 1106, exported at line 1239
- **Problem:** Added in M8 to resolve DUP-002 but no unit test was added. The function is simple (5 lines) and is tested indirectly via CLI `status` and `doctor` integration tests.
- **Fix:** Add a test in `cli-quality.test.js`:
  ```javascript
  describe("readSettingsJson", () => {
    it("returns null when settings.json does not exist", () => {
      // readSettingsJson reads SETTINGS_JSON constant
      const result = readSettingsJson();
      assert.ok(result === null || typeof result === "object");
    });
  });
  ```

### NEW-024: `shortPath()` exported but untested
- **Severity:** LOW
- **File:** `scripts/gsd-t-heartbeat.js` line 169, exported at line 22
- **Problem:** Exported helper function with zero test coverage. Handles 3 code paths (cwd-relative, home-relative, absolute) and performs backslash-to-forward-slash conversion.
- **Fix:** Add tests in `security.test.js` or a new heartbeat test file

### NEW-025: `checkForUpdates()` redundant condition
- **Severity:** LOW (readability only)
- **File:** `bin/gsd-t.js` line 1099
- **Problem:** `!cached && isStale` is redundant because when `!cached` is true, `isStale` is always true (defined as `!cached || ...`). The logic works correctly but the condition is misleading.
- **Fix:** Simplify to `if (!cached) { fetchVersionSync(); } else if (isStale) { refreshVersionAsync(); }`

### NEW-026: techdebt.md SEC-N16 factual error
- **Severity:** LOW (documentation only)
- **File:** `.gsd-t/techdebt.md` line 116
- **Problem:** States "regex patterns don't use the /g flag" but all 4 patterns DO use `/gi`
- **Fix:** Correct or remove the note

---

## Package.json Health

```json
{
  "name": "@tekyzinc/gsd-t",
  "version": "2.24.4",
  "scripts": {
    "test": "node --test",
    "prepublishOnly": "npm test"
  },
  "main": "bin/gsd-t.js",
  "engines": { "node": ">=16.0.0" },
  "files": ["bin/", "commands/", "scripts/", "templates/", "examples/", "docs/", "CHANGELOG.md"]
}
```

| Check | Status |
|-------|--------|
| Version current | `2.24.4` — matches latest commit |
| Description command count | `43 slash commands` — correct |
| `test` script works | YES — 116 tests, all pass |
| `prepublishOnly` gate | YES — `npm test` runs before publish (NEW in M8) |
| `main` field correct | YES — `bin/gsd-t.js` |
| `engines` specified | YES — `>=16.0.0` |
| `files` array complete | YES — all published directories listed |
| Zero runtime dependencies | YES — no `dependencies` field |
| `bin` field correct | YES — `"gsd-t": "bin/gsd-t.js"` |

**Assessment:** Fully healthy. All scan #4 package.json concerns resolved by M8.

---

## Command File Consistency Audit

### Verified consistent:

| Check | Result |
|-------|--------|
| `$ARGUMENTS` terminator | 41 of 43 (exceptions: `checkin.md`, `Claude-md.md` — intentional) |
| Document Ripple section | Present in all file-modifying commands |
| Autonomy Behavior section | Present in all 10 wave-phase commands |
| QA Agent spawn block | Present in all 9 applicable commands with consistent blocking language |
| Step numbering | Clean integers — zero fractional steps |

### Spot-check (3 files):

| File | Steps | Structure | Issues |
|------|-------|-----------|--------|
| `gsd-t-wave.md` | Steps 1-5 (integers) | Autonomy, Error Recovery, Security, Workflow Viz | None |
| `gsd-t-execute.md` | Steps 1-6 (integers) | QA Spawn, Autonomy, Document Ripple, Solo+Team | None |
| `gsd-t-partition.md` | Steps 1-8 (integers) | QA Spawn, Autonomy, Document Ripple | None |

---

## Summary

| Category | Scan #4 | Scan #5 | Change |
|----------|---------|---------|--------|
| Functions over 30 lines | 0 | **0** | Stable |
| Test files / tests | 4 / 116 | **4 / 116** | Stable |
| Total functions | 86 | **87** (+1: readSettingsJson) | +1 |
| Total exports | 53 | **54** (+1: readSettingsJson) | +1 |
| Duplication patterns open | 1 (DUP-002) | **0** (+1 new cosmetic) | DUP-002 resolved |
| Complexity hotspots | 0 | **0** | Stable |
| Error handling gaps | 2 (ERR-003, ERR-004) | **2** (unchanged) | Stable |
| Naming inconsistencies | 2 | **2** | Stable |
| Documentation-code drift | 2 | **1** (SEC-N16 note) | Improved |
| Dead code items | 0 | **1** (PKG_EXAMPLES) | New finding |
| CRLF consistency | Config exists, not applied | **Fully resolved** | Improved |
| Fractional step numbering | 0 | **0** | Stable |
| Security items open | 0 (1 accepted) | **0** (1 accepted) | Stable |

### Open Items by Priority

| Priority | Count | Items |
|----------|-------|-------|
| HIGH | **0** | — |
| MEDIUM | **0** | — |
| LOW | **7** | NEW-020 (summarize fallthrough), NEW-021 (PKG_EXAMPLES dead), NEW-022 (dead imports), NEW-023 (readSettingsJson untested), NEW-024 (shortPath untested), NEW-025 (redundant condition), NEW-026 (SEC-N16 note wrong) |

### Trend Analysis

| Metric | Scan #1 | Scan #2 | Scan #3 | Scan #4 | Scan #5 | Trend |
|--------|---------|---------|---------|---------|---------|-------|
| Open items (total) | 13 | 15 | 26 | 5 | **7** | Stable (all LOW) |
| Critical items | 2 | 0 | 0 | 0 | **0** | Stable |
| HIGH items | 3 | 2 | 2 | 0 | **0** | Stable |
| MEDIUM items | 4 | 5 | 8 | 1 | **0** | Resolved |
| LOW items | 4 | 8 | 16 | 4 | **7** | New findings, all cosmetic |
| Functions > 30 lines | 13 | 13 | 15 | 0 | **0** | Stable |
| Test files / tests | 0/0 | 0/0 | 0/0 | 4/116 | **4/116** | Stable |
| Duplication patterns | N/A | 3 | 3 | 1 | **0** (+1 cosmetic) | Resolved |
| Command count drift | Yes | Fixed | Regressed | Fixed | **Fixed** | Stable |
| Dead code | 0 | 0 | 0 | 0 | **1** (1 line) | Minor |

### Overall Assessment

**The codebase is in excellent shape.** Milestone 8 resolved all remaining scan #4 items (changelog, version drift, CRLF, DUP-002, prepublishOnly). The 7 new findings are all LOW severity — cosmetic or documentation-only issues. No functional bugs, no security concerns, no structural problems.

**The primary quality improvement opportunity is consolidating the `summarize()` switch cases (NEW-020)** which simultaneously fixes a duplication pattern and creates headroom in a borderline function.

### Priority Recommendations

1. **LOW:** Combine Read/Edit/Write cases in `summarize()` — saves 4 lines, adds headroom (NEW-020)
2. **LOW:** Remove unused `PKG_EXAMPLES` constant (NEW-021)
3. **LOW:** Clean up dead imports in `test/cli-quality.test.js` (NEW-022)
4. **LOW:** Add unit test for `readSettingsJson()` (NEW-023)
5. **LOW:** Add unit test for `shortPath()` (NEW-024)
6. **LOW:** Simplify redundant condition in `checkForUpdates()` (NEW-025)
7. **LOW:** Correct SEC-N16 note in techdebt.md (NEW-026)

All 7 items are individually fixable in under 5 minutes each. A single cleanup pass could resolve all of them.
