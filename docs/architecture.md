# Architecture — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-03-22 (Post-M22 — GSD 2 Tier 1 Execution Quality)

## System Overview

GSD-T is an npm-distributed methodology framework for Claude Code. It provides slash commands (markdown files), a CLI installer (Node.js), and document templates that together enable contract-driven development with AI assistance.

The framework has no runtime — it is consumed entirely by Claude Code's slash command system and the user's shell. The CLI handles installation, updates, and diagnostics. The command files define the workflow methodology that Claude Code follows.

**Architecture Pattern**: Distributed Markdown Instruction System with CLI Lifecycle Manager. Command files are the "source code" interpreted by Claude Code. The CLI is a lifecycle manager (install/update/init/status/doctor/uninstall). State files persist across sessions as git-tracked Markdown.

## Components

### CLI Installer (bin/gsd-t.js)
- **Purpose**: Install, update, diagnose, and manage GSD-T across projects
- **Location**: `bin/gsd-t.js` (1,798 lines, 90+ functions, all ≤ 30 lines)
- **Dependencies**: Node.js built-ins only (fs, path, os, child_process, https, crypto)
- **Subcommands**: install, update, status, doctor, init, uninstall, update-all, register, changelog, graph (index/status/query)
- **Organization**: Configuration → Guard section → Helpers → Heartbeat → Commands → Install/Update → Init → Status → Uninstall → Update-All → Doctor → Register → Update Check → Help → Main dispatch
- **All functions ≤ 30 lines** (M6 refactoring). Largest: `doRegister()` at 30 lines, `summarize()` at 30 lines.

### Slash Commands (commands/*.md)
- **Purpose**: Define the GSD-T methodology as executable workflows for Claude Code
- **Location**: `commands/`
- **Count**: 49 (45 GSD-T workflow + 4 utility: gsd, branch, checkin, Claude-md, global-change) — includes gsd-t-health, gsd-t-pause (M13), gsd-t-reflect (M14), gsd-t-visualize (M15), gsd-t-prd (M16), global-change (M20)
- **Format**: Pure markdown with step-numbered instructions, team mode blocks, document ripple sections, and $ARGUMENTS terminator

### Templates (templates/*.md)
- **Purpose**: Starter files for project initialization
- **Location**: `templates/`
- **Count**: 9 (CLAUDE-global, CLAUDE-project, requirements, architecture, workflows, infrastructure, progress, backlog, backlog-settings)
- **Tokens**: `{Project Name}` and `{Date}` replaced during init via `applyTokens()`

### Hook Scripts (scripts/)
- **gsd-t-heartbeat.js** (181 lines, 6 functions, 5 exports): Real-time event logging via Claude Code hooks. Captures 9 event types as structured JSONL. Input capped at 1MB. Session ID validated. Path traversal protection. Secret scrubbing via `scrubSecrets()`/`scrubUrl()` (M5). Notification message + title scrubbing (M8/M9). EVENT_HANDLERS map pattern (M6). Auto-cleanup after 7 days (SessionStart only, M6). M14: added `buildEventStreamEntry()` (maps SubagentStart/Stop/PostToolUse → events/ schema) and `appendToEventsFile()` (daily-rotated JSONL in `.gsd-t/events/`, symlink-safe).
- **gsd-t-event-writer.js** (124 lines, 3 exports, NEW in M14): Zero-dep CLI tool + module for structured JSONL event appends to `.gsd-t/events/`. Exports: `validateEvent()`, `resolveEventsFile()`, `appendEvent()`. CLI: `--type`, `--command`, `--phase`, `--reasoning`, `--outcome`, `--agent-id`. Validates all 8 event_type values and 5 outcome values from event-schema-contract. Installed to `~/.claude/scripts/` by CLI installer. Exit codes: 0 success, 1 write error, 2 validation error.
- **npm-update-check.js** (43 lines): Background npm registry version checker. Spawned detached by CLI when update cache is stale. Path validation within `~/.claude/` (M5). Symlink check before write (M5). 1MB response limit (M5).
- **gsd-t-fetch-version.js** (26 lines, NEW in M6): Synchronous npm registry fetch. Called by `fetchVersionSync()` via `execFileSync`. HTTPS-only, 5s timeout, 1MB limit. Silent failure on errors (caller validates).
- **gsd-t-tools.js** (163 lines, NEW in M13): State utility CLI returning compact JSON. Subcommands: state get/set (progress.md), validate (required file presence), parse progress --section, list domains/contracts, git pre-commit-check, template scope/tasks. Zero external dependencies. NOTE: No module.exports — untestable as module (TD-066).
- **gsd-t-statusline.js** (94 lines, NEW in M13): Context usage bar + project state for Claude Code `statusLine` setting. Reads CLAUDE_CONTEXT_TOKENS_USED/MAX env vars for usage percentage. Color-coded bar (green <50%, yellow <70%, orange <85%, red ≥85%). NOTE: No module.exports — untestable as module (TD-066).

### Execution Intelligence Layer (M14 — complete)
- **`.gsd-t/events/YYYY-MM-DD.jsonl`**: Append-only event stream. One event per line. Schema: `ts`, `event_type`, `command`, `phase`, `agent_id`, `parent_agent_id`, `trace_id`, `reasoning`, `outcome`. Written by hooks (SubagentStart/Stop, PostToolUse via heartbeat.js) and command files at phase transitions.
- **Outcome-tagged Decision Log**: New Decision Log entries use `[success]`/`[failure]`/`[learning]`/`[deferred]` prefixes for machine-readable filtering (execute, debug, wave, complete-milestone).
- **Pre-task experience retrieval (execute, debug)**: Grep Decision Log for `[failure]`/`[learning]` entries matching current domain before spawning subagent — Reflexion pattern without fine-tuning. Writes `experience_retrieval` event.
- **Distillation step (complete-milestone Step 2.5)**: Scans `.gsd-t/events/*.jsonl` for patterns seen ≥3 times, proposes CLAUDE.md / constraints.md rule additions, user confirms before write.
- **`commands/gsd-t-reflect.md`**: On-demand retrospective command (47th command). Reads current milestone events, generates `.gsd-t/retrospectives/YYYY-MM-DD-{milestone}.md` with sections: What Worked, What Failed, Patterns Found, Proposed Memory Updates.

### Auto-Route + Auto-Update Hooks (M16 — complete)
- **`scripts/gsd-t-auto-route.js`** (39 lines): UserPromptSubmit hook. Reads JSON from stdin (`{ prompt, cwd, session_id }`). If `.gsd-t/progress.md` does not exist in cwd → exits silently. If prompt starts with `/` → exits silently. If plain text in a GSD-T project → emits `[GSD-T AUTO-ROUTE]` signal to Claude's context, routing the message through `/user:gsd`. Catches all exceptions — never blocks the prompt.
- **`scripts/gsd-t-update-check.js`** (79 lines): SessionStart hook. Reads `~/.claude/.gsd-t-version`. Reads/refreshes `~/.claude/.gsd-t-update-check` cache (1h TTL). If newer version available: runs `npm install -g @tekyzinc/gsd-t@{latest}` + `gsd-t update-all` via execSync. Outputs `[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, or `[GSD-T]` banner. NOTE: No module.exports — untestable as module (TD-081). Version string not validated before execSync (SEC-N28).

### Scan Visual Output (M17 — complete v2.34.10)
- **`bin/scan-schema.js`** (77 lines): ORM detector + schema extractor. Detects 7 ORM types (Prisma, TypeORM, Drizzle, Mongoose, Sequelize, SQLAlchemy, raw-SQL). Delegates to scan-schema-parsers.js. Returns SchemaData: `{ detected, ormType, entities[], parseWarnings[] }`. Never throws.
- **`bin/scan-schema-parsers.js`** (199 lines): 7 parser functions (parsePrisma, parseTypeOrm, parseDrizzle, parseMongoose, parseSequelize, parseSqlAlchemy, parseRawSql). Returns Entity[] for each ORM type.
- **`bin/scan-diagrams.js`** (77 lines): Diagram orchestrator. Calls scan-diagrams-generators.js for each of 6 types. Calls scan-renderer.js to render Mermaid to SVG. Always returns exactly 6 DiagramResult objects. Failed diagrams get placeholder HTML.
- **`bin/scan-diagrams-generators.js`** (102 lines): Mermaid DSL source generators for 6 types: genSystemArchitecture, genAppArchitecture, genWorkflow, genDataFlow, genSequence, genDatabaseSchema. Falls back to generic diagram if analysisData lacks specific fields.
- **`bin/scan-renderer.js`** (92 lines): Sync render chain: tryMmdc() → tryD2() → placeholder. Also contains tryKroki() (async, currently dormant — never called in sync path). Uses execSync (not execFileSync — see TD-084/SEC-N30).
- **`bin/scan-report.js`** (116 lines): Generates self-contained HTML scan report. No external CSS/JS (all inline). Output: `{projectRoot}/scan-report.html` (see TD-092 for placement issue). Exports: generateReport(), buildCss(), buildSidebar(), buildHtmlSkeleton() + section builders.
- **`bin/scan-report-sections.js`** (74 lines): HTML section builders: buildMetricCards, buildDomainHealth, buildDiagramSection, buildTechDebt, buildFindings.
- **`bin/scan-export.js`** (49 lines): Export subcommand — DOCX via pandoc, PDF via md-to-pdf. Checks tool availability before attempting. Uses execSync (not execFileSync — see TD-084/SEC-N29).

### Real-Time Agent Dashboard (M15 — complete v2.33.10)
- **`scripts/gsd-t-dashboard-server.js`** (141 lines, zero external deps): Node.js SSE server watching `.gsd-t/events/*.jsonl`. Exports: `startServer(port, eventsDir, htmlPath)`, `tailEventsFile(filePath, callback)`, `readExistingEvents(eventsDir, maxEvents)`, `parseEventLine(line)`, `findEventsDir(projectDir)`. HTTP endpoints: `GET /` (serve dashboard HTML), `GET /events` (SSE stream, max 500 events on connect + tail for new), `GET /ping` (health check), `GET /stop` (graceful shutdown). CLI: `--port`, `--events`, `--detach` (writes PID to `.gsd-t/dashboard.pid`), `--stop` (kills running server). Symlink protection via `lstatSync` pattern. 23 unit tests in `test/dashboard-server.test.js`.
- **`scripts/gsd-t-dashboard.html`** (194 lines): React 17 + React Flow v11.11.4 + Dagre via CDN (no build step, no npm deps). Dark theme (`#0d1117`). Renders agent hierarchy as directed graph from `parent_agent_id` relationships. Live event feed (max 200, outcome color-coded). Auto-reconnects on SSE disconnect. Port configurable via `?port=` URL param.
- **`commands/gsd-t-visualize.md`** (104 lines, 48th command): Starts server via `--detach`, polls `/ping` up to 5s, opens browser cross-platform (win32/darwin/linux). Accepts `stop` argument to shut down server. Step 0 self-spawn with OBSERVABILITY LOGGING.

### Graph Engine (M20 — complete)
- **`bin/graph-store.js`** (147 lines): File-based graph storage in `.gsd-t/graph/`. 8 JSON files (index, calls, imports, contracts, requirements, tests, surfaces, meta). Read/write operations, MD5 file hashing for incremental indexing, staleness detection. Zero external deps. Note: no symlink protection (TD-099).
- **`bin/graph-parsers.js`** (327 lines): Language-specific entity parsers. JS/TS: function declarations, arrow functions, classes, methods, imports (ES/CJS), exports. Python: def/class/import. Regex-based (no Tree-sitter). Returns `{ entities, imports, calls }`.
- **`bin/graph-overlay.js`** (195 lines): GSD-T context mapper. Enriches code entities with: domain ownership (from scope.md), contract mapping (from contracts/*.md), requirement traceability (from requirements.md), test mapping (from test/ files), debt mapping (from techdebt.md), surface detection (from directory structure). 8 exports. No dedicated test file (TD-100).
- **`bin/graph-indexer.js`** (147 lines): Project indexer. Walks source files, calls parsers, builds overlay, writes to storage. Incremental (skips unchanged files via content hash). Exports `indexProject(root, options)`.
- **`bin/graph-query.js`** (400 lines): Graph abstraction layer. Unified `query(type, params, root)` interface with 21 query types. 3-provider fallback: CGC MCP → native → grep. Provider registry with priority-based selection. Auto-triggers reindex on stale data. WARNING: grep fallback uses execSync with string interpolation — command injection risk (TD-097/SEC-C01).
- **`bin/graph-cgc.js`** (510 lines): CodeGraphContext MCP provider — fully integrated end-to-end. Communicates via JSON-RPC/stdio MCP protocol with CGC server backed by Neo4j (Docker container `gsd-t-neo4j`). 12+ query types: getCallers, getTransitiveCallers, getCallees, getTransitiveCallees, findDeadCode, findComplexFunctions, getComplexity, findDuplicates, findCircularDeps, getEntity, getCallChain, getModuleDeps, getClassHierarchy, getStats, cypher. Health detection (3s timeout, session-cached). Overlay enrichment maps CGC results to GSD-T domains/contracts/requirements. Auto-installed by `gsd-t install`.
- **`bin/scan-data-collector.js`** (153 lines, NEW in M20): Aggregates scan markdown files into structured data for report generation.
- **Storage**: `.gsd-t/graph/` directory (git-ignored). JSON files: index.json (entities), calls.json (edges), imports.json, contracts.json, requirements.json, tests.json, surfaces.json, meta.json (file hashes + stats).

### Examples (examples/)
- **Purpose**: Reference project structure and settings
- **Location**: `examples/`
- **Contents**: settings.json, .gsd-t/ with sample contracts and domain structure

## Data Flow

### Installation Flow
```
npm install @tekyzinc/gsd-t → bin/gsd-t.js install
  ├── Copy commands/*.md → ~/.claude/commands/
  ├── Copy/append templates/CLAUDE-global.md → ~/.claude/CLAUDE.md
  ├── Copy scripts/gsd-t-heartbeat.js → ~/.claude/scripts/
  ├── Configure 9 hooks in ~/.claude/settings.json
  ├── Copy scripts/gsd-t-tools.js → ~/.claude/scripts/    (installUtilityScripts, M13)
  ├── Copy scripts/gsd-t-statusline.js → ~/.claude/scripts/ (installUtilityScripts, M13)
  └── Write version to ~/.claude/.gsd-t-version
```

### Project Initialization Flow
```
gsd-t init [name] → templates/ → applyTokens()
  ├── → {project}/CLAUDE.md
  ├── → {project}/docs/{requirements,architecture,workflows,infrastructure}.md
  ├── → {project}/.gsd-t/{progress,backlog,backlog-settings}.md
  └── → {project}/.gsd-t/{contracts,domains}/.gitkeep
```

### Runtime Command Execution (within Claude Code)
```
User types /user:gsd-t-{command} [args]
  → Claude Code loads ~/.claude/commands/gsd-t-{command}.md
  → Claude interprets step-by-step instructions
  → Reads state files → Executes workflow → Pre-Commit Gate → Updates progress.md
```

### Update Check Flow
```
CLI command → Read cache (~/.claude/.gsd-t-update-check)
  ├── Fresh (<1h): Show notice if latest > installed
  ├── No cache: Synchronous fetch → cache → show notice
  └── Stale (>1h): Spawn background scripts/npm-update-check.js
```

## Configuration Model

Three-tier configuration:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Global** | `~/.claude/CLAUDE.md` | Framework defaults: autonomy rules, code standards, pre-commit gate |
| **Project** | `{cwd}/CLAUDE.md` | Project-specific: tech stack, branch guard, conventions, overrides |
| **State** | `{cwd}/.gsd-t/` | Live state: progress, contracts, domains, backlog, scan results |

## State Files

| File | Purpose | Read By | Written By |
|------|---------|---------|------------|
| `progress.md` | Master state, version, decision log | All commands | Most commands |
| `contracts/*.md` | Domain interfaces | execute, integrate, verify | partition |
| `domains/{name}/scope.md` | File ownership | execute, quick | partition |
| `domains/{name}/tasks.md` | Task list | execute, status, resume | plan, execute |
| `backlog.md` | Priority-ordered backlog | backlog-list, status | backlog-add/edit/move/remove |
| `backlog-settings.md` | Types, apps, categories | backlog-add/edit/settings | backlog-settings, init |
| `techdebt.md` | Prioritized tech debt | promote-debt, scan | scan |
| `scan/*.md` | Codebase analysis | scan (synthesis), setup | scan (teammates) |
| `CONTEXT.md` | Discuss phase output — Locked Decisions, Deferred Ideas | plan (reads + enforces) | discuss |
| `continue-here-{ts}.md` | Pause/resume checkpoint — exact position | resume (reads + deletes) | pause |
| `deferred-items.md` | Log of unresolved issues from execute/quick/debug | (manual review) | execute, quick, debug |

## Data Models

### Progress State (.gsd-t/progress.md)
| Field | Type | Notes |
|-------|------|-------|
| Project | string | Name from CLAUDE.md |
| Version | semver | Major.Minor.Patch |
| Status | enum | READY, INITIALIZED, PARTITIONED, DISCUSSED, PLANNED, IMPACT_ANALYZED, EXECUTING, EXECUTED, TESTS_SYNCED, INTEGRATED, VERIFIED, VERIFY_FAILED, COMPLETED |
| Current Milestone | string | Active milestone name or "None" |
| Decision Log | entries | Timestamped log of all changes |

### Backlog (.gsd-t/backlog.md)
| Field | Type | Notes |
|-------|------|-------|
| Position | integer | Sequential, 1 = highest priority |
| Type | enum | bug, feature, improvement, ux, architecture |
| App | string | Target application |
| Category | string | Domain/module category |
| Description | string | Item summary |

### Contracts (.gsd-t/contracts/)
| Contract | Purpose |
|----------|---------|
| backlog-command-interface.md | Backlog command interface and promote flow |
| integration-points.md | How components connect |
| backlog-file-formats.md | Backlog markdown structure (authoritative — duplicate file-format-contract.md deleted in M9) |
| domain-structure.md | Domain directory layout |
| pre-commit-gate.md | Commit checklist contract |
| progress-file-format.md | Progress.md structure |
| wave-phase-sequence.md | Phase ordering rules |
| qa-agent-contract.md | QA agent spawn interface, output per phase, communication protocol |

## Workflow Phase Architecture

```
PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

| Phase | Mode | QA Agent | Why |
|-------|------|----------|-----|
| Partition | Solo only | NO (removed M10) | Was unnecessary overhead |
| Discuss | Solo only | No | Always pauses for user input (even Level 3) |
| Plan | Solo only | NO (removed M10) | Was unnecessary overhead |
| Impact | Solo only | No | Cross-cutting analysis |
| Execute | Solo or Team | Task subagent (M10) | Each task gets QA after completion |
| Test-Sync | Solo only | Inline (M10) | Sequential contract coverage audit |
| Integrate | Solo only | Task subagent (M10) | Cross-domain integration tests |
| Verify | Solo or Team | Inline (M10) | Full audit runs directly |
| Complete | Solo only | Inline (M10) | Final gate runs directly |

### Wave Orchestrator (Agent-Per-Phase Model)

The wave command spawns an independent agent for each phase via the Task tool with `bypassPermissions`. Each phase agent gets a fresh ~200K token context window, eliminating context accumulation and mid-wave compaction. The orchestrator itself stays lightweight (~30KB), reading only `progress.md` and `CLAUDE.md`. State handoff between phases occurs through `.gsd-t/` files.

### QA Agent Integration (Updated M10)

QA runs inline or as Task subagent depending on phase (M10 refactor). Removed from partition and plan (were unnecessary). execute and integrate spawn QA as Task subagent after each domain checkpoint. test-sync, verify, and complete-milestone run QA inline. QA failure blocks phase completion (user override available).

### Execution Quality (M11)

**Deviation Rules**: 4-rule protocol added to execute, quick, debug: (1) Bug → fix up to 3 attempts, then defer; (2) Missing dependency → add minimum; (3) Blocker → fix and log; (4) Architectural change → STOP, apply Destructive Action Guard.

**Per-Task Commits**: execute enforces `feat({domain}/task-{N})` commit format after each task. Wave spot-check verifies commits were made.

**Between-Phase Spot-Check (Wave)**: After each phase agent completes, wave reads progress.md (status), runs git log (commits), and verifies filesystem output. Re-spawns phase agent once on failure. Stops and reports to user if still failing.

### Planning Intelligence (M12)

**CONTEXT.md**: discuss phase creates `.gsd-t/CONTEXT.md` with three sections: Locked Decisions (plan MUST implement), Deferred Ideas (plan must NOT implement), Claude's Discretion (implementation details left to executor). Plan reads CONTEXT.md and fails validation if any Locked Decision has no task mapping.

**Plan Validation**: After creating task lists, plan spawns a Task subagent to validate REQ coverage, Locked Decision mapping, task completeness, contract existence. Max 3 fix iterations before stopping and reporting to user.

**REQ Traceability**: Plan writes a traceability table to docs/requirements.md mapping REQ-IDs to domain/task/status. Verify marks matched requirements complete.

### Tooling & UX (M13)

**gsd-t-tools.js**: State utility CLI for Claude Code agents. Reduces token-heavy markdown parsing with compact JSON responses. Installed to `~/.claude/scripts/`. See Hook Scripts section.

**gsd-t-statusline.js**: Visual context usage bar for Claude Code `statusLine` setting. Shows milestone, status, version, and context percentage. Installed to `~/.claude/scripts/`.

**gsd-t-health**: New command — validates .gsd-t/ structure against 12 required items. `--repair` creates missing files from templates. Step 0 subagent pattern.

**gsd-t-pause**: New command — creates `.gsd-t/continue-here-{timestamp}.md` with exact position snapshot. More precise than progress.md alone.

**gsd-t-resume** (updated): Reads continue-here files first (most recent by timestamp), falls back to progress.md. Deletes continue-here file after reading.

### Test Suite (test/)
- **helpers.test.js** (27 tests): Pure helper functions — validateProjectName, applyTokens, isNewerVersion, normalizeEol, etc.
- **filesystem.test.js** (37 tests): Filesystem helpers + CLI subcommand integration — ensureDir, isSymlink, writeTemplateFile, status/doctor/help outputs
- **security.test.js** (30 tests): Security functions — scrubSecrets (18), scrubUrl (5), summarize integration (4), hasSymlinkInPath (3)
- **cli-quality.test.js** (22 tests): M6 refactored functions — buildEvent (10), readProjectDeps (3), readPyContent (2), insertGuardSection (3), readUpdateCache (1), addHeartbeatHook (3)
- **Runner**: Node.js built-in (`node --test`), zero test dependencies
- **Total**: 125 tests, all passing (post-M9)

## Security Model

- **Zero dependencies**: No supply chain attack surface
- **Symlink protection**: `isSymlink()` at 15+ write sites + `hasSymlinkInPath()` for parent directory validation (M5)
- **Secret scrubbing**: `scrubSecrets()` masks passwords/tokens/API keys in heartbeat logs; `scrubUrl()` masks URL query params (M5)
- **Input validation**: Project names, version strings, session IDs, project paths all validated
- **Path traversal prevention**: Heartbeat validates session_id regex, resolves paths, verifies containment; npm-update-check validates cache path within `~/.claude/` (M5)
- **Command injection mitigation**: `execFileSync` with array args (not `execSync`)
- **Exclusive file creation**: Init uses `{ flag: "wx" }` for atomic create-or-fail
- **Resource limits**: Heartbeat stdin capped at 1MB, HTTP responses capped at 1MB (M5), 5s/8s timeouts, 7-day file cleanup
- **Wave security**: `bypassPermissions` mode documented with attack surface analysis and mitigations (M5)

## Design Decisions

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-02-07 | Zero external dependencies for CLI | Simplicity, no install failures, no supply chain risk | Using commander.js, yargs |
| 2026-02-07 | Markdown-only command files | Claude Code native format, no build step, human-readable | YAML frontmatter, JSON config |
| 2026-02-09 | Semantic versioning with git tags | Standard npm practice, enables update checks | CalVer, build numbers |
| 2026-02-12 | Heartbeat via Claude Code hooks | Non-invasive monitoring, no command file changes needed | Polling, WebSocket |
| 2026-02-13 | Semantic router over keyword matching | Better intent detection, fewer misroutes | Regex patterns, ML classifier |
| 2026-02-16 | Mandatory Playwright for all projects | Consistent E2E testing, no "we'll add tests later" | Optional testing, Jest-only |
| 2026-02-16 | Team mode default for scan | Parallel scanning faster, better results | Solo sequential scan |
| 2026-02-17 | QA Agent as cross-cutting concern | Mandatory test-driven contracts for all code phases | Optional testing, deferred testing |
| 2026-02-17 | Agent-per-phase wave orchestration | Fresh context window per phase, eliminates compaction | Inline execution (original approach) |
| 2026-02-18 | QA refactor — remove from partition/plan, Task subagent for execute/integrate | QA on partition/plan added overhead with little value; Task subagent gives QA fresh context | Teammate QA (original), no QA |
| 2026-02-18 | Deviation Rules + 3-attempt limit | Prevents infinite loops; auto-fixes bugs without blocking; escalates architectural changes | Manual escalation only, no auto-fix |
| 2026-02-18 | CONTEXT.md from discuss phase | Structured handoff between discuss and plan; fidelity enforcement on Locked Decisions | Free-form decisions in progress.md |
| 2026-02-18 | gsd-t-tools.js as state utility CLI | Reduces token-heavy markdown parsing; compact JSON responses save ~50K tokens/wave | Parsing progress.md inline (original) |
| 2026-02-18 | continue-here files for pause/resume | More precise than progress.md; captures exact task+next-action, not just phase | progress.md alone (less precise) |

### GSD 2 Tier 1 — Execution Quality (M22 — complete v2.40.10)

Five interlocking capabilities eliminate context rot, enable safe parallel execution, and verify behavior rather than structure alone.

**Task-Level Fresh Dispatch**

Execute dispatches one subagent per TASK (not per domain). Each task agent gets a fresh context window containing only: domain scope.md, relevant contracts, the single current task, graph context for touched files, and prior task summaries (10-20 lines each). Context utilization per task: ~10-20% (down from 60-75% cumulative per domain). Compaction never triggers. The domain dispatcher (lightweight orchestrator) sequences tasks and passes summaries — it never accumulates full task context.

```
Execute orchestrator (summaries only — ~4-8% ctx)
  └── Domain-A task-dispatcher
       ├── Task 1 subagent (fresh, 10-20% ctx) → summary → dies
       ├── Task 2 subagent (fresh + task 1 summary) → summary → dies
       └── Task N subagent (fresh + prior summaries) → summary → dies
```

**Plan command constraint** (added M22): Every task must fit in one context window. If estimated scope exceeds 70% context, plan splits the task automatically.

**Worktree Isolation**

Parallel domain agents work in isolated git worktrees via Agent tool's `isolation: "worktree"` parameter. No shared filesystem — domains cannot step on each other's files. Merges are sequential and atomic:

```
Dispatch N domains (isolation: "worktree") → parallel execution
  └── Domain A completes → merge A → run integration tests
  └── Domain B completes → merge B → run integration tests
  └── Conflict or test failure → rollback that domain, others unaffected
```

Rollback granularity is per-domain (not per-commit). Worktrees are cleaned up after all merges complete.

**Goal-Backward Verification**

After all structural quality gates pass (tests, contracts, file existence), a goal-backward pass verifies behavior. Reads milestone goals, traces each requirement to code, and checks for placeholders:
- `console.log("TODO")` / `console.log("implement X")`
- Hardcoded return values (`return "Synced"`, `return 200` on a path that should compute)
- `// TODO`, `// FIXME`, `// PLACEHOLDER` comments in critical paths
- UI components rendering static strings where dynamic data is required

Applied in: `verify`, `complete-milestone`, `wave` (verification phase).

**Adaptive Replanning**

After each domain completes in execute, the orchestrator reads the domain's result summary and evaluates whether remaining domain plans remain valid. If execution revealed new constraints (deprecated API, schema mismatch, missing dependency, incompatible library), affected domain `tasks.md` files are rewritten on disk before the next domain is dispatched.

Guard: max 2 replanning cycles per execute run. After that, pause for user input (prevents new-constraint → replan → new-constraint loops).

**Context Observability**

Extended token-log.md format (M22) includes `Domain`, `Task`, and `Ctx%` columns:

```
| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |
```

Alert thresholds (inline display):
- `Ctx% >= 70%` → warning: task approaching compaction, consider splitting
- `Ctx% >= 85%` → critical: compaction likely, task MUST be split

`gsd-t-status` displays token breakdown by domain/task/phase. `gsd-t-visualize` consumes the same data for dashboard rendering.

## Planned Architecture Changes (M23-M24)

**M23: Headless Mode**
- New `gsd-t headless` CLI subcommand wrapping `claude -p` for unattended execution.
- New `gsd-t headless query` for instant JSON state access (no LLM).

**M24: Docker**
- Dockerfile + docker-compose for containerized enterprise execution.

## Known Architecture Concerns

1. **CLI single-file size**: bin/gsd-t.js at 1,438 lines exceeds the 200-line convention, but splitting adds complexity for questionable benefit given zero-dependency constraint. Accepted deviation.
2. **Four-file synchronization**: Any command change requires updating README, GSD-T-README, CLAUDE-global template, and gsd-t-help. Manual process — no automated validation.
3. **Pre-Commit Gate unenforced**: Mental checklist in CLAUDE.md, not a git hook or CI check.
4. **Progress.md Decision Log growth**: Unbounded append-only log. May need periodic archival strategy for long-lived projects.
