# Code Quality Analysis — 2026-02-18

Previous scan: 2026-02-07. This scan reflects the current state after significant work since the first scan.

---

## Previous Tech Debt Status Check

| ID | Title | Previous Status | Current Status | Notes |
|----|-------|-----------------|----------------|-------|
| TD-001 | 25 of 26 Command Files Missing | CRITICAL | **RESOLVED** | All 42 command files present on disk |
| TD-002 | Command Injection in Doctor via execSync | CRITICAL | **RESOLVED** | Line 993: now uses `execFileSync("claude", ["--version"], ...)` |
| TD-003 | No Test Coverage | HIGH | **OPEN** | Still zero test files in the project |
| TD-004 | Missing Error Handling in File Operations | HIGH | **PARTIALLY RESOLVED** | `copyFile()` now has try/catch (line 156-161). `initClaudeMd()`, `initDocs()`, `initGsdtDir()` now catch `EEXIST`. But some paths still lack catch blocks (see Error Handling section) |
| TD-005 | Symlink Attack Vulnerability | HIGH | **RESOLVED** | `isSymlink()` check added at line 114-120, used throughout before writes |
| TD-006 | Brainstorm Command Not Documented | HIGH | **RESOLVED** | Brainstorm appears in gsd-t-help.md and all reference files |
| TD-007 | Hardcoded Utility Command List | MEDIUM | **RESOLVED** | `getUtilityCommands()` line 294 now uses convention: non-`gsd-t-` files are utilities |
| TD-008 | CRLF/LF Mismatch Causes False-Positive Updates | MEDIUM | **PARTIALLY RESOLVED** | `normalizeEol()` helper added at line 130-132, used in `installCommands()` (line 408) and `installGlobalClaudeMd()` (line 435). However, the project still has CRLF endings in JS files and no `.gitattributes` or `.editorconfig` to enforce consistency |
| TD-009 | Missing Input Validation on Project Name | MEDIUM | **RESOLVED** | `validateProjectName()` added at line 122-124 with regex validation |
| TD-010 | Large Functions Approaching Complexity | MEDIUM | **PARTIALLY RESOLVED** | `doInstall()` split into `installCommands()` + `installGlobalClaudeMd()`. `doDoctor()` split into `checkDoctorEnvironment()` + `checkDoctorInstallation()` + `checkDoctorProject()`. `doStatus()` still 98 lines. New large functions introduced (see Complexity section) |
| TD-012 | Package.json Missing Metadata | LOW | **RESOLVED** | `scripts.test` and `main` fields now present |
| TD-013 | Template Token Duplication | LOW | **RESOLVED** | `applyTokens()` helper added at line 126-128, used by `initClaudeMd()`, `initDocs()`, `initGsdtDir()` |

---

## Function Length Inventory — `bin/gsd-t.js`

Project standard: functions MUST be under 30 lines. Flagged functions are marked with :warning:.

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| `log()` | 2 | 77 | OK |
| `success()` | 2 | 80 | OK |
| `warn()` | 2 | 83 | OK |
| `error()` | 2 | 86 | OK |
| `info()` | 2 | 89 | OK |
| `heading()` | 2 | 92 | OK |
| `link()` | 2 | 95 | OK |
| `versionLink()` | 2 | 98 | OK |
| `ensureDir()` | 10 | 102 | OK |
| `isSymlink()` | 6 | 114 | OK |
| `validateProjectName()` | 2 | 122 | OK |
| `applyTokens()` | 2 | 126 | OK |
| `normalizeEol()` | 2 | 130 | OK |
| `validateVersion()` | 2 | 134 | OK |
| `validateProjectPath()` | 10 | 138 | OK |
| `copyFile()` | 11 | 151 | OK |
| `hasPlaywright()` | 4 | 164 | OK |
| `hasSwagger()` | **32** | 169 | :warning: OVER 30 |
| `hasApi()` | **24** | 203 | OK |
| `getInstalledVersion()` | 6 | 228 | OK |
| `saveInstalledVersion()` | 10 | 236 | OK |
| `getRegisteredProjects()` | 15 | 248 | OK |
| `registerProject()` | 16 | 265 | OK |
| `getCommandFiles()` | 5 | 283 | OK |
| `getGsdtCommands()` | 2 | 290 | OK |
| `getUtilityCommands()` | 2 | 294 | OK |
| `getInstalledCommands()` | 8 | 298 | OK |
| `installHeartbeat()` | 27 | 317 | OK |
| `configureHeartbeatHooks()` | **42** | 347 | :warning: OVER 30 |
| `installCommands()` | **30** | 393 | BORDERLINE |
| `installGlobalClaudeMd()` | **41** | 425 | :warning: OVER 30 |
| `doInstall()` | **37** | 468 | :warning: OVER 30 |
| `doUpdate()` | 18 | 507 | OK |
| `initClaudeMd()` | 22 | 527 | OK |
| `initDocs()` | 22 | 551 | OK |
| `initGsdtDir()` | **50** | 574 | :warning: OVER 30 |
| `doInit()` | **47** | 626 | :warning: OVER 30 |
| `doStatus()` | **98** | 675 | :warning: OVER 30 |
| `doUninstall()` | **39** | 775 | :warning: OVER 30 |
| `updateProjectClaudeMd()` | **34** | 816 | :warning: OVER 30 |
| `createProjectChangelog()` | 23 | 852 | OK |
| `checkProjectHealth()` | 25 | 877 | OK |
| `doUpdateAll()` | **78** | 904 | :warning: OVER 30 |
| `checkDoctorEnvironment()` | 25 | 983 | OK |
| `checkDoctorInstallation()` | **52** | 1010 | :warning: OVER 30 |
| `checkDoctorProject()` | 22 | 1065 | OK |
| `doDoctor()` | 14 | 1089 | OK |
| `doRegister()` | 29 | 1105 | OK |
| `isNewerVersion()` | 8 | 1136 | OK |
| `checkForUpdates()` | **45** | 1146 | :warning: OVER 30 |
| `showUpdateNotice()` | 9 | 1193 | OK |
| `doChangelog()` | 16 | 1203 | OK |
| `showHelp()` | 30 | 1220 | BORDERLINE |

**Summary:** 13 functions exceed 30 lines. 2 functions are at exactly 30 lines (borderline). The largest is `doStatus()` at 98 lines.

### Functions Requiring Extraction — `scripts/gsd-t-heartbeat.js`

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| `cleanupOldHeartbeats()` | 16 | 67 | OK |
| `buildEvent()` | 69 | 85 | :warning: OVER 30 |
| `summarize()` | 28 | 157 | OK |
| `shortPath()` | 13 | 188 | OK |
| stdin `on("end")` handler | 32 | 31 | :warning: OVER 30 |

### Functions — `scripts/npm-update-check.js`

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| Main script (no named functions) | 27 | 1 | OK |

---

## Dead Code

- **None found.** All functions in `bin/gsd-t.js` are reachable from the `switch` statement at line 1257. All helpers are called by at least one command function.
- No commented-out code blocks in any JS file.

---

## Duplication

### DUP-001: `hasSwagger()` and `hasApi()` share identical package.json parsing pattern
- **Files:** `bin/gsd-t.js` lines 169-201 vs 203-226
- **Pattern:** Both functions do `fs.existsSync(pkgPath) → JSON.parse(fs.readFileSync(...)) → Object.keys(dependencies).concat(devDependencies) → someArray.some(...)`. Both also iterate Python files with the same `pyFiles` loop pattern.
- **Fix:** Extract a `getDependencies(projectDir)` helper and a `hasPythonDep(projectDir, name)` helper.

### DUP-002: JSON.parse(fs.readFileSync(SETTINGS_JSON)) repeated 3 times
- **Files:** `bin/gsd-t.js` lines 351, 732, 1039
- **Pattern:** Each caller opens `SETTINGS_JSON`, parses it, and handles parse errors independently.
- **Fix:** Extract `readSettingsJson()` helper returning parsed object or null.

### DUP-003: Template-write-or-skip pattern repeated across `initClaudeMd()`, `initDocs()`, `initGsdtDir()`
- **Files:** `bin/gsd-t.js` lines 527-548, 551-572, 574-624
- **Pattern:** Read template → apply tokens → `writeFileSync` with `{ flag: "wx" }` → catch `EEXIST` → info skip. Done identically for each template file.
- **Fix:** Extract `writeTemplate(templateName, destPath, projectName, today, label)` helper.

---

## Complexity Hotspots

### CMPLX-001: `doStatus()` — 98 lines (line 675-773)
- **Cyclomatic complexity:** ~15 (5 major if/else branches for version, commands, CLAUDE.md, settings, project)
- **Problem:** Checks 5 independent aspects sequentially in one function. Each could be extracted.
- **Fix:** Extract `statusVersion()`, `statusCommands()`, `statusGlobalConfig()`, `statusTeams()`, `statusCurrentProject()`.

### CMPLX-002: `doUpdateAll()` — 78 lines (line 904-981)
- **Cyclomatic complexity:** ~10
- **Problem:** Handles global update + project iteration + health check + summary in one function.
- **Fix:** The project loop (lines 936-961) could be extracted as `updateSingleProject()`.

### CMPLX-003: `checkDoctorInstallation()` — 52 lines (line 1010-1063)
- **Cyclomatic complexity:** ~8
- **Problem:** 4 independent checks (commands, CLAUDE.md, settings, encoding) in one function.
- **Fix:** Could split encoding check into `checkDoctorEncoding()`.

### CMPLX-004: `checkForUpdates()` — 45 lines (line 1146-1191)
- **Cyclomatic complexity:** ~8 (3 code paths: show cached, sync fetch, background refresh)
- **Problem:** Inline JavaScript string for fetching version (line 1169) is particularly hard to read and maintain.
- **Fix:** The inline script is necessary for a zero-dependency approach, but the 3 code paths should be separate functions.

### CMPLX-005: `buildEvent()` in heartbeat — 69 lines (line 85-155)
- **Cyclomatic complexity:** ~10 (switch with 9 cases)
- **Problem:** Long switch statement mapping hook events to internal events. Each case is simple but the function is long.
- **Fix:** Use a lookup object `const EVENT_MAP = { SessionStart: (hook) => ({ evt: "session_start", ... }), ... }` to reduce the function to ~5 lines.

---

## Error Handling Gaps

### ERR-001: `doUpdateAll()` project iteration — no try/catch around individual projects
- **File:** `bin/gsd-t.js` lines 936-961
- **Problem:** If `updateProjectClaudeMd()` throws on one project (e.g., permission denied on CLAUDE.md), the entire loop aborts. Remaining projects are not updated.
- **Fix:** Wrap each project iteration in try/catch with `error()` logging.

### ERR-002: `checkForUpdates()` inline eval — fragile sync fetch
- **File:** `bin/gsd-t.js` line 1169
- **Problem:** The inline JavaScript string `fetchScript` is executed via `execFileSync`. If Node.js changes behavior or the inline code has a subtle bug, it fails silently with an empty catch. This is acceptable (non-critical), but the lack of any timeout feedback is confusing.
- **Impact:** Low — failure is silent and non-blocking.

### ERR-003: `doChangelog()` — platform detection without error detail
- **File:** `bin/gsd-t.js` line 1203-1218
- **Problem:** On Linux, `xdg-open` may not be installed. The error is caught but the user only sees the URL fallback with no explanation of why the browser didn't open.
- **Fix:** Add info message: "Could not open browser — install xdg-open or visit the URL above."

### ERR-004: Heartbeat stdin handler — broad silent catch
- **File:** `scripts/gsd-t-heartbeat.js` line 62
- **Problem:** The entire stdin handler is wrapped in a single `try { ... } catch (e) {}` that silently swallows all errors. This is intentional (never interfere with Claude Code) but makes debugging heartbeat issues impossible.
- **Fix:** Log to a debug file or stderr when `GSD_T_DEBUG` env var is set.

---

## Performance Issues

### PERF-001: `hasSwagger()` reads package.json + Python files on every call
- **File:** `bin/gsd-t.js` lines 169-201
- **Problem:** `hasSwagger()` and `hasApi()` both independently read the same `package.json` for the same project. When called together (as in `checkProjectHealth()` line 886), the same file is read and parsed twice.
- **Impact:** Low — only affects `doctor` and `update-all` commands, and only for projects with package.json.
- **Fix:** Pass parsed package.json data as parameter, or cache per-project.

### PERF-002: `cleanupOldHeartbeats()` runs on every event
- **File:** `scripts/gsd-t-heartbeat.js` line 57
- **Problem:** `cleanupOldHeartbeats(gsdtDir)` calls `fs.readdirSync` + `fs.lstatSync` for every heartbeat file, on every single hook event. In a busy session with many tool uses, this runs hundreds of times.
- **Impact:** Medium — adds filesystem overhead to every Claude Code tool invocation.
- **Fix:** Rate-limit cleanup to once per minute or once per session start, not on every event. A simple approach: only run cleanup when `hook_event_name === "SessionStart"`.

---

## Naming Inconsistencies

### NAME-001: Mixed function naming: `do*` vs verb-only
- **File:** `bin/gsd-t.js`
- **Pattern:** Main commands use `doInstall()`, `doUpdate()`, `doInit()` etc. (with `do` prefix). But helpers use bare verbs: `installCommands()`, `installHeartbeat()`, `installGlobalClaudeMd()`, `copyFile()`.
- **Impact:** Low — the convention is somewhat clear (`do*` = top-level subcommand, bare = helper) but it is not documented.
- **Recommendation:** Document in CLAUDE.md Conventions: "`do*()` prefix for CLI subcommand entry points, bare verbs for internal helpers."

### NAME-002: `getInstalledCommands()` vs `getCommandFiles()` — similar but different
- **File:** `bin/gsd-t.js` lines 283 vs 298
- **Problem:** `getCommandFiles()` returns package source command files. `getInstalledCommands()` returns installed command files that match our known commands. The names are similar but the semantics are different. `getCommandFiles()` would more precisely be `getPackageCommandFiles()`.
- **Impact:** Low — code works correctly, naming is slightly ambiguous.

---

## Unresolved Developer Notes

- None found. No TODO, FIXME, HACK, XXX, or WORKAROUND comments in any JS or MD file.

---

## Test Coverage Gaps (TD-003 — STILL OPEN)

**Zero test files exist in the project.** `package.json` has `"test": "node --test"` but no test files exist for it to find.

### Critical paths needing tests (prioritized):

**P0 — Core commands:**
1. `doInstall()` — fresh install, update mode, CLAUDE.md merge/append/backup, command counting
2. `doInit()` — empty dir, existing files, token replacement, project registration
3. `doUpdate()` — same version skip, version mismatch, content diff
4. `doUninstall()` — normal removal, already-removed files, CLAUDE.md preservation

**P1 — Helper functions:**
5. `validateProjectName()` — valid names, edge cases (empty, too long, special chars)
6. `applyTokens()` — token replacement, no tokens, partial tokens
7. `normalizeEol()` — CRLF → LF conversion
8. `validateVersion()` — valid semver, invalid formats
9. `isNewerVersion()` — all comparison cases
10. `isSymlink()` — real file, symlink, non-existent
11. `getRegisteredProjects()` — valid file, empty file, missing file, invalid paths

**P2 — Detection functions:**
12. `hasPlaywright()` — with/without config files
13. `hasSwagger()` — spec files, package deps, Python deps
14. `hasApi()` — Node frameworks, Python frameworks, no frameworks
15. `configureHeartbeatHooks()` — fresh settings, existing hooks, invalid JSON

**P3 — Integration:**
16. `installHeartbeat()` — script copy, hook configuration
17. `doStatus()` — all 5 display sections
18. `doDoctor()` — all diagnostic paths (pass and fail)
19. `doUpdateAll()` — with/without registered projects
20. `checkForUpdates()` — cached, stale, missing cache

### Recommended test framework:
Node.js built-in test runner (`node --test`) — already configured in `package.json`. Zero additional dependencies needed.

---

## Command File Quality — Consistency Analysis

### 42 command files analyzed across 5 dimensions:

#### 1. `$ARGUMENTS` Terminator
- **Convention:** Every command file should end with `$ARGUMENTS` as the final line to accept user input.
- **Present:** 40 of 42 files
- **Missing:** `checkin.md`, `Claude-md.md`
- **Impact:** These 2 utility commands do not accept passthrough arguments. This may be intentional for `Claude-md.md` (no args needed) but `checkin.md` could benefit from accepting a commit message argument.

#### 2. Document Ripple Section
- **Convention:** Commands that modify files should have a "Document Ripple" section listing which docs to update.
- **Present:** 27 of 42 files have an explicit Document Ripple section
- **Appropriately absent:** 15 files are read-only or conversational commands where Document Ripple does not apply:
  - `gsd-t-help.md` — read-only display
  - `gsd-t-status.md` — read-only display
  - `gsd-t-resume.md` — state recovery, not modification
  - `gsd-t-prompt.md` — conversational
  - `gsd-t-brainstorm.md` — optional save only
  - `gsd-t-wave.md` — orchestrator (delegates to sub-commands which have their own ripples)
  - `gsd-t-version-update.md` / `gsd-t-version-update-all.md` — meta-commands
  - `gsd-t-log.md` — modifies only progress.md (self-contained)
  - `gsd.md` — router, no direct modification
  - `branch.md` — git only
  - `checkin.md` — references Pre-Commit Gate from CLAUDE.md
  - `Claude-md.md` — read-only
  - `gsd-t-backlog-list.md` — read-only
  - `gsd-t-init-scan-setup.md` — delegates to sub-commands
- **Verdict:** **Good coverage.** All file-modifying commands have Document Ripple sections.

#### 3. Destructive Action Guard Reference
- **Convention:** Commands that execute code changes should reference the Destructive Action Guard.
- **Present:** 5 of 42 files: `gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-setup.md`, `gsd-t-quick.md`, `gsd-t-debug.md`
- **Appropriate coverage:** These are the 5 commands that directly modify source code. Other commands modify only `.gsd-t/` state files or docs, which are not destructive.
- **Verdict:** **Correct.**

#### 4. Autonomy Behavior Section
- **Convention:** Commands that auto-advance should document Level 1-2 vs Level 3 behavior.
- **Present:** 8 of 42 files: `gsd-t-verify.md`, `gsd-t-test-sync.md`, `gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-partition.md`, `gsd-t-plan.md`, `gsd-t-integrate.md`, `gsd-t-init-scan-setup.md`
- **Missing from wave-phase commands:** `gsd-t-discuss.md` mentions pausing at Level 3 but has no formal Autonomy Behavior section. `gsd-t-impact.md` has no Autonomy Behavior section despite being a wave phase.
- **Verdict:** **Minor inconsistency.** `gsd-t-discuss.md` and `gsd-t-impact.md` should have explicit Autonomy Behavior sections to match the pattern of other wave-phase commands.

#### 5. Test Verification Section
- **Convention:** Commands that modify code or state should verify tests pass before committing.
- **Present in dedicated section:** `gsd-t-setup.md`, `gsd-t-populate.md`
- **Embedded in workflow steps:** `gsd-t-execute.md` (Step 8), `gsd-t-quick.md` (Step 5), `gsd-t-debug.md` (Step 5), `gsd-t-verify.md` (Step 3), `gsd-t-scan.md` (Step 5.5), `gsd-t-init.md` (Step 7.7), `gsd-t-milestone.md` (Step 4.6), `gsd-t-partition.md` (Step 4.6), `gsd-t-complete-milestone.md` (Step 7.6), `gsd-t-integrate.md` (Step 5.5), `gsd-t-wave.md` (embedded in each phase)
- **Missing:** `gsd-t-feature.md`, `gsd-t-project.md` — these modify docs but do not run test suites.
- **Verdict:** **Good.** All code-modifying commands verify tests. Doc-only commands appropriately skip.

#### 6. Step Numbering Convention
- **Convention:** Steps use `## Step N:` format.
- **Inconsistency found:** Some commands use fractional steps (`Step 4.5`, `Step 5.5`, `Step 7.5`, `Step 7.6`, `Step 7.7`). This suggests sections were added incrementally without renumbering.
- **Affected files:** `gsd-t-milestone.md`, `gsd-t-partition.md`, `gsd-t-plan.md`, `gsd-t-init.md`, `gsd-t-complete-milestone.md`, `gsd-t-integrate.md`, `gsd-t-impact.md`, `gsd-t-scan.md`, `gsd-t-promote-debt.md`, `gsd-t-project.md`, `gsd-t-feature.md`
- **Impact:** Low — Claude can follow fractional steps. But it creates visual inconsistency and suggests organic growth without cleanup.
- **Recommendation:** Renumber steps to integers in a future cleanup pass.

---

## CRLF/LF Consistency (TD-008 — STILL PARTIALLY OPEN)

- **JS files:** All 3 JS files (`bin/gsd-t.js`, `scripts/gsd-t-heartbeat.js`, `scripts/npm-update-check.js`) use CRLF line endings.
- **No `.gitattributes`:** No file exists to enforce line ending consistency across platforms.
- **No `.editorconfig`:** No file exists to enforce editor settings.
- **`normalizeEol()` helper exists** at line 130 and is used in content comparison (lines 332, 408, 435), which prevents false-positive update detection.
- **Risk:** Contributors on macOS/Linux will create LF files. When mixed with CRLF files, git diffs become noisy. The `normalizeEol()` helper mitigates the functional impact but not the git noise.
- **Fix:** Add `.gitattributes` with `* text=auto` and `.editorconfig` with `end_of_line = lf`.

---

## Security Observations (non-blocking)

### SEC-OBS-001: Heartbeat writes to project `.gsd-t/` directory
- **File:** `scripts/gsd-t-heartbeat.js` lines 40-60
- **Observation:** The heartbeat script validates `session_id` against `SAFE_SID` regex (line 18), checks `path.isAbsolute()`, verifies resolved path stays within `.gsd-t/`, and checks for symlinks before writing. These are all good mitigations.
- **Remaining concern:** The `cwd` value comes from the hook input (line 35: `hook.cwd || process.cwd()`). If a malicious hook payload provides a crafted `cwd`, the script would write to an arbitrary `.gsd-t/` directory. The `path.isAbsolute()` check at line 38 is the primary defense.
- **Impact:** Very low — the hook input comes from Claude Code itself, not from external sources.

---

## Documentation-Code Drift

### DRIFT-001: CLAUDE.md command counts
- **File:** `CLAUDE.md` line 13
- **Current text:** "42 slash commands (38 GSD-T workflow + 4 utility)"
- **Actual count:** 42 files in `commands/` directory: 38 `gsd-t-*` files + 1 `gsd.md` + 3 utilities (`branch.md`, `checkin.md`, `Claude-md.md`)
- **Breakdown math:** 38 + 1 + 3 = 42 total. But `gsd.md` is categorized as a utility in `getUtilityCommands()` (since it lacks the `gsd-t-` prefix), so the actual split is 38 GSD-T + 4 utility (gsd + branch + checkin + Claude-md).
- **Verdict:** The current text "42 slash commands (38 GSD-T workflow + 4 utility)" is **accurate** if we count `gsd.md` as a utility. However, CLAUDE.md Project Structure section (line 34) says "41 slash commands" which is **incorrect** — it should say 42.

### DRIFT-002: CLAUDE.md Project Structure says "41 slash commands"
- **File:** `CLAUDE.md` line 34
- **Problem:** Says `commands/ — 41 slash commands for Claude Code` but there are 42 files in `commands/`.
- **Fix:** Update to `42 slash commands`.

### DRIFT-003: CLAUDE.md says "37 GSD-T workflow commands" but has 38
- **File:** `CLAUDE.md` line 35
- **Problem:** Says `gsd-t-*.md — 37 GSD-T workflow commands` but `ls commands/gsd-t-*.md | wc -l` yields 38 files.
- **Fix:** Update to `38 GSD-T workflow commands`.

### DRIFT-004: package.json version says v2.20.5 in CLAUDE.md
- **File:** `CLAUDE.md` line 55
- **Problem:** Says `package.json — npm package config (v2.20.5)` but actual `package.json` version is `2.21.1`.
- **Fix:** Update to `v2.21.1` or remove version from the description (it will always drift).

---

## Package.json Assessment

```json
{
  "name": "@tekyzinc/gsd-t",
  "version": "2.21.1",
  "scripts": { "test": "node --test" },
  "main": "bin/gsd-t.js",
  "engines": { "node": ">=16.0.0" }
}
```

- **`test` script:** Present but no test files exist — `node --test` silently passes with 0 tests.
- **`main` field:** Present and correct.
- **`engines`:** Properly specified.
- **`files` array:** Includes `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`. All present.
- **Missing optional metadata:** `bugs`, `funding`. Not critical.
- **Missing `prepublishOnly` script:** No pre-publish validation to catch issues like missing command files before publishing.

---

## New Issues Found This Scan

### NEW-001: `doStatus()` still 98 lines — not decomposed
- **Severity:** MEDIUM
- **Location:** `bin/gsd-t.js` lines 675-773
- **Description:** Previous scan (TD-010) flagged this. `doInstall()` and `doDoctor()` were decomposed, but `doStatus()` was not.
- **Fix:** Extract `statusVersion()`, `statusCommands()`, `statusGlobalConfig()`, `statusTeams()`, `statusCurrentProject()`.

### NEW-002: `doUpdateAll()` is 78 lines with no per-project error isolation
- **Severity:** HIGH
- **Location:** `bin/gsd-t.js` lines 904-981
- **Description:** New function added since last scan. Iterates registered projects but a throw in any project's update aborts the remaining projects. Also handles global update + project updates + health check + summary in one function.
- **Fix:** Wrap per-project logic in try/catch. Extract `updateSingleProject()`.

### NEW-003: `checkDoctorInstallation()` is 52 lines
- **Severity:** MEDIUM
- **Location:** `bin/gsd-t.js` lines 1010-1063
- **Description:** New function added during `doDoctor()` decomposition, but it absorbed multiple independent checks without further splitting.
- **Fix:** Extract encoding check into `checkDoctorEncoding()`.

### NEW-004: `checkForUpdates()` runs inline JS via `execFileSync` — fragile and hard to test
- **Severity:** MEDIUM
- **Location:** `bin/gsd-t.js` line 1169
- **Description:** Contains an inline JavaScript program as a string literal, executed via `execFileSync(process.execPath, ["-e", fetchScript], ...)`. This is hard to read, impossible to unit test, and fragile.
- **Fix:** Move the sync fetch logic to a separate script file (like `npm-update-check.js`) and call it synchronously, or accept the async-only approach for first-run.

### NEW-005: `gsd-t-discuss.md` and `gsd-t-impact.md` missing Autonomy Behavior section
- **Severity:** LOW
- **Location:** `commands/gsd-t-discuss.md`, `commands/gsd-t-impact.md`
- **Description:** These are wave-phase commands but lack the explicit `### Autonomy Behavior` section that other phase commands (`execute`, `verify`, `partition`, `plan`, `integrate`, `test-sync`) have. `gsd-t-discuss.md` mentions pausing inline but does not follow the standard format.
- **Fix:** Add `### Autonomy Behavior` sections matching the pattern in other wave-phase commands.

### NEW-006: Fractional step numbering across 11 command files
- **Severity:** LOW
- **Location:** `gsd-t-milestone.md`, `gsd-t-partition.md`, `gsd-t-plan.md`, `gsd-t-init.md`, `gsd-t-complete-milestone.md`, `gsd-t-integrate.md`, `gsd-t-impact.md`, `gsd-t-scan.md`, `gsd-t-promote-debt.md`, `gsd-t-project.md`, `gsd-t-feature.md`
- **Description:** Steps like `Step 4.5`, `Step 5.5`, `Step 7.5`, `Step 7.6`, `Step 7.7` indicate incremental additions without renumbering.
- **Fix:** Renumber to clean integers in a future cleanup pass.

### NEW-007: `buildEvent()` in heartbeat is 69 lines — switch statement
- **Severity:** LOW
- **Location:** `scripts/gsd-t-heartbeat.js` lines 85-155
- **Description:** A long switch statement mapping 9 hook events to internal events. Each case is simple (3-5 lines) but the function exceeds the 30-line limit.
- **Fix:** Use a lookup object pattern: `const BUILDERS = { SessionStart: (h) => ({...}), ... }`.

### NEW-008: Heartbeat cleanup runs on every event — performance concern
- **Severity:** MEDIUM
- **Location:** `scripts/gsd-t-heartbeat.js` line 57
- **Description:** `cleanupOldHeartbeats()` is called on every hook event. In an active session, `PostToolUse` fires hundreds of times, each triggering a `readdirSync` + multiple `lstatSync` calls.
- **Fix:** Only run cleanup on `SessionStart` events.

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Functions over 30 lines | 13 | MEDIUM |
| Duplication patterns | 3 | LOW |
| Complexity hotspots | 5 | MEDIUM |
| Error handling gaps | 4 | LOW-MEDIUM |
| Performance issues | 2 | LOW-MEDIUM |
| Naming inconsistencies | 2 | LOW |
| Command file inconsistencies | 3 | LOW |
| Documentation-code drift | 4 | LOW |
| Missing test coverage | 1 (all) | HIGH |
| CRLF consistency gap | 1 | MEDIUM |

### Priority Recommendations

1. **HIGH:** Add test suite — TD-003 remains the biggest quality gap. The CLI has 52+ functions and zero tests.
2. **HIGH:** Fix `doUpdateAll()` error isolation (NEW-002) — a single project failure kills the entire update-all operation.
3. **MEDIUM:** Decompose `doStatus()` (98 lines) and `checkDoctorInstallation()` (52 lines) — the 30-line function limit is violated 13 times.
4. **MEDIUM:** Fix heartbeat cleanup performance (NEW-008) — rate-limit to `SessionStart` events only.
5. **MEDIUM:** Add `.gitattributes` and `.editorconfig` for line ending consistency.
6. **LOW:** Fix CLAUDE.md documentation drift (DRIFT-002, DRIFT-003, DRIFT-004) — command counts and version are stale.
7. **LOW:** Add Autonomy Behavior sections to `gsd-t-discuss.md` and `gsd-t-impact.md`.
8. **LOW:** Renumber fractional steps across 11 command files.
