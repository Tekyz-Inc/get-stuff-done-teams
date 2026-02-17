# Business Rules — 2026-02-18

## CLI Rules

### Input Validation

**Project name validation** (`bin/gsd-t.js:123`):
- Regex: `/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/`
- Must start with letter or number
- Allows letters, numbers, dots, hyphens, underscores, spaces
- Max 101 characters total (1 start char + 100 continuation)

**Version string validation** (`bin/gsd-t.js:134-136`):
- Regex: `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/`
- Strict semver: `Major.Minor.Patch` with optional pre-release suffix
- Used to validate both installed version and npm registry responses

**Project path validation** (`bin/gsd-t.js:138-149`):
- Must be absolute path
- Must exist on filesystem
- Must be a directory (not file)
- On Unix: directory must be owned by current user (`stat.uid === process.getuid()`)
- Invalid paths in `.gsd-t-projects` are silently skipped with a warning

### Symlink Protection

Every file write operation checks for symlinks first. This is a security hardening pattern applied consistently:

| Location | What it protects |
|----------|-----------------|
| `bin/gsd-t.js:107-110` | `ensureDir()` — refuses to use symlinked directories |
| `bin/gsd-t.js:152-155` | `copyFile()` — skips symlink targets |
| `bin/gsd-t.js:237-239` | `saveInstalledVersion()` — skips version file if symlinked |
| `bin/gsd-t.js:269-272` | `registerProject()` — skips projects file if symlinked |
| `bin/gsd-t.js:381-383` | `configureHeartbeatHooks()` — skips settings.json if symlinked |
| `bin/gsd-t.js:438-440` | `installGlobalClaudeMd()` — skips backup if symlinked |
| `bin/gsd-t.js:453-455` | `installGlobalClaudeMd()` — skips append if symlinked |
| `bin/gsd-t.js:529-531` | `initClaudeMd()` — skips project CLAUDE.md if symlinked |
| `bin/gsd-t.js:558-560` | `initDocs()` — skips each doc template if symlinked |
| `bin/gsd-t.js:584` | `initGsdtDir()` — skips .gitkeep if symlinked |
| `bin/gsd-t.js:594-595` | `initGsdtDir()` — skips progress.md if symlinked |
| `bin/gsd-t.js:611-613` | `initGsdtDir()` — skips backlog files if symlinked |
| `bin/gsd-t.js:838-840` | `updateProjectClaudeMd()` — skips CLAUDE.md write if symlinked |
| `bin/gsd-t.js:854` | `createProjectChangelog()` — skips changelog if symlinked |

**Rule**: `isSymlink()` returns `false` for non-existent files (safe to create), `true` only for actual symlinks.

### File Creation Guards

All template-based file creation uses Node.js `{ flag: "wx" }` (exclusive write) — fails with `EEXIST` if file already exists. This prevents overwriting user content during:
- `initClaudeMd()` (`bin/gsd-t.js:536`)
- `initDocs()` (`bin/gsd-t.js:565`)
- `initGsdtDir()` progress.md (`bin/gsd-t.js:600`)
- `initGsdtDir()` backlog files (`bin/gsd-t.js:621`)
- `createProjectChangelog()` (`bin/gsd-t.js:868`)

**Rule**: Init operations are idempotent — running init twice never overwrites existing files.

### EOL Normalization

`normalizeEol()` (`bin/gsd-t.js:130-132`) converts `\r\n` to `\n` before comparing file contents. Used during update to detect whether a command file actually changed. Without this, Windows line endings would cause unnecessary file overwrites.

### Token Replacement

`applyTokens()` (`bin/gsd-t.js:126-128`) performs exactly two substitutions on template content:
- `{Project Name}` -> project name argument
- `{Date}` -> ISO date string (`YYYY-MM-DD`)

No other token patterns are supported. Templates use only these two tokens.

---

## Version Management

### Semver Comparison (`bin/gsd-t.js:1136-1144`)

`isNewerVersion(latest, current)` performs segment-by-segment comparison:
1. Split both versions on `.` and parse to integers
2. Compare major, then minor, then patch
3. Returns `true` only if `latest` is strictly newer
4. Missing segments default to `0`
5. **Does not handle pre-release suffixes** — only compares numeric segments

### Update Check Caching (`bin/gsd-t.js:1146-1191`)

- **Cache file**: `~/.claude/.gsd-t-update-check` (JSON: `{ latest, timestamp }`)
- **Staleness threshold**: 3,600,000 ms (1 hour)
- **First-run behavior**: No cache exists -> synchronous HTTP fetch to npm registry (blocks CLI for up to 8s timeout)
- **Subsequent runs**: Cache exists but stale -> spawns detached background process (`scripts/npm-update-check.js`) for non-blocking refresh
- **Skip commands**: Update check is suppressed for `install`, `update`, `update-all`, `--version`, `-v`
- **Registry endpoint**: `https://registry.npmjs.org/@tekyzinc/gsd-t/latest` (5s timeout)
- **Validation**: Registry response version must pass `validateVersion()` regex before being cached

### Background Update Script (`scripts/npm-update-check.js`)

- Receives cache file path as `process.argv[2]`
- Fetches latest version from npm registry with 5s timeout
- Validates version format before writing cache
- Writes JSON `{ latest, timestamp }` to cache file
- Silent failure on network errors — never interferes with CLI

### Version Bump Rules

**During `gsd-t-complete-milestone`** (`commands/gsd-t-complete-milestone.md:103-120`):
| Milestone Type | Bump | Reset |
|----------------|------|-------|
| Breaking changes, major rework, v1 launch | Major | Minor and patch to 0 |
| New features, completed feature milestones | Minor | Patch to 0 |
| Bug fixes, minor improvements, cleanup | Patch | Nothing |

Version is updated in:
1. `.gsd-t/progress.md`
2. Package manifest (package.json, pyproject.toml, Cargo.toml) if it exists
3. `README.md` version badge/reference if present
4. Git tag (`v{version}`)

**During `/user:checkin`** (`commands/checkin.md:14-21`):
| Change Type | Bump |
|-------------|------|
| Bug fixes, doc updates, refactors, cleanup | Patch (default) |
| New features, new commands, new capabilities | Minor |
| Breaking changes, major rework, incompatible API changes | Major |

Version is updated in:
1. `package.json`
2. `.gsd-t/progress.md` (`## Version` line)
3. `CHANGELOG.md` (new entry prepended)

### Installed Version Tracking

- **File**: `~/.claude/.gsd-t-version` — contains only the version string (no JSON)
- **Read**: `getInstalledVersion()` reads and trims
- **Write**: `saveInstalledVersion()` writes `PKG_VERSION` directly
- **Used by**: `doUpdate()` to skip if already at latest; `doStatus()` to show current version

### Project Registry (`bin/gsd-t.js:248-280`)

- **File**: `~/.claude/.gsd-t-projects` — newline-separated list of absolute project paths
- **Read**: Lines starting with `#` are ignored; empty lines filtered out
- **Validation**: Each path checked via `validateProjectPath()` (absolute, exists, directory, owned by current user)
- **Deduplication**: `registerProject()` checks if path already exists before appending
- **Auto-registration**: Projects are registered during `gsd-t init`

---

## Workflow Phase Sequence

### Fixed Phase Order

```
PARTITION -> DISCUSS -> PLAN -> IMPACT -> EXECUTE -> TEST-SYNC -> INTEGRATE -> VERIFY -> COMPLETE
```

Source: `commands/gsd-t-wave.md`, `.gsd-t/contracts/wave-phase-sequence.md`

### Status State Machine

| Status | Set By | Next Valid Status |
|--------|--------|-------------------|
| READY | gsd-t-init, gsd-t-complete-milestone | INITIALIZED |
| INITIALIZED | gsd-t-milestone | DEFINED |
| DEFINED | gsd-t-milestone | PARTITIONED |
| PARTITIONED | gsd-t-partition | DISCUSSED or PLANNED (Discuss is skippable) |
| DISCUSSED | gsd-t-discuss | PLANNED |
| PLANNED | gsd-t-plan | IMPACT_ANALYZED |
| IMPACT_ANALYZED | gsd-t-impact | EXECUTING |
| EXECUTING | gsd-t-execute (start) | EXECUTED |
| EXECUTED | gsd-t-execute (complete) | TESTS_SYNCED |
| TESTS_SYNCED | gsd-t-test-sync | INTEGRATED |
| INTEGRATED | gsd-t-integrate | VERIFIED or VERIFY_FAILED |
| VERIFIED | gsd-t-verify | COMPLETED |
| VERIFY_FAILED | gsd-t-verify (on failure) | EXECUTING (remediation) |
| COMPLETED | gsd-t-complete-milestone | READY (reset for next) |

**Forward-only rule**: Status transitions proceed in order, except:
- VERIFY_FAILED can revert to EXECUTING for remediation
- COMPLETED resets to READY for next milestone

### Skippable Phase: Discuss

Discuss is the ONLY phase that may be skipped. Skip conditions:
- Path is clear (simple milestone, clear requirements)
- Architecture is well-established
- No open design questions

When skipped: PARTITIONED -> PLANNED (gsd-t-plan runs directly after partition).

### Decision Gates

**Impact Analysis Gate** (IMPACT_ANALYZED -> EXECUTE):
| Verdict | Behavior |
|---------|----------|
| PROCEED | Continue to execute |
| PROCEED WITH CAUTION | Level 3: log and continue. Level 1-2: report, wait for confirmation |
| BLOCK | Stop execution. Add remediation tasks. Require user decision. |

**Verify Gate** (VERIFIED -> COMPLETE):
- All quality gates must pass
- VERIFY_FAILED: remediate and re-verify (up to 2 attempts)
- Milestone cannot complete without VERIFIED status (unless `--force`)

**Gap Analysis Gate** (within Complete, before archival):
- Requirements gap analysis against milestone deliverables
- Must reach 100% Implemented for scoped requirements
- Auto-fix cycles (up to 2) before blocking

### Autonomy Level Behavior

Default: Level 3 (Full Auto) if not specified in project CLAUDE.md.

| Level | Phase Transitions | Stop Conditions |
|-------|-------------------|-----------------|
| Level 1 (Supervised) | Pause at each phase | Always wait for user confirmation |
| Level 2 (Standard) | Pause only at milestones | Report at milestones |
| Level 3 (Full Auto) | Auto-advance between phases | Only stop for: Destructive Action Guard, Impact BLOCK, unrecoverable errors (2 attempts), Discuss phase (always pauses) |

**Critical rule**: Discuss phase ALWAYS pauses for user input, even at Level 3.

### Error Recovery (2-Attempt Rule)

The "2 fix attempts" rule is consistently applied across all error scenarios:
| Failure Point | Recovery Action | After 2 Failures |
|---------------|-----------------|-------------------|
| Impact BLOCK | Add remediation tasks, re-run impact | STOP and report |
| Test failures during execute | Pause, generate fix tasks, re-run | STOP and report |
| Verify failure | Remediate, re-run verify | STOP and report |
| Gap analysis gaps | Auto-fix, re-verify, re-analyze | STOP and report |
| Pre-existing test failures | Fix immediately | Report to user |

### Wave Auto-Select Mode

**Execute mode selection** (`commands/gsd-t-wave.md:46-49`):
- Count total independent starting tasks across domains
- If 3+ domains with independent work AND teams enabled -> team mode
- Otherwise -> solo mode

**Verify mode selection** (`commands/gsd-t-wave.md:74-78`):
- If teams enabled AND milestone is complex (3+ domains) -> team verify
- Otherwise -> solo verify

### Plan Execution Mode Recommendation

(`commands/gsd-t-plan.md:137-141`):
| Condition | Recommended Mode |
|-----------|-----------------|
| < 8 total tasks or heavily interdependent | Solo sequential |
| 8-15 tasks with some independence | Solo interleaved |
| 15+ tasks with 3+ independent starting points | Team parallel |

### Interruption Handling

When interrupted mid-wave:
1. Finish current atomic task
2. Save state to `.gsd-t/progress.md` with exact resume point
3. Note format: `{phase} -- {domain} -- Task {N}`
4. Resume with `gsd-t-resume`

---

## Pre-Commit Gate Rules

### Base Checklist (applies to ALL projects)

Source: `templates/CLAUDE-global.md:240-285`, `.gsd-t/contracts/pre-commit-gate.md`

Every commit must pass ALL applicable checks in order:

1. **Branch Check**: `git branch --show-current` vs. "Expected branch" in CLAUDE.md
   - Wrong branch -> STOP, do NOT commit
   - No guard set -> Proceed with warning

2. **API Contract Check**: If API endpoint or response shape created/changed:
   - Update `.gsd-t/contracts/api-contract.md`
   - Update Swagger/OpenAPI spec
   - Verify Swagger URL in CLAUDE.md and README.md

3. **Schema Contract Check**: If database schema changed:
   - Update `.gsd-t/contracts/schema-contract.md` AND `docs/schema.md`

4. **Component Contract Check**: If UI component interface added/changed:
   - Update `.gsd-t/contracts/component-contract.md`

5. **Scope Check**: If new files/directories added:
   - Update owning domain's `scope.md`

6. **Requirements Check**: If requirement implemented/changed:
   - Update `docs/requirements.md` (mark complete or revise)

7. **Architecture Check**: If component added/changed/removed or data flow changed:
   - Update `docs/architecture.md`

8. **Decision Log**: If ANY document, script, or code file modified:
   - Add timestamped entry to `.gsd-t/progress.md` Decision Log
   - Format: `- YYYY-MM-DD HH:MM: {what was done} -- {brief context or result}`

9. **Decision Rationale**: If architectural or design decision made:
   - Include rationale in the progress.md entry

10. **Tech Debt**: If debt discovered or fixed:
    - Update `.gsd-t/techdebt.md`

11. **Convention Tracking**: If pattern established for future work:
    - Update `CLAUDE.md` or domain `constraints.md`

12. **Test Reference**: If tests added/changed:
    - Verify test names and paths referenced in requirements

13. **E2E Update**: If UI, routes, or user flows changed:
    - Update affected E2E test specs (Playwright/Cypress)

14. **Test Execution**: If any code changes:
    - Run affected tests and verify they pass

**Enforcement rule**: If ANY check is YES and the corresponding doc is NOT updated, update it BEFORE committing. No exceptions.

### GSD-T Framework Project-Specific Gate

Source: `CLAUDE.md` (project-level, this repo)

Additional checks for the GSD-T framework itself:

| Condition | Required Actions |
|-----------|-----------------|
| Changed command file interface/behavior | Update GSD-T-README.md, README.md, CLAUDE-global template, gsd-t-help |
| Added/removed command | Update all 4 files above + package.json version + command counting in bin/gsd-t.js |
| Changed CLI installer | Test: install, update, status, doctor, init, uninstall |
| Changed template | Verify gsd-t-init produces correct output |
| Changed wave flow (add/remove/reorder phases) | Update gsd-t-wave.md, GSD-T-README.md, README.md |
| Changed contract or domain boundary | Update .gsd-t/contracts/ and affected domain scope.md |

---

## Contract Enforcement

### Contract File Types

| Contract | Location | Owner | Purpose |
|----------|----------|-------|---------|
| API Contract | `.gsd-t/contracts/api-contract.md` | Domain owning API | Endpoint signatures, request/response shapes, error codes |
| Schema Contract | `.gsd-t/contracts/schema-contract.md` | Data layer domain | Table definitions, column types, constraints |
| Component Contract | `.gsd-t/contracts/component-contract.md` | UI domain | Component props, events, interface |
| Integration Points | `.gsd-t/contracts/integration-points.md` | Lead agent | Cross-domain dependency graph, checkpoints, execution order |

### Contract Rules

1. **Every dependency between domains must have a contract** (`commands/gsd-t-partition.md:183`)
2. **Every contract must have an owner and at least one consumer** (`commands/gsd-t-partition.md:184`)
3. **Every file in src/ must be owned by exactly one domain** (`commands/gsd-t-partition.md:181`)
4. **No domain scope may overlap with another** (`commands/gsd-t-partition.md:182`)
5. **Code must match contracts exactly** — if mismatch found, fix implementation OR update contract and notify all affected domains (`commands/gsd-t-execute.md:101-107`)
6. **Contract violations during execution**: Stop teammate, identify deviation, decide fix or update contract, notify ALL affected teammates (`commands/gsd-t-execute.md:112-117`)
7. **Contract audit during integration**: Verify EVERY domain honored its contracts before wiring together (`commands/gsd-t-integrate.md:17-42`)

### Checkpoint Handling

When a checkpoint is reached (defined in integration-points.md):
1. Stop execution of blocked tasks
2. Read the relevant contract
3. Verify implemented code matches the contract (API shapes, schema, component interfaces, error handling)
4. If mismatch: fix implementation or update contract and notify affected domains
5. Log: `CHECKPOINT {name}: PASSED/FAILED -- {details}`
6. Unblock downstream tasks

### Domain Structure Contract

Source: `.gsd-t/contracts/domain-structure.md`

Required files per domain:
```
.gsd-t/domains/{domain-name}/
  scope.md        -- files/directories owned, NOT-owned list
  tasks.md        -- atomic task list (populated by plan phase)
  constraints.md  -- must-follow patterns, must-not boundaries
```

Domain naming: kebab-case (e.g., `cli-hardening`, `data-layer`)

### Task Design Rules

Source: `.gsd-t/contracts/domain-structure.md:71-76`

1. **Atomic**: Each task produces a working, testable increment
2. **Self-contained**: Executable with only CLAUDE.md, scope, constraints, contracts, and task description
3. **File-scoped**: Lists exactly which files it touches
4. **Contract-bound**: Cross-domain tasks reference specific contract
5. **Ordered**: Tasks numbered in execution order within domain
6. **No implicit knowledge**: Reference contracts and files explicitly

---

## Backlog Rules

### Auto-Categorization

Source: `commands/gsd-t-backlog-add.md:30-41`, `.gsd-t/contracts/backlog-file-formats.md:89-95`

When `Auto-categorize` is `true` in backlog-settings.md and fields are not explicitly provided:

| Trigger Words | Assigned Type |
|---------------|---------------|
| bug, fix, broken, error, crash | `bug` |
| add, new, create, implement | `feature` |
| improve, optimize, refactor, clean | `improvement` |
| ui, ux, design, layout, style | `ux` |
| architecture, structure, pattern, system | `architecture` |
| (unclear) | `feature` (default) |

For category: infer best-matching category from title/description. If no match or no categories defined, use `general`.

### Validation Rules

Source: `.gsd-t/contracts/backlog-file-formats.md:112-118`

1. **Type must be in settings**: Reject unknown types with closest-match suggestion
2. **App must be in settings**: Same validation as type
3. **Category must be in settings**: Same validation, or defaults to `general` if no categories defined
4. **Position must be valid**: Move validates target position is within range
5. **Settings file required**: All backlog commands except gsd-t-init require `backlog-settings.md` to exist

### Position Numbering

- Positions are sequential integers starting at 1
- Position 1 = highest priority
- `gsd-t-backlog-move` renumbers ALL entries when items are reordered
- `gsd-t-backlog-remove` renumbers remaining entries to close gaps
- Entry detection: count `## {N}.` heading patterns

### Promote Flow Classification

Source: `.gsd-t/contracts/command-interface-contract.md:36-40`

Items promoted from backlog are classified into:
| Classification | Criteria |
|----------------|----------|
| Milestone | Multi-file, multi-phase, needs partitioning |
| Quick | Small scope, obvious implementation |
| Debug | Diagnosis + fix for specific broken behavior |
| Feature analysis | Triggers gsd-t-feature for impact assessment first |

---

## Triage and Merge Rules

### Impact Scoring Tiers

Source: `commands/gsd-t-triage-and-merge.md:48-53`

| Tier | Criteria | Action |
|------|----------|--------|
| Auto-merge | Docs-only, contracts-only, templates with no behavior change, < 100 lines, no conflicts, no command behavior changes | Merge automatically |
| Review | Command file changes, CLI behavior changes, new commands/ files, template behavior changes, > 100 lines, wave/phase sequence changes | Show summary, ask user |
| Skip | Merge conflicts, version-sensitive changes (package.json version), breaking changes to existing interfaces | Report why, do not merge |

### Sensitive vs. Safe File Patterns

**Sensitive** (trigger Review tier):
- `commands/*.md`, `bin/gsd-t.js`, `templates/CLAUDE-global.md`, `scripts/*.js`, `package.json`

**Safe** (stay in Auto-merge tier):
- `.gsd-t/contracts/*.md`, `.gsd-t/techdebt.md`, `docs/*.md`, `examples/**`, root `*.md` (except structural README changes)

### Publish Gate

- Level 3: Auto-publish ON — skip prompt
- Level 1-2: Ask user before auto-publishing (version bump, npm publish, deploy)

### Version Bump Logic for Merges

- Any merged branch adds new commands -> bump minor
- Docs/contracts/fixes only -> bump patch
- Breaking changes -> bump minor (major reserved for truly breaking, but those should be in Skip tier)

---

## Guard Rules

### Destructive Action Guard

Source: `templates/CLAUDE-global.md:119-154`, `bin/gsd-t.js:46-65`

**ALWAYS stop and ask user before:**
- DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE
- Renaming or removing database tables or columns
- Schema migrations that lose data or break existing queries
- Replacing an existing architecture pattern
- Removing or replacing existing files/modules with working functionality
- Changing ORM models conflicting with existing schema
- Removing API endpoints or changing response shapes clients depend on
- Replacing a dependency or framework
- Any change requiring other system parts to be rewritten

**Applies at ALL autonomy levels including Level 3.**

The Guard section is also injected into project CLAUDE.md files by `doUpdateAll()` (`bin/gsd-t.js:816-850`). Injection logic:
1. If CLAUDE.md already contains "Destructive Action Guard" -> skip
2. If "Pre-Commit Gate" heading exists -> insert guard before it
3. Else if "Don't Do These Things" heading exists -> insert guard before it
4. Else -> append guard at end of file

### Auto-Init Guard

Source: `templates/CLAUDE-global.md:182-193`

Before any GSD-T workflow command, check for missing files:
- `.gsd-t/progress.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
- `.gsd-t/contracts/`, `.gsd-t/domains/`
- `.claude/settings.local.json` (if `~/.claude/settings.local` exists)
- `CLAUDE.md`, `README.md`
- `docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`

If any missing -> auto-run gsd-t-init (skips existing files), then continue.

**Exempt commands**: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`

### Playwright Readiness Guard

Source: `templates/CLAUDE-global.md:196-212`

Before any testing command (`gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-quick`, `gsd-t-wave`, `gsd-t-milestone`, `gsd-t-complete-milestone`, `gsd-t-debug`):
1. Check for `playwright.config.*`
2. If missing: install Playwright, create config, create E2E dir, then continue

Playwright detection in CLI (`bin/gsd-t.js:164-167`): checks for `playwright.config.ts`, `.js`, `.mjs`

### Playwright Cleanup Rule

After Playwright tests finish (pass or fail):
1. Kill any dev server processes spawned during tests
2. Verify the port is free before proceeding

Applies to: execute, test-sync, verify, quick, wave, debug, complete-milestone, integrate

### API Documentation Guard (Swagger/OpenAPI)

Source: `templates/CLAUDE-global.md:214-231`

When any command creates/modifies an API endpoint:
1. If no Swagger/OpenAPI spec exists -> set one up immediately
2. Update spec for every new/changed endpoint
3. Swagger URL must appear in: CLAUDE.md, README.md, docs/infrastructure.md
4. Verify Swagger UI loads after API changes

Swagger detection in CLI (`bin/gsd-t.js:169-201`):
- Checks for spec files: swagger.json/yaml/yml, openapi.json/yaml/yml
- Checks package.json for swagger packages: swagger-jsdoc, swagger-ui-express, @fastify/swagger, @nestjs/swagger, swagger-ui, express-openapi-validator
- Checks Python files for FastAPI (built-in OpenAPI)

API detection (`bin/gsd-t.js:203-226`):
- package.json deps: express, fastify, hono, koa, hapi, @nestjs/core, next
- Python files: fastapi, flask, django

### Branch Guard

Source: `commands/gsd-t-execute.md:14-15`

Before any execution work: `git branch --show-current` compared against "Expected branch" in CLAUDE.md. If different -> STOP and warn user. Do NOT execute tasks on the wrong branch.

---

## Heartbeat Rules

### Event Processing (`scripts/gsd-t-heartbeat.js`)

**Input safety**:
- Max stdin: 1 MB (`MAX_STDIN = 1024 * 1024`) — prevents OOM from unbounded input
- Aborted flag: if input exceeds limit, stdin is destroyed and processing silently stops

**Session ID validation** (`scripts/gsd-t-heartbeat.js:18`):
- Regex: `/^[a-zA-Z0-9_-]+$/` — allowlist blocks path traversal (e.g., `../../etc/evil`)

**Path traversal protection**:
1. Validates `hook.cwd` is absolute path
2. Resolves heartbeat file path and verifies it stays within `.gsd-t/` directory
3. Symlink check before writing

**Heartbeat file cleanup** (`scripts/gsd-t-heartbeat.js:67-83`):
- Max age: 7 days (`MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`)
- Cleanup runs on every event write
- Only processes files matching `heartbeat-*.jsonl`
- Skips symlinked heartbeat files
- Uses `mtimeMs` for age comparison

### Registered Hook Events (`bin/gsd-t.js:312-315`)

Nine events captured:
`SessionStart`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`, `Notification`, `Stop`, `SessionEnd`

### Tool Summarization Rules (`scripts/gsd-t-heartbeat.js:157-186`)

Each tool type has a specific summarization pattern:
| Tool | Fields Captured |
|------|----------------|
| Read, Edit, Write | `file` (shortened path) |
| Bash | `cmd` (first 150 chars), `desc` |
| Grep | `pattern`, `path` (shortened) |
| Glob | `pattern` |
| Task | `desc`, `type` (subagent_type) |
| WebSearch | `query` |
| WebFetch | `url` |
| NotebookEdit | `file` (shortened notebook_path) |
| Others | Empty object |

**Path shortening** (`shortPath()`):
- CWD-relative paths: strip cwd prefix
- Home-dir paths: replace with `~` prefix
- All backslashes converted to forward slashes

---

## Smart Router Rules

Source: `commands/gsd.md`

### Resolution Logic

- **0 matches** -> Ask one clarifying question
- **1 match** -> Route immediately
- **2+ matches** -> Pick best fit, show runner-up

### Scope Disambiguation

| Scope Signal | Routed Command |
|--------------|----------------|
| Touches 1-3 files, straightforward | `quick` |
| New capability spanning multiple files | `feature` |
| Requires own milestone with domains | `milestone` or `project` |
| Needs investigation before fixing | `debug` (not `quick`) |
| Spec/requirements to verify against code | `gap-analysis` (not `scan`) |

---

## Next Command Hint Rules

Source: `templates/CLAUDE-global.md:337-369`

When a command completes and does NOT auto-advance, display recommended next command.

| Completed | Next |
|-----------|------|
| `project` | `gsd-t-milestone` |
| `feature` | `gsd-t-milestone` |
| `milestone` | `gsd-t-partition` |
| `partition` | `gsd-t-plan` (or `gsd-t-discuss` if complex) |
| `discuss` | `gsd-t-plan` |
| `plan` | `gsd-t-execute` (or `gsd-t-impact` if risky) |
| `impact` | `gsd-t-execute` |
| `execute` | `gsd-t-test-sync` |
| `test-sync` | `gsd-t-verify` (or `gsd-t-integrate` if multi-domain) |
| `integrate` | `gsd-t-verify` |
| `verify` | `gsd-t-complete-milestone` |
| `complete-milestone` | `gsd-t-status` |
| `scan` | `gsd-t-promote-debt` or `gsd-t-milestone` |
| `init` | `gsd-t-scan` or `gsd-t-milestone` |
| `init-scan-setup` | `gsd-t-milestone` |
| `gap-analysis` | `gsd-t-milestone` or `gsd-t-feature` |
| `populate` | `gsd-t-status` |
| `setup` | `gsd-t-status` |

Standalone commands with no successor: `quick`, `debug`, `brainstorm`, `status`, `help`, `resume`, `prompt`, `log`, backlog commands.

Skip the hint if auto-advancing (Level 3 mid-wave).

---

## Testing Rules (Cross-Command)

### "No Feature Code Without Test Code" Rule

This rule appears in every execution-related command:
- `commands/gsd-t-execute.md:43` — "implementation and tests are ONE deliverable"
- `commands/gsd-t-quick.md:63` — applies to quick tasks too
- `commands/gsd-t-verify.md:26` — "Zero test coverage on new functionality = FAIL"
- `commands/gsd-t-test-sync.md:131` — "No task is complete until its tests exist and pass"

### Mandatory E2E Spec Creation

When UI/routes/flows/modes change, Playwright specs MUST cover:
- Happy path for every new flow
- All feature modes/flags
- Form validation (valid, invalid, empty, boundary)
- Error states (network, API errors, permissions, timeout)
- Empty states (no data, first-time user)
- Loading states
- Edge cases (rapid clicking, double submission, back/forward, browser refresh)
- Responsive breakpoints if layout changes

### Test Execution Sequence

1. Write/update tests for changed code paths
2. Run ALL unit/integration tests
3. Run FULL Playwright E2E suite (if configured)
4. Fix failures (up to 2 attempts)
5. Only then proceed to commit/next task

### Verification Dimensions

Source: `commands/gsd-t-verify.md:19-30`

Seven quality gate dimensions:
1. **Functional Correctness**: Does it work per requirements?
2. **Contract Compliance**: Does every domain honor its contracts?
3. **Code Quality**: Conventions, patterns, error handling, readability
4. **Test Coverage Completeness**: Zero test coverage on new functionality = FAIL
5. **E2E Tests**: Full Playwright suite must pass
6. **Security**: Auth flows, input validation, data exposure, dependencies
7. **Integration Integrity**: Domain seams hold under stress

Verify report verdicts: PASS / WARN / FAIL per dimension. Overall: PASS / CONDITIONAL PASS / FAIL.

---

## Undocumented Rules (logic with no comments or docs)

### `bin/gsd-t.js:510` — Update same-version skip
`doUpdate()` compares `installedVersion === PKG_VERSION` (exact string equality). If versions match, it displays "Already up to date" and returns WITHOUT running `doInstall()`. This means `update` is NOT a force reinstall — user must run `install` to force. **Risk**: If a file got corrupted but version matches, `update` won't fix it.

### `bin/gsd-t.js:432` — GSD-T section detection
`installGlobalClaudeMd()` checks for `"GSD-T: Contract-Driven Development"` as a literal string to detect if CLAUDE.md already contains GSD-T config. **Risk**: If the heading text changes in the template, the detection breaks and GSD-T content gets duplicated.

### `bin/gsd-t.js:360` — Hook command path escaping
`configureHeartbeatHooks()` escapes backslashes in the script path: `scriptPath.replace(/\\/g, "\\\\")`. This is necessary for Windows paths in JSON but is silently applied on all platforms. **Risk**: Double-escaping on platforms that don't need it, though in practice `\\` in a command string is interpreted correctly.

### `bin/gsd-t.js:252-253` — Projects file comment support
`getRegisteredProjects()` filters lines starting with `#` from the projects file, supporting comments in the project registry. This is not documented anywhere but allows users to annotate their projects file.

### `bin/gsd-t.js:1048-1054` — Encoding issue detection
`checkDoctorInstallation()` checks installed command files for corrupted UTF-8 sequences (`\u00e2\u20ac` or `\u00c3`) — likely mojibake from double-encoding. **Risk**: These specific byte sequences are hardcoded. Other corruption patterns would not be detected.

### `bin/gsd-t.js:821-835` — Guard injection position priority
`updateProjectClaudeMd()` uses regex to find insertion point for the Destructive Action Guard. Priority: (1) before "Pre-Commit Gate" heading, (2) before "Don't Do These Things" heading, (3) append at end. Heading match is case-sensitive and level-agnostic (`#{1,3}`). **Risk**: If neither heading exists and file ends without newline, the guard section starts on the last line.

### `bin/gsd-t.js:985-986` — Node.js version check
`checkDoctorEnvironment()` parses Node.js version by slicing the first character (the `v` prefix) and parsing the major version as integer. Minimum required: Node.js 16. **Risk**: The `parseInt()` will work correctly for semver but would fail on non-numeric version strings.

### `bin/gsd-t.js:457-458` — CLAUDE.md append separator
When appending GSD-T to an existing non-GSD-T CLAUDE.md, a separator line is added: `\n\n# --- GSD-T Section (added by installer) ---\n\n`. This visual separator is never referenced elsewhere and exists solely for human readability. **Risk**: If the user later runs `update`, the detection checks for `"GSD-T: Contract-Driven Development"` which is inside the appended content, not in the separator — so updates work correctly regardless.

### `commands/gsd-t-wave.md:101` — Discuss always pauses
Even at autonomy Level 3 (Full Auto), the Discuss phase always pauses for user input. This is the ONE exception to Level 3's auto-advance behavior. **Risk**: If an implementer adds a new phase without checking this exception list, it may auto-advance when it should pause.

### `commands/gsd-t-complete-milestone.md:16-17` — Force flag
The `--force` flag allows completing a milestone even if status is not VERIFIED. When forced, the archive summary records status as "FORCED" instead of "VERIFIED". **Risk**: No validation prevents force-completing a milestone that has never been executed.

### `bin/gsd-t.js:294-296` — Utility command detection
`getUtilityCommands()` returns all `.md` files in `commands/` that do NOT start with `gsd-t-`. This means adding a file like `foo.md` to commands/ would be auto-detected as a utility command. The count in status output includes these. **Risk**: Non-command markdown files accidentally placed in commands/ would inflate the count.

### `bin/gsd-t.js:784` — Uninstall preserves CLAUDE.md
`doUninstall()` explicitly does NOT remove `~/.claude/CLAUDE.md` because it "may contain your customizations." This is a safety decision that means full cleanup requires manual intervention. The comment at line 805 explains this.

### `commands/gsd-t-quick.md:19-23` — Cross-boundary warning
If a quick task crosses domain boundaries or affects existing contracts, the command warns the user and offers to switch to the full execute workflow. This is the only command that offers a workflow upgrade path mid-execution. **Risk**: The check depends on `.gsd-t/domains/*/scope.md` existing; without partition, no warning fires.

---

*Business rules extraction: 2026-02-18*
