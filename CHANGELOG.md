# Changelog

All notable changes to GSD-T are documented here. Updated with each release.

## [2.24.6] - 2026-02-18

### Added
- **Auto-update on session start**: SessionStart hook now automatically installs new GSD-T versions when detected — runs `npm install -g` + `gsd-t update-all`. Falls back to manual instructions if auto-update fails
- **Changelog link in all version messages**: All three output modes (`[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]`) now include the changelog URL
- **Update check installer**: `bin/gsd-t.js` now deploys the update check script and configures the SessionStart hook automatically during install, with auto-fix for incorrect matchers

### Fixed
- **SessionStart hook matcher**: Changed from `"startup"` to `""` (empty) to match all session types including compact/resumed sessions

## [2.24.5] - 2026-02-18

### Fixed
- **Dead code removed**: `PKG_EXAMPLES` constant in `bin/gsd-t.js` and dead imports (`writeTemplateFile`, `showStatusVersion`) in `test/cli-quality.test.js` (TD-057, TD-058)
- **summarize() case fallthrough**: Combined identical `Read`/`Edit`/`Write` cases using switch fallthrough, saving 4 lines (TD-056)
- **checkForUpdates() condition**: Simplified redundant `!cached && isStale` to `if (!cached) ... else if (stale)` (TD-061)
- **Notification title scrubbing**: Applied `scrubSecrets()` to `h.title` in heartbeat notification handler (TD-063)
- **SEC-N16 note corrected**: Updated informational note during scan #5 (TD-062)
- **Wave integrity check contract**: Updated `wave-phase-sequence.md` to match actual implementation — checks Status, Milestone name, Domains table (not version) (TD-064)
- **Duplicate format contract**: Deleted `file-format-contract.md` — `backlog-file-formats.md` is authoritative (TD-065)

### Added
- 9 new tests: 3 `readSettingsJson()` tests in `cli-quality.test.js`, 6 `shortPath()` tests in `security.test.js` (TD-059, TD-060)
- Total tests: 125 (was 116)

## [2.24.4] - 2026-02-18

### Fixed
- **progress.md status**: Now uses contract-recognized values (READY between milestones, not ACTIVE)
- **CLAUDE.md version**: Removed hardcoded version — references `package.json` directly to prevent recurring drift (TD-048)
- **CHANGELOG.md**: Added missing entries for v2.23.1 through v2.24.3 covering milestones 3-7 (TD-045)
- **Orphaned domains**: Deleted stale `cli-quality/` and `cmd-cleanup/` directories from previous milestones (TD-046)
- **Git line endings**: Applied `git add --renormalize .` to enforce LF across all tracked files (TD-049)
- **Notification scrubbing**: Applied `scrubSecrets()` to heartbeat notification messages (TD-052)

### Changed
- **Contracts synced**: `progress-file-format.md` enriched with milestone table + optional fields. `wave-phase-sequence.md` updated with integrity check (M7) and security considerations (M5). `command-interface-contract.md` renamed to `backlog-command-interface.md`. `integration-points.md` rewritten to reflect current state (TD-047, TD-053, TD-054, TD-055)
- **readSettingsJson()**: Extracted helper to deduplicate 3 `JSON.parse(readFileSync)` call sites in CLI (TD-050)
- **prepublishOnly**: Added `npm test` gate before `npm publish` (TD-051)
- **TD-029 (TOCTOU)**: Formally accepted as risk with 5-point rationale — single-threaded Node.js, user-owned dirs, Windows symlink requires admin

## [2.24.3] - 2026-02-19

### Changed
- **Command file cleanup**: 85 fractional step numbers renumbered to integers across 17 command files. Autonomy Behavior sections added to `gsd-t-discuss` and `gsd-t-impact`. QA agent hardened with file-path boundary constraints, multi-framework test detection, and Document Ripple section. Wave integrity check validates progress.md fields before starting. Structured 3-condition discuss-skip heuristic. Consistent "QA failure blocks" language across all 10 QA-spawning commands

### Fixed
- 8 tech debt items resolved: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041

## [2.24.2] - 2026-02-19

### Changed
- **CLI quality improvement**: All 86 functions across `bin/gsd-t.js` (80) and `scripts/gsd-t-heartbeat.js` (6) are now <= 30 lines. 3 code duplication patterns resolved (`readProjectDeps`, `writeTemplateFile`, `readPyContent` extracted). `buildEvent()` refactored to handler map pattern. `checkForUpdates` inline JS extracted to `scripts/gsd-t-fetch-version.js`. `doUpdateAll` has per-project error isolation

### Added
- `.gitattributes` and `.editorconfig` for consistent file formatting
- 22 new tests in `test/cli-quality.test.js` (buildEvent, readProjectDeps, readPyContent, insertGuardSection, readUpdateCache, addHeartbeatHook)

### Fixed
- Heartbeat cleanup now only runs on SessionStart (not every event)
- 7 tech debt items resolved: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034

## [2.24.1] - 2026-02-18

### Added
- **Security hardening**: `scrubSecrets()` and `scrubUrl()` in heartbeat script scrub sensitive data (passwords, tokens, API keys, bearer tokens) before logging. 30 new security tests in `test/security.test.js`
- `hasSymlinkInPath()` validates parent directories for symlink attacks
- HTTP response accumulation bounded to 1MB in both fetch paths
- Security Considerations section in `gsd-t-wave.md` documenting `bypassPermissions` implications

### Fixed
- `npm-update-check.js` validates cache path within `~/.claude/` and checks for symlinks before writing
- 6 tech debt items resolved: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035

## [2.24.0] - 2026-02-18

### Added
- **Testing foundation**: 64 automated tests in 2 test files (`test/helpers.test.js`: 27 tests, `test/filesystem.test.js`: 37 tests) using Node.js built-in test runner (`node --test`). Zero external test dependencies
- `module.exports` added to `bin/gsd-t.js` for 20 testable functions with `require.main` guard
- CLI subcommand tests (--version, help, status, doctor)
- Helper function tests (validateProjectName, applyTokens, normalizeEol, validateVersion, isNewerVersion)
- Filesystem tests (isSymlink, ensureDir, validateProjectPath, copyFile, hasPlaywright, hasSwagger, hasApi)
- Command listing tests (getCommandFiles, getGsdtCommands, getUtilityCommands with count validation)

### Fixed
- Tech debt item TD-003 (no test coverage) resolved

## [2.23.1] - 2026-02-18

### Fixed
- **Count fix**: All command count references updated to 43/39/4 across CLAUDE.md, README.md, package.json, and docs (TD-022)
- QA agent contract now includes test-sync phase with "During Test-Sync" section and updated output table (TD-042)
- Orphaned domain files from previous milestones archived to `.gsd-t/milestones/` (TD-043)

## [2.23.0] - 2026-02-17

### Changed
- **Wave orchestrator rewrite**: `gsd-t-wave` now spawns an independent agent for each phase instead of executing all phases inline. Each phase agent gets a fresh context window (~200K tokens), eliminating cross-phase context accumulation and preventing mid-wave compaction. The orchestrator stays lightweight (~30KB), reading only progress.md between phases. Phase sequence is unchanged — only the execution model changed. Estimated 75-85% reduction in peak context usage during waves

## [2.22.0] - 2026-02-17

### Added
- **gsd-t-qa**: New QA Agent command — dedicated teammate for test generation, execution, and gap reporting. Spawned automatically by 10 GSD-T phase commands
- **QA Agent spawn steps**: Added to partition (4.7), plan (4.7), execute (1.5 + team), verify (1.5 + team), complete-milestone (7.6), quick (2.5), debug (2.5), integrate (4.5), test-sync (1.5), wave (1.5)
- **Contract-to-test mapping rules**: API contracts → Playwright API tests, Schema contracts → constraint tests, Component contracts → E2E tests
- **QA Agent (Mandatory) section**: Added to global CLAUDE.md template — QA failure blocks phase completion

## [2.21.1] - 2026-02-18

### Fixed
- **PR #7 — Fix 12 scan items**: Security symlink validation gaps, contract/doc alignment, scope template hardening, heartbeat crash guard, progress template field ordering
- **PR #8 — Resolve final 4 scan items**: Function splitting in CLI (`doInit` helpers extracted), ownership validation for domain files, npm-update-check extracted to standalone script (`scripts/npm-update-check.js`)

## [2.21.0] - 2026-02-17

### Added
- **gsd-t-triage-and-merge**: New command to auto-review unmerged GitHub branches, score impact (auto-merge / review / skip), merge safe branches, and optionally version bump + publish. Publish gate respects autonomy level — auto in Level 3, prompted in Level 1-2. Sensitive file detection for commands, CLI, templates, and scripts

## [2.20.7] - 2026-02-17

### Added
- **Formal contracts**: 5 contract definitions for core GSD-T interfaces — backlog file formats, domain structure, pre-commit gate, progress.md format, and wave phase sequence. Formalizes existing conventions as machine-readable reference docs

## [2.20.6] - 2026-02-16

### Fixed
- Stale command/template counts in project CLAUDE.md (25→41 commands, 7→9 templates, v2.0.0→v2.20.x)
- Duplicate step numbering in `gsd-t-execute.md` (two step 10s)
- Windows CRLF/LF comparison causing false "changed" detection in CLI update

### Added
- Document Ripple sections to `gsd-t-execute`, `gsd-t-scan`, `gsd-t-test-sync`, `gsd-t-verify`
- Heartbeat auto-cleanup: files older than 7 days are automatically removed
- Error handling wrapping around file operations in CLI (copy, unlink, write)
- `applyTokens()` and `normalizeEol()` helpers to reduce duplication
- Extracted `updateProjectClaudeMd()`, `createProjectChangelog()`, `checkProjectHealth()` from `doUpdateAll()`

## [2.20.5] - 2026-02-16

### Added
- **Next Command Hint**: After each GSD-T phase completes, displays the recommended next command (e.g., `Next → /user:gsd-t-partition`). Full successor mapping for all workflow commands. Skipped during auto-advancing (Level 3 mid-wave)

## [2.20.4] - 2026-02-16

### Changed
- **Scan always uses team mode**: `gsd-t-scan` and `gsd-t-init-scan-setup` now spawn a team by default. Solo mode only for trivially small codebases (< 5 files) or when teams are explicitly disabled

## [2.20.3] - 2026-02-16

### Added
- **Playwright Cleanup**: After Playwright tests finish, kill any app/server processes that were started for the tests. Prevents orphaned dev servers from lingering after test runs

## [2.20.2] - 2026-02-16

### Added
- **CLI health checks**: `update-all` and `doctor` now check all projects for missing Playwright and Swagger/OpenAPI
- Smart API detection: scans `package.json`, `requirements.txt`, `pyproject.toml` for API frameworks (Express, Fastify, Hono, Django, FastAPI, etc.)
- Swagger detection: checks for spec files (`openapi.json/yaml`, `swagger.json/yaml`) and swagger packages in dependencies
- Health summary in `update-all` shows counts of missing Playwright and Swagger across all registered projects

## [2.20.1] - 2026-02-16

### Added
- **API Documentation Guard (Swagger/OpenAPI)**: Every API endpoint must be documented in Swagger/OpenAPI spec — no exceptions. Auto-detects framework and installs appropriate Swagger integration. Swagger URL must be published in CLAUDE.md, README.md, and docs/infrastructure.md
- Pre-Commit Gate now checks for Swagger spec updates on any API endpoint change

## [2.20.0] - 2026-02-16

### Added
- **Playwright Setup in Init**: `gsd-t-init` now installs Playwright, creates `playwright.config.ts`, and sets up E2E test directory for every project. Detects package manager (bun, npm, yarn, pnpm, pip) automatically
- **Playwright Readiness Guard**: Before any testing command (execute, test-sync, verify, quick, wave, milestone, complete-milestone, debug), checks for `playwright.config.*` and auto-installs if missing. Playwright must always be ready — no deferring to "later"

## [2.19.1] - 2026-02-16

### Changed
- **Quick**: Now runs the FULL test suite (not just affected tests), requires comprehensive test creation for new/changed code paths including Playwright E2E, and verifies against requirements and contracts. "Quick doesn't mean skip testing."

## [2.19.0] - 2026-02-16

### Changed
- **Execute**: "No feature code without test code" — every task must include comprehensive unit tests AND Playwright E2E specs for all new code paths, modes, and flows. Tests are part of the deliverable, not a follow-up
- **Test-Sync**: Creates tests immediately during execute phase instead of deferring gaps to verify. Missing Playwright specs for new features/modes are created on the spot
- **Verify**: Zero test coverage on new functionality is now a FAIL (not WARN). Coverage audit checks that every new feature, mode, page, and flow has comprehensive Playwright specs covering happy path, error states, edge cases, and all modes/flags

## [2.18.2] - 2026-02-16

### Added
- Gap Analysis Gate in `gsd-t-complete-milestone` — mandatory requirements verification before archiving
- Self-correction loop: auto-fixes gaps, re-verifies, re-analyzes (up to 2 cycles), stops if unresolvable
- Explicit Playwright E2E test execution in milestone test verification step

## [2.18.1] - 2026-02-16

### Added
- Auto-Init Guard — GSD-T workflow commands automatically run `gsd-t-init` if any init files are missing, then continue with the original command
- `gsd-t-init` copies `~/.claude/settings.local` → `.claude/settings.local.json` during project initialization
- Exempt commands that skip auto-init: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`

## [2.18.0] - 2026-02-16

### Added
- Heartbeat system — real-time event streaming from Claude Code sessions via async hooks
- `scripts/gsd-t-heartbeat.js` — hook handler that writes JSONL events to `.gsd-t/heartbeat-{session_id}.jsonl`
- 9 Claude Code hooks: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd
- Installer auto-configures heartbeat hooks in settings.json (all async, zero performance impact)
- Event types: session lifecycle, tool calls with file/command summaries, agent spawn/stop/idle, task completions

## [2.17.0] - 2026-02-16

### Added
- `/user:gsd-t-log` command — sync progress.md Decision Log with recent git activity by scanning commits since last logged entry
- Incremental updates (only new commits) and first-time full reconstruction from git history
- Total commands: 38 GSD-T + 3 utility = 41

## [2.16.5] - 2026-02-16

### Added
- `gsd-t-populate` now reconstructs Decision Log from git history — parses all commits, generates timestamped entries, merges with existing log
- Pre-Commit Gate explicitly lists all 30 file-modifying commands that must log to progress.md

### Changed
- Rebuilt GSD-T project Decision Log with full `YYYY-MM-DD HH:MM` timestamps from 54 git commits

## [2.16.4] - 2026-02-16

### Changed
- Smart router renamed from `/user:gsd-t` to `/user:gsd` — sorts first in autocomplete, shorter to type
- Pre-Commit Gate now requires timestamped progress.md entry (`YYYY-MM-DD HH:MM`) after every completed task, not just architectural decisions

## [2.16.3] - 2026-02-16

### Fixed
- Reverted smart router rename (`/gsd` back to `/gsd-t`) — superseded by 2.16.4 which re-applies the rename

## [2.16.2] - 2026-02-16

### Changed
- Smart router renamed from `/user:gsd-t` to `/user:gsd` (reverted in 2.16.3)

## [2.16.1] - 2026-02-16

### Fixed
- `gsd-t-init-scan-setup` now pulls existing code from remote before scanning — prevents treating repos with existing code as greenfield

## [2.16.0] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) replaced signal-word lookup table with **semantic evaluation** — evaluates user intent against each command's purpose and "Use when" criteria from help summaries
- Router shows runner-up command when confidence is close: `(also considered: gsd-t-{x} — Esc to switch)`
- New commands automatically participate in routing without updating a routing table

### Added
- Backlog item B1: Agentic Workflow Architecture (future exploration when Claude Code agents mature)

## [2.15.4] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team scaling: one teammate per requirement (3–10), cap at 10 with even batching for 11+, solo for 1–2

## [2.15.3] - 2026-02-13

### Fixed
- `gsd-t-gap-analysis` hard cap of 4 teammates max — scales by requirement count (2 for 5–10, 3 for 11–15, 4 for 16+), solo for < 5

## [2.15.2] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team mode now handles flat requirement lists — chunks into batches of ~8–10 per teammate instead of requiring sections

## [2.15.1] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` now uses agent team mode automatically — one teammate per requirement section for parallel scanning and classification, with solo fallback

## [2.15.0] - 2026-02-13

### Added
- `/user:gsd-t-gap-analysis` command — requirements gap analysis against existing codebase
- Parses spec into discrete numbered requirements, scans codebase, classifies each as implemented/partial/incorrect/not-implemented
- Evidence-based classification with file:line references for each requirement
- Severity levels: Critical (incorrect), High (partial), Medium (not implemented), Low (deferrable)
- Generates `.gsd-t/gap-analysis.md` with requirements breakdown, gap matrix, and summary stats
- Re-run support with diff against previous gap analysis (resolved, new, changed, unchanged)
- Optional merge of parsed requirements into `docs/requirements.md`
- Auto-groups gaps into recommended milestones/features/quick-fixes for promotion
- Autonomy-aware: Level 3 proceeds with flagged assumptions, Level 1-2 pauses for clarification
- Total commands: 37 GSD-T + 3 utility = 40

## [2.14.2] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) now displays selected command as the first line of output (mandatory routing confirmation)

## [2.14.1] - 2026-02-13

### Changed
- Update Notices section in CLAUDE-global template now handles both `[GSD-T UPDATE]` (update available) and `[GSD-T]` (up to date) version banners
- Update command in notification changed from raw npm command to `/user:gsd-t-version-update-all`

## [2.14.0] - 2026-02-12

### Added
- `/user:gsd-t` smart router command — describe what you need in plain language, auto-routes to the correct GSD-T command
- Intent classification routes to: quick, feature, project, debug, scan, brainstorm, milestone, wave, status, resume, backlog-add, and more
- Total commands: 36 GSD-T + 3 utility = 39

## [2.13.4] - 2026-02-12

### Added
- Auto-invoked status column on all command tables in README and GSD-T-README (Manual / In wave)
- `[auto]` markers on wave-invoked commands in `gsd-t-help` main listing
- Section headers in `gsd-t-help` now show Manual or Auto label

## [2.13.3] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks "Is {current folder} your project root?" before prompting for a folder name

## [2.13.2] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks for project folder name, creates it if needed, and `cd`s into it — can be run from anywhere

## [2.13.1] - 2026-02-12

### Changed
- Update notification now includes changelog link (https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md)

## [2.13.0] - 2026-02-12

### Added
- `/user:gsd-t-init-scan-setup` slash command — full project onboarding combining git setup, init, scan, and setup in one command
- Prompts for GitHub repo URL if not already connected; skips if remote exists
- Total commands: 35 GSD-T + 3 utility = 38

## [2.12.0] - 2026-02-12

### Added
- `/user:gsd-t-version-update` slash command — update GSD-T to latest version from within Claude Code
- `/user:gsd-t-version-update-all` slash command — update GSD-T + all registered projects from within Claude Code
- Total commands: 34 GSD-T + 3 utility = 37

## [2.11.6] - 2026-02-12

### Changed
- Update notice now shown at both beginning and end of Claude's first response

## [2.11.5] - 2026-02-12

### Added
- SessionStart hook script (`~/.claude/scripts/gsd-t-update-check.js`) for automatic update notifications in Claude Code sessions
- "Update Notices" instruction in global CLAUDE.md template — Claude relays update notices to the user on first response

## [2.11.4] - 2026-02-12

### Fixed
- First-run update check now fetches synchronously when no cache exists — notification shows immediately instead of requiring a second run

## [2.11.3] - 2026-02-12

### Changed
- Reduced update check cache duration from 24 hours to 1 hour — new releases are detected faster

## [2.11.2] - 2026-02-12

### Fixed
- CLI update check used `!==` instead of semver comparison — would show incorrect downgrade notices when cache had an older version
- Added `isNewerVersion()` helper for proper semver comparison in update notifications

## [2.11.1] - 2026-02-12

### Changed
- `gsd-t-resume` now detects same-session vs cross-session mode — skips full state reload when context is already available, auto-resumes at Level 3
- Added "Conversation vs. Work" rule to global CLAUDE.md template — plain text questions are answered conversationally, workflow only runs when a `/gsd-t-*` command is invoked

## [2.11.0] - 2026-02-12

### Added
- Autonomy-level-aware auto-advancing for all phase commands — at Level 3 (Full Auto), partition, plan, impact, execute, test-sync, integrate, verify, and complete-milestone auto-advance without waiting for user input
- Wave error recovery auto-remediates at Level 3 (up to 2 fix attempts before stopping)
- Discuss phase always pauses for user input regardless of autonomy level
- Autonomy levels documentation added to GSD-T-README Configuration section

## [2.10.3] - 2026-02-11

### Changed
- Default autonomy level changed from Level 2 (Standard) to Level 3 (Full Auto) across all templates and commands
- `gsd-t-init` now sets Level 3 in generated CLAUDE.md
- `gsd-t-setup` defaults to Level 3 when asking autonomy level

## [2.10.2] - 2026-02-11

### Added
- Version update check in `gsd-t-status` slash command — works inside Claude Code and ClaudeWebCLI sessions, not just the CLI binary

### Fixed
- Normalized `repository.url` in package.json (`git+https://` prefix)

## [2.10.1] - 2026-02-10

### Added
- Automatic update check — CLI queries npm registry (cached 24h, background refresh) and shows a notice box with update commands when a newer version is available

## [2.10.0] - 2026-02-10

### Added
- `CHANGELOG.md` release notes document with full version history
- `changelog` CLI subcommand — opens changelog in the browser (`gsd-t changelog`)
- Clickable version links in CLI output (OSC 8 hyperlinks to changelog)
- `checkin` command now auto-updates CHANGELOG.md on every version bump
- `update-all` now creates CHANGELOG.md for registered projects that don't have one

## [2.9.0] - 2026-02-10

### Added
- `gsd-t-setup` command — generates or restructures project CLAUDE.md by scanning codebase, detecting tech stack/conventions, and removing global duplicates

## [2.8.1] - 2026-02-10

### Added
- Workflow Preferences section in global and project CLAUDE.md templates (Research Policy, Phase Flow defaults with per-project override support)

## [2.8.0] - 2026-02-10

### Added
- Backlog management system: 7 new commands (`backlog-add`, `backlog-list`, `backlog-move`, `backlog-edit`, `backlog-remove`, `backlog-promote`, `backlog-settings`)
- 2 new templates (`backlog.md`, `backlog-settings.md`)
- Backlog initialization in `gsd-t-init` with auto-category derivation
- Backlog summary in `gsd-t-status` report
- Backlog section in `gsd-t-help`

### Changed
- Updated `gsd-t-init`, `gsd-t-status`, `gsd-t-help`, CLAUDE-global template, README with backlog integration

## [2.7.0] - 2026-02-09

### Added
- `update-all` CLI command — updates global install + all registered project CLAUDE.md files
- `register` CLI command — manually register a project in the GSD-T project registry
- Auto-registration on `gsd-t init`
- Project registry at `~/.claude/.gsd-t-projects`

## [2.6.0] - 2026-02-09

### Added
- Destructive Action Guard — mandatory safeguard requiring explicit user approval before destructive or structural changes (schema drops, architecture replacements, module removal)
- Guard enforced in global CLAUDE.md, project template, and all execution commands

## [2.5.0] - 2026-02-09

### Changed
- Audited all 27 command files — added Document Ripple and Test Verification steps to 15 commands that were missing them
- All code-modifying commands now enforce doc updates and test runs before completion

## [2.4.0] - 2026-02-09

### Added
- Automatic version bumping in `checkin` command — determines patch/minor/major from change type

## [2.3.0] - 2026-02-09

### Added
- Branch Guard — prevents commits on wrong branch by checking `Expected branch` in CLAUDE.md

## [2.2.1] - 2026-02-09

### Fixed
- `gsd-t-discuss` now stops for user review when manually invoked (was auto-continuing even in manual mode)

## [2.2.0] - 2026-02-09

### Added
- E2E test support in `test-sync`, `verify`, and `execute` commands

## [2.1.0] - 2026-02-09

### Added
- `gsd-t-populate` command — auto-populate living docs from existing codebase
- Semantic versioning system tracked in `progress.md`
- Auto-update README on version changes

## [2.0.2] - 2026-02-07

### Changed
- `gsd-t-init` now creates all 4 living document templates (`requirements.md`, `architecture.md`, `workflows.md`, `infrastructure.md`)
- `gsd-t-scan` cross-populates findings into living docs

## [2.0.1] - 2026-02-07

### Fixed
- Added `gsd-t-brainstorm` to all 4 reference files (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- Fixed workflow diagram alignment

## [2.0.0] - 2026-02-07

### Added
- Renamed package to `@tekyzinc/gsd-t`
- `gsd-t-brainstorm` command — creative exploration, rethinking, and idea generation
- Initialized GSD-T state (`.gsd-t/` directory) on itself

### Changed
- Complete framework rewrite from GSD to GSD-T (contract-driven development)
- npm package with CLI installer (`bin/gsd-t.js`)
- 6 CLI subcommands: install, update, init, status, doctor, uninstall

## [1.0.0] - 2026-02-07

### Added
- Initial GSD-T framework implementation
- Full milestone workflow: partition, discuss, plan, impact, execute, test-sync, integrate, verify, complete
- Agent Teams support for parallel execution
- Living documents system (requirements, architecture, workflows, infrastructure)
