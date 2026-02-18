# Business Rules — 2026-02-18

## Scan #4: Business Rules Extraction (Post-Milestones 3-7)
**Package**: @tekyzinc/gsd-t v2.24.3
**Previous scan**: #3 at v2.23.0 (2026-02-18)
**Scope**: CLI validation, workflow phase rules, QA agent rules, wave orchestration, pre-commit gates, autonomy behavior, heartbeat security, undocumented rules
**Files scanned**: `bin/gsd-t.js`, 43 command files in `commands/`, `templates/CLAUDE-global.md`, `scripts/gsd-t-heartbeat.js`, `scripts/npm-update-check.js`, `scripts/gsd-t-fetch-version.js` (NEW)

### Changes Since Scan #3
- **M5**: New security functions `scrubSecrets()`, `scrubUrl()`, `hasSymlinkInPath()` in heartbeat; path validation in `npm-update-check.js`
- **M6**: All 13 over-30-line functions split. New helpers: `buildEvent()` → `EVENT_HANDLERS` map, `readProjectDeps()`, `readPyContent()`, `insertGuardSection()`, `readUpdateCache()`, `addHeartbeatHook()`, `updateSingleProject()`, `showUpdateAllSummary()`. New script: `scripts/gsd-t-fetch-version.js`
- **M7**: Command files now have integer-only step numbers, Autonomy Behavior sections in discuss+impact, structured discuss-skip in wave, QA file-path boundaries + multi-framework detection

---

## 1. CLI Validation Rules

### 1.1 Project Name Validation
- **File**: `bin/gsd-t.js:139-141`
- **Rule**: Project names must match `/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/`
- **Constraint**: Must start with letter or number; max 101 chars; allows dots, hyphens, underscores, spaces
- **Enforcement**: `validateProjectName()` — blocks `doInit()` if invalid

### 1.2 Version String Validation
- **File**: `bin/gsd-t.js:151-153`
- **Rule**: Versions must match `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/`
- **Constraint**: Strict semver with optional pre-release suffix
- **Enforcement**: `validateVersion()` — used in update check cache validation, npm registry response validation, and `fetchVersionSync()`

### 1.3 Project Path Validation
- **File**: `bin/gsd-t.js:155-166`
- **Rule**: Registered project paths must be absolute, exist on disk, be a directory, and (on Unix) be owned by current user
- **Constraint**: Defense-in-depth against path traversal and privilege escalation
- **Enforcement**: `validateProjectPath()` — filters `getRegisteredProjects()`, invalid paths logged with warning and skipped

### 1.4 Symlink Protection (Enhanced in M5)
- **File**: `bin/gsd-t.js:118-137`, used at 15+ locations throughout
- **Rule**: NEVER write to a symlinked file or directory; NEVER use a path with any symlinked component
- **Functions**:
  - `isSymlink(filePath)`: Checks if the target itself is a symlink via `fs.lstatSync()`
  - `hasSymlinkInPath(targetPath)` **(NEW in M5)**: Walks from target up to filesystem root, checking each ancestor for symlinks
- **Enforcement**: `isSymlink()` guard before every `fs.writeFileSync`, `fs.copyFileSync`, `fs.appendFileSync`; `hasSymlinkInPath()` guard in `ensureDir()`
- **Affected operations**: version file, settings.json, CLAUDE.md, project registration, command files, heartbeat script, all init-created files, backup files, changelog creation, guard injection, heartbeat event writing, update cache writing

### 1.5 File-Exists-Skip Pattern (Idempotent Init)
- **File**: `bin/gsd-t.js:579-590` (`writeTemplateFile()`), `512-534` (`initClaudeMd()`), `536-557` (`initDocs()`), `559-577` (`initGsdtDir()`), `799-822` (`createProjectChangelog()`)
- **Rule**: Init never overwrites existing files — uses `{ flag: "wx" }` (exclusive create)
- **Constraint**: If file exists (`EEXIST`), log info and skip; never clobber user content
- **Enforcement**: `fs.writeFileSync(path, content, { flag: "wx" })` with EEXIST catch

### 1.6 Update Content Comparison
- **File**: `bin/gsd-t.js:390-406`
- **Rule**: During `update`, command files are only overwritten if content differs
- **Constraint**: Comparison uses `normalizeEol()` to handle CRLF vs LF differences
- **Enforcement**: Read both source and dest, compare normalized content; skip if identical; count skipped files

### 1.7 Version Comparison
- **File**: `bin/gsd-t.js:1083-1091`
- **Rule**: `isNewerVersion(latest, current)` compares semver segments left to right
- **Constraint**: Returns true only if latest is strictly newer (not equal); missing segments default to 0
- **Limitation**: Does not handle pre-release suffixes — only compares numeric segments

### 1.8 Update Check Cache (Refactored in M6)
- **File**: `bin/gsd-t.js:1093-1140`
- **Rule**: Update check caches npm registry response for 1 hour (3600000ms)
- **Three-tier fetch logic** (refactored — was monolithic):
  - `readUpdateCache()`: Reads and parses `~/.claude/.gsd-t-update-check` JSON; returns null on missing/corrupt
  - `fetchVersionSync()`: **NEW in M6** — delegates to `scripts/gsd-t-fetch-version.js` via `execFileSync` (8s timeout). Previous behavior embedded the fetch inline
  - `refreshVersionAsync()`: Spawns detached background `scripts/npm-update-check.js` for non-blocking refresh
- **First-run**: No cache → synchronous fetch via `gsd-t-fetch-version.js` (blocks CLI)
- **Subsequent stale**: Cache exists but >1hr old → async background refresh
- **Skip**: update/install/update-all/--version/-v commands bypass the check

### 1.9 Encoding Validation (Doctor)
- **File**: `bin/gsd-t.js:997-1010`
- **Rule**: Command files are checked for encoding corruption (mojibake)
- **Detection**: Specific corrupted UTF-8 sequences (`\u00e2\u20ac`, `\u00c3`)
- **Remediation**: Reports count and recommends `gsd-t update` to fix

### 1.10 Zero External Dependencies
- **File**: `CLAUDE.md` (project-level), `package.json`
- **Rule**: `bin/gsd-t.js` must use ONLY Node.js built-ins (fs, path, os, child_process)
- **Enforcement**: No `dependencies` or `devDependencies` in package.json; stated as "Don't Do" rule

---

## 2. Workflow Phase Rules (State Transitions)

### 2.1 Phase Sequence (Fixed Order)
- **File**: `templates/CLAUDE-global.md:14-16`, `commands/gsd-t-wave.md:16-29`
- **Canonical order**: PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
- **State machine**:

| Current Status | Next Phase | Set By |
|----------------|------------|--------|
| READY | Need milestone first | init / complete-milestone |
| INITIALIZED | Milestone definition | init |
| DEFINED | Partition | milestone |
| PARTITIONED | Discuss (conditional) or Plan | partition |
| DISCUSSED | Plan | discuss |
| PLANNED | Impact | plan |
| IMPACT_ANALYZED | Execute | impact |
| EXECUTED | Test-Sync | execute |
| TESTS_SYNCED | Integrate | test-sync |
| INTEGRATED | Verify | integrate |
| VERIFIED | Complete | verify |
| VERIFY_FAILED | Remediate → re-Verify | verify (failure) |
| COMPLETED | Reset to READY | complete-milestone |

- **Forward-only**: Status transitions proceed in order. Exceptions: VERIFY_FAILED reverts to remediation; COMPLETED resets to READY

### 2.2 Discuss Phase — Structured Skip Check (NEW in M7)
- **File**: `commands/gsd-t-wave.md:78-83`
- **Rule**: Discuss is the ONLY phase that may be skipped, but wave now uses a **structured three-condition check** instead of a heuristic
- **Skip when ALL of these are true**:
  - (a) Single domain milestone (only one entry in Domains table)
  - (b) No items containing "OPEN QUESTION" in the Decision Log
  - (c) For multi-domain milestones: all cross-domain contracts exist in `.gsd-t/contracts/`
- **If ANY check fails**: Spawn discuss agent
- **CHANGE from scan #3**: Previously, the skip condition was a vague "Path is clear, architecture well-established, no open design questions". Now it is a deterministic three-part check.

### 2.3 Discuss Phase — Dual Autonomy Behavior (NEW in M7)
- **File**: `commands/gsd-t-discuss.md:6-19`, `126-133`
- **Manual invocation** (`/user:gsd-t-discuss`):
  - Focus on user's specific topic from `$ARGUMENTS`
  - Present analysis, options, recommendations — do NOT auto-implement
  - **STOP and wait for user input — even at Level 3 / bypass permissions**
  - "This is mandatory — even at Level 3 / bypass permissions"
- **Auto invocation** (called by wave or another workflow):
  - Work through all open questions automatically
  - Make recommendations and log decisions
  - Continue to next phase without stopping
- **Detection heuristic**: `$ARGUMENTS` with specific topic = manual; empty or milestone-only = auto-invoked
- **CHANGE from scan #3**: Autonomy behavior section is now a structured subsection at end of command file. The rules themselves are the same but are now explicitly structured.

### 2.4 Impact Analysis — Dual Autonomy Behavior (NEW in M7)
- **File**: `commands/gsd-t-impact.md:240-244`
- **Level 3 (Full Auto)**:
  - PROCEED or PROCEED WITH CAUTION → log findings and auto-advance to execute. "Do NOT wait for user input."
  - BLOCK → stop and report breaking changes to user. "Do NOT auto-advance."
  - Standalone → always report and exit without auto-proceeding
- **Level 1-2**:
  - Present full impact report
  - Wait for user confirmation before proceeding (PROCEED) or pause for remediation (BLOCK)
  - PROCEED WITH CAUTION → ask "These can be addressed during execution. Proceed?"
- **CHANGE from scan #3**: Impact now has an explicit "Autonomy Behavior" subsection at the end (M7 pattern). Previously, the behavior was described inline in the decision gate.

### 2.5 Impact Analysis Decision Gate (Three Verdicts)
- **File**: `commands/gsd-t-impact.md:204-226`, `commands/gsd-t-wave.md:93-97`
- **PROCEED**: "No blocking issues found. Ready for execution." → continue to execute
- **PROCEED WITH CAUTION**: Level 3 → log and auto-advance; Level 1-2 → report, wait for user
- **BLOCK**: Stop entirely. Generate remediation tasks. Require user decision. Do NOT proceed
- **Wave behavior**: Level 3 on BLOCK → spawn remediation agent, then re-spawn impact. Max 2 attempts

### 2.6 Verify Outcome Handling (Three Outcomes)
- **File**: `commands/gsd-t-verify.md:160-177`, `commands/gsd-t-wave.md:112-115`
- **VERIFIED**: Proceed to complete-milestone
- **CONDITIONAL PASS (VERIFIED-WITH-WARNINGS)**: Level 3 → treat as VERIFIED, auto-advance; Level 1-2 → user decides
- **FAIL (VERIFY-FAILED)**: Level 3 → auto-remediate (max 2 fix attempts), then STOP; Level 1-2 → return to execute

### 2.7 Complete-Milestone Gap Analysis Gate (MANDATORY)
- **File**: `commands/gsd-t-complete-milestone.md:20-33`
- **Rule**: Before archiving, mandatory gap analysis runs against `docs/requirements.md` scoped to milestone deliverables
- **Gate logic**: 100% Implemented → proceed | Gaps found → auto-fix → re-verify → re-gap-analysis | Max 2 fix cycles | Unresolved after 2 → STOP

### 2.8 Complete-Milestone Force Override
- **File**: `commands/gsd-t-complete-milestone.md:16-18`
- **Rule**: `--force` flag allows completing milestone even if status is not VERIFIED
- **Recording**: Forced completion recorded as status "FORCED" in archive summary

### 2.9 Wave Integrity Check (NEW in M7)
- **File**: `commands/gsd-t-wave.md:13-22`
- **Rule**: After reading progress.md, wave orchestrator MUST verify three required fields before proceeding:
  - **Status field**: A `Status:` line with a recognized value (DEFINED, PARTITIONED, PLANNED, etc.)
  - **Milestone name**: A `Milestone` heading or table entry identifying the current milestone
  - **Domains table**: A `| Domain |` table with at least one row
- **If ANY missing/malformed**: STOP and report: "Wave cannot proceed — progress.md is missing required fields: {list}. Run `/user:gsd-t-status` to inspect, or `/user:gsd-t-init` to repair."
- **Critical**: "Do NOT attempt to fix progress.md yourself — that risks data loss."
- **CHANGE from scan #3**: This is a NEW rule. Previously wave just loaded state without structural validation.

### 2.10 Phase Status Update Verification
- **File**: `commands/gsd-t-wave.md:122-130`
- **Rule**: After each phase agent completes, wave orchestrator reads `progress.md` to verify status was updated correctly
- **Failure**: If status NOT updated → report error and STOP; do not proceed to next phase

### 2.11 Incomplete Milestone Guard
- **File**: `commands/gsd-t-milestone.md:36-39`
- **Rule**: If previous milestone is NOT complete, ask: "Milestone {N-1} is still {status}. Archive it and start new? Or complete it first?"

---

## 3. QA Agent Rules

### 3.1 QA Agent Is Mandatory for All Code Phases
- **File**: `templates/CLAUDE-global.md:215-230`
- **Rule**: Any GSD-T phase that produces or validates code MUST spawn a QA teammate
- **Mandatory commands**: partition, plan, execute, verify, complete-milestone, quick, debug, integrate, test-sync, wave (10 commands)
- **Spawn instruction format**: `Teammate "qa": Read commands/gsd-t-qa.md for your full instructions. Phase context: {current phase}.`

### 3.2 QA Agent Identity Constraints
- **File**: `commands/gsd-t-qa.md:1-10`
- **DO**: Write tests, run tests, report results
- **DO NOT**: Write feature code, modify contracts, change architecture
- **Context**: Receives contracts from `.gsd-t/contracts/` and current phase context

### 3.3 QA File-Path Boundaries (NEW in M7)
- **File**: `commands/gsd-t-qa.md:14-27`
- **CAN modify**: Project test directories (`test/`, `tests/`, `__tests__/`, `e2e/`, `spec/`), test config files (`playwright.config.*`, `jest.config.*`, `vitest.config.*`), `.gsd-t/test-coverage.md`
- **MUST NOT modify**: Source code (`src/`, `lib/`, `bin/`, `scripts/`), contracts (`.gsd-t/contracts/`), documentation (`docs/`, `README.md`, `CLAUDE.md`), command files (`commands/`), template files (`templates/`), non-test config (`.gsd-t/progress.md`, `package.json`, etc.)
- **If source change needed**: "Message the lead — do not make the change yourself"
- **CHANGE from scan #3**: This is a NEW explicit boundary rule. Previously QA was told "you never write feature code" but had no explicit file-path boundary list.

### 3.4 QA Failure Blocks Phase Completion
- **File**: `commands/gsd-t-qa.md:209-213`
- **Rule**: QA FAIL status blocks phase completion; lead cannot proceed until QA reports PASS
- **Override**: User can explicitly approve "proceed despite QA fail"
- **Autonomy**: QA agent does not need lead approval to write or run tests — that is its job

### 3.5 Phase-Specific QA Behavior

| Phase | Trigger | QA Action | Report Format |
|-------|---------|-----------|---------------|
| **Partition** | Contracts written | Generate contract test skeletons | `QA: {N} contract test files generated, {N} test cases total` |
| **Plan** | Task lists created | Generate acceptance test scenarios | `QA: {N} acceptance test scenarios generated` |
| **Execute** | Alongside domain teammates | Run tests continuously, write edge cases, report per-task | `QA: Task {N} — {pass\|fail}. {details}` |
| **Test-Sync** | Lead runs test-sync | Validate test-to-contract alignment, fill gaps | `QA: Test-sync — {pass\|fail}. {N} contract tests aligned, {N} gaps filled, {N} stale tests updated` |
| **Verify** | Lead invokes verify | Full test audit: contract + acceptance + edge case + project tests | `QA: {pass\|fail} — {N} contract, {N} acceptance, {N} edge case. Gaps: {list}` |
| **Quick** | Quick task runs | Write tests for change, run FULL suite | `QA: {pass\|fail} — {N} tests added/updated, full suite {N}/{N} passing` |
| **Debug** | Bug being fixed | Write regression test (fails before fix, passes after) | `QA: Regression test written — {test name}. Full suite {pass\|fail}` |
| **Integrate** | Domains wired together | Run cross-domain contract tests and integration tests | `QA: Integration — {pass\|fail}. {N} cross-domain tests, {gaps}` |
| **Complete-Milestone** | Before archive | Final gate: ALL tests, every contract verified, every requirement has test | `QA: Final gate — {PASS\|FAIL}. {N} total, {N} passing, {N} failing` |

- **Source**: `commands/gsd-t-qa.md:29-119`

### 3.6 QA Framework Detection (NEW in M7)
- **File**: `commands/gsd-t-qa.md:123-140`
- **Rule**: Before generating any tests, QA MUST detect the project's existing test framework
- **Detection order**:
  1. Check for existing test config (`playwright.config.*`, `jest.config.*`, `vitest.config.*`, mocha in package.json, `pytest.ini`, `pyproject.toml`)
  2. Check package.json dependencies (`@playwright/test`, `jest`, `vitest`, `mocha`, `node:test`)
  3. Check existing test files (import style)
  4. Check for Python (`requirements.txt`, `pyproject.toml` with `pytest`)
- **Framework-specific generation table**:

| Framework | Import Style | Test Block | Assertion |
|-----------|-------------|------------|-----------|
| Playwright | `import { test, expect } from '@playwright/test'` | `test.describe` / `test` | `expect(x).toBe(y)` |
| Jest | `const { describe, it, expect } = require(...)` or ES import | `describe` / `it` | `expect(x).toBe(y)` |
| Vitest | `import { describe, it, expect } from 'vitest'` | `describe` / `it` | `expect(x).toBe(y)` |
| Node.js built-in | `const { describe, it } = require('node:test')` | `describe` / `it` | `assert.equal(x, y)` |
| Pytest | `import pytest` | `def test_` / `class Test` | `assert x == y` |

- **Key rule**: "Always match the project's existing test framework. Do not introduce a new framework unless the project has none. If no framework exists, default to ecosystem standard (Node.js: `node:test`, Python: `pytest`)."
- **CHANGE from scan #3**: This is a NEW explicit multi-framework detection and generation specification. Previously QA defaulted to Playwright patterns.

### 3.7 Contract-to-Test Mapping Rules
- **File**: `commands/gsd-t-qa.md:142-186`
- **API Contract** (`api-contract.md`):
  - Each `## METHOD /path` → one `test.describe` block
  - `Request:` section → test sends this payload
  - `Response {code}:` → status code assertion + response shape validation (every field)
  - `Errors:` → one test per error code
  - `Auth:` → test with and without auth
  - Auto-generate: empty body, missing required fields, wrong HTTP method
- **Schema Contract** (`schema-contract.md`):
  - Each `## Table` → one `test.describe` block
  - Column constraints → assertion tests (unique, not null, FK)
  - Prefer API-through-testing; direct DB only for unexercised constraints
- **Component Contract** (`component-contract.md`):
  - Each `## ComponentName` → one `test.describe` block
  - `Props:` → renders with required props, handles missing optional props
  - `Events:` → event handlers fire correctly
  - Auto-generate: empty form, partial form, network error handling

### 3.8 QA Test File Conventions
- **File**: `commands/gsd-t-qa.md:187-194`
- **Location**: Project's test directory (detected from `playwright.config.*` or `package.json`)
- **Naming**: `contract-{contract-name}.spec.ts` (e.g., `contract-api.spec.ts`)
- **Marker**: Every generated test includes `// @contract-test` comment
- **Separation**: Contract tests are distinct from implementation tests — never mix
- **Regeneration**: When contract changes, regenerate affected test file; preserve manual additions marked with `// @custom`

### 3.9 QA Communication Protocol
- **File**: `commands/gsd-t-qa.md:197-205`
- **Format**:
  ```
  QA: {PASS|FAIL} — {one-line summary}
    Contract tests: {N} passing, {N} failing
    Acceptance tests: {N} passing, {N} failing
    Edge case tests: {N} added
    Gaps: {list or "none"}
  ```

### 3.10 QA Document Ripple (NEW in M7)
- **File**: `commands/gsd-t-qa.md:219-229`
- **Always update**: `.gsd-t/test-coverage.md`
- **Check if affected**:
  - `docs/requirements.md` — add test file paths to requirement's test mapping
  - Domain `scope.md` — verify test directory listed in owned files
  - `.gsd-t/techdebt.md` — if generation revealed untestable code or missing exports, add as debt
- **CHANGE from scan #3**: This is a NEW document ripple section added to QA. Previously QA had no document ripple obligations.

### 3.11 QA Cleanup Rule
- **File**: `commands/gsd-t-qa.md:216`
- **Rule**: After tests complete (pass or fail), kill any app/server processes spawned during test runs; do not leave orphaned dev servers

---

## 4. Wave Orchestrator Rules

### 4.1 Agent-Per-Phase Architecture
- **File**: `commands/gsd-t-wave.md:1-4`
- **Rule**: Wave orchestrator does NOT execute phases itself; spawns an independent agent for each phase with fresh context window (~200K tokens)
- **Rationale**: Eliminates context accumulation; prevents mid-wave compaction; each agent loads only what it needs from state files
- **Orchestrator footprint**: ~30KB total, never compacts

### 4.2 Orchestrator Loads Minimal State
- **File**: `commands/gsd-t-wave.md:8-10`
- **Rule**: Orchestrator reads ONLY `progress.md` (status) and `CLAUDE.md` (autonomy level)
- **Explicit**: "Do NOT read contracts, domains, docs, or source code."

### 4.3 State Handoff Via Files
- **File**: `commands/gsd-t-wave.md:203`
- **Rule**: All state handoff between phases happens through `.gsd-t/` files

### 4.4 Phase Agent Spawn Pattern
- **File**: `commands/gsd-t-wave.md:50-66`
- **Spawn method**: Task tool with `subagent_type: "general-purpose"`, `mode: "bypassPermissions"`
- **Agent instructions**: Read command file → Read progress.md → Read CLAUDE.md → Read contracts → Complete phase fully → Update progress status → Run document ripple → Commit work → Report one-line summary

### 4.5 Between-Phase Verification Protocol
- **File**: `commands/gsd-t-wave.md:122-130`
- **After each agent completes**:
  1. Read `.gsd-t/progress.md` to verify the phase updated status correctly
  2. Report brief status to user
  3. If status NOT updated correctly → report error and STOP
  4. Proceed to next phase

### 4.6 Wave Autonomy Behavior
- **File**: `commands/gsd-t-wave.md:132-140`
- **Level 3 (Full Auto)**: Auto-advance to next phase. STOP only for:
  - Destructive Action Guard violations (reported by phase agent)
  - Impact analysis BLOCK verdict
  - Unrecoverable errors after 2 fix attempts
  - Discuss phase (always pauses for user input)
- **Level 1-2**: Pause between phases, show status, ask to continue

### 4.7 Wave Error Recovery Rules
- **File**: `commands/gsd-t-wave.md:175-193`
- **Impact blocks**: Level 3 → spawn remediation agent then re-spawn impact; max 2 attempts. Level 1-2 → ask user
- **Test failures during execute**: Execute agent handles internally (2 fix attempts); if still failing → report failure; orchestrator stops
- **Verify fails**: Level 3 → spawn remediation then re-verify; max 2 attempts. Level 1-2 → ask user
- **Universal max**: 2 fix attempts on any error before stopping

### 4.8 Wave Interruption Handling
- **File**: `commands/gsd-t-wave.md:168-173`
- **Protocol**: (1) Current phase agent saves state to progress.md; (2) Report "Paused at {phase}. Run `/user:gsd-t-resume` to continue."; (3) Resume picks up from last completed phase

### 4.9 Wave Completion Report
- **File**: `commands/gsd-t-wave.md:144-166`
- **Includes**: Milestone name, archive location, git tag, domains, tasks completed, contracts defined/verified, tests added/updated, impact items addressed, decision log entries

### 4.10 Wave Security — bypassPermissions Mode
- **File**: `commands/gsd-t-wave.md:205-231`
- **Rule**: Wave spawns each phase agent with `mode: "bypassPermissions"` — agents execute bash, write files, perform git operations without per-action user approval
- **Attack surface**: Tampered command files in `~/.claude/commands/` would execute with full permissions
- **Current mitigations**: npm-installed files (known-good source), content comparison on update, user-owned directory permissions, Destructive Action Guard (soft protection), autonomy levels 1-2 give visibility
- **Recommendations**: Use Level 1-2 for sensitive projects; run `gsd-t doctor` periodically; audit command files for modifications; keep GSD-T updated

---

## 5. Pre-Commit Gate Rules

### 5.1 Branch Guard (First Check)
- **File**: `templates/CLAUDE-global.md:264-268`, `commands/gsd-t-execute.md:14-15`
- **Rule**: Before every commit, check `git branch --show-current` against "Expected branch" in CLAUDE.md
- **Wrong branch**: STOP — do NOT commit; switch to correct branch first
- **No guard set**: Proceed but warn user to set one
- **Execute phase**: Also checks branch before any execution work begins

### 5.2 Contract Sync Checks
- **File**: `templates/CLAUDE-global.md:269-276`
- **API endpoint changed**: Update `api-contract.md` + Swagger/OpenAPI spec + verify Swagger URL in CLAUDE.md and README.md
- **Database schema changed**: Update `schema-contract.md` AND `docs/schema.md`
- **UI component interface changed**: Update `component-contract.md`

### 5.3 Scope and Documentation Checks
- **File**: `templates/CLAUDE-global.md:277-302`
- **New files/directories**: Update owning domain's `scope.md`
- **Requirement implemented/changed**: Update `docs/requirements.md`
- **Component/data flow changed**: Update `docs/architecture.md`
- **ANY file modified**: Add timestamped Decision Log entry to `progress.md`
- **Architectural decision**: Include rationale in progress.md entry
- **Tech debt found/fixed**: Update `.gsd-t/techdebt.md`
- **Pattern established**: Update `CLAUDE.md` or domain `constraints.md`
- **Tests added/changed**: Verify test names/paths referenced in requirements
- **UI/routes/flows changed**: Update E2E test specs

### 5.4 Decision Log Entry Format
- **File**: `templates/CLAUDE-global.md:284-286`
- **Format**: `- YYYY-MM-DD HH:MM: {what was done} — {brief context or result}`
- **Scope**: ALL file-modifying activities across ALL commands (35+ specific activities listed)

### 5.5 Test Execution Requirement
- **File**: `templates/CLAUDE-global.md:301-302`
- **Rule**: Before committing, run affected tests and verify they pass; if not run yet, run them now

### 5.6 GSD-T Framework-Specific Pre-Commit Gate
- **File**: `CLAUDE.md` (project-level, this repo)
- **Additional rules for GSD-T itself**:

| Condition | Required Actions |
|-----------|-----------------|
| Command file interface/behavior changed | Update GSD-T-README.md, README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md |
| Command added or removed | All 4 above + package.json version + bin/gsd-t.js command counting |
| CLI installer changed | Test: install, update, status, doctor, init, uninstall |
| Template changed | Verify gsd-t-init produces correct output |
| Wave flow changed | Update gsd-t-wave.md, GSD-T-README.md, README.md |
| Contract or domain boundary changed | Update .gsd-t/contracts/ and affected domain scope.md |

---

## 6. Autonomy Level Behavior Rules

### 6.1 Three Levels (Default: Level 3)
- **File**: `templates/CLAUDE-global.md:318-328`
- **Level 1 (Supervised)**: Pause at each phase for confirmation
- **Level 2 (Standard)**: Pause only at milestones
- **Level 3 (Full Auto)**: Only pause for blockers or project completion
- **Default**: Level 3 if not specified in project CLAUDE.md

### 6.2 Level 3 Stop Conditions (Prime Rule: KEEP GOING)
- **File**: `templates/CLAUDE-global.md:251-257`
- **Only stop for**:
  1. Unrecoverable errors after 2 fix attempts
  2. Ambiguity that fundamentally changes project direction
  3. Milestone completion (checkpoint for user review)
  4. Destructive actions (Destructive Action Guard — ALWAYS stop)

### 6.3 Per-Phase Autonomy Behavior Pattern (Formalized in M7)
- **Observation**: Every phase command now has a structured "Autonomy Behavior" subsection following this pattern:
  - **Level 3**: Log brief status line, auto-advance. "Do NOT wait for user input."
  - **Level 1-2**: Present summary, wait for confirmation
- **Commands with explicit Autonomy Behavior sections**: execute, discuss, impact, verify, test-sync, wave
- **Exceptions to Level 3 auto-advance**:
  - Discuss (manual invocation) → ALWAYS pauses
  - Impact BLOCK → ALWAYS pauses
  - Destructive Action Guard → ALWAYS pauses
  - VERIFY_FAILED after 2 fix attempts → pauses
- **CHANGE from scan #3**: Discuss and Impact now have formalized "Autonomy Behavior" subsections. Previously, autonomy behavior was described inline within those commands' step text.

### 6.4 Triage-and-Merge Publish Gate
- **File**: `commands/gsd-t-triage-and-merge.md:7-16`
- **Level 3**: Auto-publish ON — skip prompt, proceed with version bump + npm publish + deploy
- **Level 1-2**: Ask user "Auto-publish after merge?" before starting

### 6.5 Gap Analysis Ambiguity Handling
- **File**: `commands/gsd-t-gap-analysis.md:40-49`
- **Level 3**: Proceed with reasonable assumptions, flag each with `[ASSUMED: {reason}]`
- **Level 1-2**: Present ambiguous items and ask for clarification

### 6.6 Init-Scan-Setup Autonomy
- **File**: `commands/gsd-t-init-scan-setup.md:96-101`
- **Level 3**: Run all steps without pausing; only stop for git remote (requires user input) or critical security blockers
- **Level 1-2**: Pause after each major step (init, scan, setup) for user review

---

## 7. Destructive Action Guard Rules

### 7.1 Guard Scope (Applies at ALL Levels)
- **File**: `templates/CLAUDE-global.md:120-135`
- **ALWAYS stop and ask before**:
  - DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE
  - Renaming or removing database tables or columns
  - Schema migrations that lose data or break existing queries
  - Replacing an existing architecture pattern (e.g., normalized → denormalized)
  - Removing or replacing existing files/modules with working functionality
  - Changing ORM models conflicting with existing database schema
  - Removing API endpoints or changing response shapes clients depend on
  - Replacing a dependency or framework
  - Any change requiring other system parts to be rewritten

### 7.2 Handling Protocol
- **File**: `templates/CLAUDE-global.md:137-155`
- **Steps**: (1) READ existing schema/code first; (2) Adapt new code to existing structures; (3) If restructuring truly needed → present case with: what exists, what changes, what breaks, data/functionality lost, migration path; (4) Wait for EXPLICIT approval

### 7.3 Guard Injection into Projects (CLI) — Refactored in M6
- **File**: `bin/gsd-t.js:46-65`, `775-797`
- **Rule**: `update-all` injects Destructive Action Guard section into project CLAUDE.md files if not present
- **Placement logic** (now in dedicated `insertGuardSection()` function):
  1. Before "Pre-Commit Gate" heading (regex: `#{1,3} Pre-Commit Gate`)
  2. Before "Don't Do These Things" heading (regex: `#{1,3} Don't Do These Things`)
  3. Append to end (fallback)
- **Idempotent**: Checks `content.includes("Destructive Action Guard")` before modifying
- **Guard content**: Hardcoded as `GUARD_SECTION` constant (lines 46-65)
- **CHANGE from scan #3**: `insertGuardSection()` was extracted from inline code during M6 function-splitting.

### 7.4 Per-Command Guard Integration
- **Commands with explicit Destructive Action Guard checks**: execute (solo step 4, team rules), quick (step 3), debug (solo step 5)
- **Pattern**: "If YES → STOP and present the change to the user with what exists, what will change, what will break, and a safe migration path. Wait for explicit approval."

---

## 8. Testing Enforcement Rules

### 8.1 "No Feature Code Without Test Code"
- **File**: `commands/gsd-t-execute.md:56`, `commands/gsd-t-quick.md:76`, `commands/gsd-t-verify.md:39`, `commands/gsd-t-test-sync.md:273`
- **Rule**: Implementation and tests are ONE deliverable, not two separate steps
- **Scope**: Applies to execute, quick, and all phases — "We'll add tests later" is never acceptable

### 8.2 Comprehensive Test Coverage Requirements (Execute)
- **File**: `commands/gsd-t-execute.md:47-55`
- **Mandatory per task**:
  - Unit/integration tests: happy path + common edge cases + error cases + boundary conditions for every new/modified function
  - Playwright E2E (if UI/routes/flows/modes changed): new specs for new features/pages/modes/flows; cover happy path, form validation, empty states, loading states, error states, responsive breakpoints, all feature modes/flags, edge cases
  - If no test framework exists: set one up as part of the task

### 8.3 Zero Coverage = FAIL (Verify Phase)
- **File**: `commands/gsd-t-verify.md:39`
- **Rule**: "Zero test coverage on new functionality = FAIL (not WARN, not 'nice to have' — FAIL)"
- **Enforcement**: Missing E2E coverage on new functionality = verification FAIL

### 8.4 Playwright Readiness Guard
- **File**: `templates/CLAUDE-global.md:196-204`, `commands/gsd-t-init.md:177-197`
- **Rule**: Before any testing command, check if `playwright.config.*` exists; if not → auto-install
- **Guarded commands**: execute, test-sync, verify, quick, wave, milestone, complete-milestone, debug
- **Setup sequence**: (1) Detect package manager; (2) Install `@playwright/test` + chromium; (3) Create `playwright.config.ts`; (4) Create E2E test directory; (5) Add test script to package.json

### 8.5 Playwright Cleanup Rule
- **File**: `templates/CLAUDE-global.md:206-213`
- **Rule**: After Playwright tests finish (pass or fail), kill any app/server processes started for tests
- **Steps**: (1) Check for spawned dev servers; (2) Kill them; (3) Verify port is free
- **Scope**: execute, test-sync, verify, quick, wave, debug, complete-milestone, integrate

### 8.6 Test Failure Auto-Fix Rule (2-Attempt Max)
- **File**: `templates/CLAUDE-global.md:316`, `commands/gsd-t-execute.md:57`
- **Rule**: If a test fails, fix it immediately (up to 2 attempts) before reporting/proceeding

### 8.7 Test-Sync Mandatory Behavior During Execute
- **File**: `commands/gsd-t-test-sync.md:264-273`
- **After each task completes**:
  1. Scan changed files → map to existing tests
  2. If new code paths have zero test coverage → write tests NOW (do not defer)
  3. Run ALL affected unit/integration tests
  4. Run ALL affected Playwright E2E tests
  5. If failures → fix immediately (up to 2 attempts)
  6. If E2E specs missing for new features/modes/flows → create NOW
  7. If E2E specs need updating for changed behavior → update before continuing
  8. **No task is complete until its tests exist and pass**

### 8.8 Verification Dimensions (7 Quality Gates)
- **File**: `commands/gsd-t-verify.md:30-43`
1. **Functional Correctness**: Does it work per requirements?
2. **Contract Compliance**: Does every domain honor its contracts?
3. **Code Quality**: Conventions, patterns, error handling, readability
4. **Test Coverage Completeness**: Zero coverage on new code = FAIL
5. **E2E Tests**: Full Playwright suite must pass; missing specs → create before proceeding
6. **Security**: Auth flows, input validation, data exposure, dependencies
7. **Integration Integrity**: Domain seams hold under stress
- **Verdicts per dimension**: PASS / WARN / FAIL
- **Overall verdicts**: PASS / CONDITIONAL PASS / FAIL

---

## 9. API Documentation Guard Rules

### 9.1 Swagger/OpenAPI Is Mandatory
- **File**: `templates/CLAUDE-global.md:232-249`
- **Rule**: Every API endpoint MUST be documented in a Swagger/OpenAPI spec — no exceptions
- **When triggered**: Any GSD-T command creates or modifies an API endpoint
- **If no spec exists**: Set up immediately — detect framework, install integration, create spec, add `/docs` or `/api-docs` route
- **Spec updates**: Every new/changed endpoint reflected in spec
- **Publication**: Swagger URL must appear in CLAUDE.md, README.md, docs/infrastructure.md
- **Verification**: After any API change, confirm Swagger UI loads and reflects current endpoints

### 9.2 Detection Logic (CLI) — Refactored in M6
- **File**: `bin/gsd-t.js:186-223`
- **Swagger detection** (`hasSwagger()`): spec files (swagger/openapi .json/.yaml/.yml) + package.json deps (swagger-jsdoc, swagger-ui-express, @fastify/swagger, @nestjs/swagger, swagger-ui, express-openapi-validator) + Python FastAPI
- **API detection** (`hasApi()`): package.json deps (express, fastify, hono, koa, hapi, @nestjs/core, next) + Python (fastapi, flask, django)
- **Helper functions** (NEW in M6):
  - `readProjectDeps(projectDir)`: Reads package.json, returns combined deps + devDeps array
  - `readPyContent(projectDir, filename)`: Reads Python dependency files, returns content string
- **CHANGE from scan #3**: `hasSwagger()` and `hasApi()` now use extracted helper functions instead of inline package.json/Python parsing.

---

## 10. Document Ripple Rules

### 10.1 Every Phase Has Document Ripple
- **Observation**: All command files that modify state include a "Document Ripple" section
- **Pattern**: "Always update" list (mandatory) + "Check if affected" list (conditional) + "Skip what's not affected"
- **Commands with Document Ripple**: partition, discuss, plan, impact, execute, test-sync, integrate, verify, complete-milestone, quick, debug, feature, project, scan, milestone, promote-debt, init, gap-analysis, triage-and-merge, backlog-add, log, **qa** (22 commands — QA added in M7)

### 10.2 Progress.md Decision Log Is Universal
- **Rule**: Every command that modifies files MUST add a timestamped Decision Log entry
- **Format**: `- YYYY-MM-DD HH:MM: {what was done} — {brief context or result}`

### 10.3 Living Documents Must Be Current
- **File**: `templates/CLAUDE-global.md:390-401`
- **Enforcement rules**:
  - NEVER batch doc updates for later
  - NEVER start a phase without reading contracts and relevant docs first
  - NEVER complete a phase without running document ripple on affected docs
  - NEVER let code and contract disagree

---

## 11. Auto-Init Guard Rules

### 11.1 Missing File Detection
- **File**: `templates/CLAUDE-global.md:182-194`
- **Rule**: Before executing any workflow command, check if ANY of these are missing:
  - `.gsd-t/progress.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
  - `.gsd-t/contracts/`, `.gsd-t/domains/`
  - `.claude/settings.local.json` (only if `~/.claude/settings.local` exists)
  - `CLAUDE.md`, `README.md`
  - `docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`
- **Action**: If any missing → run `gsd-t-init` automatically (skips existing) → then continue with original command

### 11.2 Exempt Commands
- **Rule**: These do NOT trigger auto-init: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`

---

## 12. Conversation vs. Work Rule

- **File**: `templates/CLAUDE-global.md:177-179`
- **Rule**: Only execute GSD-T workflow behavior when a `/gsd-t-*` command is invoked or when actively mid-phase via `/gsd-t-resume`
- **Plain text messages (especially questions)**: Answer conversationally — do NOT launch into workflow execution, file reading, or phase advancement

---

## 13. Contract Rules

### 13.1 Contract Types and Structure
- **File**: `commands/gsd-t-partition.md:69-128`
- **Types**: API contracts (`api-contract.md`), Schema contracts (`schema-contract.md`), Component contracts (`component-contract.md`), Integration points (`integration-points.md`)
- **Required fields**: Owner domain, Consumer domain(s)

### 13.2 Contract Compliance Audit (Integrate Phase)
- **File**: `commands/gsd-t-integrate.md:17-43`
- **Rule**: Before wiring together, verify EVERY domain honored its contracts

### 13.3 Checkpoint Handling
- **File**: `commands/gsd-t-execute.md:111-125`
- **At checkpoints**: (1) Stop blocked tasks; (2) Read relevant contract; (3) Verify implementation matches; (4) Mismatch → fix implementation or update contract + notify affected domains; (5) Log; (6) Unblock downstream

### 13.4 Contract Deviation Protocol
- **File**: `commands/gsd-t-execute.md:88`, `129-135`
- **Rule**: Teammates MUST stop and message lead if they need to deviate from a contract

### 13.5 Code-Contract Agreement
- **File**: `templates/CLAUDE-global.md:400`
- **Rule**: NEVER let code and contract disagree — fix one or the other immediately

---

## 14. Domain Rules

### 14.1 File Ownership (Single Domain per File)
- **File**: `commands/gsd-t-partition.md:194`
- **Rule**: Every file in `src/` must be owned by exactly one domain; no scope overlaps

### 14.2 Domain Scope Enforcement (Teammates)
- **File**: `commands/gsd-t-execute.md:80`
- **Rule**: Teammates may ONLY modify files listed in their domain's `scope.md`

### 14.3 Merge Conflict Protocol
- **File**: `commands/gsd-t-execute.md:137-143`
- **Rule**: (1) Stop both; (2) Check scope.md for owner; (3) Non-owner reverts; (4) Contract update if needed; (5) Log incident

### 14.4 Domain Structure Requirements
- **File**: `commands/gsd-t-partition.md:28-67`
- **Required files per domain**: `scope.md`, `tasks.md`, `constraints.md`

---

## 15. Execution Mode Rules

### 15.1 Solo vs Team Selection Guidelines
- **File**: `commands/gsd-t-plan.md:149-154`
- Solo sequential: <8 total tasks or heavily interdependent
- Solo interleaved: 8-15 tasks with some independence
- Team parallel: 15+ tasks with 3+ independent starting points

### 15.2 Scan Always Uses Team Mode
- **File**: `commands/gsd-t-scan.md:16-17`
- **Rule**: Always use team mode unless codebase trivially small (<5 files) or teams explicitly disabled

### 15.3 Plan Is Always Single-Session
- **File**: `commands/gsd-t-plan.md:3`

### 15.4 Integrate Is Always Single-Session
- **File**: `commands/gsd-t-integrate.md:3`

### 15.5 Gap Analysis Team Cap
- **File**: `commands/gsd-t-gap-analysis.md:57-61`
- **Rule**: Maximum 10 teammate agents, regardless of requirement count

---

## 16. Version Management Rules

### 16.1 Semantic Versioning (Milestone Completion)
- **File**: `commands/gsd-t-complete-milestone.md:105-120`
- **Major**: Breaking changes, v1 launch → reset minor and patch
- **Minor**: New features, feature milestones → reset patch
- **Patch**: Bug fixes, cleanup

### 16.2 Checkin Auto-Bump
- **File**: `commands/checkin.md:14-21`

### 16.3 Triage-and-Merge Bump
- **File**: `commands/gsd-t-triage-and-merge.md:115-119`

### 16.4 Installed Version Tracking
- **File**: `~/.claude/.gsd-t-version` — plain text version string
- **Project Registry**: `~/.claude/.gsd-t-projects` — newline-separated absolute paths

---

## 17. Smart Router Rules

### 17.1 Routing Algorithm
- **File**: `commands/gsd.md:14-44`

### 17.2 Scope Disambiguation
- 1-3 files, straightforward → quick
- Multi-file capability → feature
- Investigation needed → debug

### 17.3 Route and Go
- **File**: `commands/gsd.md:46-54`
- First line MUST be: `→ Routing to /user:gsd-t-{command}: {reason}`

---

## 18. Next Command Hint Rules

- **File**: `templates/CLAUDE-global.md:355-387`
- **When**: Command completes and does NOT auto-advance
- **Format**: `Next → /user:gsd-t-{command}`
- **Skip**: When auto-advancing (Level 3 mid-wave)

---

## 19. Recovery Rules

### 19.1 Cross-Session Recovery
- **File**: `templates/CLAUDE-global.md:423-433`
- **Steps**: (1) progress.md; (2) requirements.md; (3) architecture.md; (4) contracts; (5) Verify last task; (6) Continue — don't restart
- **Critical**: "Do NOT research how the system works. The docs tell you."

### 19.2 Resume Mode Detection
- **File**: `commands/gsd-t-resume.md:6-12`
- **Same-session**: Skip to Step 2
- **Cross-session**: Full state load

---

## 20. Backlog Rules

### 20.1 Auto-Categorization Keywords
- **File**: `commands/gsd-t-backlog-add.md:30-41`

| Trigger Words | Type |
|---------------|------|
| bug, fix, broken, error, crash | `bug` |
| add, new, create, implement | `feature` |
| improve, optimize, refactor, clean | `improvement` |
| ui, ux, design, layout, style | `ux` |
| architecture, structure, pattern, system | `architecture` |
| (unclear) | `feature` (default) |

### 20.2 Validation Rules
- Type/App/Category must exist in `backlog-settings.md`; if not → warn with closest-match suggestion

### 20.3 Entry Format (Exact)
```
## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

---

## 21. Triage-and-Merge Rules

### 21.1 Impact Scoring Tiers
- **File**: `commands/gsd-t-triage-and-merge.md:43-53`

| Tier | Criteria | Action |
|------|----------|--------|
| Auto-merge | Docs-only, contracts-only, <100 lines, no conflicts | Merge automatically |
| Review | Command/CLI/template behavior changes, >100 lines | Ask user |
| Skip | Merge conflicts, version-sensitive, breaking | Report why, do not merge |

### 21.2 File Pattern Classification
- **Sensitive** (→ Review): `commands/*.md`, `bin/gsd-t.js`, `templates/CLAUDE-global.md`, `scripts/*.js`, `package.json`
- **Safe** (→ Auto-merge): `.gsd-t/contracts/*.md`, `.gsd-t/techdebt.md`, `docs/*.md`, `examples/**`

---

## 22. Heartbeat/Event Rules

### 22.1 Event Processing
- **File**: `scripts/gsd-t-heartbeat.js`
- **Output**: `.gsd-t/heartbeat-{session_id}.jsonl` (one JSON per line)
- **Events**: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd

### 22.2 Security Rules (Enhanced in M5)
- **Max stdin**: 1MB (`MAX_STDIN = 1024 * 1024`) — prevents OOM; silently discards oversized input
- **Session ID**: `/^[a-zA-Z0-9_-]+$/` (`SAFE_SID`) — blocks path traversal
- **CWD**: Must be absolute path (`path.isAbsolute(dir)`)
- **Path containment**: Resolved file path must be within `.gsd-t/` directory (`resolvedFile.startsWith(resolvedDir + path.sep)`)
- **Symlink**: Check before write (`fs.lstatSync(file).isSymbolicLink()`)
- **Auto-cleanup**: Files >7 days old deleted on SessionStart (`MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`)
- **Cleanup safety**: Symlinked heartbeat files are skipped during cleanup (`stat.isSymbolicLink()` check)

### 22.3 Secret Scrubbing (NEW in M5)
- **File**: `scripts/gsd-t-heartbeat.js:112-136`
- **`scrubSecrets(cmd)`**: Replaces sensitive values in CLI commands with `***`
  - `SECRET_FLAGS`: `--password`, `--token`, `--secret`, `--api-key`, `--auth`, `--credential`, `--private-key` + value → `***`
  - `SECRET_SHORT`: `-p` + value → `***`
  - `SECRET_ENV`: `API_KEY=`, `SECRET=`, `TOKEN=`, `PASSWORD=`, `BEARER=`, `AUTH_TOKEN=`, `PRIVATE_KEY=`, `ACCESS_KEY=`, `SECRET_KEY=` + value → `***`
  - `BEARER_HEADER`: `bearer` + value → `***`
- **`scrubUrl(url)`**: Replaces all URL query parameter values with `***`
  - Parses URL, iterates `searchParams.keys()`, sets each to `***`
  - Falls back to original URL on parse error
- **Applied in**: `summarize()` — Bash commands scrubbed via `scrubSecrets()`, WebFetch URLs scrubbed via `scrubUrl()`
- **CHANGE from scan #3**: These are entirely NEW functions added in M5. Previously Bash commands and URLs were logged verbatim.

### 22.4 Event Handler Architecture (Refactored in M6)
- **File**: `scripts/gsd-t-heartbeat.js:93-109`
- **`EVENT_HANDLERS` map**: Static object mapping event name → handler function
  - Each handler returns a structured event payload
  - `buildEvent(hook)` looks up handler by `hook.hook_event_name`, returns `{ ts, sid, ...handler(hook) }` or null
- **CHANGE from scan #3**: Previously `buildEvent()` was a monolithic switch/case. Now uses a declarative handler map.

### 22.5 Tool Summarization
- **File**: `scripts/gsd-t-heartbeat.js:138-167`
- **Read/Edit/Write**: `file` (shortened path via `shortPath()`)
- **Bash**: `cmd` (first 150 chars, scrubbed), `desc`
- **Grep**: `pattern`, `path`
- **Task**: `desc`, `type` (subagent_type)
- **WebSearch**: `query`
- **WebFetch**: `url` (scrubbed via `scrubUrl()`)
- **NotebookEdit**: `file` (shortened path)
- **Others**: Empty object

---

## 23. External Fetch Script (NEW in M6)

### 23.1 gsd-t-fetch-version.js
- **File**: `scripts/gsd-t-fetch-version.js`
- **Purpose**: Synchronous npm registry version check, called by `fetchVersionSync()` in `bin/gsd-t.js`
- **Rule**: Fetches `https://registry.npmjs.org/@tekyzinc/gsd-t/latest` with 5s timeout
- **Safety**: 1MB response limit (`MAX_BODY = 1048576`); destroys response if exceeded
- **Output**: Writes version string to stdout (consumed by parent via `execFileSync`)
- **Silent failure**: Network or parse errors produce no output (parent handles missing output)
- **CHANGE from scan #3**: This is a NEW file. Previously the synchronous fetch was done inline in `bin/gsd-t.js` using a different approach.

### 23.2 npm-update-check.js — Path Validation (Enhanced in M5)
- **File**: `scripts/npm-update-check.js:17-21`
- **Rule**: Cache file path argument is validated to be within `~/.claude/` directory
  - `path.resolve(cacheFile)` must start with `path.join(os.homedir(), ".claude") + path.sep`
  - Prevents arbitrary file writes via CLI argument injection
- **Additional safety**: Symlink check before writing cache file; 1MB response limit
- **CHANGE from scan #3**: The path validation (`resolved.startsWith(claudeDir + path.sep)`) is NEW in M5. Previously the cache path was used without validation.

---

## 24. Code Standards (Defaults)

- **File**: `templates/CLAUDE-global.md:404-420`
- Type hints required on all function signatures
- Dataclasses/interfaces for data models, not raw dicts
- Functions under 30 lines — split if longer
- Files under 200 lines — create new modules if needed
- Enums for state management and fixed option sets
- Naming: files=snake_case, classes=PascalCase, functions=snake_case, constants=UPPER_SNAKE_CASE, private=_underscore
- **3-file threshold**: NEVER make changes touching >3 files without pausing to confirm approach

---

## 25. Undocumented / Implicit Rules

### 25.1 Update vs Install Distinction
- **File**: `bin/gsd-t.js:492-510`
- `doUpdate()` compares `installedVersion === PKG_VERSION` (exact string equality). If versions match → "Already up to date" without running `doInstall()`. User must run `install` to force reinstall.
- **Risk**: Corrupted file with matching version → `update` won't fix it.

### 25.2 GSD-T Section Detection (Literal String)
- **File**: `bin/gsd-t.js:418`
- Detection uses literal string `"GSD-T: Contract-Driven Development"`.
- **Risk**: If heading text changes in template, detection breaks and content gets duplicated.

### 25.3 Projects File Comment Support
- **File**: `bin/gsd-t.js:249`
- `getRegisteredProjects()` filters lines starting with `#` — supports comments in project registry.
- **Not documented anywhere** — discovered behavior.

### 25.4 Hook Command Path Escaping (Windows)
- **File**: `bin/gsd-t.js:356`
- Backslashes in heartbeat script path are double-escaped for JSON embedding.
- Applied on all platforms, harmless on Unix.

### 25.5 Encoding Issue Detection (Hardcoded Patterns)
- **File**: `bin/gsd-t.js:1000-1001`
- Only detects specific mojibake sequences (`\u00e2\u20ac`, `\u00c3`).
- Other corruption patterns would not be detected.

### 25.6 Guard Injection Position Priority — Now Explicit Function (M6)
- **File**: `bin/gsd-t.js:791-797` (`insertGuardSection()`)
- Regex matches heading levels 1-3 (`#{1,3}`) for "Pre-Commit Gate" and "Don't Do These Things".
- Case-sensitive matching.
- **CHANGE from scan #3**: Previously inline logic; now a named, exported, testable function.

### 25.7 CLAUDE.md Append Separator
- **File**: `bin/gsd-t.js:447`
- When appending GSD-T to existing CLAUDE.md: `\n\n# ─── GSD-T Section (added by installer) ───\n\n`

### 25.8 Uninstall Preserves CLAUDE.md
- **File**: `bin/gsd-t.js:747`
- `doUninstall()` explicitly does NOT remove CLAUDE.md.

### 25.9 Utility Command Detection (Non-gsd-t- Prefix)
- **File**: `bin/gsd-t.js:291-293`
- Any `.md` file in `commands/` not starting with `gsd-t-` is counted as utility command.
- Accidentally placed files would inflate the count.

### 25.10 Quick Task Cross-Boundary Warning
- **File**: `commands/gsd-t-quick.md:19-23`
- Only command that offers workflow upgrade path: warns if task crosses domain boundaries.

### 25.11 Feature Milestone Sequencing (Implicit)
- **File**: `commands/gsd-t-feature.md:119-124`
- Ordering: (1) Schema/data first; (2) Backend before frontend; (3) Existing contract updates early; (4) New functionality before integration; (5) Migration/backfill as own milestone.

### 25.12 Project Milestone Sequencing (Implicit)
- **File**: `commands/gsd-t-project.md:69-79`
- Ordering: (1) Foundation first; (2) Each shippable; (3) Dependencies forward; (4) MVP early; (5) Risk front-loaded; (6) Integration points are milestones; (7) Polish last.

### 25.13 Changelog Auto-Creation (Update-All)
- **File**: `bin/gsd-t.js:799-822`
- Uses `{ flag: "wx" }` — never overwrites existing changelogs.

### 25.14 Exported Test Surface (NEW in M6)
- **File**: `bin/gsd-t.js:1195-1244`
- 37 functions and 3 constants are exported via `module.exports` for unit testing.
- Includes all validation functions, all helper functions, all show/display functions, and key business logic functions.
- **New exports since scan #3**: `insertGuardSection`, `addHeartbeatHook`, `readUpdateCache`, `fetchVersionSync`, `refreshVersionAsync`, `updateSingleProject`, `showUpdateAllSummary`, `updateGlobalCommands`, `showNoProjectsHint`, `showStatusVersion`, `showStatusCommands`, `showStatusConfig`, `showStatusTeams`, `showStatusProject`, `showInstallSummary`, `showInitTree`, `writeTemplateFile`, `removeInstalledCommands`, `removeVersionFile`, `updateExistingGlobalClaudeMd`, `appendGsdtToClaudeMd`, `readProjectDeps`, `readPyContent`, `checkDoctorClaudeMd`, `checkDoctorSettings`, `checkDoctorEncoding`
- **CHANGE from scan #3**: Major expansion of exported test surface. Previously only validation functions and a few helpers were exported.

### 25.15 Heartbeat Exports for Testing (NEW in M5)
- **File**: `scripts/gsd-t-heartbeat.js:22`
- Exports: `scrubSecrets`, `scrubUrl`, `buildEvent`, `summarize`, `shortPath`
- Placed before `require.main` guard so they're available for import without executing main logic.

### 25.16 Integer-Only Step Numbers (M7 Convention)
- **Observation**: Command files in M7 use integer step numbers (`## Step 1`, `## Step 2`) rather than sub-steps or lettered steps at the top level.
- **Pattern**: All steps are numbered sequentially. Sub-sections within steps use `### A)`, `### B)` etc.
- **CHANGE from scan #3**: This is an implicit convention change. Previous command files sometimes used non-integer or inconsistent step numbering.

---

## Summary Statistics

- **Total business rules extracted**: 135+
- **NEW rules since scan #3**: 11
- **CHANGED rules since scan #3**: 8
- **CLI validation rules**: 10 (1 enhanced: symlink)
- **Workflow phase rules**: 11 (3 new: integrity check, structured discuss-skip, discuss/impact autonomy sections)
- **QA Agent rules**: 11 (3 new: file-path boundaries, framework detection, document ripple)
- **Wave orchestrator rules**: 10
- **Pre-Commit Gate rules**: 6 (global) + 6 (GSD-T specific)
- **Autonomy behavior rules**: 6 (1 formalized: per-phase pattern)
- **Testing enforcement rules**: 8
- **Destructive Action Guard rules**: 4 (1 refactored: insertGuardSection)
- **API Documentation Guard rules**: 2 (1 refactored: helper extraction)
- **Document Ripple rules**: 3 (1 updated: QA now included)
- **Contract rules**: 5
- **Domain rules**: 4
- **Execution mode rules**: 5
- **Version management rules**: 4
- **Smart router rules**: 3
- **Backlog rules**: 3
- **Triage-and-merge rules**: 2
- **Heartbeat/event rules**: 5 (2 new: scrubSecrets/scrubUrl, handler refactor)
- **External fetch script rules**: 2 (all new)
- **Code standards**: 1 (with sub-rules)
- **Undocumented/implicit rules**: 16 (3 new: exported test surface, heartbeat exports, integer step numbers)

### Change Summary — New Rules Since Scan #3

| # | Rule | Source (Milestone) | Category |
|---|------|--------------------|----------|
| 1 | `hasSymlinkInPath()` — walk ancestors for symlinks | M5 | CLI validation |
| 2 | `scrubSecrets()` / `scrubUrl()` — redact sensitive data in heartbeat | M5 | Heartbeat security |
| 3 | npm-update-check.js path validation — cache file must be within `~/.claude/` | M5 | External script security |
| 4 | Wave integrity check — verify progress.md has Status, Milestone, Domains before proceeding | M7 | Workflow state |
| 5 | Structured discuss-skip — three-condition deterministic check replaces heuristic | M7 | Workflow state |
| 6 | Discuss/Impact autonomy sections — formalized subsections at end of command | M7 | Autonomy behavior |
| 7 | QA file-path boundaries — explicit CAN/MUST NOT modify lists | M7 | QA rules |
| 8 | QA multi-framework detection — detect and match existing test framework | M7 | QA rules |
| 9 | QA document ripple — test-coverage.md, requirements, scope, techdebt | M7 | QA rules |
| 10 | `gsd-t-fetch-version.js` — dedicated external script for sync version fetch | M6 | External scripts |
| 11 | Expanded module.exports — 37 functions + 3 constants for unit testing | M6 | Test surface |

### Change Summary — Modified Rules Since Scan #3

| # | Rule | What Changed | Source (Milestone) |
|---|------|-------------|-------------------|
| 1 | Update check cache | Three-tier refactor: `readUpdateCache()` + `fetchVersionSync()` (external script) + `refreshVersionAsync()` | M6 |
| 2 | Guard injection | Extracted to `insertGuardSection()` function | M6 |
| 3 | Swagger/API detection | `hasSwagger()` and `hasApi()` now use `readProjectDeps()` and `readPyContent()` helpers | M6 |
| 4 | EVENT_HANDLERS | Monolithic switch → declarative handler map | M6 |
| 5 | All 13 over-30-line functions | Split into focused single-purpose helpers | M6 |
| 6 | Discuss skip condition | Vague heuristic → structured 3-part check | M7 |
| 7 | Autonomy behavior sections | Inline descriptions → formalized end-of-command subsections | M7 |
| 8 | Document ripple command count | 21 → 22 (QA added) | M7 |

---

*Business rules extraction: 2026-02-18 — Scan #4 (post-Milestones 3-7)*
