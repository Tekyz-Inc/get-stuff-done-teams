# Tasks: cli-quality

## Summary
Bring all CLI and script code to project quality standards: every function under 30 lines, code deduplication resolved, error isolation in doUpdateAll, heartbeat cleanup optimized to SessionStart only, checkForUpdates uses external script, and .gitattributes/.editorconfig added.

## Tasks

### Task 1: Add .gitattributes and .editorconfig (TD-025)
- **Files**: `.gitattributes` (new), `.editorconfig` (new)
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `.gitattributes` exists with `* text=auto` and `*.js text eol=lf`
  - `.editorconfig` exists with `root = true`, `end_of_line = lf`, `charset = utf-8`, `indent_style = space`, `indent_size = 2`
  - Both files committed

### Task 2: Heartbeat cleanup only on SessionStart (TD-024)
- **Files**: `scripts/gsd-t-heartbeat.js`
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `cleanupOldHeartbeats()` is only called when `hook.hook_event_name === "SessionStart"`
  - Non-SessionStart events still build and write events normally
  - Existing tests pass

### Task 3: Refactor buildEvent to event handler map (TD-032)
- **Files**: `scripts/gsd-t-heartbeat.js`
- **Contract refs**: None
- **Dependencies**: Requires Task 2 (same file)
- **Acceptance criteria**:
  - `buildEvent()` is under 30 lines
  - Uses an object map (EVENT_HANDLERS or similar) instead of 71-line switch
  - Each event handler is a small function or inline object
  - All 9 event types still produce the same output
  - Existing security tests pass (scrubSecrets, scrubUrl, summarize)
  - `buildEvent` still exported in module.exports

### Task 4: Extract fetch script from checkForUpdates (TD-034)
- **Files**: `bin/gsd-t.js`, `scripts/gsd-t-fetch-version.js` (new)
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - New file `scripts/gsd-t-fetch-version.js` contains the HTTPS fetch logic (replaces inline JS string)
  - `checkForUpdates()` in bin/gsd-t.js calls `execFileSync(process.execPath, [fetchScriptPath], ...)` instead of inline `-e` string
  - `checkForUpdates()` is under 30 lines after extraction
  - Update check still works (validates version, writes cache, shows notice)
  - `scripts/gsd-t-fetch-version.js` included in package.json `files` array (already has `scripts/`)

### Task 5: doUpdateAll error isolation (TD-017)
- **Files**: `bin/gsd-t.js`
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Per-project loop in `doUpdateAll()` is wrapped in try/catch
  - If one project throws, remaining projects still get updated
  - Error message includes project name and error details
  - `doUpdateAll()` under 30 lines (extract `updateSingleProject()` helper)
  - Existing tests pass

### Task 6: Split remaining over-30-line functions in bin/gsd-t.js (TD-021 + TD-033)
- **Files**: `bin/gsd-t.js`
- **Contract refs**: None
- **Dependencies**: Requires Task 4 (checkForUpdates already split), Task 5 (doUpdateAll already split)
- **Acceptance criteria**:
  - `doStatus()` (99 lines) split into sub-functions: `showStatusVersion()`, `showStatusCommands()`, `showStatusConfig()`, `showStatusTeams()`, `showStatusProject()`
  - `initGsdtDir()` (51 lines) split using `writeTemplateFile()` helper (TD-033 pattern 3)
  - `doInit()` (48 lines) split — extract tree output into `showInitTree()`
  - `configureHeartbeatHooks()` (43 lines) — extract loop body or simplify
  - `installGlobalClaudeMd()` (42 lines) — extract update logic into sub-functions
  - `doUninstall()` (40 lines) — extract command removal loop
  - `doInstall()` (38 lines) — extract summary output into `showInstallSummary()`
  - `updateProjectClaudeMd()` (35 lines) — consider inlining or simplifying
  - `checkDoctorInstallation()` (54 lines) — extract encoding check
  - `installCommands()` (31 lines) — borderline, may leave if natural
  - `showHelp()` (31 lines) — borderline, may leave if natural
  - TD-033 deduplication: extract `readProjectDeps()` shared by hasSwagger/hasApi, extract `readSettingsJson()` to replace 3x JSON.parse pattern, extract `writeTemplateFile()` for init functions
  - **Every function in bin/gsd-t.js and scripts/ is 30 lines or under**
  - All new helper functions added to module.exports
  - All existing tests pass

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 4 (Tasks 1, 2, 4, 5)
- Blocked tasks: 2 (Task 3 after Task 2, Task 6 after Tasks 4+5)
- Estimated checkpoints: 0

## Execution Order (solo mode)
1. Task 1 (TD-025) — .gitattributes + .editorconfig
2. Task 2 (TD-024) — heartbeat SessionStart guard
3. Task 3 (TD-032) — buildEvent refactor (depends on Task 2)
4. Task 4 (TD-034) — extract fetch script
5. Task 5 (TD-017) — doUpdateAll error isolation
6. Task 6 (TD-021 + TD-033) — split all remaining functions (depends on Tasks 4, 5)
