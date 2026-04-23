# Architecture — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-03-22 (M23 — Headless Mode)

> **Scan #11 note (2026-04-16, v3.11.11)**: this doc is partially stale relative to
> M34 (Context Meter), M35 (Runway-Protected Execution), M36 (Unattended Supervisor),
> M37 (Universal Auto-Pause), and the v3.11.11 switch to local token estimation.
> See `.gsd-t/scan/architecture.md` for the current architecture snapshot and
> `.gsd-t/techdebt.md` TD-103 for the doc-ripple milestone candidate.

## System Overview

GSD-T is an npm-distributed methodology framework for Claude Code. It provides slash commands (markdown files), a CLI installer (Node.js), and document templates that together enable contract-driven development with AI assistance.

The framework has no runtime — it is consumed entirely by Claude Code's slash command system and the user's shell. The CLI handles installation, updates, and diagnostics. The command files define the workflow methodology that Claude Code follows.

**Architecture Pattern**: Distributed Markdown Instruction System with CLI Lifecycle Manager. Command files are the "source code" interpreted by Claude Code. The CLI is a lifecycle manager (install/update/init/status/doctor/uninstall). State files persist across sessions as git-tracked Markdown.

## Components

### CLI Installer (bin/gsd-t.js)
- **Purpose**: Install, update, diagnose, and manage GSD-T across projects
- **Location**: `bin/gsd-t.js` (1,798 lines, 90+ functions, all ≤ 30 lines)
- **Dependencies**: Node.js built-ins only (fs, path, os, child_process, https, crypto)
- **Subcommands**: install, update, status, doctor, init, uninstall, update-all, register, changelog, graph (index/status/query), headless (exec/query/--debug-loop)
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
### Auto-Route + Auto-Update Hooks (M16 — complete)
- **`scripts/gsd-t-auto-route.js`** (39 lines): UserPromptSubmit hook. Reads JSON from stdin (`{ prompt, cwd, session_id }`). If `.gsd-t/progress.md` does not exist in cwd → exits silently. If prompt starts with `/` → exits silently. If plain text in a GSD-T project → emits `[GSD-T AUTO-ROUTE]` signal to Claude's context, routing the message through `/gsd`. Catches all exceptions — never blocks the prompt.
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

### Transcript Viewer as Primary Surface (M43 D6 — complete v3.16.13)
- **Dashboard server additions** (`scripts/gsd-t-dashboard-server.js`): two new HTTP routes for the per-spawn viewer. `GET /transcript/:id/usage` → `{spawn_id, rows, truncated}` filtered from `.gsd-t/metrics/token-usage.jsonl` by `row.spawn_id === id` OR (no `spawn_id` column + `row.session_id === id` — the session-id branch covers M43 D1 Branch B in-session rows). `GET /transcript/:id/tool-cost` → proxies to `bin/gsd-t-tool-attribution.cjs::aggregateByTool` (M43 D2); returns 503 `{error: "tool-attribution library not yet available"}` when D2 isn't on disk so D6 could ship before D2 in Wave 2 without crashing callers.
- **Transcript viewer panel** (`scripts/gsd-t-transcript.html`): collapsible "Tool Cost" sidebar panel that fetches `/transcript/:id/tool-cost` on viewer load and debounces a 2s refresh on each SSE `turn_complete` / `result` frame. Renders top-N tools sorted by attributed tokens with name, call count, tokens, and USD cost. Live badge green while SSE is open, muted otherwise. 503 → friendly "tool attribution not yet wired" row. `window.__gsdtRenderToolCostPanel` exposed for DOM tests.
- **URL banner** (`bin/headless-auto-spawn.cjs`): every detached spawn prints `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}` on stdout. Port sourced from `ensureDashboardRunning().port` with `projectScopedDefaultPort(projectDir)` fallback. Best-effort — banner failure never crashes the spawn.
- **Dashboard autostart** (`scripts/gsd-t-dashboard-autostart.cjs`, ~160 lines, zero deps): `ensureDashboardRunning({projectDir, port?})` probes the port synchronously via a short-lived subprocess (`_isPortBusySync` issues `net.createServer().listen(port)` host-less — matches the server's IPv6-wildcard bind on macOS dual-stack; specifying `127.0.0.1` would falsely report free). If free, fork-detaches the server with `spawn(…, {detached:true, stdio:'ignore'})` + `child.unref()` + writes `.gsd-t/.dashboard.pid` (hyphen → dot distinguishes this lifecycle from M38's `.gsd-t/dashboard.pid`). Idempotent on repeated invocation. Called at the top of `autoSpawnHeadless` so the banner printed immediately after resolves to a live listener.
- **Contract**: `.gsd-t/contracts/dashboard-server-contract.md` v1.2.0 — new §HTTP Endpoints entries, §Banner Format, §Autostart sections.
- **Tests**: `test/m43-dashboard-tool-cost-route.test.js` (9), `test/m43-transcript-panel.test.js` (12), `test/m43-dashboard-autostart.test.js` (6), `test/m43-url-banner.test.js` (3).

### Headless Mode (M23 — complete)
- **doHeadless(args)**: Dispatch function for the `headless` CLI subcommand.
- **doHeadlessExec(command, cmdArgs, flags)**: Wraps `claude -p "/gsd-t-{command}"` via `execFileSync`. Verifies claude CLI availability, enforces timeout, writes log file if `--log` requested. Returns structured JSON if `--json` flag set. (M36 Phase 0: prompt form is `/gsd-t-X`, NOT `/gsd-t-X` — non-interactive mode rejects the `/` namespace prefix.)
- **parseHeadlessFlags(args)**: Extracts `--json`, `--timeout=N`, `--log` from raw args. Returns `{ flags, positional }`.
- **buildHeadlessCmd(command, cmdArgs)**: Builds the bare `/gsd-t-{command}` prompt string. Interactive-mode `/` prefix deliberately omitted — see `.gsd-t/M36-spike-findings.md` Spike A.
- **mapHeadlessExitCode(processExitCode, output)**: Maps process exit code + output text patterns to GSD-T exit codes (0–5).
- **headlessLogPath(projectDir, timestamp)**: Generates `.gsd-t/headless-{timestamp}.log` path.
- **doHeadlessQuery(type)**: Dispatches to one of 7 query functions. All pure Node.js file reads, no LLM calls, <100ms.
- **Query functions** (7): `queryStatus`, `queryDomains`, `queryContracts`, `queryDebt`, `queryContext`, `queryBacklog`, `queryGraph` — each reads corresponding `.gsd-t/` file and returns typed JSON result.
- **Exit codes**: 0=success, 1=verify-fail, 2=context-budget-exceeded, 3=error, 4=blocked-needs-human, 5=command-dispatch-failed (M36 Phase 0 — `claude -p` returned `Unknown command:` for the slash command; caller should treat as a bug not a transient failure)
- **CI/CD examples**: `docs/ci-examples/github-actions.yml` (GitHub Actions), `docs/ci-examples/gitlab-ci.yml` (GitLab CI)

### Compaction-Proof Debug Loop (M29 — complete)
- **bin/debug-ledger.js** (193 lines): JSONL-based debug persistence layer. 6 exported functions: `readLedger`, `appendEntry`, `compactLedger`, `generateAntiRepetitionPreamble`, `getLedgerStats`, `clearLedger`. Ledger file: `.gsd-t/debug-state.jsonl` (11-field schema per entry). Compaction triggers at 50KB — haiku session condenses history, last 5 raw entries preserved. Anti-repetition preamble lists all STILL_FAILS hypotheses, current narrowing direction, and tests still failing. Zero external deps.
- **doHeadlessDebugLoop(flags)**: External iteration manager in `bin/gsd-t.js`. Runs test-fix-retest as separate `claude -p` sessions — each session starts with zero accumulated context. Escalation tiers: sonnet (iterations 1-5), opus (6-15), STOP with full diagnostic output (16-20). `--max-iterations N` flag (default 20) enforced by external process.
- **parseDebugLoopFlags(args)**: Extracts `--max-iterations`, `--test-cmd`, `--fix-scope`, `--json`, `--log` from args. Defaults: maxIterations=20.
- **getEscalationModel(iteration)**: Returns "sonnet" for 1-5, "opus" for 6-15, null for 16-20 (STOP tier).
- **Command integration**: execute, wave, test-sync, verify, debug all delegate fix-retest loops to `gsd-t headless --debug-loop` after 2 in-context fix attempts.
- **Exit codes (debug-loop specific)**: 0=all tests pass (ledger cleared), 1=max iterations reached, 3=process error, 4=escalation stop (needs human)

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
User types /gsd-t-{command} [args]
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

## Unattended Supervisor (M36)

The unattended supervisor is a cross-session relay engine that runs an active GSD-T milestone to completion over hours or days without human intervention. It spans the boundary between the interactive Claude session and the OS process layer.

### Component Diagram

```
Interactive Claude session
  └── /gsd-t-unattended (launch command)
        ├── Pre-flight safety checks (branch, dirty tree)
        └── spawn(detached) → Supervisor process (bin/gsd-t-unattended.js)
                               ├── writes .gsd-t/.unattended/supervisor.pid
                               ├── writes .gsd-t/.unattended/state.json  (atomic rewrite each iter)
                               ├── appends .gsd-t/.unattended/run.log    (worker stdout+stderr)
                               ├── checks .gsd-t/.unattended/stop        (sentinel — presence = halt)
                               └── relay loop:
                                    spawnSync('claude -p "/gsd-t-resume"')
                                      → worker exits → post-worker safety check → next iter

In-session watch loop (every 270s via ScheduleWakeup)
  └── /gsd-t-unattended-watch
        ├── reads supervisor.pid  (kill -0 liveness)
        ├── reads state.json      (status, iter, lastTick)
        └── reschedules or reports final status
```

### State Directory Layout

```
.gsd-t/.unattended/
├── supervisor.pid   — Integer PID. Exists ONLY while supervisor is alive.
├── state.json       — Live state snapshot. Atomically rewritten between iterations.
├── run.log          — Append-only worker stdout+stderr. Never truncated during a run.
├── stop             — Sentinel file. Absence = run. Presence = user-requested stop.
└── config.json      — Optional per-project config overrides (maxIterations, hours, etc.)
```

Sibling: `.gsd-t/.handoff/` — owned by M35-gap-fixes for single-shot handoff locks (see below).

### Contract

`.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 — authoritative source for: state schema, status enum, exit-code table, launch handshake, watch tick decision tree, resume auto-reattach handshake, stop mechanism, safety-rails hook points, and CLI surface.

### Platform Abstraction Layer (`bin/gsd-t-unattended-platform.js`)

Exports four cross-platform functions:

| Export | macOS | Linux | Windows |
|--------|-------|-------|---------|
| `spawnSupervisor(args)` | `spawn(node, ...)` detached | same | same (`windowsHide:true`) |
| `preventSleep()` | `caffeinate -i` subprocess | `systemd-inhibit` or no-op | no-op (not supported — see docs/unattended-windows-caveats.md) |
| `releaseSleep(handle)` | kill caffeinate PID | release inhibit or no-op | no-op |
| `notify(title, msg, level)` | `osascript` | `notify-send` | no-op |
| `resolveClaudePath()` | PATH lookup | PATH lookup | `claude.cmd` via PATH |

### Safety Rails (`bin/gsd-t-unattended-safety.js`)

Called at four supervisor hook points (pre-launch, supervisor-init, pre-worker, post-worker):

- **Gutter detection**: stall pattern — repeated identical errors or no file changes for N iterations
- **Blocker sentinels**: scan worker stdout for unrecoverable-error markers (`BLOCKED_NEEDS_HUMAN`, `DISPATCH_FAILED`)
- **Iteration cap**: `maxIterations` guard (default 200)
- **Wall-clock cap**: `hours` guard (default 24h)
- **Branch/dirty-tree pre-flight**: refuses to start on protected branches or uncleaned worktrees

Each check returns `{ ok, reason?, code? }`. A `false` result halts with `status = 'failed'` and the corresponding exit code (6=gutter, 7=protected-branch, 8=dirty-tree).

### Handoff-Lock Primitive (`bin/handoff-lock.js`)

Closes the M35 parent/child race in `bin/headless-auto-spawn.js`. When the runway estimator fires `autoSpawnHeadless()`, the parent session writes a lock file in `.gsd-t/.handoff/` before spawning the child and removes it only after the child has confirmed PID + state-ready. Prevents the child from beginning execution before the parent has cleanly exited — eliminating the race where both sessions wrote to the same `.gsd-t/` files simultaneously.

### Resume Auto-Reattach

`/gsd-t-resume` Step 0 checks for a live supervisor before any other resume logic. If `supervisor.pid` exists and `kill -0` succeeds and `state.json.status` is non-terminal, the resume command skips normal resume flow entirely, prints the current watch block, and calls `ScheduleWakeup(270, '/gsd-t-unattended-watch', ...)`. The user transparently re-enters the watch loop without any manual step.

---

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

**Token Pipeline (M40 → M41 → M43 D3 → M43 D2)**

Canonical store: `.gsd-t/metrics/token-usage.jsonl` (append-only JSONL; schema in `.gsd-t/contracts/metrics-schema-contract.md` — v1 M40, v2 M43 additive).

```
producers ─┬─► .gsd-t/metrics/token-usage.jsonl ─┬─► gsd-t tokens                 (dashboard)
           │                                     ├─► gsd-t tokens --regenerate-log (→ token-log.md)
           │                                     ├─► gsd-t tokens --show-tool-costs (adds D2 section)
           │                                     └─► gsd-t tool-cost (M43 D2)
           ├── scripts/gsd-t-token-aggregator.js     (M40 worker stream-json)
           ├── bin/gsd-t-token-capture.cjs           (M41 recordSpawnRow / captureSpawn)
           ├── bin/gsd-t-token-backfill.cjs          (M41 D3 historical recovery)
           └── bin/gsd-t-in-session-usage.cjs       (M43 D1 — Branch B: Stop-hook trigger + transcript-sourced)
```

Under v2, `.gsd-t/token-log.md` is a **regenerated view** (`gsd-t tokens --regenerate-log`), not hand-maintained. Wrapper still appends in real time for live visibility; regeneration is an explicit operator step that requires the JSONL to be fully backfilled first. Regeneration is idempotent and deterministic (sort order: `startedAt` asc → `session_id` asc → `turn_id` asc, numeric when both turn IDs parse).

**Per-Tool Attribution (M43 D2)**

`bin/gsd-t-tool-attribution.cjs` + `bin/gsd-t-tool-cost.cjs` + `gsd-t tool-cost` CLI join per-turn usage rows with tool-call events and attribute each turn's tokens across the tools called in that turn. Contract: `.gsd-t/contracts/tool-attribution-contract.md` v1.0.0 defines the output-byte ratio algorithm with four tie-breakers (zero-byte turn → equal split, missing tool_result → zero weight flagged, no tool calls → no-tool bucket, null turn tokens → skipped).

```
.gsd-t/metrics/token-usage.jsonl ─┐
                                  ├─► joinTurnsAndEvents (session_id + ts window)
.gsd-t/events/YYYY-MM-DD.jsonl ───┘            │
                                               ▼
                                    attributeTurn → attributions[]
                                               │
                                               ▼
                             aggregateByTool / aggregateByCommand / aggregateByDomain
                                               │
                                               ▼
                                         gsd-t tool-cost CLI
                                  (table / json, --group-by, --since, --milestone)
```

Zero-dep, sync filesystem I/O. Perf gate: 3k turns × 30k events join+aggregate in <3s (measured ~30ms on a dev laptop). The current event schema does not carry `tool_result` bytes, so the zero-byte tie-breaker fires and tools-in-turn split equally. A future event-schema extension that records bytes will activate the ratio with no library change.

### GSD 2 Tier 3 — Quality Culture & Design (M32 — complete v2.53.10)

Three enhancements for project-level quality identity and design consistency.

**Quality North Star**

Projects define a `## Quality North Star` section in their CLAUDE.md (1-3 sentences describing the quality identity). Auto-detected preset options: `library`, `web-app`, `cli`. Configured by `gsd-t-init` (auto-detects from package.json signals: `bin` → cli, React/Vue/Next → web-app, `main` + no `scripts.dev` → library) and `gsd-t-setup` (interactive config for existing projects). Subagents read this section as a quality lens. Silent skip when section absent (backward compatible — no migration required).

**Design Brief Artifact**

During partition, UI/frontend projects automatically receive `.gsd-t/contracts/design-brief.md` with: color palette, typography, spacing system, component patterns, layout principles, interaction patterns, and tone/voice. Trigger signals: React/Vue/Svelte/Next.js in package.json deps, `pubspec.yaml` exists (Flutter), `.css`/`.scss`/`.jsx`/`.tsx`/`.svelte`/`.vue` files, Tailwind config. Source priority: Tailwind config → theme/token files → Quality North Star for tone → sensible defaults. Non-UI projects: no artifact, no step shown. Preservation rule: if brief already exists, never overwrite (user-authoritative).

**Exploratory Testing (Playwright MCP)**

When Playwright MCP is registered in Claude Code settings, QA agents get 3 minutes of interactive exploration and Red Team gets 5 minutes after all scripted tests pass. Findings are tagged `[EXPLORATORY]` in qa-issues.md and red-team-report.md, and tracked separately in QA calibration (category key: `exploratory` — does NOT count against scripted pass/fail ratio). Silent skip when Playwright MCP absent. Wired into: execute, quick, integrate, debug.

## Context Meter Architecture (M34, v2.75.10+)

The Context Meter is the authoritative source for session context-burn measurement in GSD-T. It replaces the v2.74.12 `bin/task-counter.cjs` proxy (and the pre-v2.74.12 `CLAUDE_CONTEXT_TOKENS_USED` env-var approach, which never worked because Claude Code does not export those vars).

**Data flow:**

```
Claude Code tool call finishes
  │
  ▼
PostToolUse hook (~/.claude/settings.json registered)
  │
  ▼
scripts/gsd-t-context-meter.js (runMeter)
  │
  ├── 1. loadConfig(.gsd-t/context-meter-config.json)
  ├── 2. check-frequency gate — short-circuits if tool-call % freq != 0
  ├── 3. parseTranscript(hook.transcript_path)
  │         → { system, messages } shaped for count_tokens
  ├── 4. countTokens({apiKey, model, system, messages, timeoutMs:200})
  │         → POST https://api.anthropic.com/v1/messages/count_tokens
  │         → 200 { input_tokens }  |  failure → null
  ├── 5. computePct(inputTokens, modelWindowSize)
  ├── 6. bandFor(pct) → "normal" | "warn" | "stop"   (v3.0.0 three-band model)
  └── 7. atomic write .gsd-t/.context-meter-state.json
           { version, timestamp, inputTokens, modelWindowSize, pct, threshold, checkCount, lastError? }
  │
  ▼
bin/token-budget.js getSessionStatus(projectDir)      ── v3.0.0: normal/warn/stop only
  │
  ├── readContextMeterState(dir)
  │      if fresh (timestamp within 5 min):
  │        return { consumed, estimated_remaining, pct, threshold }
  │      else: null
  │
  └── fallback: readSessionConsumed(dir) from .gsd-t/token-log.md (heuristic)
  │
  ▼
bin/runway-estimator.js estimateRunway({command, domain_type, remaining_tasks})
  │        reads current_pct from .context-meter-state.json
  │        queries .gsd-t/token-metrics.jsonl for historical pct-delta per spawn
  │        projects current_pct + pct_per_task × remaining_tasks × skew
  │        confidence: high ≥50 records, medium ≥10, low <10 (+1.25× skew)
  │        returns {can_start, projected_end_pct, confidence, recommendation}
  ▼
Command file Step 0 — runway gate (execute/wave/quick/integrate/debug):
  if (!decision.can_start) {
    print ⛔ banner
    autoSpawnHeadless({command, continue_from: '.'})    ── bin/headless-auto-spawn.js
    process.exit(0)                                      ── never prompts user
  } else {
    proceed to Step 0.1 (Verify Context Gate Readiness) and Step 1
  }
  │
  ▼
bin/headless-auto-spawn.js (when refused)
  │        detached child: node bin/gsd-t.js headless {command} --log
  │        child.unref(); interactive session returns immediately
  │        writes .gsd-t/headless-sessions/{id}.json (status: "running")
  │        2s poll watcher: process.kill(pid, 0) → mac osascript notification on exit
  │
  ▼
Orchestrator Context Gate — v3.0.0 semantics:
  normal → proceed
  warn   → log to .gsd-t/token-log.md, proceed at full quality (informational only)
  stop   → halt cleanly, runway estimator hands off to headless-auto-spawn
```

**Key constraints:**
- **Fail-open**: every stage catches errors and writes a partial state file. Never crashes Claude Code.
- **No message content in state or log files** — only token counts, band names, error codes.
- **Never logs or writes the API key** anywhere.
- **State staleness window**: 5 minutes — after that, heuristic fallback takes over.
- **Hook latency budget**: 200ms (timeoutMs on the HTTP call), enforced by `req.setTimeout` + `req.destroy()`.

**Contracts:**
- `.gsd-t/contracts/context-meter-contract.md` — schema, state file format, hook I/O
- `.gsd-t/contracts/context-observability-contract.md` v2.0.0 — Ctx% as the real session-wide signal (replaces Tasks-Since-Reset)
- `.gsd-t/contracts/token-budget-contract.md` v3.0.0 — single-band stop-at-85 (M38 collapsed the three-band degradation model)
- `.gsd-t/contracts/headless-default-contract.md` v1.0.0 — detached-by-default spawn primitive (M38; folds-and-supersedes headless-auto-spawn-contract v1.0.0 and obviates the runway-estimator / token-telemetry contracts deleted in M38)
- `.gsd-t/contracts/model-selection-contract.md` v1.0.0 — per-phase tier mapping + complexity-signal escalation, consumed by `bin/model-selector.js`

**Supporting components** (outside the context-meter dataflow):
- `bin/model-selector.js` — declarative rules table mapping phases to haiku/sonnet/opus; consulted at plan time, never at runtime under pressure
- `bin/check-headless-sessions.js` — renders the read-back banner on `/gsd-t-resume` and `/gsd-t-status` for completed-but-not-yet-surfaced headless sessions
- `bin/event-stream.cjs` (M38) — shared library for JSONL event emission and cursor-based tailing; used by supervisor, watch tick, and dashboard

**Installer integration** (`bin/gsd-t.js`):
- `install` / `init` — copy hook runtime, merge PostToolUse entry into `~/.claude/settings.json`, copy config template, prompt for API key (skippable, TTY-only)
- `doctor` — RED on missing API key, missing hook, missing script, invalid config, failed count_tokens dry-run
- `status` — displays `Context: {pct}% of {window} tokens ({band}) — last check {rel}` line
- `update-all` — one-shot task-counter retirement migration (deletes legacy files, writes `.gsd-t/.task-counter-retired-v1` marker)

## Task-Graph Reader (M44 D1, v3.18.10+)

`bin/gsd-t-task-graph.cjs` — a zero-external-dep CommonJS module that parses every `.gsd-t/domains/*/tasks.md` (and falls back to each domain's `scope.md` `## Files Owned` for missing touch lists) into a typed in-memory DAG. This is the **single shared input** for every M44 parallelism domain — D2 `gsd-t parallel`, D3 command-file integration, D4 dep-graph validation, D5 file-disjointness prover, D6 pre-spawn economics — none of which re-parse `tasks.md` themselves.

```
.gsd-t/domains/<domain>/tasks.md  ──┐
.gsd-t/domains/<domain>/scope.md  ──┴──>  buildTaskGraph({projectDir})
                                              │
                                              ▼
                                {nodes, edges, ready, byId, warnings}
                                              │
       ┌──────────────────────────────────────┼──────────────────────────────────────┐
       ▼                                      ▼                                      ▼
  D2 gsd-t parallel              D4 dep-validate (veto)                D5 disjoint-prove (veto)
  D3 command-file integ.         D6 pre-spawn economics                 (touches[] overlap check)
```

**Public API** (`require('./bin/gsd-t-task-graph.cjs')`):
- `buildTaskGraph({projectDir}) → { nodes, edges, ready, byId, warnings }` — synchronous
- `getReadyTasks(graph) → TaskNode[]` — node objects whose deps are all DONE
- `TaskGraphCycleError` — thrown on circular dependency, carries `.cycle: string[]`

**Hard rules** (from `task-graph-contract.md` v1.0.0):
- Zero external deps — Node built-ins only
- Cycle detection mandatory (iterative three-color DFS) — never produces partial graph on cycle
- Read-only — never writes to `tasks.md`, `scope.md`, or contracts
- Mode-agnostic — knows nothing about in-session vs unattended; pure graph emitter
- Performance budget < 200 ms for 100-domain / 1000-task project (measured 6 ms / 250 tasks)

**CLI surface** (`bin/gsd-t.js doGraph` → `doGraphTaskOutput`):
- `gsd-t graph --output json` — pretty-printed DAG to stdout
- `gsd-t graph --output table` — column-aligned id/domain/wave/status/ready/deps table
- `gsd-t graph tasks [json|table]` — explicit subcommand form
- Pre-existing `graph index|status|query` (codebase entity graph via `graph-indexer`) unchanged

**Contract**: `.gsd-t/contracts/task-graph-contract.md` v1.0.0

## Dep-Graph Validation (M44 D4, v3.18.10+)

`bin/gsd-t-depgraph-validate.cjs` — a zero-external-dep CommonJS module that runs as the **first pre-spawn gate** between D1's DAG emitter and the parallel dispatcher. Given `graph.ready` (the DAG's candidate set), it filters down to tasks whose declared `deps[]` are all in DONE status, emits one `dep_gate_veto` event per task it removes, and returns the reduced ready set plus the veto list. The caller (D2) decides whether to spawn the smaller batch or fall back to sequential — D4 itself is a pure filter with no spawn authority.

```
D1 graph (graph.ready, graph.byId)
      │
      ▼
  D4 validateDepGraph              ← this module (filter-only; never throws on unmet deps)
      │            │
 ready[] (OK)   vetoed[] ──────>  .gsd-t/events/YYYY-MM-DD.jsonl  (one dep_gate_veto per task)
      │
      ▼
  D5 disjointness check            ← next pre-spawn gate
      │
      ▼
  D6 economics                     ← final pre-spawn gate
      │
      ▼
  D2 parallel dispatch
```

**Public API** (`require('./bin/gsd-t-depgraph-validate.cjs')`):
- `validateDepGraph({graph, projectDir}) → { ready: TaskNode[], vetoed: {task, unmet_deps[]}[] }` — synchronous

**Veto rule** (locked in `depgraph-validation-contract.md` §3): a dep is satisfied iff `graph.byId[depId]` exists AND `status === 'done'`. Pending / skipped / failed / unknown all veto the dependent. Every vetoed task emits exactly one `dep_gate_veto` JSONL record on the event stream.

**Event payload** (`dep_gate_veto`): base `event-schema-contract.md` fields (ts ISO 8601, event_type, command/phase/agent_id/parent_agent_id/trace_id/model set to null when D4 doesn't own them, reasoning="unmet deps: …", outcome="deferred") PLUS additive `task_id`, `domain`, `unmet_deps[]`.

**Hard rules** (from `depgraph-validation-contract.md` v1.0.0):
- Zero external deps — Node built-ins only
- Never throws on unmet deps, unknown dep ids, or event-log I/O failure (only throws on malformed `opts`)
- Read-only on `tasks.md` / `scope.md` / contracts — only write surface is appending JSONL lines (events dir created on demand)
- Synchronous; < 50 ms on realistic 100-domain / 1000-task graphs
- Mode-agnostic — same call shape in [in-session] and [unattended]; what to do with the reduced set is D2's call

**Contract**: `.gsd-t/contracts/depgraph-validation-contract.md` v1.0.0

## File-Disjointness Prover (M44 D5, v3.18.10+)

`bin/gsd-t-file-disjointness.cjs` — the pre-spawn gate that, given a candidate parallel set of task nodes from D1's DAG, partitions them into `parallel` / `sequential` / `unprovable` groups based on declared write-target overlap. Mode-agnostic: same function used by the in-session D2 parallel CLI and the unattended D6 economics path.

```
D1 task-graph nodes (touches[])                    safe-default
       │                                      (unprovable → sequential)
       ▼                                                ▲
 proveDisjointness({tasks, projectDir}) ────────────────┤
       │                                                │
       ├─→ resolveTouches()  (declared → git-history → none)
       ├─→ groupByOverlap()  (union-find on touches[])
       │
       ▼
 { parallel: TaskNode[][],  (singletons only in v1.0.0 — no multi-task "parallel clusters")
   sequential: TaskNode[][], (overlap groups + unprovable singletons)
   unprovable: TaskNode[] }
       │
       ▼
 .gsd-t/events/YYYY-MM-DD.jsonl
   { type: "disjointness_fallback", task_id, reason, ts }
   reason ∈ { "unprovable", "write-target-overlap" }
```

**Public API** (`require('./bin/gsd-t-file-disjointness.cjs')`):
- `proveDisjointness({tasks, projectDir}) → { parallel, sequential, unprovable }` — synchronous, never throws

**Hard rules** (from `file-disjointness-contract.md` v1.0.0):
- Unprovable is ALWAYS sequential — never assume disjointness
- Zero external runtime deps; git invoked via `child_process.execSync` in a try/catch
- Read-only on all domain artifacts; only write surface is the event JSONL append
- Checks WRITE targets only — read-only file access is never a conflict
- Git-history fallback bounded to 100 commits (`git log -n 100`)
- Mode-agnostic — downstream (D2 / D6) decides what to do with sequential + unprovable groups

**Contract**: `.gsd-t/contracts/file-disjointness-contract.md` v1.0.0

## Per-CW Attribution (M44 D7, v3.18.10+)

Per-Context-Window (CW) attribution lets the optimization report, the per-CW rollup in `gsd-t metrics`, and D6's pre-spawn estimator distinguish multiple CWs within one iter — necessary because Claude Code can compact mid-run, silently splitting one iter into two CWs that pre-D7 metrics treated as a single unit.

```
spawn site (orchestrator | supervisor | in-session driver)
   │ supplies cw_id (= spawn_id for unattended; = session_id+":"+compaction_index for in-session)
   ▼
bin/gsd-t-token-capture.cjs::recordSpawnRow / captureSpawn
   │ pass-through; serializes cw_id into the JSONL row when supplied
   ▼
.gsd-t/metrics/token-usage.jsonl   (schema v2.1.0 — cw_id optional)
   │
   ▼  consumers (D6 calibration, gsd-t metrics rollup, optimization report)

Claude Code SessionStart  (source=compact)
   ├──> scripts/gsd-t-compact-detector.js   (v1.0.0 — boundary row, unchanged)
   └──> scripts/gsd-t-calibration-hook.js   (v1.1.0 — calibration row)
              │ correlates with active spawn from .gsd-t/.unattended/state.json
              │ derives actualCwPct from payload.input_tokens ÷ CW ceiling
              ▼
        .gsd-t/metrics/compactions.jsonl
        ({type: "compaction_post_spawn", cw_id, task_id, spawn_id,
          estimatedCwPct, actualCwPct, ts, schemaVersion: 1})
```

**`bin/gsd-t-token-capture.cjs` extension** — additive optional `cw_id` opt on `recordSpawnRow` and `captureSpawn`. The wrapper does not derive `cw_id`; it only forwards what the caller supplies. When absent (undefined / null / "") the field is omitted from the JSONL row entirely (NOT serialized as `null` or `""`). Pre-D7 callers produce byte-identical output. The serialization branch follows the existing `session_id` / `turn_id` pattern (`if (cw_id != null && cw_id !== '') rec.cw_id = String(cw_id);`).

**`scripts/gsd-t-calibration-hook.js`** — zero-external-dep SessionStart hook handler that complements (does not replace) `scripts/gsd-t-compact-detector.js`. Both hooks fire on the same payload; both write to `.gsd-t/metrics/compactions.jsonl`; neither reads or writes the other's rows. The calibration hook silently no-ops when:
- `payload.source !== "compact"`
- `<cwd>/.gsd-t/` does not exist (off-switch)
- `.gsd-t/.unattended/state.json` is missing / unparseable / `status !== "running"`
- No `spawn_id` derivable from state
- No `input_tokens` derivable from the compaction payload

The hook ALWAYS exits 0 — throwing breaks Claude Code SessionStart. It includes a 1 MiB stdin cap, a path-traversal guard on the output sink, and a non-absolute-cwd guard mirroring the detector. Hard rules (from `compaction-events-contract.md` v1.1.0) specify the `compaction_post_spawn` row schema, the calibration sink coexistence rules, and the CW-ceiling override (`state.cwCeilingTokens` → defaults to `200000` input tokens).

**Contracts**: `.gsd-t/contracts/metrics-schema-contract.md` v2.1.0 (`cw_id` field), `.gsd-t/contracts/compaction-events-contract.md` v1.1.0 (calibration event)

**Tests**: `test/m44-cw-attribution.test.js` (19 tests covering pass-through with/without `cw_id`, calibration hook with/without active spawn, malformed state, non-compact sources, derivation fallback to `compactMetadata.preTokens`, ceiling overrides, coexistence with v1.0.0 detector rows, and zero-deps verification).

## Pre-Spawn Economics Estimator (M44 D6, v3.18.10+)

`bin/gsd-t-economics.cjs` — the pre-spawn gate component that predicts each candidate task's Context-Window (CW) footprint and feeds the D2 parallel-CLI gating math with a per-task recommendation. Zero external deps; loaded once per `projectDir` (sync cached corpus read); never returns `undefined` for numeric fields (global-median fallback is mandatory).

**Core function**: `estimateTaskFootprint({taskNode, mode, projectDir})` → `{estimatedCwPct, parallelOk, split, workerCount, matchedRows, confidence}`.

**Three-tier lookup** over the in-memory corpus index:

1. **Exact** `command|step|domain` triplet — HIGH (≥5 rows) or MEDIUM (1–4 rows).
2. **Fuzzy** — domain-only match, then command-only match → LOW confidence.
3. **Global median** — `median(totals)` across every row → FALLBACK confidence. Mandatory floor; guarantees no undefined result.

```
     D1 task graph            ┌──────────────────────────────┐
  ┌─ taskNode{cmd,step,dom} ──┤ bin/gsd-t-economics.cjs      │
  │                           │  estimateTaskFootprint       │
  │                           │  - corpus cache (per projDir)│
  │                           │  - triplet lookup            │
  │                           │  - fuzzy fallback            │
  │                           │  - global median fallback    │
  │                           │  - mode-specific gate math   │
  │                           └───┬──────────────────────────┘
  │                               │ {estimatedCwPct,
  │                               │  parallelOk, split,
  │                               │  workerCount, matchedRows,
  │                               │  confidence}
  │                               ↓
  │                       D2 gating math (owns final decision)
  │                               │
  │                               └──→ appends economics_decision
  │                                    event to .gsd-t/events/*.jsonl
  │
  └─ corpus sources: .gsd-t/metrics/token-usage.jsonl (v2.1.0)
                     .gsd-t/metrics/compactions.jsonl (v1.1.0; calibration signal)
```

**Mode awareness**: `estimatedCwPct` is mode-agnostic (same tokens → same %). Gates differ:

| Mode        | `parallelOk` threshold | `split` threshold | Rationale |
|-------------|------------------------|-------------------|-----------|
| in-session  | `≤ 85%`                | always `false`    | 85 % matches orchestrator-CW headroom check (D2); over-limit tasks still run with fewer workers. |
| unattended  | `≤ 60%`                | `> 60%` → `true`  | Per-worker CW gate; heavy tasks are sliced into multiple `claude -p` iters by the caller (D6 recommends, does not slice). |

**CW ceiling**: `200_000` input tokens — matches `bin/token-budget.cjs`, `bin/context-meter-config.cjs`, and `bin/runway-estimator.cjs`. Row totals = `inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens` (a deliberately conservative upper bound; cache-read tokens are ~free in real CW accounting and inflate the estimate).

**Calibration** (2026-04-22): run against the live 528-row `token-usage.jsonl` corpus. Per-tier MAE (% of CW ceiling): HIGH 12.89 %, MEDIUM 0.00 % (small-n tautology — 4 keys with 1–4 rows each), LOW 13.08 %, FALLBACK 15.06 %. Current corpus is skewed (523 rows on one triplet); `gsd-t-execute` and `gsd-t-wave` have no corpus signal yet and resolve to FALLBACK. Coverage grows as D7 `cw_id`-tagged rows accumulate from real-world spawns — the estimator's signal improves without code changes.

**Hard invariants** (from `.gsd-t/contracts/economics-estimator-contract.md` v1.0.0):

1. D6 is a HINT, not a veto — D2 retains gate authority.
2. Corpus loaded ONCE per `projectDir` (cache via `Map`; `_resetCorpusCache()` exposed for tests).
3. Never returns `undefined` for numeric fields — global-median fallback is mandatory.
4. Mode-aware for gates; mode-agnostic for `estimatedCwPct`.
5. Event emission is best-effort; FS failures never fail the estimate.
6. Zero external npm runtime deps (Node built-ins only).

**Contract**: `.gsd-t/contracts/economics-estimator-contract.md` v1.0.0.

**Tests**: `test/m44-economics.test.js` (9 tests covering HIGH/MEDIUM/LOW/FALLBACK tiers, both mode thresholds under and over the boundary, economics_decision event shape, corpus cache identity, and empty-corpus behaviour).

## Parallel CLI (M44 D2, v3.18.10+)

`bin/gsd-t-parallel.cjs` — the `gsd-t parallel` subcommand dispatch. Wraps the M40 orchestrator with task-level (not just domain-level) parallelism and layers in mode-aware gating math. Extends, does not replace, `bin/gsd-t-orchestrator.js`; zero external runtime deps.

**Surface**:
- Module: `runParallel({projectDir, mode, milestone, domain, dryRun})` and `runCli(argv, env)`.
- CLI: `gsd-t parallel [--mode in-session|unattended] [--milestone Mxx] [--domain <name>] [--dry-run] [--help]`.
- Config extension in `bin/gsd-t-orchestrator-config.cjs`: `computeInSessionHeadroom`, `computeUnattendedGate`, and the exported constants `IN_SESSION_CW_CEILING_PCT=85`, `UNATTENDED_PER_WORKER_CW_PCT=60`, `DEFAULT_SUMMARY_SIZE_PCT=4`.

**Dispatch flow**:

```
    gsd-t parallel --mode … [--dry-run]
         │
         ├──► D1 buildTaskGraph(projectDir) ─────────────┐
         │    (bin/gsd-t-task-graph.cjs)                  │
         │                                                │ ready tasks
         ├──► D4 validateDepGraph(graph)  ◄───────────────┘
         │    (bin/gsd-t-depgraph-validate.cjs)
         │    → emits gate_veto on unmet deps
         │
         ├──► D5 proveDisjointness(readyTasks)
         │    (bin/gsd-t-file-disjointness.cjs)
         │    → emits gate_veto on overlap / unprovable
         │
         ├──► D6 estimateTaskFootprint(task, mode) × N
         │    (bin/gsd-t-economics.cjs)
         │    → per-task {estimatedCwPct, parallelOk, split, confidence}
         │
         ├──► Mode-aware gating math (config.cjs)
         │    ├─ in-session: computeInSessionHeadroom
         │    │  ctxPct from token-budget.getSessionStatus()
         │    │  → reducedCount; emits parallelism_reduced on N < requested
         │    └─ unattended: computeUnattendedGate(estimatedCwPct)
         │       → emits task_split on > 60%
         │
         └──► plan{ workerCount, parallelTasks, plan[] }
              → dry-run renders the 6-col table + mode/totals
              → non-dry-run: hands off to M40 orchestrator machinery
```

**Mode contracts** (from `.gsd-t/contracts/wave-join-contract.md` v1.1.0):

| Mode | Threshold | Math | On exceed |
|------|-----------|------|-----------|
| in-session | 85% orchestrator-CW | `ctxPct + N × summarySize ≤ 85` | Reduce N; floor=1 (never refuses) |
| unattended | 60% per-worker CW | `estimatedCwPct ≤ 60` | `split=true`; caller slices |

**Integration with the M40 path**: `runParallel` produces a plan object; it does **not** replace `bin/gsd-t-orchestrator.js`. The existing orchestrator machinery owns actual worker spawn, retry policy, wave barriers, merging, and the state-file lifecycle. D2 is the pre-spawn planning layer.

**Event schemas** (all written best-effort to `.gsd-t/events/YYYY-MM-DD.jsonl`; failures never break control flow):
- `gate_veto{type, task_id, gate, reason, ts}` — D4 or D5 rejection.
- `parallelism_reduced{type, original_count, reduced_count, reason:'in_session_headroom', ts}` — in-session headroom forced a smaller N.
- `task_split{type, task_id, estimatedCwPct, ts}` — unattended over-threshold.

**Hard invariants** (from m44-d2 constraints.md):
1. Zero external npm runtime deps.
2. `bin/gsd-t-orchestrator.js` is never replaced; only extended via the config module.
3. All three pre-existing invariants (disjointness, auto-merge, economics) apply to BOTH modes. No mode flag bypasses any gate.
4. In-session mode NEVER throws pause/resume; N=1 is the irreducible floor.
5. Adaptive `maxParallel` (`computeAdaptiveMaxParallel`) is untouched — D2 layers on top, not under.

**Contract**: `.gsd-t/contracts/wave-join-contract.md` v1.1.0.

**Tests**: `test/m44-parallel-cli.test.js` (21 tests covering headroom ok/reduced/floor, unattended gate ok/split/boundary, plan-table format, runParallel in-session fan-out, disjointness gate-veto fallback, mode auto-detect, explicit-mode override, headroom reduction end-to-end with a 5-domain fixture at 70% ctxPct, and CLI arg parsing).

## Command-File Integration (M44 D3, v3.18.10+)

Wires the five primary GSD-T command files — `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md` — to the D2 `gsd-t parallel` CLI so task-level parallel dispatch becomes available from the standard workflow. Purely additive doc-ripple + conditional integration blocks; no new library code, no new spawns. Every existing sequential code path remains intact.

**Dispatch decision flow**:

```
  command file                                 bin/gsd-t-parallel.cjs      bin/gsd-t-orchestrator.js
  ────────────────                             ────────────────────       ────────────────────────
  execute   ┐
  wave      │   "Optional — Parallel               ┌─ D4 depgraph-validate ─┐
  integrate ├─► Dispatch (M44)" block ───► runParallel │ (veto on unmet deps)  │
  quick     │   (conditional: >1 pending       (D2)     ├─ D5 disjointness ──────┤──► validated plan
  debug     ┘    task + D4/D5/D6 gates                  │ (veto on overlap)     │    ────► M40 orchestrator
                 pass). Mode auto-detected              ├─ D6 economics (hint)  │          (spawns workers,
                 from GSD_T_UNATTENDED.                 └─ mode-aware final     │          retries, wave
                 Single-task or veto →                    gate (85% / 60%)      │          barriers, state
                 silent sequential fallback.                                    │          lifecycle)
                                                         emits gate_veto,
                                                         parallelism_reduced,
                                                         task_split events
                                                         (best-effort JSONL)
```

**Per-file integration points**:

| Command file | Step | Trigger | Behavior when no trigger |
|-------------|------|---------|-------------------------|
| `gsd-t-execute.md` | Step 3 (Choose Execution Mode) | >1 pending task + gates pass | Existing Wave Scheduling + Solo/Team Mode sequential path |
| `gsd-t-wave.md` | Step 3 EXECUTE phase (#5) | Inherited from execute agent | Wave orchestrator does not configure mode |
| `gsd-t-integrate.md` | Step 3 (Wire Integration Points) | Integrating >1 domain + gates pass | Sequential task-level dispatch |
| `gsd-t-quick.md` | Step 3 (Execute) | >1 pending task + gates pass (uncommon for quick) | Sequential single-subagent (the common case) |
| `gsd-t-debug.md` | Step 3 (Debug Solo or Team) | Multi-domain contract-boundary/gap debug | Sequential Solo Mode / Team Mode |

**Invariants** (enforced by D2; documented in every D3 integration block):
1. **Mode auto-detection** — mode comes from `GSD_T_UNATTENDED=1`; no command file hardcodes `--mode`.
2. **Silent fallback** — gate vetoes, unprovable disjointness, and single-task scope ALL drop to sequential without a user prompt.
3. **No opt-out flag** — no `--in-session`/`--headless` flag exists (consistent with M43 D4).
4. **In-session: never interrupt** — headroom pressure reduces worker count to N=1 floor; never pauses.
5. **Unattended: zero-compaction** — D2 enforces by splitting when D6 estimates > 60% per-worker CW.
6. **Observability** — D2 owns spawn observability; D3 adds zero new spawns.

**Contract**: `.gsd-t/contracts/wave-join-contract.md` v1.1.0 (surface referenced by every integration block).

## Spawn Plan Visibility (M44 D8, v3.18.10+)

Right-side two-layer task panel in the dashboard / transcript visualizer.
Answers exactly one question: *"Of the tasks that were supposed to happen
in this spawn, which are done, which are in flight, which are pending?"*
Observability-only; zero added LLM token cost.

**Writers (3 chokepoints; all wrapped in try/catch — plan-write failure NEVER blocks the spawn)**:
- `bin/gsd-t-token-capture.cjs` — `captureSpawn()` calls `writeSpawnPlan`
  before `await spawnFn()` and `markSpawnEnded` in both success/error paths.
- `bin/headless-auto-spawn.cjs` — `autoSpawnHeadless()` calls
  `writeSpawnPlan` before the detached child launches; `markSessionCompleted`
  now also closes the plan.
- `commands/gsd-t-resume.md` Step 0 — under `GSD_T_UNATTENDED_WORKER=1`,
  every worker iteration writes a plan at iteration start.

**Derivation**: `bin/spawn-plan-derive.cjs` reads `.gsd-t/partition.md` +
`.gsd-t/domains/*/tasks.md` and emits `{milestone, wave, domains, tasks}`.
Deterministic projection — no LLM calls, no prompts. Silent-fails to an
empty slice when partition is absent.

**Status updater**: `bin/spawn-plan-status-updater.cjs` — atomic JSON
patches:
- `markTaskDone({spawnId, taskId, commit, tokens?, projectDir})`
- `markSpawnEnded({spawnId, endedReason, projectDir})`
- `sumTokensForTask(...)` — parses `.gsd-t/token-log.md` rows where
  `Task` column matches the id AND `Datetime-start >= spawn.startedAt`.

**Post-commit hook**: `scripts/gsd-t-post-commit-spawn-plan.sh` (+ template
at `templates/hooks/post-commit-spawn-plan.sh`). Greps commit message for
all `[M\d+-D\d+-T\d+]` ids; for each active plan, calls `markTaskDone`
with token attribution. Silent-fail: always `exit 0`.

**Reader surface**:
- `GET /api/spawn-plans` — active plans (where `endedAt === null`),
  newest-first.
- SSE channel `/api/spawn-plans/stream` — `fs.watch` on
  `.gsd-t/spawns/*.json` emits `{spawnId, plan}` on every change.
- `scripts/gsd-t-transcript.html` — right-side `<aside class="spawn-panel">`
  with Layer 1 (project) + Layer 2 (active spawn). Status icons
  `☐` pending / `◐` in_progress / `✓` done. Token cells render as
  `in=12.5k out=1.7k $0.42` (k-suffix above 1000, 2-decimal USD); `—` when
  attribution returned null.

**Storage**: `.gsd-t/spawns/{spawnId}.json`. Schema v1. Atomic writes
(temp file + rename). `spawnId` is filesystem-safe
(`^[A-Za-z0-9._-]{1,200}$`). One ACTIVE plan per spawn; `endedAt === null`
means in-flight.

**Invariants** (from `.gsd-t/domains/m44-d8-spawn-plan-visibility/constraints.md`):
1. Writer DERIVES, never decides.
2. Spawn must launch even if writer fails.
3. Atomic writes only.
4. Post-commit hook silent-fail.
5. Zero new LLM token cost.
6. Additive edits to existing files only.
7. No transcript-derivation fallback — missing plan file → *"no active
   spawn plan"*, never reconstruct from transcript heuristics.

**Contract**: `.gsd-t/contracts/spawn-plan-contract.md` v1.0.0.

**Tests**: `test/m44-d8-spawn-plan-writer.test.js`,
`test/m44-d8-spawn-plan-status-updater.test.js`,
`test/m44-d8-post-commit-hook.test.js`,
`test/m44-d8-dashboard-spawn-plans-endpoint.test.js`,
`test/m44-d8-transcript-renderer-panel.test.js` — 36 tests total.

## Parallelism Panel (M44 D9, v3.19.0+)

Pure-observer readout answering two questions:

> *Is the orchestrator actually fanning out, or serializing despite parallelism being available?*

> *When this wave finishes, did it hit the parallelism factor D6 estimated?*

Zero added LLM token cost — every number is derived from files the other
M44 domains already write: D8 spawn-plan files, D4/D5/D6 event rows, and
D7 `cw_id` columns in `.gsd-t/token-log.md`.

**Module**: `bin/parallelism-report.cjs` —
`computeParallelismMetrics({projectDir, wave?, now?})` returns the shape
defined in `.gsd-t/contracts/parallelism-report-contract.md` v1.0.0.
`buildFullReport(...)` returns a post-mortem markdown string with Summary,
Per-spawn timeline, Per-gate decisions, Per-worker Gantt, Token cost, and
Notes sections.

**Data flow**:

```
  .gsd-t/spawns/*.json  ─┐                     (D8 writer)
  .gsd-t/events/*.jsonl ─┼─▶  bin/parallelism-report.cjs
  .gsd-t/domains/*/tasks.md ┤       │
  .gsd-t/token-log.md   ─┘       (pure I/O — never writes, never spawns)
                                    │
                                    ▼
                    scripts/gsd-t-dashboard-server.js
                    (5s in-memory cache per wave param)
                      ├── GET /api/parallelism           → JSON metrics
                      ├── GET /api/parallelism/report    → markdown
                      └── POST /api/unattended-stop      → writes sentinel
                                    │
                                    ▼
                    scripts/gsd-t-transcript.html
                    `<aside class="spawn-panel"> .parallelism-panel`
                    polls /api/parallelism every 5s
```

**Color thresholds** (worst-of across five per-signal colors, from contract §color_state):

| Signal | Green | Yellow | Red |
|--------|-------|--------|-----|
| activeWorkers / readyTasks | ≥80% | 50–80% | <50% AND >10 min since last spawn |
| Gate veto rate (D4) | <10% | 10–30% | >30% |
| parallelism_factor vs. D6 estimate | ≥80% | 50–80% | <50% |
| Spawn age (any active worker) | <30 min | 30–45 min | >45 min |
| Time since last `spawn_started` (when ready>0) | <5 min | 5–10 min | >10 min |

Special: `color_state === "dimmed"` when no spawn-plan files exist (idle
project) — never red.

**Silent-fail invariant**: malformed spawn-plan JSON, corrupt JSONL event
lines, missing `.gsd-t/domains/`, missing `.gsd-t/token-log.md` — every
case logs a note to `metrics.notes` / Full Report `## Notes` and continues
with partial data. Observer must never throw when watching a live system.

**Contract**: `.gsd-t/contracts/parallelism-report-contract.md` v1.0.0.

**Tests**: `test/m44-d9-parallelism.test.js` — 16 tests covering metric
shape, parallelism_factor math (live 1-worker, 4-worker, mixed-duration,
post-wave), color-state thresholds, silent-fail on malformed inputs, Full
Report markdown sections, and `/api/parallelism*` endpoint shape + 5s
cache behaviour.

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
