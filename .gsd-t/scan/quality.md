# Code Quality Analysis — 2026-02-18

Previous scans: 2026-02-07 (scan #1), 2026-02-18 (scan #2). This is scan #3, reflecting current state after QA agent addition and wave rewrite.

---

## Previous Tech Debt Status Check

| ID | Title | Previous Status | Current Status | Notes |
|----|-------|-----------------|----------------|-------|
| TD-001 | 25 of 26 Command Files Missing | RESOLVED | **RESOLVED** | All 43 command files present (39 GSD-T + 4 utility) |
| TD-002 | Command Injection in Doctor via execSync | RESOLVED | **RESOLVED** | Line 993: `execFileSync("claude", ["--version"], ...)` |
| TD-003 | No Test Coverage | HIGH — OPEN | **OPEN** | Still zero test files in the project |
| TD-005 | Symlink Attack Vulnerability | RESOLVED | **RESOLVED** | `isSymlink()` check at all write sites |
| TD-006 | Brainstorm Command Not Documented | RESOLVED | **RESOLVED** | Present in all reference files |
| TD-007 | Hardcoded Utility Command List | RESOLVED | **RESOLVED** | Convention-based detection |
| TD-008 | CRLF/LF Mismatch | PARTIALLY RESOLVED | **PARTIALLY RESOLVED** | `normalizeEol()` mitigates, still no `.gitattributes` or `.editorconfig` |
| TD-009 | Missing Input Validation on Project Name | RESOLVED | **RESOLVED** | `validateProjectName()` at line 122 |
| TD-010 | Large Functions Approaching Complexity | PARTIALLY RESOLVED | **PARTIALLY RESOLVED** | `doInstall`, `doDoctor` decomposed; `doStatus` still 98 lines; total 13 functions over 30 lines unchanged |
| TD-014 | Backlog File Format Drift | RESOLVED | **RESOLVED** | Fixed 2026-02-18 |
| TD-015 | Progress.md Format Drift | RESOLVED | **RESOLVED** | Fixed 2026-02-18 |
| TD-016 | 7 Backlog Commands Missing from GSD-T-README | RESOLVED | **RESOLVED** | Fixed 2026-02-18 |
| TD-017 | doUpdateAll() No Per-Project Error Isolation | HIGH — OPEN | **OPEN** | No change — still no try/catch around per-project iteration |
| TD-018 | Heartbeat JSONL Files Not in .gitignore | RESOLVED | **RESOLVED** | Fixed 2026-02-18 |
| TD-019 | Heartbeat Sensitive Data in Bash Commands | MEDIUM — OPEN | **OPEN** | No change — still logs first 150 chars of bash commands |
| TD-020 | npm-update-check.js Arbitrary Path Write | MEDIUM — OPEN | **OPEN** | No change — still no path validation |
| TD-021 | 13 Functions Exceed 30-Line Limit | MEDIUM — OPEN | **OPEN** | Same 13 functions in bin/gsd-t.js, same 2 in heartbeat |
| TD-022 | Stale Command Counts Across Reference Files | RESOLVED | **REGRESSION** | See DRIFT-001 below — counts are stale again after gsd-t-qa.md addition |
| TD-023 | CLAUDE.md Version/Count Drift | RESOLVED | **REGRESSION** | See DRIFT-001/DRIFT-002 below |
| TD-024 | Heartbeat Cleanup Runs on Every Event | MEDIUM — OPEN | **OPEN** | No change — still `cleanupOldHeartbeats()` on every event |
| TD-025 | Missing .gitattributes and .editorconfig | MEDIUM — OPEN | **OPEN** | No files added |
| TD-030 | discuss/impact Missing Autonomy Behavior | LOW — OPEN | **OPEN** | No change — `gsd-t-discuss.md` and `gsd-t-impact.md` still lack formal Autonomy Behavior sections |
| TD-031 | Fractional Step Numbering in 11 Command Files | LOW — OPEN | **WORSENED** | Now 16 command files with fractional steps (was 11). QA spawn added `.5`/`.6`/`.7` steps to 5 more files |
| TD-032 | buildEvent() 69 Lines in Heartbeat | LOW — OPEN | **OPEN** | No change |
| TD-033 | Code Duplication Patterns | LOW — OPEN | **OPEN** | No change — 3 duplication patterns remain |
| TD-034 | checkForUpdates Inline JS Fragile | LOW — OPEN | **OPEN** | No change |

**Summary:** Of 15 previously open items: 0 resolved, 2 regressed, 1 worsened, 12 unchanged.

---

## Function Length Inventory — `bin/gsd-t.js` (1301 lines)

Project standard: functions MUST be under 30 lines. Flagged functions are marked with :warning:.

**No functions changed since scan #2.** The file is identical. Full inventory unchanged:

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
| `hasApi()` | 24 | 203 | OK |
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

**Summary:** 13 functions exceed 30 lines. 2 functions at exactly 30 lines (borderline). Largest: `doStatus()` at 98 lines. No change from scan #2.

### Functions — `scripts/gsd-t-heartbeat.js` (202 lines, unchanged)

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| `cleanupOldHeartbeats()` | 16 | 67 | OK |
| `buildEvent()` | **69** | 85 | :warning: OVER 30 |
| `summarize()` | 28 | 157 | OK |
| `shortPath()` | 13 | 188 | OK |
| stdin `on("end")` handler | 32 | 31 | :warning: OVER 30 |

### Functions — `scripts/npm-update-check.js` (27 lines, unchanged)

| Function | Lines | Start Line | Status |
|----------|-------|------------|--------|
| Main script (no named functions) | 27 | 1 | OK |

---

## New Code: `commands/gsd-t-qa.md` Analysis

The `gsd-t-qa.md` file (169 lines) is a new command file added as part of the QA agent integration.

### Quality Assessment

**Strengths:**
- Clear phase-specific behavior matrix (partition, plan, execute, verify, quick, debug, integrate, complete-milestone)
- Contract-to-test mapping rules are well-structured with code examples
- Communication protocol is consistent and machine-parseable (`QA: {PASS|FAIL} — {summary}`)
- Blocking rules are explicit (QA FAIL blocks phase completion)
- Cleanup rule included (kill orphan dev servers)
- Ends with `$ARGUMENTS` as convention requires

**Issues found:**

#### QA-001: No Document Ripple section
- **Severity:** LOW
- **File:** `commands/gsd-t-qa.md`
- **Problem:** The QA agent writes test files (which are source code modifications) but has no Document Ripple section specifying what docs to update. Other code-modifying commands have this section.
- **Mitigating factor:** QA is always spawned as a teammate, and the lead agent's command includes Document Ripple. The QA agent's scope is limited to test files.
- **Recommendation:** Add a minimal Document Ripple section: update `.gsd-t/test-coverage.md` and `.gsd-t/progress.md` after test generation.

#### QA-002: Regeneration behavior underspecified
- **Severity:** LOW
- **File:** `commands/gsd-t-qa.md` line 144
- **Problem:** Says "When a contract changes, regenerate the affected test file (preserving any manual additions marked with `// @custom`)". The mechanism for distinguishing `// @contract-test` generated code from `// @custom` additions during regeneration is not defined. An implementing agent would need to invent this merging logic.
- **Recommendation:** Specify the merge strategy: "Delete all lines between `// @contract-test` markers, re-generate, then leave `// @custom` blocks untouched."

#### QA-003: Test framework assumption
- **Severity:** LOW
- **File:** `commands/gsd-t-qa.md` lines 104-121
- **Problem:** Code examples use `@playwright/test` import syntax exclusively. The command assumes Playwright for all test types (including contract tests which may be better as unit tests). Projects using Jest, Vitest, or pytest have no guidance.
- **Recommendation:** Add a framework detection preamble similar to `gsd-t-test-sync.md` Step 1.

---

## New Code: Wave Rewrite (`commands/gsd-t-wave.md`) Analysis

The wave command was rewritten from an inline orchestrator to an agent-per-phase spawner (219 lines).

### Quality Assessment

**Strengths:**
- Agent-per-phase architecture eliminates context accumulation across phases
- Clear phase sequence table with status → next phase mapping
- Lightweight orchestrator (reads only `progress.md` and `CLAUDE.md`)
- Between-phase verification pattern (read progress.md, verify status update)
- Error recovery documented for impact blocks, test failures, and verify failures
- ASCII visualization diagram is accurate and helpful

**Issues found:**

#### WAVE-001: No Document Ripple section
- **Severity:** LOW
- **File:** `commands/gsd-t-wave.md`
- **Problem:** Wave is an orchestrator that delegates all work to phase agents, so it doesn't modify files directly. However, other orchestrator-like commands in the project have Document Ripple sections (even if minimal). The previous scan noted wave as "appropriately absent" from Document Ripple, which is still correct, but for consistency it could include a note: "Document Ripple handled by each phase agent."

#### WAVE-002: Discuss phase skip logic is vague
- **Severity:** LOW
- **File:** `commands/gsd-t-wave.md` lines 67-69
- **Problem:** The skip condition is "Are there open architectural questions or multiple viable approaches?" This is subjective. The orchestrator agent must evaluate this without deep context (it only reads progress.md and CLAUDE.md). There is no machine-parseable signal in progress.md to determine this.
- **Recommendation:** Define a concrete skip heuristic. For example: "Skip Discuss if progress.md contains no `## Open Questions` section or that section is empty."

#### WAVE-003: Error recovery agent count not bounded
- **Severity:** LOW
- **File:** `commands/gsd-t-wave.md` lines 167-168, 177-179
- **Problem:** "Max 2 attempts" is stated for impact and verify remediation, but no limit is stated for the execute phase's internal failure handling. The wave command says "the execute agent handles test failures internally (up to 2 fix attempts)" but this relies on the execute agent respecting that limit.
- **Impact:** Low — execute.md does specify the 2-attempt limit in its own text.

---

## QA Spawn Integration Consistency

9 command files spawn the QA agent. Analysis of consistency:

| Command | Step # | Phase Context | QA Blocking? | Consistent? |
|---------|--------|---------------|--------------|-------------|
| `gsd-t-partition.md` | Step 4.7 | partition | YES — "blocks partition completion" | YES |
| `gsd-t-plan.md` | Step 4.7 | plan | Partial — "Wait for QA agent to complete" | MINOR ISSUE |
| `gsd-t-execute.md` | Step 1.5 | execute | YES — "QA failure on any task blocks proceeding" | YES |
| `gsd-t-test-sync.md` | Step 1.5 | test-sync | Partial — "QA failure flags included" | MINOR ISSUE |
| `gsd-t-integrate.md` | Step 4.5 | integrate | YES — "QA failure blocks integration" | YES |
| `gsd-t-verify.md` | Step 1.5 | verify | YES — "QA failure blocks verification" | YES |
| `gsd-t-quick.md` | Step 2.5 | quick | YES — "QA failure blocks the commit" | YES |
| `gsd-t-debug.md` | Step 2.5 | debug | YES — "QA failure blocks the commit" | YES |
| `gsd-t-complete-milestone.md` | Step 7.6 | complete-milestone | YES — "QA failure blocks milestone completion" | YES |

### Issues:

#### QA-SPAWN-001: Inconsistent blocking language in plan and test-sync
- **Severity:** LOW
- **Files:** `commands/gsd-t-plan.md` (Step 4.7), `commands/gsd-t-test-sync.md` (Step 1.5)
- **Problem:** `gsd-t-plan.md` says "Wait for QA agent to complete before proceeding" but does not explicitly say QA failure blocks the phase. `gsd-t-test-sync.md` says "QA failure flags are included in the coverage report" but does not say QA failure blocks test-sync. Other 7 commands all use explicit "QA failure blocks {phase}" language.
- **Fix:** Add "QA failure blocks plan completion." and "QA failure blocks test-sync completion." respectively.

#### QA-SPAWN-002: QA spawn step numbering is inconsistent
- **Severity:** LOW
- **Problem:** QA spawn appears at different fractional step numbers across commands:
  - `Step 1.5` in execute, test-sync, verify
  - `Step 2.5` in quick, debug
  - `Step 4.5` in integrate
  - `Step 4.7` in partition, plan
  - `Step 7.6` in complete-milestone
- **Impact:** The step number follows local context (spawning after the relevant prior step), so this is rational but inconsistent in naming convention.
- **Recommendation:** This is a symptom of the broader fractional step numbering issue (TD-031). Fix by renumbering to integers.

#### QA-SPAWN-003: QA agent spawn block format is consistent
- **Positive finding:** All 9 commands use the same Teammate spawn block format:
  ```
  Teammate "qa": Read commands/gsd-t-qa.md for your full instructions.
    Phase context: {phase}. Read .gsd-t/contracts/ for contract definitions.
    {phase-specific instruction}.
    Report: {phase-specific report format}.
  ```
  This consistency is good.

---

## Fractional Step Numbering — Updated Inventory

Previous scan reported 11 files. After QA spawn integration and other additions, now **16 command files** use fractional step numbering:

| File | Fractional Steps | Added Since Scan #2 |
|------|-----------------|---------------------|
| `gsd-t-partition.md` | 4.5, 4.6, **4.7** | 4.7 is new (QA spawn) |
| `gsd-t-plan.md` | 4.5, 4.6, **4.7** | 4.7 is new (QA spawn) |
| `gsd-t-execute.md` | **1.5** | 1.5 is new (QA spawn) |
| `gsd-t-test-sync.md` | **1.5** | 1.5 is new (QA spawn) |
| `gsd-t-verify.md` | **1.5** | 1.5 is new (QA spawn) |
| `gsd-t-quick.md` | **2.5** | 2.5 is new (QA spawn) |
| `gsd-t-debug.md` | **2.5** | 2.5 is new (QA spawn) |
| `gsd-t-integrate.md` | **4.5**, 5.5 | 4.5 is new (QA spawn) |
| `gsd-t-complete-milestone.md` | 1.5, 7.5, **7.6** | 7.6 expanded (QA spawn added) |
| `gsd-t-milestone.md` | 4.5, 4.6 | Unchanged |
| `gsd-t-init.md` | 1.5, 2.5, 7.5, 7.6, 7.7 | Unchanged |
| `gsd-t-impact.md` | 6.5, 6.6 | Unchanged |
| `gsd-t-scan.md` | 5.5 | Unchanged |
| `gsd-t-promote-debt.md` | 5.5, 5.6 | Unchanged |
| `gsd-t-project.md` | 5.5, 5.6 | Unchanged |
| `gsd-t-feature.md` | 7.5 | Unchanged |
| `gsd-t-discuss.md` | 5.5 | Unchanged |

**Total fractional steps:** 34 across 17 files (was 22 across 11 files in scan #2). The QA spawn integration added 12 new fractional steps across 9 files (7 newly affected, 2 already had fractional steps).

---

## Dead Code

- **None found.** All functions in `bin/gsd-t.js` are reachable from the `switch` statement at line 1257. All helpers are called by at least one command function.
- No commented-out code blocks in any JS file.
- No unused imports.

---

## Duplication (unchanged from scan #2)

### DUP-001: `hasSwagger()` and `hasApi()` share identical package.json parsing pattern
- **Files:** `bin/gsd-t.js` lines 169-201 vs 203-226
- **Pattern:** Both read and parse package.json independently, concat deps+devDeps, use `some()` to check against a package list. Both also iterate Python files identically.
- **Fix:** Extract `getDependencies(projectDir)` and `hasPythonDep(projectDir, name)`.

### DUP-002: JSON.parse(fs.readFileSync(SETTINGS_JSON)) repeated 3 times
- **Files:** `bin/gsd-t.js` lines 351, 732, 1039
- **Fix:** Extract `readSettingsJson()` returning parsed object or null.

### DUP-003: Template-write-or-skip pattern repeated across init functions
- **Files:** `bin/gsd-t.js` lines 527-548, 551-572, 574-624
- **Fix:** Extract `writeTemplate(templateName, destPath, projectName, today, label)`.

---

## Complexity Hotspots (unchanged from scan #2)

### CMPLX-001: `doStatus()` — 98 lines (line 675-773)
- **Cyclomatic complexity:** ~15
- **Fix:** Extract `statusVersion()`, `statusCommands()`, `statusGlobalConfig()`, `statusTeams()`, `statusCurrentProject()`.

### CMPLX-002: `doUpdateAll()` — 78 lines (line 904-981)
- **Cyclomatic complexity:** ~10
- **Fix:** Extract `updateSingleProject()`. Add try/catch per project.

### CMPLX-003: `checkDoctorInstallation()` — 52 lines (line 1010-1063)
- **Cyclomatic complexity:** ~8
- **Fix:** Extract encoding check into `checkDoctorEncoding()`.

### CMPLX-004: `checkForUpdates()` — 45 lines (line 1146-1191)
- **Cyclomatic complexity:** ~8
- **Fix:** Move inline JS fetch script to separate file.

### CMPLX-005: `buildEvent()` in heartbeat — 69 lines (line 85-155)
- **Cyclomatic complexity:** ~10
- **Fix:** Use lookup object pattern.

---

## Error Handling Gaps (unchanged from scan #2)

### ERR-001: `doUpdateAll()` project iteration — no try/catch around individual projects
- **File:** `bin/gsd-t.js` lines 936-961
- **Problem:** If `updateProjectClaudeMd()` throws on one project, remaining projects are skipped.
- **Fix:** Wrap each project iteration in try/catch.

### ERR-002: `checkForUpdates()` inline eval — fragile sync fetch
- **File:** `bin/gsd-t.js` line 1169
- **Impact:** Low — failure is silent and non-blocking.

### ERR-003: `doChangelog()` — platform detection without error detail
- **File:** `bin/gsd-t.js` line 1203-1218
- **Fix:** Add info message for `xdg-open` not found.

### ERR-004: Heartbeat stdin handler — broad silent catch
- **File:** `scripts/gsd-t-heartbeat.js` line 62
- **Fix:** Log to debug file when `GSD_T_DEBUG` env var is set.

---

## Performance Issues (unchanged from scan #2)

### PERF-001: `hasSwagger()` reads package.json + Python files on every call
- **File:** `bin/gsd-t.js` lines 169-201
- **Impact:** Low — only affects `doctor` and `update-all`.
- **Fix:** Pass parsed package.json data as parameter, or cache per-project.

### PERF-002: `cleanupOldHeartbeats()` runs on every event
- **File:** `scripts/gsd-t-heartbeat.js` line 57
- **Impact:** Medium — filesystem overhead on every Claude Code tool invocation.
- **Fix:** Only run cleanup on `SessionStart` events.

---

## Documentation-Code Drift

### DRIFT-001: Command counts stale after gsd-t-qa.md addition (REGRESSION)

The `gsd-t-qa.md` file was added, increasing total commands from 42 to 43 (39 GSD-T + 4 utility). The following files have stale counts:

| File | Line(s) | Current Text | Should Be |
|------|---------|-------------|-----------|
| `CLAUDE.md` | 13 | "42 slash commands (38 GSD-T workflow + 4 utility)" | "43 slash commands (39 GSD-T workflow + 4 utility)" |
| `CLAUDE.md` | 34 | "commands/ — 42 slash commands for Claude Code" | "43 slash commands" |
| `CLAUDE.md` | 35 | "gsd-t-*.md — 38 GSD-T workflow commands" | "39 GSD-T workflow commands" |
| `README.md` | 21 | "38 GSD-T commands + 4 utility commands (42 total)" | "39 GSD-T commands + 4 utility commands (43 total)" |
| `README.md` | 286 | "# 42 slash commands" | "# 43 slash commands" |
| `README.md` | 287 | "# 38 GSD-T workflow commands" | "# 39 GSD-T workflow commands" |
| `package.json` | 4 | "42 slash commands" in description | "43 slash commands" |

**Note:** The installer (`bin/gsd-t.js`) counts dynamically from the `commands/` directory, so it is NOT affected.

### DRIFT-002: CLAUDE.md version says v2.23.0 (CORRECT)
- **File:** `CLAUDE.md` line 55
- **Current text:** `package.json — npm package config (v2.23.0)`
- **Actual:** `package.json` version is `2.23.0`
- **Status:** Previously drifted, now **CORRECT** — someone updated it.

---

## Naming Inconsistencies (unchanged from scan #2)

### NAME-001: Mixed function naming: `do*` vs verb-only
- **Pattern:** `do*` = top-level subcommand, bare verb = helper. Not documented.
- **Recommendation:** Document in CLAUDE.md Conventions.

### NAME-002: `getInstalledCommands()` vs `getCommandFiles()` — similar but different
- **Impact:** Low — naming is slightly ambiguous.

---

## Unresolved Developer Notes

- None found. No TODO, FIXME, HACK, XXX, or WORKAROUND comments in any JS or MD file.

---

## Test Coverage Gaps (TD-003 — STILL OPEN)

**Zero test files exist in the project.** `package.json` has `"test": "node --test"` but no test files exist for it to find.

### Critical paths needing tests (prioritized — same as scan #2):

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

## Command File Quality — New Findings

### Consistency Dimensions (updated from scan #2)

#### 1. `$ARGUMENTS` Terminator
- **Present:** 42 of 43 files (new: `gsd-t-qa.md` has it)
- **Missing:** `checkin.md` (intentional — doesn't accept args)
- **Note:** `Claude-md.md` also lacks `$ARGUMENTS` but this is intentional.
- **Verdict:** **Good.**

#### 2. Document Ripple Section
- **Present:** 27 of 43 files (same 27 as before)
- **Missing from file-modifying commands:** `gsd-t-qa.md` writes test files but has no Document Ripple section (see QA-001 above)
- **Verdict:** **Minor gap** — QA is the only code-modifying command without Document Ripple.

#### 3. Autonomy Behavior Section
- **Present:** 8 of 43 files: `gsd-t-verify.md`, `gsd-t-test-sync.md`, `gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-partition.md`, `gsd-t-plan.md`, `gsd-t-integrate.md`, `gsd-t-init-scan-setup.md`
- **Missing from wave-phase commands:** `gsd-t-discuss.md` and `gsd-t-impact.md` (unchanged since scan #2)
- **Note:** `gsd-t-qa.md` is always spawned as a teammate, not a standalone phase, so Autonomy Behavior is not applicable.
- **Verdict:** **Minor inconsistency** — same as scan #2.

#### 4. QA Agent Spawn Section
- **Present:** 9 of 43 files (new dimension)
- **Expected in:** All wave-phase commands that modify code or verify quality
- **Missing from:** `gsd-t-scan.md` — performs codebase analysis but does not spawn QA to validate test coverage as part of the scan. The test verification step in scan (Step 5.5) is manual, not QA-agent-driven.
- **Verdict:** **Acceptable** — scan is an analysis command, not an execution command. QA spawn is appropriate only for commands that write or verify code.

---

## CRLF/LF Consistency (TD-025 — STILL OPEN)

- **JS files:** All 3 JS files use CRLF line endings.
- **No `.gitattributes`:** Still missing.
- **No `.editorconfig`:** Still missing.
- **`normalizeEol()` helper:** Functional mitigation in place.
- **Risk:** Noisy git diffs with cross-platform contributors.

---

## Security Observations (unchanged from scan #2, non-blocking)

### SEC-OBS-001: Heartbeat writes to project `.gsd-t/` directory
- Mitigations present: `SAFE_SID` regex, `path.isAbsolute()`, resolved path check, symlink check.
- Remaining concern: `cwd` from hook input could target arbitrary `.gsd-t/` directory.
- Impact: Very low — hook input comes from Claude Code itself.

---

## Package.json Assessment

```json
{
  "name": "@tekyzinc/gsd-t",
  "version": "2.23.0",
  "description": "...42 slash commands...",  // STALE — should say 43
  "scripts": { "test": "node --test" },
  "main": "bin/gsd-t.js",
  "engines": { "node": ">=16.0.0" }
}
```

- **`description`:** Stale command count (says 42, should be 43)
- **`test` script:** Present but no test files exist — `node --test` silently passes with 0 tests
- **`main` field:** Present and correct
- **`engines`:** Properly specified
- **`files` array:** Includes `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`. All present.
- **Missing `prepublishOnly` script:** No pre-publish validation

---

## New Issues Found This Scan

### NEW-009: Command count regression after gsd-t-qa.md addition
- **Severity:** MEDIUM
- **Location:** `CLAUDE.md` (lines 13, 34, 35), `README.md` (lines 21, 286, 287), `package.json` (line 4)
- **Description:** `gsd-t-qa.md` was added to `commands/` but no reference files were updated to reflect the new count (43 total, 39 GSD-T + 4 utility). This is a regression of TD-022 and TD-023 which were previously resolved.
- **Fix:** Update all 7 locations listed in DRIFT-001 to use 43/39/4 counts.

### NEW-010: Fractional step numbering worsened — now 17 files, 34 fractional steps
- **Severity:** LOW
- **Location:** 17 command files (see Fractional Step Numbering section above)
- **Description:** QA spawn integration added 12 new fractional steps to 9 command files (7 newly affected). Total went from 22 fractional steps across 11 files to 34 across 17 files. This accelerates the technical debt rather than addressing it.
- **Fix:** Renumber all command files to use clean integer steps in a dedicated cleanup pass.

### NEW-011: QA agent missing Document Ripple section
- **Severity:** LOW
- **Location:** `commands/gsd-t-qa.md`
- **Description:** QA agent writes test files but has no Document Ripple section. All other code-writing commands have this section.
- **Fix:** Add minimal Document Ripple section.

### NEW-012: Inconsistent QA blocking language in plan and test-sync
- **Severity:** LOW
- **Location:** `commands/gsd-t-plan.md` (Step 4.7), `commands/gsd-t-test-sync.md` (Step 1.5)
- **Description:** These two commands don't explicitly state "QA failure blocks {phase}" like the other 7 QA-spawning commands do.
- **Fix:** Add explicit blocking language.

### NEW-013: QA agent test framework assumption
- **Severity:** LOW
- **Location:** `commands/gsd-t-qa.md` lines 104-121
- **Description:** Code examples assume `@playwright/test` exclusively. No guidance for Jest, Vitest, pytest, or other frameworks.
- **Fix:** Add framework detection preamble.

### NEW-014: Wave discuss-skip heuristic is subjective
- **Severity:** LOW
- **Location:** `commands/gsd-t-wave.md` lines 67-69
- **Description:** The skip condition for Discuss phase is qualitative ("Are there open architectural questions?") without a machine-parseable signal. The lightweight orchestrator (reading only progress.md and CLAUDE.md) has insufficient context to evaluate this reliably.
- **Fix:** Define a concrete skip heuristic based on progress.md content.

---

## Summary

| Category | Count | Severity | Change from Scan #2 |
|----------|-------|----------|---------------------|
| Functions over 30 lines | 13 (JS) + 2 (heartbeat) | MEDIUM | No change |
| Duplication patterns | 3 | LOW | No change |
| Complexity hotspots | 5 | MEDIUM | No change |
| Error handling gaps | 4 | LOW-MEDIUM | No change |
| Performance issues | 2 | LOW-MEDIUM | No change |
| Naming inconsistencies | 2 | LOW | No change |
| Command file inconsistencies | 5 | LOW | +2 (QA-related) |
| Documentation-code drift | 1 (command counts) | MEDIUM | **Regression** — previously fixed |
| Missing test coverage | 1 (all) | HIGH | No change |
| CRLF consistency gap | 1 | MEDIUM | No change |
| Fractional step numbering | 17 files, 34 steps | LOW | **Worsened** (+6 files, +12 steps) |

### Priority Recommendations

1. **HIGH (UNCHANGED):** Add test suite — TD-003 remains the single biggest quality gap. 52+ functions, zero tests.
2. **HIGH (UNCHANGED):** Fix `doUpdateAll()` error isolation (TD-017) — single project failure kills entire update-all.
3. **MEDIUM (REGRESSION):** Fix command counts in CLAUDE.md, README.md, and package.json — `gsd-t-qa.md` addition created stale counts in 7 locations.
4. **MEDIUM (UNCHANGED):** Decompose `doStatus()` (98 lines), `doUpdateAll()` (78 lines), `checkDoctorInstallation()` (52 lines).
5. **MEDIUM (UNCHANGED):** Fix heartbeat cleanup performance — rate-limit to `SessionStart` events only.
6. **MEDIUM (UNCHANGED):** Add `.gitattributes` and `.editorconfig` for line ending consistency.
7. **LOW:** Add Document Ripple section to `gsd-t-qa.md`.
8. **LOW:** Add explicit QA blocking language to `gsd-t-plan.md` and `gsd-t-test-sync.md`.
9. **LOW:** Add Autonomy Behavior sections to `gsd-t-discuss.md` and `gsd-t-impact.md`.
10. **LOW:** Renumber fractional steps across 17 command files (now more urgent — the problem grew from 11 to 17 files).

### Trend Analysis

| Metric | Scan #1 | Scan #2 | Scan #3 | Trend |
|--------|---------|---------|---------|-------|
| Open items | 13 | 15 | 15 + 6 new = 21 | Increasing |
| Critical items | 2 | 0 | 0 | Stable (good) |
| HIGH items | 3 | 2 | 2 | Stable |
| MEDIUM items | 4 | 5 | 5 | Stable |
| LOW items | 4 | 8 | 14 | Increasing |
| Functions > 30 lines | 13 | 13 | 13 | No improvement |
| Test files | 0 | 0 | 0 | No improvement |
| Fractional steps | N/A | 22/11 files | 34/17 files | Worsening |
| Command count drift | Yes | Fixed | **Regressed** | Regression |

The codebase is growing in command files and integrations (QA agent, wave rewrite) while core quality issues remain unaddressed. The fractional step numbering debt is actively growing with each new feature. Command count drift recurred because the Pre-Commit Gate was not followed when `gsd-t-qa.md` was added.
