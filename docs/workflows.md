# Workflows — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-03-09 (Scan #9, Post-M17)

## User Workflows

### Install GSD-T
1. Run `npx @tekyzinc/gsd-t install`
2. CLI copies 45 commands to `~/.claude/commands/`
3. CLI sets up global CLAUDE.md if missing (appends with separator if exists)
4. CLI installs heartbeat script to `~/.claude/scripts/`
5. CLI configures 9 hooks in `~/.claude/settings.json`
6. CLI saves version to `~/.claude/.gsd-t-version`
7. User starts Claude Code in their project

**Entry point**: `npx @tekyzinc/gsd-t install`
5b. CLI installs gsd-t-tools.js and gsd-t-statusline.js to `~/.claude/scripts/` (M13)
**Success**: 45 commands available in Claude Code
**Failure**: CLI reports missing Node.js or permission errors

### Initialize a Project
1. User runs `/gsd-t-init [name]` in Claude Code (or `gsd-t init [name]` CLI)
2. Init creates `.gsd-t/` directory with progress.md, backlog.md, backlog-settings.md, contracts/, domains/
3. Init creates or updates CLAUDE.md (project-level) using template with token replacement
4. Init creates `docs/` living documents (requirements, architecture, workflows, infrastructure) if missing
5. Init auto-registers project in `~/.claude/.gsd-t-projects`
6. All file creation uses `{ flag: "wx" }` — never overwrites existing files

**Entry point**: `/gsd-t-init` slash command or `gsd-t init` CLI
**Success**: Project ready for milestone definition
**Failure**: Reports what couldn't be created (existing files preserved)

### Full Wave Cycle
1. User defines milestone via `/gsd-t-milestone`
2. **Partition**: Decompose into domains + contracts (file ownership, interfaces)
3. **Discuss**: Explore design decisions (always pauses, even Level 3) — SKIPPABLE via structured 3-condition check: single domain, no open questions in Decision Log, all cross-domain contracts exist (M7)
4. **Plan**: Create atomic task lists per domain with dependencies
5. **Impact**: Analyze downstream effects (PROCEED / CAUTION / BLOCK verdicts)
6. **Execute**: Implement tasks (solo or team mode based on domain count)
7. **Test-Sync**: Align tests with code changes, verify coverage
8. **Integrate**: Wire domains at boundaries, verify contracts honored
9. **Verify**: Run 7 quality gate dimensions (functional, contracts, quality, tests, E2E, security, integration)
10. **Complete**: Archive to `.gsd-t/milestones/`, bump version, git tag

Additional wave behaviors (M10-M12):
- **M10**: QA removed from partition/plan; execute/integrate spawn QA as Task subagent; test-sync/verify/complete run QA inline
- **M11**: Per-task commits (`feat({domain}/task-{N})`) enforced; between-phase spot-check (status + git + filesystem); Deviation Rules in execute (4-rule protocol, 3-attempt limit)
- **M12**: discuss creates CONTEXT.md (Locked Decisions); plan reads CONTEXT.md + runs plan validation subagent (max 3 iterations); REQ traceability table in requirements.md; verify marks requirements complete

**Entry point**: `/gsd-t-wave` (auto-advances) or manual phase-by-phase
**Success**: Milestone completed, version bumped, git tagged
**Failure**: Wave pauses at failing phase; spot-check re-spawns phase agent once before stopping

### Autonomy Levels
| Level | Behavior |
|-------|----------|
| Level 1 (Supervised) | Pause at each phase for confirmation |
| Level 2 (Standard) | Pause only at milestones |
| Level 3 (Full Auto) | Auto-advance; only stop for Destructive Guard, Impact BLOCK, errors after 2 attempts, Discuss |

### Error Recovery (2-Attempt Rule)
| Failure | Recovery | After 2 Failures |
|---------|----------|-------------------|
| Impact BLOCK | Add remediation tasks, re-run | STOP and report |
| Test failures | Fix and re-run | STOP and report |
| Verify failure | Remediate and re-verify | STOP and report |
| Gap analysis gaps | Auto-fix and re-analyze | STOP and report |

## Technical Workflows

### CLI Update Check
1. CLI reads cached version from `~/.claude/.gsd-t-update-check` (JSON: `{ latest, timestamp }`)
2. If cache is fresh (<1 hour): show notice if cached latest > installed
3. If no cache: synchronous fetch to npm registry (8s timeout), cache result
4. If cache stale (>1 hour): spawn detached background `scripts/npm-update-check.js`
5. Compare versions using `isNewerVersion()` semver comparison

**Trigger**: Every CLI invocation (except install/update/update-all)
**Also**: `/gsd-t-status` slash command checks independently

### Heartbeat Event Logging
1. Claude Code hook fires (9 events: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd)
2. `settings.json` hook calls `node ~/.claude/scripts/gsd-t-heartbeat.js`
3. Script reads JSON from stdin (capped at 1MB)
4. Validates session_id (alphanumeric regex), validates path is absolute and within `.gsd-t/`
5. Builds structured event with timestamp, type-specific data (tool summaries, file paths)
6. Appends JSONL to `.gsd-t/heartbeat-{session_id}.jsonl`
7. Runs cleanup: removes heartbeat files older than 7 days

**Trigger**: Claude Code hooks (9 event types)
**Frequency**: On every hooked event during a session

### Version Bump Rules
| Context | Change Type | Bump |
|---------|-------------|------|
| Complete-milestone | Breaking changes, major rework | Major |
| Complete-milestone | New features, feature milestones | Minor |
| Complete-milestone | Bug fixes, cleanup | Patch |
| Checkin | New features, new commands | Minor |
| Checkin | Bug fixes, docs, refactors | Patch (default) |
| Checkin | Breaking changes | Major |

Updated in: package.json, .gsd-t/progress.md, CHANGELOG.md, git tag

### Pre-Commit Gate
Every commit must pass applicable checks:
1. Branch guard (correct branch?)
2. Contract updates (API, schema, component)
3. Scope updates (new files → domain scope.md)
4. Documentation updates (requirements, architecture)
5. Decision Log entry (timestamped in progress.md)
6. Tech debt tracking (discovered/fixed?)
7. Test execution (affected tests pass?)

### Pause and Resume (M13)

**Pause workflow** (`/gsd-t-pause`):
1. Command reads progress.md + domains/*/tasks.md to identify exact position
2. Creates `.gsd-t/continue-here-{YYYYMMDDTHHMMSS}.md` with: milestone, phase, version, last completed action, next action, open items, user note
3. File persists until consumed by resume
4. Multiple pauses create multiple files; resume reads most recent by timestamp

**Resume workflow** (`/gsd-t-resume`):
1. Same-session: skip file reads, use conversation context
2. Cross-session: glob `.gsd-t/continue-here-*.md`, read most recent
3. Resume from "Next Action" field in continue-here file (more precise than progress.md alone)
4. Delete continue-here file after reading

### CONTEXT.md Workflow (M12)

1. `discuss` phase completes design decisions
2. Writes `.gsd-t/CONTEXT.md`:
   - **Locked Decisions**: specific decisions the plan MUST implement
   - **Deferred Ideas**: good ideas NOT in scope (plan must NOT implement)
   - **Claude's Discretion**: implementation details left open
3. `plan` reads CONTEXT.md; every Locked Decision must map to at least one task
4. Plan validation subagent (Task tool) verifies mapping before finalizing plan
5. CONTEXT.md persists after plan phase; deleted manually if desired
6. If discuss is skipped (structured skip), CONTEXT.md is not created; plan handles gracefully

### Project Health Check (M13)

1. User invokes `/gsd-t-health [--repair]`
2. Health spawns as Task subagent (fresh context)
3. Checks 12 items: 5 root files, 3 directories, 4 docs, active milestone domains, version consistency, status validity, Decision Log, contract integrity
4. Reports status as HEALTHY (0 issues), DEGRADED (1-3), or BROKEN (4+ or critical missing)
5. With `--repair`: creates missing files from templates (MISSING items only; INVALID items flagged for user)

## Integration Workflows

### npm Publish
- **Trigger**: Manual `npm publish` after milestone completion
- **Pre-publish gate**: `prepublishOnly: "npm test"` runs 125 tests before publish (M8)
- **Flow**: Version bumped → CHANGELOG updated → git tagged → `npm publish` → tests run automatically → published
- **Verification**: `npx @tekyzinc/gsd-t status` on fresh install

### Update All Projects
- **Trigger**: `gsd-t update-all` CLI command
- **Flow**: Global update → iterate registered projects → inject Destructive Action Guard → create CHANGELOG → health check (Playwright, Swagger)
- **Registry**: `~/.claude/.gsd-t-projects` (newline-separated absolute paths)

### Real-Time Agent Dashboard (M14)

**Launch workflow** (`/gsd-t-visualize`):
1. Check if server is running: `GET http://localhost:7433/ping`
2. If not running: spawn `gsd-t-dashboard-server.js --detach` as background process; write PID to `.gsd-t/dashboard.pid`
3. Open browser to `http://localhost:7433`
4. Dashboard connects to `GET /events` (Server-Sent Events stream)

**Event stream flow**:
1. Claude Code hook fires (any hook event)
2. `gsd-t-event-writer.js` validates event fields and appends JSON line to `.gsd-t/events/YYYY-MM-DD.jsonl`
3. Dashboard server (`gsd-t-dashboard-server.js`) detects file change via `fs.watchFile()`
4. New event lines are broadcast as SSE: `data: {event-json}\n\n`
5. Dashboard HTML (React app via CDN) renders event feed with agent hierarchy

**Stop workflow**:
1. User runs `/gsd-t-visualize stop` or `GET /stop`
2. Server reads PID file, sends SIGTERM, deletes PID file

**Note:** Server watches only the newest JSONL file at startup. Date rollover (midnight UTC) requires server restart to pick up new file (TD-085).

### Auto-Update Workflow (M15)

1. Claude Code SessionStart hook fires
2. `gsd-t-update-check.js` reads `~/.claude/.gsd-t-version` (installed version)
3. Reads cached version from `~/.claude/.gsd-t-update-check` (JSON: `{latest, timestamp}`)
4. If cached version newer than installed: auto-runs `npm install -g @tekyzinc/gsd-t@{latest}` + `gsd-t update-all`
5. Outputs `[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, or `[GSD-T] v{ver}` to stdout
6. Claude agent reads hook output from context and shows update status in first response

**Cache TTL**: 1 hour. After TTL, background `npm-update-check.js` refreshes async.

### Auto-Route Workflow (M16)

1. User types plain text in Claude Code in a GSD-T project directory
2. `gsd-t-auto-route.js` UserPromptSubmit hook fires
3. Script checks if `.gsd-t/progress.md` exists in cwd
4. If yes: injects `[GSD-T AUTO-ROUTE]` signal into prompt context
5. Claude agent sees signal and routes the plain text message through `/user:gsd {message}`
6. Smart router interprets intent and launches appropriate GSD-T command

**Note:** Only fires in GSD-T projects (`.gsd-t/progress.md` must exist). Silently passes through in all other directories.

### Scan Visual Output Workflow (M17)

1. User runs `/gsd-t-scan` — scan subagent analyzes codebase (Steps 1-2)
2. **Schema extraction** (Step 2.5): `bin/scan-schema.js` detects ORM/schema files
   - Tries Prisma → TypeORM → Drizzle → Mongoose → Sequelize → SQLAlchemy → raw SQL
   - Returns `SchemaData { detected, ormType, entities[], parseWarnings[] }`
3. **Diagram generation** (Step 3.5): `bin/scan-diagrams.js` generates 6 Mermaid diagrams
   - Types: system-architecture, app-architecture, workflow, data-flow, sequence, database-schema
   - Renderer chain: mmdc (CLI) → d2 (CLI) → placeholder HTML
4. **HTML report generation** (Step 8): `bin/scan-report.js` produces self-contained HTML
   - Sidebar navigation with scrollspy, metric cards, domain health bars
   - 6 diagram sections with expand-to-modal button
   - Tech debt table, key findings
   - Written to project root as `scan-report.html`
5. **Export** (optional `--export` flag): `bin/scan-export.js` handles docx/pdf (stubs in v2.34.10)

**No external dependencies**: HTML report is fully self-contained (no CDN). All CSS/JS inlined.

### npm Pre-Publish Gate (Updated)
- **Trigger**: `npm publish` (via `prepublishOnly`)
- **Gate**: `npm test` runs 205 tests (8 files including verify-gates.js)
- **Verify-gates checks**: file size compliance (all bin/*.js ≤ 200 lines), no CDN references in scan-report.html, has DOCTYPE, has 6 diagram sections, export format validation
