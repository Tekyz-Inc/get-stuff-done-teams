# Architecture Analysis — 2026-02-18 (Scan #5)

## Stack

- **Language**: JavaScript (Node.js >= 16), enforced via `engines` in `package.json`
- **Framework**: None — zero external npm dependencies
- **Database**: None — all state is filesystem-based (Markdown files)
- **Cache**: Update check cache at `~/.claude/.gsd-t-update-check` (JSON, 1-hour TTL)
- **Deployment**: npm registry (`@tekyzinc/gsd-t`), `bin/gsd-t.js` as CLI entry point
- **Runtime Node modules**: `fs`, `path`, `os`, `child_process` (execFileSync, spawn), `https` (in scripts)
- **Test runner**: Node.js built-in test runner (`node --test`), zero test dependencies
- **Current version**: 2.24.4
- **Build gate**: `prepublishOnly: "npm test"` — tests must pass before `npm publish`

## Structure

```
get-stuff-done-teams/
├── bin/
│   └── gsd-t.js              — CLI installer (1299 lines, 81 functions, 49 exports, 10 subcommands)
├── commands/                  — 43 slash command files (Claude Code custom commands)
│   ├── gsd-t-*.md            — 39 GSD-T workflow commands
│   ├── gsd.md                — Smart router (semantic intent → command dispatch)
│   ├── branch.md             — Git branch helper
│   ├── checkin.md            — Auto-version + commit/push helper
│   └── Claude-md.md          — Reload CLAUDE.md directives
├── scripts/                   — 3 hook/utility scripts
│   ├── gsd-t-heartbeat.js    — Claude Code hook event writer (183 lines, 6 functions, 5 exports)
│   ├── npm-update-check.js   — Background npm version checker (42 lines)
│   └── gsd-t-fetch-version.js — Synchronous npm registry fetch (25 lines, extracted M6)
├── test/                      — 4 test files, 116 tests (all passing)
│   ├── helpers.test.js        — 27 tests: pure helper functions (validateProjectName, applyTokens, etc.)
│   ├── filesystem.test.js     — 37 tests: filesystem helpers + CLI subcommand integration
│   ├── security.test.js       — 30 tests: scrubSecrets, scrubUrl, summarize integration
│   └── cli-quality.test.js    — 22 tests: buildEvent, readProjectDeps, insertGuardSection, etc.
├── templates/                 — 9 document templates with token substitution
│   ├── CLAUDE-global.md      — Global ~/.claude/CLAUDE.md template
│   ├── CLAUDE-project.md     — Per-project CLAUDE.md template
│   ├── progress.md           — GSD-T progress tracker template
│   ├── backlog.md            — Backlog file template
│   ├── backlog-settings.md   — Backlog settings template
│   ├── requirements.md       — Requirements doc template
│   ├── architecture.md       — Architecture doc template
│   ├── workflows.md          — Workflows doc template
│   └── infrastructure.md     — Infrastructure doc template
├── examples/                  — Example project structure
│   ├── settings.json         — Claude Code settings with teams enabled
│   └── .gsd-t/               — Example contracts and domain structure
├── docs/                      — Methodology documentation
│   ├── methodology.md        — GSD → GSD-T evolution and concepts
│   ├── architecture.md       — Living architecture doc (this project)
│   ├── requirements.md       — Living requirements doc (this project)
│   ├── workflows.md          — Living workflows doc (this project)
│   └── infrastructure.md     — Living infrastructure doc (this project)
├── .gsd-t/                    — GSD-T's own state (meta: project manages itself)
│   ├── progress.md           — Project progress and decision log
│   ├── backlog.md            — Priority-ordered backlog
│   ├── backlog-settings.md   — Backlog configuration
│   ├── techdebt.md           — Tech debt register (0 open, TD-029 accepted as risk)
│   ├── test-coverage.md      — Test coverage tracking
│   ├── verify-report.md      — Last verification results
│   ├── contracts/            — Active domain contracts (9 files)
│   ├── domains/              — Active domain definitions (empty — between milestones)
│   ├── scan/                 — Codebase analysis outputs (6 files)
│   └── milestones/           — Archived completed milestones (9 archived)
│       ├── backlog-management-system-2026-02-10/
│       ├── qa-agent-test-driven-contracts-2026-02-17/
│       ├── contract-doc-alignment/
│       ├── contract-doc-alignment-2026-02-18/
│       ├── count-fix-qa-contract-2026-02-18/
│       ├── security-hardening-2026-02-18/
│       ├── cli-quality-2026-02-19/
│       ├── cmd-cleanup-2026-02-19/
│       └── housekeeping-2026-02-18/
├── package.json               — npm package config (v2.24.4)
├── CLAUDE.md                  — Project instructions for GSD-T itself
├── README.md                  — User-facing npm/repo documentation
├── GSD-T-README.md            — Detailed command reference
├── CHANGELOG.md               — Release history
├── LICENSE                    — MIT license
├── .gitattributes             — Line ending enforcement (LF for *.js)
├── .editorconfig              — Editor config (LF, UTF-8, 2-space indent)
├── .gitignore                 — OS, editor, node_modules, heartbeat JSONL
└── .claude/
    └── settings.local.json   — Local Claude Code settings
```

## Architecture Pattern

**Distributed Markdown Instruction System with CLI Lifecycle Manager, Agent Orchestration, and Automated Test Suite**

This is not a traditional application. It is a methodology framework where:

1. **Command files** (`commands/*.md`) are the "source code" — structured instructions that Claude Code interprets as slash commands. Each is a self-contained workflow definition with no inter-command code dependencies.

2. **The CLI** (`bin/gsd-t.js`) is a lifecycle manager that handles install/update/init/status/uninstall/doctor operations. It has zero runtime involvement — once commands are installed, the CLI is not needed until the next update.

3. **State files** (`{project}/.gsd-t/`) persist across Claude Code sessions and are read/written by commands at runtime. State is human-readable Markdown, git-tracked, and session-surviving.

4. **Templates** (`templates/`) provide initial document scaffolding with `{Project Name}` and `{Date}` token replacement.

5. **Hook scripts** (`scripts/`) are async event listeners installed into Claude Code's settings.json hook system.

6. **Agent orchestration** (`commands/gsd-t-wave.md`, `commands/gsd-t-qa.md`) defines how the wave orchestrator spawns independent agents per phase, and how the QA agent is spawned as a teammate within multiple phases.

7. **Test suite** (`test/`) validates CLI logic, security functions, and quality invariants using Node.js built-in test runner. 116 tests across 4 files, zero external test dependencies.

### Key Architectural Characteristics

- **No runtime code path**: The CLI installs files; Claude Code interprets them. There is no application server, no running process, no shared runtime state.
- **Self-referential**: This project uses GSD-T on itself — `.gsd-t/` coexists with the files that _define_ `.gsd-t/`.
- **Convention over configuration**: Commands follow predictable naming (`gsd-t-{verb}.md`), templates use consistent token format, state files follow documented schemas.
- **Parallel-safe by design**: Domain isolation (each domain owns distinct files) enables Claude Code Agent Teams to execute concurrently.
- **Agent-per-phase orchestration**: Wave command spawns a fresh Claude Code agent (via Task tool) for each phase, keeping each agent's context window clean and eliminating mid-wave compaction.
- **QA agent integration**: 10 command files spawn a QA teammate to handle test generation, execution, and gap reporting.
- **Zero external dependencies**: CLI uses only Node.js built-ins (`fs`, `path`, `os`, `child_process`). Tests use `node:test` and `node:assert/strict`. No npm runtime or dev dependencies.
- **Testable via module.exports + require.main guard**: Both `bin/gsd-t.js` (49 exports) and `scripts/gsd-t-heartbeat.js` (5 exports) expose functions for testing while guarding their main execution behind `require.main === module`.
- **Publish-safe via prepublishOnly**: `npm test` runs automatically before `npm publish`, preventing broken releases.

## Data Flow

### Installation Flow

```
npm install @tekyzinc/gsd-t
       │
       ▼
bin/gsd-t.js install
       │
       ├── Copy commands/*.md → ~/.claude/commands/ (43 files)
       ├── Copy/append templates/CLAUDE-global.md → ~/.claude/CLAUDE.md
       ├── Copy scripts/gsd-t-heartbeat.js → ~/.claude/scripts/
       ├── Configure 9 hooks in ~/.claude/settings.json
       └── Write version to ~/.claude/.gsd-t-version
```

### Project Initialization Flow

```
gsd-t init [name]       OR       /user:gsd-t-init [name]
       │                                │
       ▼                                ▼
templates/ → applyTokens({Project Name}, {Date})
       │
       ├── → {project}/CLAUDE.md
       ├── → {project}/docs/requirements.md
       ├── → {project}/docs/architecture.md
       ├── → {project}/docs/workflows.md
       ├── → {project}/docs/infrastructure.md
       ├── → {project}/.gsd-t/progress.md
       ├── → {project}/.gsd-t/backlog.md
       ├── → {project}/.gsd-t/backlog-settings.md
       ├── → {project}/.gsd-t/contracts/.gitkeep
       └── → {project}/.gsd-t/domains/.gitkeep
```

### Runtime Command Execution Flow (within Claude Code)

```
User types: /user:gsd-t-{command} [args]
       │
       ▼
Claude Code loads ~/.claude/commands/gsd-t-{command}.md
       │
       ▼
Claude interprets the markdown as step-by-step instructions
       │
       ├── Step 1: Read state files (CLAUDE.md, .gsd-t/progress.md, contracts, etc.)
       ├── Step N: Execute workflow logic (analyze, generate, modify files)
       ├── Step N+1: Spawn QA agent (if phase requires it)
       ├── Pre-Commit Gate: Update all affected docs before committing
       └── Final: Update .gsd-t/progress.md with decision log entry
```

### Wave Orchestrator Flow (Agent-Per-Phase Model)

```
/user:gsd-t-wave
       │
       ▼
Wave orchestrator reads .gsd-t/progress.md + CLAUDE.md (lightweight ~30KB)
       │
       ├── Integrity check: verify Status, Milestone, Domains table present
       │
       ▼
For each phase in sequence:
       │
       ├── Spawn fresh Task agent → "Execute {phase} per commands/gsd-t-{phase}.md"
       │       │
       │       ├── Agent loads its own context from state files
       │       ├── Agent executes full phase workflow
       │       ├── Agent spawns QA teammate (if applicable)
       │       ├── Agent commits work
       │       └── Agent updates .gsd-t/progress.md and dies
       │
       ├── Orchestrator reads progress.md → verify status updated correctly
       ├── Report brief status to user
       └── Proceed to next phase (or handle error)

Phase sequence:
PARTITION → [DISCUSS] → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE

Discuss skip conditions (structured):
  (a) Single domain milestone
  (b) No "OPEN QUESTION" in Decision Log
  (c) All cross-domain contracts exist (for multi-domain)
```

### Test Execution Flow

```
npm test  (or:  node --test)
       │
       ▼
Node.js built-in test runner discovers test/*.test.js
       │
       ├── test/helpers.test.js
       │     └── require("../bin/gsd-t.js")  — 7 describe blocks, 27 tests
       │         Tests: validateProjectName, applyTokens, normalizeEol,
       │                validateVersion, isNewerVersion, PKG_VERSION/PKG_ROOT
       │
       ├── test/filesystem.test.js
       │     └── require("../bin/gsd-t.js")  — 9 describe blocks, 37 tests
       │         Tests: isSymlink, hasSymlinkInPath, ensureDir, validateProjectPath,
       │                copyFile, hasPlaywright, hasSwagger, hasApi, command listing,
       │                CLI subcommand integration (--version, help, status, doctor)
       │
       ├── test/security.test.js
       │     └── require("../scripts/gsd-t-heartbeat.js") + require("../bin/gsd-t.js")
       │         4 describe blocks, 30 tests
       │         Tests: scrubSecrets, scrubUrl, summarize integration, hasSymlinkInPath
       │
       └── test/cli-quality.test.js
              └── require("../scripts/gsd-t-heartbeat.js") + require("../bin/gsd-t.js")
                  6 describe blocks, 22 tests
                  Tests: buildEvent, readProjectDeps, readPyContent,
                         insertGuardSection, readUpdateCache, addHeartbeatHook
```

### Fetch-Version External Script Flow

```
checkForUpdates() in bin/gsd-t.js
       │
       ├── Cache miss (first run)?
       │   └── fetchVersionSync()
       │       └── execFileSync(node, ["scripts/gsd-t-fetch-version.js"])
       │           └── HTTPS GET → registry.npmjs.org → stdout → cache file
       │
       └── Cache stale (>1h)?
            └── refreshVersionAsync()
                └── spawn(node, ["scripts/npm-update-check.js", cacheFile], { detached: true })
                    └── HTTPS GET → registry.npmjs.org → cache file (validated within ~/.claude/)
```

### QA Agent Flow (Cross-Phase Test Coverage)

```
Phase command spawns QA teammate:
       │
       ├── Partition: Generate contract test skeletons from .gsd-t/contracts/
       ├── Plan: Generate acceptance test scenarios from domain task lists
       ├── Execute: Run tests continuously, write edge case tests
       ├── Test-Sync: Audit test coverage against contracts, fill gaps
       ├── Verify: Full test audit — contract tests + coverage gaps
       ├── Quick: Write regression/feature tests, run full suite
       ├── Debug: Write regression test for bug
       ├── Integrate: Run cross-domain integration tests
       ├── Complete: Final gate check — all tests must pass
       └── Wave: QA spawned within each sub-phase agent

Communication: QA → Lead via teammate message
Format: "QA: {PASS|FAIL} — {summary}. Contract tests: N/N. Gaps: {list|none}"
Blocking: QA FAIL blocks phase completion (user override available)

File-path boundaries (QA agent restricted to):
  CAN modify: test/, tests/, __tests__/, e2e/, spec/, test configs, .gsd-t/test-coverage.md
  CANNOT modify: src/, lib/, bin/, scripts/, commands/, templates/, docs/, .gsd-t/contracts/, CLAUDE.md
```

### Heartbeat Event Flow

```
Claude Code event (SessionStart, PostToolUse, SubagentStart, SubagentStop, etc.)
       │
       ▼
settings.json hook fires → node ~/.claude/scripts/gsd-t-heartbeat.js
       │
       ├── Read JSON from stdin (hook payload, max 1MB)
       ├── Validate: cwd is absolute, .gsd-t/ exists
       ├── Validate: session_id matches /^[a-zA-Z0-9_-]+$/ (anti-traversal)
       ├── Validate: resolved file path stays within .gsd-t/ directory
       ├── Symlink check before append
       ├── Build structured event via EVENT_HANDLERS map (ts, sid, evt, data)
       │   ├── Notification events: message scrubbed via scrubSecrets() (added M8)
       │   └── Bash tool events: command truncated to 150 chars, secrets scrubbed
       ├── Cleanup old heartbeat files >7 days (SessionStart only — gated)
       └── Append to {project}/.gsd-t/heartbeat-{session_id}.jsonl
```

### Update Check Flow

```
Any CLI command (except install/update)
       │
       ├── Read ~/.claude/.gsd-t-update-check (cache)
       │
       ├── Cache exists + fresh (<1h)?
       │   └── Show notice if cached.latest > PKG_VERSION
       │
       ├── No cache at all?
       │   └── Synchronous fetch via scripts/gsd-t-fetch-version.js (8s timeout)
       │       └── Cache result → show notice if newer
       │
       └── Cache exists but stale (>1h)?
            └── Spawn background process (scripts/npm-update-check.js, detached)
                └── Fetches npm registry → updates cache file (path validated to ~/.claude/)
```

## Configuration Model

Three-tier configuration, layered from global to project-specific to runtime state:

| Layer | Location | Installed By | Purpose |
|-------|----------|--------------|---------|
| **Global** | `~/.claude/CLAUDE.md` | CLI install | Framework defaults: autonomy rules, code standards, pre-commit gate, naming conventions, workflow preferences, QA Agent integration rules |
| **Project** | `{cwd}/CLAUDE.md` | CLI init or gsd-t-init command | Project-specific: tech stack, branch guard, conventions, deployed URLs, overrides of global defaults |
| **State** | `{cwd}/.gsd-t/` | gsd-t-init, then commands | Live state: progress.md (master), contracts/, domains/, backlog, scan results, impact/verify reports |

### State Files Schema

| File | Read By | Written By | Content |
|------|---------|------------|---------|
| `progress.md` | All commands | Most commands | Project name, version, status, milestones table, domains table, decision log, session log |
| `contracts/*.md` | execute, integrate, verify, quick, resume, qa | partition, execute, integrate | API shapes, schema definitions, component interfaces, integration points, QA agent contract |
| `domains/{name}/scope.md` | execute, quick | partition | File ownership, responsibilities, exclusions |
| `domains/{name}/tasks.md` | execute, status, resume | plan, execute | Task list with completion status |
| `domains/{name}/constraints.md` | execute | partition | Patterns to follow, boundaries |
| `backlog.md` | backlog-list, status | backlog-add, backlog-edit, backlog-move, backlog-remove | Priority-ordered backlog entries |
| `backlog-settings.md` | backlog-add, backlog-edit, backlog-settings | backlog-settings, init | Types, apps, categories, defaults |
| `techdebt.md` | promote-debt, scan, milestone | scan | Prioritized tech debt register |
| `scan/*.md` | scan (synthesis step), setup | scan (teammates) | Architecture, business rules, security, quality, contract-drift findings |
| `impact-report.md` | wave, execute | impact | Downstream effect analysis |
| `verify-report.md` | complete-milestone, wave | verify | Quality gate results |
| `test-coverage.md` | verify, complete-milestone | test-sync, qa | Test coverage analysis |
| `heartbeat-{sid}.jsonl` | (external analysis) | gsd-t-heartbeat.js | Append-only session events (auto-cleanup >7 days, gated to SessionStart) |
| `milestones/{name}-{date}/` | status, resume | complete-milestone | Archived milestone with all contracts, domains, progress |

### Settings.json Integration

`readSettingsJson()` (added M8) provides a single entry point for reading `~/.claude/settings.json`:
- Returns parsed JSON object if valid
- Returns `null` if file missing or invalid JSON
- Used by `configureHeartbeatHooks()`, `showStatusTeams()`, and `checkDoctorSettings()`

### Contracts Registry (9 files)

| Contract File | Owner | Key Consumers | Purpose |
|---------------|-------|---------------|---------|
| `backlog-command-interface.md` | commands domain | integration domain | Backlog command names, args, promote flow |
| `file-format-contract.md` | templates domain | commands, integration | backlog.md and backlog-settings.md format |
| `backlog-file-formats.md` | framework | backlog commands | Detailed entry format, validation rules |
| `domain-structure.md` | framework | plan, execute, integrate, verify | Domain directory layout, scope/tasks/constraints format |
| `progress-file-format.md` | framework | all workflow commands | progress.md sections, status values, lifecycle |
| `pre-commit-gate.md` | framework | all committing commands | Mandatory pre-commit checklist |
| `wave-phase-sequence.md` | framework | wave, resume, status | Phase order, transition rules, gates |
| `integration-points.md` | (milestone-specific) | execute, integrate | Dependency graph, checkpoints |
| `qa-agent-contract.md` | qa-agent-spec domain | command-integration (10 commands) | QA agent spawn interface, output per phase (9 phases), communication protocol |

## Key Abstractions

### Command File Pattern

Every command file (`commands/gsd-t-*.md`) follows a consistent structure with integer step numbering (fractional steps eliminated in M7):

```markdown
# GSD-T: {Name} — {Subtitle}

{Role statement: "You are..."}

## Step 1: Load State
Read: CLAUDE.md, .gsd-t/progress.md, relevant contracts

## Step 2: Spawn QA Agent (if applicable)
Teammate "qa": Read commands/gsd-t-qa.md ...
QA failure blocks {phase} completion.

## Step N: {Action}
{Instructions with code blocks for team mode}

## Step N+1: Document Ripple
{List of docs to check/update}

## Step Final: Autonomy Behavior
Level 3: auto-advance / log status
Level 1-2: pause for user

$ARGUMENTS
```

### QA Agent Spawn Pattern

10 commands include a QA agent spawn step with consistent blocking language:

```markdown
## Step N: Spawn QA Agent

Spawn the QA teammate to {phase-specific purpose}:

Teammate "qa": Read commands/gsd-t-qa.md for your full instructions.
  Phase context: {phase}. Read .gsd-t/contracts/ for contract definitions.
  {Phase-specific instructions}
  Report: {expected output format}

QA failure blocks {phase} completion.
```

Commands that spawn QA: partition, plan, execute, verify, quick, debug, integrate, test-sync, complete-milestone, wave (indirectly via sub-phase agents).

### Token Replacement

Templates use two replacement tokens, applied by `applyTokens()` in `bin/gsd-t.js`:
- `{Project Name}` → user-provided project name
- `{Date}` → ISO date string (YYYY-MM-DD)

### CLI Function Organization

`bin/gsd-t.js` (1299 lines, 81 functions, all <= 30 lines) is organized into sections:

| Section | Lines (approx.) | Functions |
|---------|-----------------|-----------|
| Configuration | 23-43 | Path constants, package version |
| Guard Section | 46-65 | `GUARD_SECTION` template literal |
| Helpers | 67-304 | Logging (7), file ops (5), validation (4), project utils (7), detection (4) |
| Heartbeat | 306-379 | `installHeartbeat()`, `configureHeartbeatHooks()`, `addHeartbeatHook()` |
| Commands | 381-451 | `installCommands()`, `installGlobalClaudeMd()`, `updateExistingGlobalClaudeMd()`, `appendGsdtToClaudeMd()` |
| Install/Update | 453-510 | `doInstall()`, `showInstallSummary()`, `doUpdate()` |
| Init | 512-639 | `initClaudeMd()`, `initDocs()`, `initGsdtDir()`, `writeTemplateFile()`, `doInit()`, `showInitTree()` |
| Status | 641-738 | `doStatus()`, `showStatusVersion()`, `showStatusCommands()`, `showStatusConfig()`, `showStatusTeams()`, `showStatusProject()` |
| Uninstall | 740-773 | `doUninstall()`, `removeInstalledCommands()`, `removeVersionFile()` |
| Update All | 775-928 | `updateProjectClaudeMd()`, `insertGuardSection()`, `createProjectChangelog()`, `checkProjectHealth()`, `doUpdateAll()`, `updateGlobalCommands()`, `showNoProjectsHint()`, `updateSingleProject()`, `showUpdateAllSummary()` |
| Doctor | 930-1050 | `checkDoctorEnvironment()`, `checkDoctorInstallation()`, `checkDoctorClaudeMd()`, `checkDoctorSettings()`, `checkDoctorEncoding()`, `checkDoctorProject()`, `doDoctor()` |
| Register | 1052-1081 | `doRegister()` |
| Update Check | 1083-1167 | `isNewerVersion()`, `checkForUpdates()`, `readSettingsJson()`, `readUpdateCache()`, `fetchVersionSync()`, `refreshVersionAsync()`, `showUpdateNotice()`, `doChangelog()` |
| Help | 1169-1191 | `showHelp()` |
| Exports | 1193-1246 | 49 named exports for testing (46 functions + 3 constants) |
| Main | 1248-1299 | `require.main === module` guard, argument parsing, command dispatch |

### Heartbeat Function Organization

`scripts/gsd-t-heartbeat.js` (183 lines, 6 functions, all <= 30 lines):

| Function | Purpose |
|----------|---------|
| `cleanupOldHeartbeats()` | Remove files > 7 days old (called only on SessionStart) |
| `buildEvent()` | Route hook event to handler via `EVENT_HANDLERS` map |
| `scrubSecrets()` | Strip passwords, tokens, API keys from command strings |
| `scrubUrl()` | Mask query parameter values in URLs |
| `summarize()` | Extract tool-specific summary from hook payload |
| `shortPath()` | Convert absolute paths to relative/abbreviated form |

`EVENT_HANDLERS` map (declared at module scope, not inside buildEvent):
```javascript
const EVENT_HANDLERS = {
  SessionStart: (h) => ({ evt: "session_start", data: { source, model } }),
  PostToolUse:  (h) => ({ evt: "tool", tool: h.tool_name, data: summarize(...) }),
  SubagentStart: ..., SubagentStop: ..., TaskCompleted: ...,
  TeammateIdle: ...,
  Notification: (h) => ({ evt: "notification", data: { message: scrubSecrets(h.message), ... } }),
  Stop: ..., SessionEnd: ...
};
```

## Entry Points

### CLI Entry Point (`bin/gsd-t.js`)

- **Triggers**: `npx @tekyzinc/gsd-t <command>` or global `gsd-t <command>`
- **Responsibilities**: install, update, update-all, init, register, status, uninstall, doctor, changelog, help, --version
- **Dispatch**: Simple `switch` statement on `process.argv[2]` (line 1254), guarded by `require.main === module`
- **Post-dispatch**: `checkForUpdates()` runs after every command (except install/update/--version)
- **Testability**: 49 functions exported via `module.exports` for unit testing

### Claude Code Commands (43 files in `commands/`)

- **Triggers**: User types `/user:gsd-t-{name}` or `/user:{utility-name}` in Claude Code
- **Responsibilities**: Each command defines a complete workflow phase
- **Discovery**: Claude Code auto-discovers all `.md` files in `~/.claude/commands/`
- **Breakdown**: 39 GSD-T workflow commands (`gsd-t-*.md`) + 4 utility commands (`gsd.md`, `branch.md`, `checkin.md`, `Claude-md.md`)
- **Structure**: Integer step numbering, Autonomy Behavior sections, Document Ripple sections, QA spawn steps

### Heartbeat Hook (`scripts/gsd-t-heartbeat.js`)

- **Triggers**: 9 Claude Code events (SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd)
- **Input**: JSON on stdin from Claude Code hook system (max 1MB)
- **Output**: Appends JSONL events to `.gsd-t/heartbeat-{session_id}.jsonl`
- **Security**: Session ID validation, path containment check, symlink check, parent validation
- **Scrubbing**: Notification messages scrubbed via `scrubSecrets()` (added M8); Bash commands scrubbed and truncated
- **Testability**: 5 functions exported via `module.exports`, guarded by `require.main === module`

### Fetch Version Script (`scripts/gsd-t-fetch-version.js`)

- **Triggers**: Called synchronously by `fetchVersionSync()` in `bin/gsd-t.js` on first run (no cache)
- **Input**: None (hardcoded npm registry URL)
- **Output**: Version string to stdout
- **Bounded**: 1MB HTTP response limit, 5s timeout

### Background Update Check (`scripts/npm-update-check.js`)

- **Triggers**: Spawned detached by `refreshVersionAsync()` when update cache is stale
- **Input**: Cache file path as argv[2] (validated to resolve within `~/.claude/`)
- **Output**: Writes `{latest, timestamp}` JSON to cache file
- **Security**: Path validation (must be within `~/.claude/`), symlink check, version format validation

### Test Suite (`test/*.test.js`)

- **Triggers**: `npm test` or `node --test`
- **Runner**: Node.js built-in test runner (no external dependencies)
- **Pattern**: `require("node:test")` for describe/it, `require("node:assert/strict")` for assertions
- **Coverage**: 116 tests across 25 describe blocks, covering all exported functions
- **Publish gate**: Tests run automatically via `prepublishOnly` before `npm publish`

## Error Handling

### CLI Error Handling Strategy

- **File operations**: Individual try/catch per operation with `error()` logging — continues on failure
- **Per-project isolation**: `doUpdateAll()` wraps each project update in try/catch (added M6) — one bad project does not abort remaining projects
- **Symlink defense**: Every file write checks `isSymlink()` first — refuses to follow symlinks. `hasSymlinkInPath()` validates parent directory components.
- **Safe file creation**: Uses `{ flag: "wx" }` (exclusive create) to avoid overwriting existing files during init
- **Version validation**: `validateVersion()` regex guards against malformed version strings
- **Project path validation**: `validateProjectPath()` checks absolute path, existence, directory status, and Unix ownership
- **Session ID validation**: `SAFE_SID = /^[a-zA-Z0-9_-]+$/` blocks path traversal in heartbeat filenames
- **HTTP response bounding**: Both `gsd-t-fetch-version.js` and `npm-update-check.js` cap responses at 1MB
- **Settings.json resilience**: `readSettingsJson()` returns `null` on missing file or invalid JSON, callers handle gracefully

### Command Error Handling

- Commands specify retry policies: "up to 2 fix attempts" for test failures
- Destructive Action Guard: mandatory user approval before any destructive operation
- Impact analysis gate: BLOCK verdict halts execution in wave mode
- Checkpoint verification: contract compliance checks at domain boundaries
- QA agent blocking: QA FAIL status blocks phase completion (user override available)
- Wave integrity check: verifies progress.md has Status, Milestone, and Domains table before proceeding

### Wave Error Recovery

| Failure Point | Recovery |
|---------------|----------|
| Impact BLOCK | Level 3: Spawn remediation agent, re-run impact (max 2). Level 1-2: Ask user |
| Test failures during execute | Execute agent handles internally (2 fix attempts) |
| Verify failure | Level 3: Spawn remediation agent, re-run verify (max 2). Level 1-2: Ask user |
| Phase agent fails to update status | Orchestrator stops and reports error |
| QA agent reports FAIL | Phase blocked until QA passes or user overrides |
| progress.md integrity failure | Wave halts — user directed to /gsd-t-status or /gsd-t-init |

## Cross-Cutting Concerns

### Security

- **Symlink protection**: All file writes in CLI and heartbeat check for symlinks. `hasSymlinkInPath()` walks parent directory components.
- **Input validation**: Project names (`validateProjectName`), version strings (`validateVersion`), session IDs (`SAFE_SID` regex), and project paths (`validateProjectPath`) are validated.
- **Path traversal prevention**: Heartbeat resolves paths and verifies containment within `.gsd-t/`. Update check validates cache path within `~/.claude/`.
- **Command injection mitigation**: Uses `execFileSync` with array args (not `execSync` with string) for external commands.
- **Stdin size limit**: Heartbeat caps input at 1MB (`MAX_STDIN`) to prevent OOM.
- **HTTP response bounding**: Both fetch scripts cap at 1MB to prevent OOM from oversized registry responses.
- **Secret scrubbing**: Heartbeat scrubs passwords, tokens, API keys, bearer tokens, and URL query params from logged commands via `scrubSecrets()` and `scrubUrl()`. Notification messages also scrubbed (added M8).
- **Wave security**: `bypassPermissions` mode documented with attack surface analysis, mitigations, and recommendations in `gsd-t-wave.md` and `README.md`.
- **QA agent file boundaries**: Explicit allowed/denied file paths prevent QA agent from modifying source code, contracts, or docs.
- **No secrets handling**: Package stores no credentials; env var names (not values) in templates.

### State Persistence

- All state in `.gsd-t/` is git-tracked Markdown — survives session loss, machine migration, and team sharing
- Heartbeat JSONL files auto-cleanup after 7 days (gated to SessionStart only — not every event)
- Update check cache has 1-hour TTL
- Milestone archives preserve complete snapshot of contracts + domains + progress

### Documentation Synchronization

- **Pre-Commit Gate**: Mental checklist (not enforced programmatically) requiring doc updates with every commit
- **Document Ripple**: Each command specifies which documents it may affect
- **Four reference files** must stay synchronized: `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`
- **Command count assertions**: Tests enforce exact counts (43 total, 39 GSD-T, 4 utility) to catch drift

### Logging

- CLI: ANSI-colored console output via helper functions (`success()`, `warn()`, `error()`, `info()`, `heading()`)
- Commands: Decision Log entries in `.gsd-t/progress.md` with timestamps
- Heartbeat: Structured JSONL events per session with tool summaries and scrubbed secrets

### Testing Strategy

- **116 automated tests** covering CLI helpers, filesystem operations, security functions, and quality invariants
- **4 test files**: `helpers.test.js` (pure functions), `filesystem.test.js` (filesystem + CLI integration), `security.test.js` (scrubbing + path validation), `cli-quality.test.js` (refactored functions)
- **Command count tests**: Explicit assertions that total=43, GSD-T=39, utility=4 — catches count drift automatically
- **Zero external test dependencies**: Uses Node.js built-in `node:test` and `node:assert/strict`
- **Run command**: `npm test` (which runs `node --test`)
- **Publish gate**: `prepublishOnly: "npm test"` prevents broken publishes
- **QA Agent** generates tests for _consumer projects_ using contracts, not for GSD-T itself

## Workflow Phase Architecture

The core GSD-T workflow is a linear pipeline with conditional branches, orchestrated via agent-per-phase:

```
INITIALIZED
    │
    ▼
PARTITION ─── Decompose milestone into domains + contracts
    │           └── QA spawned: generate contract test skeletons
    ▼
DISCUSS ────── Explore design decisions (always pauses, even Level 3)
    │           └── Skippable: single domain + no open questions + contracts exist
    ▼
PLAN ────────── Create atomic task lists per domain
    │           └── QA spawned: generate acceptance test scenarios
    ▼
IMPACT ──────── Analyze downstream effects
    │           └── Gate: PROCEED / PROCEED WITH CAUTION / BLOCK
    ▼
EXECUTE ─────── Run tasks (solo or team mode)
    │           ├── QA spawned: run tests continuously, write edge cases
    │           └── test-sync after each task
    ▼
TESTS_SYNCED ── Full test coverage analysis
    │           └── QA spawned: audit coverage against contracts
    ▼
INTEGRATED ──── Wire domains at boundaries
    │           └── QA spawned: run cross-domain integration tests
    ▼
VERIFIED ────── Quality gates pass
    │           ├── QA spawned: full test audit + gap report
    │           └── Gate: PASS / CONDITIONAL PASS / FAIL
    ▼
COMPLETED ───── Archive to .gsd-t/milestones/{name}-{date}/
                ├── QA spawned: final gate check
                ├── Gap analysis gate (100% implemented)
                └── Create git tag
```

### Wave Orchestration Diagram (Agent-Per-Phase)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Wave Orchestrator (lightweight ~30KB)                     │
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌──────┐   ┌────────┐   ┌─────────┐          │
│  │PARTITION│ → │ DISCUSS │ → │ PLAN │ → │ IMPACT │ → │ EXECUTE │          │
│  │ agent 1 │   │ agent 2 │   │agent 3│   │agent 4 │   │ agent 5 │          │
│  │ + QA    │   │(skip OK)│   │ + QA  │   │        │   │ + QA    │          │
│  └────┬────┘   └────┬────┘   └───┬──┘   └───┬────┘   └────┬────┘          │
│       ↓              ↓            ↓           ↓             ↓               │
│    status          status      status      status +      status             │
│    check           check       check       gate          check              │
│                                                                              │
│  ┌──────────┐   ┌────────┐   ┌───────────┐       ┌─────────────────┐       │
│  │ COMPLETE │ ← │ VERIFY │ ← │ INTEGRATE │ ←──── │ FULL TEST-SYNC  │       │
│  │ agent 9  │   │agent 8 │   │  agent 7  │       │    agent 6      │       │
│  │ + QA     │   │ + QA   │   │  + QA     │       │    + QA         │       │
│  └────┬────┘   └────┬────┘   └─────┬─────┘       └────────┬────────┘       │
│       ↓              ↓              ↓                      ↓               │
│    archive        status +       status                 status              │
│    gap gate       gate check     check                  check               │
│    git tag                                                                   │
│                                                                              │
│  Each agent: fresh context window (~200K tokens)                            │
│  Each agent: may spawn QA teammate for testing within that phase            │
│  Orchestrator: ~30KB total, never compacts                                  │
│  State handoff: exclusively through .gsd-t/ files                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Patterns Observed

### Zero-Dependency CLI
Only Node.js built-ins: `fs`, `path`, `os`, `child_process`. This is intentional and enforced — CLAUDE.md explicitly states "NEVER add external npm dependencies to the installer."

### module.exports + require.main Guard
Both `bin/gsd-t.js` and `scripts/gsd-t-heartbeat.js` use the pattern:
```javascript
module.exports = { fn1, fn2, ... };  // For testing
if (require.main === module) { /* CLI/stdin logic */ }
```
This enables unit testing of all functions while preserving CLI behavior when run directly. `bin/gsd-t.js` exports 49 items (46 functions + 3 constants); `gsd-t-heartbeat.js` exports 5 functions.

### readSettingsJson() — Central Settings Parser (New in M8)
A single function for reading `~/.claude/settings.json`, replacing inline JSON.parse calls across 3 callsites:
```javascript
function readSettingsJson() {
  if (!fs.existsSync(SETTINGS_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8")); }
  catch { return null; }
}
```

### EVENT_HANDLERS Map Pattern
Heartbeat's `buildEvent()` dispatches via a declarative handler map instead of a switch statement:
```javascript
const EVENT_HANDLERS = {
  SessionStart: (h) => ({ evt: "session_start", ... }),
  PostToolUse:  (h) => ({ evt: "tool", ... }),
  // ...
};
function buildEvent(hook) {
  const handler = EVENT_HANDLERS[hook.hook_event_name];
  if (!handler) return null;
  return { ts: new Date().toISOString(), sid: hook.session_id, ...handler(hook) };
}
```

### Notification Scrubbing (New in M8)
The Notification event handler now scrubs sensitive data from message fields:
```javascript
Notification: (h) => ({ evt: "notification", data: { message: scrubSecrets(h.message), title: h.title } }),
```

### Synchronous File I/O
All CLI file operations use synchronous APIs (`readFileSync`, `writeFileSync`, `copyFileSync`, `existsSync`). Acceptable for a CLI tool that runs briefly and exits.

### Content-Based Diffing
`doInstall({ update: true })` compares file contents (after EOL normalization) before copying — only overwrites files that actually changed. Prevents unnecessary git diffs.

### Defensive File Creation
Init functions use `{ flag: "wx" }` (exclusive create) to never overwrite existing user content during initialization. If a file exists, it logs "already exists — skipping."

### Backup-on-Conflict
When updating `~/.claude/CLAUDE.md`, if the content has been customized (differs from template), the existing file is backed up with a timestamp suffix before overwriting.

### Project Registry
`~/.claude/.gsd-t-projects` is a newline-delimited file of absolute paths to registered GSD-T projects. Used by `update-all` to propagate changes (like the Destructive Action Guard) to all projects.

### Heartbeat Event Sourcing
Claude Code hook events are captured as append-only JSONL with structured schemas. Each event type produces a standardized record with timestamp, session ID, event type, and type-specific data. Tool usage is summarized (file paths shortened, command strings truncated to 150 chars, secrets scrubbed). Cleanup is gated to SessionStart events only (not every PostToolUse).

### Contract-as-Specification
`.gsd-t/contracts/` files serve as the single source of truth for inter-domain interfaces. The QA agent generates test skeletons directly from these contracts, establishing a contract -> test -> implementation pipeline.

### Agent-Per-Phase Orchestration
The wave command spawns an independent Task agent for each phase, giving each a fresh ~200K token context window. State handoff occurs exclusively through `.gsd-t/` files. The orchestrator performs an integrity check on progress.md before proceeding (verifying Status, Milestone, and Domains table fields).

### QA Agent as Cross-Cutting Concern
The QA agent (`commands/gsd-t-qa.md`) is spawned as a teammate within 10 phases. Its behavior is phase-dependent. It has explicit file-path boundaries, multi-framework detection (Playwright, Jest, Vitest, node:test, pytest), a Document Ripple section, and standardized communication protocol. QA failure blocks phase completion.

### prepublishOnly Gate (New in M8)
`package.json` includes `"prepublishOnly": "npm test"` which runs the full test suite before every `npm publish`. This prevents publishing broken releases.

## Architecture Concerns

### Resolved Since Scan #4 (12 items via M8)

All scan #4 tech debt items were resolved through Milestone 8 (Housekeeping + Contract Sync):

| Concern from Scan #4 | Resolution | TD ID |
|----------------------|------------|-------|
| progress.md Status ACTIVE not recognized by wave | Status field contract-compliant | TD-044 |
| CHANGELOG.md missing M4-M7 entries | Added entries for v2.23.1-v2.24.3 | TD-045 |
| Orphaned domain directories (cli-quality, cmd-cleanup) | Deleted | TD-046 |
| progress-file-format.md too sparse | Enriched with lifecycle, valid statuses, header block | TD-047 |
| CLAUDE.md version reference stale (hardcoded) | Removed hardcoded version, references package.json | TD-048 |
| Git line-ending renormalize needed | Ran git add --renormalize | TD-049 |
| Inline settings.json parsing duplicated 3x | Extracted readSettingsJson() | TD-050 |
| No prepublishOnly in package.json | Added `"prepublishOnly": "npm test"` | TD-051 |
| Notification events not scrubbed in heartbeat | Added scrubSecrets() to Notification handler | TD-052 |
| wave-phase-sequence.md outdated (missing discuss-skip, integrity) | Rewritten with full M5/M7 additions | TD-053 |
| command-interface-contract.md misnamed | Renamed to backlog-command-interface.md | TD-054 |
| integration-points.md stale from M1 | Rewritten with current state + history | TD-055 |

### Accepted Risk

#### TD-029: TOCTOU Race in Symlink Check + Write (LOW)
- **Location**: `bin/gsd-t.js` — all `isSymlink()` callers
- **Description**: Time-of-check-time-of-use gap between `isSymlink()` and `writeFileSync`. A symlink could be created between the check and the write.
- **Impact**: Theoretical — requires attacker with write access to user's directories at precisely the right moment. Low ROI fix for a CLI tool.
- **Status**: Accepted as risk in M8. 5-point rationale documented: (1) requires local attacker, (2) attacker already has write access, (3) no escalation path, (4) Node.js lacks O_NOFOLLOW support, (5) CLI is not a security boundary.
- **Revisit**: If GSD-T becomes a service or daemon rather than a CLI tool.

### Standing Architectural Observations

#### CLI Size (1299 lines, single file)
`bin/gsd-t.js` exceeds the project's 200-line file limit. Since this is the only executable code file, splitting would add complexity (module resolution, import management) for questionable benefit. The zero-dependency constraint makes module splitting awkward. All 81 functions are <= 30 lines and well-organized by section.

#### Four-File Synchronization Requirement
Any command addition or change requires updating 4 reference files (`README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`). This is a manual process enforced by Pre-Commit Gate (not automated). However, the command count test assertions (`test/filesystem.test.js` lines 271-281) catch count drift automatically.

#### Pre-Commit Gate is Unenforced
The Pre-Commit Gate is a mental checklist in CLAUDE.md, not a git hook or CI check. Its effectiveness depends on Claude following the instructions. No programmatic enforcement exists.

#### CLAUDE.md Merge Risk
When a user's `~/.claude/CLAUDE.md` exists without GSD-T content, the installer appends GSD-T config. The detection heuristic (`includes("GSD-T: Contract-Driven Development")`) could fail if the marker text is modified, potentially causing duplicate sections.

#### Heartbeat File Growth
Heartbeat JSONL files auto-cleanup after 7 days, but during active development sessions, they can grow unbounded within that window. No per-file size limit exists.

#### Wave Orchestrator Has No Rollback
If a phase agent fails midway, the orchestrator can detect that status was not updated in `progress.md`, but cannot roll back partial changes. Recovery is `gsd-t-resume`, which picks up from the last completed phase — work from the failed agent is left in place.

#### Contract-to-Test Mapping is One-Way
The QA agent generates tests FROM contracts, but there is no mechanism to detect when a contract changes and automatically regenerate tests. The test-sync command covers code-to-test alignment but not contract-to-test alignment.

#### progress.md Decision Log Size
The Decision Log in `.gsd-t/progress.md` grows monotonically (currently ~170 entries). For long-running projects, this could cause context window pressure when commands read progress.md. No archival or truncation mechanism exists for log entries (only milestone archives remove domain/contract data).

## Changes Since Scan #4

### New/Modified in M8

**New function**: `readSettingsJson()` in `bin/gsd-t.js` (line 1106) — centralized settings.json parser replacing 3 inline JSON.parse calls.

**Modified files**:
- `bin/gsd-t.js` — added `readSettingsJson()`, updated `configureHeartbeatHooks()`, `showStatusTeams()`, `checkDoctorSettings()` to use it. 81 functions (was 80), 49 exports (was 48).
- `scripts/gsd-t-heartbeat.js` — added `scrubSecrets()` to Notification handler (line 100).
- `package.json` — added `"prepublishOnly": "npm test"`, version bumped to 2.24.4.
- `.gsd-t/contracts/backlog-command-interface.md` — renamed from `command-interface-contract.md`.
- `.gsd-t/contracts/wave-phase-sequence.md` — rewritten with M5/M7 content (discuss-skip, integrity, security).
- `.gsd-t/contracts/integration-points.md` — rewritten with current state + history.
- `.gsd-t/contracts/progress-file-format.md` — enriched with lifecycle and valid status values.
- `CHANGELOG.md` — added entries for v2.23.1 through v2.24.3.

**Archived milestone**: `milestones/housekeeping-2026-02-18/`

**Deleted**: Orphaned domain directories `cli-quality/` and `cmd-cleanup/` from `.gsd-t/domains/`.

### Metrics Comparison

| Metric | Scan #4 (v2.24.3) | Scan #5 (v2.24.4) | Change |
|--------|-------------------|-------------------|--------|
| bin/gsd-t.js lines | 1297 | 1299 | +2 (readSettingsJson) |
| bin/gsd-t.js functions | 80 | 81 | +1 (readSettingsJson) |
| Functions > 30 lines | 0 | 0 | Stable |
| bin/gsd-t.js exports | 48 | 49 | +1 (readSettingsJson) |
| heartbeat.js exports | 5 | 5 | Stable |
| Total exports | 53 | 54 | +1 |
| Test files | 4 | 4 | Stable |
| Test count | 116 | 116 | Stable |
| Test status | All pass | All pass | Stable |
| Scripts | 3 | 3 | Stable |
| Open tech debt | 1 (TD-029) | 0 (TD-029 accepted as risk) | Resolved |
| Command files | 43 | 43 | Stable |
| Active contracts | 9 | 9 | Stable (2 renamed, 3 rewritten) |
| Archived milestones | 8 | 9 | +1 (housekeeping) |
| Version | 2.24.3 | 2.24.4 | Patch bump |
| package.json scripts | 1 (test) | 2 (test, prepublishOnly) | +1 |
