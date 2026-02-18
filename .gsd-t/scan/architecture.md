# Architecture Analysis — 2026-02-18

## Stack

- **Language**: JavaScript (Node.js >= 16), enforced via `engines` in `package.json`
- **Framework**: None — zero external npm dependencies
- **Database**: None — all state is filesystem-based (Markdown files)
- **Cache**: Update check cache at `~/.claude/.gsd-t-update-check` (JSON, 1-hour TTL)
- **Deployment**: npm registry (`@tekyzinc/gsd-t`), `bin/gsd-t.js` as CLI entry point
- **Runtime Node modules**: `fs`, `path`, `os`, `child_process` (execFileSync, spawn)
- **Current version**: 2.23.0

## Structure

```
get-stuff-done-teams/
├── bin/
│   └── gsd-t.js              — CLI installer (1300 lines, 10 subcommands)
├── commands/                  — 43 slash command files (Claude Code custom commands)
│   ├── gsd-t-*.md            — 39 GSD-T workflow commands (was 38, added gsd-t-qa.md)
│   ├── gsd.md                — Smart router (semantic intent → command dispatch)
│   ├── branch.md             — Git branch helper
│   ├── checkin.md            — Auto-version + commit/push helper
│   └── Claude-md.md          — Reload CLAUDE.md directives
├── scripts/                   — 2 hook/utility scripts
│   ├── gsd-t-heartbeat.js    — Claude Code hook event writer (JSONL, 202 lines)
│   └── npm-update-check.js   — Background npm version checker (28 lines)
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
│   ├── GSD-T-README.md       — Detailed command reference (ships with package)
│   ├── architecture.md       — Living architecture doc (this project)
│   ├── requirements.md       — Living requirements doc (this project)
│   ├── workflows.md          — Living workflows doc (this project)
│   └── infrastructure.md     — Living infrastructure doc (this project)
├── .gsd-t/                    — GSD-T's own state (meta: project manages itself)
│   ├── progress.md           — Project progress and decision log
│   ├── backlog-settings.md   — Backlog configuration
│   ├── techdebt.md           — Tech debt register
│   ├── contracts/            — Active domain contracts (9 files)
│   ├── domains/              — Active domain definitions
│   ├── scan/                 — Codebase analysis outputs (5 files)
│   └── milestones/           — Archived completed milestones (3 archived)
│       ├── backlog-management-system-2026-02-10/
│       ├── qa-agent-test-driven-contracts-2026-02-17/
│       └── contract-doc-alignment-2026-02-18/
├── package.json               — npm package config (v2.23.0)
├── CLAUDE.md                  — Project instructions for GSD-T itself
├── README.md                  — User-facing npm/repo documentation
├── CHANGELOG.md               — Release history
├── LICENSE                    — MIT license
└── .claude/
    └── settings.local.json   — Local Claude Code settings
```

## Architecture Pattern

**Distributed Markdown Instruction System with CLI Lifecycle Manager and Agent Orchestration**

This is not a traditional application. It is a methodology framework where:

1. **Command files** (`commands/*.md`) are the "source code" — structured instructions that Claude Code interprets as slash commands. Each is a self-contained workflow definition with no inter-command code dependencies.

2. **The CLI** (`bin/gsd-t.js`) is a lifecycle manager that handles install/update/init/status/uninstall/doctor operations. It has zero runtime involvement — once commands are installed, the CLI is not needed until the next update.

3. **State files** (`{project}/.gsd-t/`) persist across Claude Code sessions and are read/written by commands at runtime. State is human-readable Markdown, git-tracked, and session-surviving.

4. **Templates** (`templates/`) provide initial document scaffolding with `{Project Name}` and `{Date}` token replacement.

5. **Hook scripts** (`scripts/`) are async event listeners installed into Claude Code's settings.json hook system.

6. **Agent orchestration** (`commands/gsd-t-wave.md`, `commands/gsd-t-qa.md`) defines how the wave orchestrator spawns independent agents per phase, and how the QA agent is spawned as a teammate within multiple phases.

### Key Architectural Characteristics

- **No runtime code path**: The CLI installs files; Claude Code interprets them. There is no application server, no running process, no shared runtime state.
- **Self-referential**: This project uses GSD-T on itself — `.gsd-t/` coexists with the files that _define_ `.gsd-t/`.
- **Convention over configuration**: Commands follow predictable naming (`gsd-t-{verb}.md`), templates use consistent token format, state files follow documented schemas.
- **Parallel-safe by design**: Domain isolation (each domain owns distinct files) enables Claude Code Agent Teams to execute concurrently.
- **Agent-per-phase orchestration**: Wave command spawns a fresh Claude Code agent (via Task tool) for each phase, keeping each agent's context window clean and eliminating mid-wave compaction.
- **QA agent integration**: 10 command files now spawn a QA teammate to handle test generation, execution, and gap reporting.

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

### Wave Orchestrator Flow (NEW — Agent-Per-Phase Model)

```
/user:gsd-t-wave
       │
       ▼
Wave orchestrator reads .gsd-t/progress.md + CLAUDE.md (lightweight ~30KB)
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
```

Key benefits of agent-per-phase:
- Each phase agent gets a **fresh ~200K token context window**
- No context accumulation across phases
- Mid-phase compaction eliminated for standard-sized phases
- Orchestrator stays lightweight (~30KB total)
- State handoff happens through `.gsd-t/` files

### QA Agent Flow (NEW — Cross-Phase Test Coverage)

```
Phase command spawns QA teammate:
       │
       ├── Partition: Generate contract test skeletons from .gsd-t/contracts/
       ├── Plan: Generate acceptance test scenarios from domain task lists
       ├── Execute: Run tests continuously, write edge case tests
       ├── Verify: Full test audit — contract tests + coverage gaps
       ├── Quick: Write regression/feature tests, run full suite
       ├── Debug: Write regression test for bug
       ├── Integrate: Run cross-domain integration tests
       ├── Test-Sync: Audit test coverage against contracts
       ├── Complete: Final gate check — all tests must pass
       └── Wave: QA spawned within each sub-phase agent

Communication: QA → Lead via teammate message
Format: "QA: {PASS|FAIL} — {summary}. Contract tests: N/N. Gaps: {list|none}"
Blocking: QA FAIL blocks phase completion (user override available)
```

### Heartbeat Event Flow

```
Claude Code event (SessionStart, PostToolUse, SubagentStart, SubagentStop, etc.)
       │
       ▼
settings.json hook fires → node ~/.claude/scripts/gsd-t-heartbeat.js
       │
       ├── Read JSON from stdin (hook payload, max 1MB)
       ├── Validate session_id (alphanumeric only, anti-traversal)
       ├── Validate cwd is absolute, .gsd-t/ exists
       ├── Build structured event (ts, sid, evt, data)
       ├── Cleanup old heartbeat files (>7 days)
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
       │   └── Synchronous fetch → npm registry → cache result → show notice
       │
       └── Cache exists but stale (>1h)?
            └── Spawn background process (scripts/npm-update-check.js)
                └── Fetches npm registry → updates cache file
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
| `heartbeat-{sid}.jsonl` | (external analysis) | gsd-t-heartbeat.js | Append-only session events (auto-cleanup >7 days) |
| `milestones/{name}-{date}/` | status, resume | complete-milestone | Archived milestone with all contracts, domains, progress |

### Contracts Registry (9 files)

| Contract File | Owner | Key Consumers | Purpose |
|---------------|-------|---------------|---------|
| `command-interface-contract.md` | commands domain | integration domain | Backlog command names, args, promote flow |
| `file-format-contract.md` | templates domain | commands, integration | backlog.md and backlog-settings.md format |
| `backlog-file-formats.md` | framework | backlog commands | Detailed entry format, validation rules |
| `domain-structure.md` | framework | plan, execute, integrate, verify | Domain directory layout, scope/tasks/constraints format |
| `progress-file-format.md` | framework | all workflow commands | progress.md sections, status values, lifecycle |
| `pre-commit-gate.md` | framework | all committing commands | Mandatory pre-commit checklist |
| `wave-phase-sequence.md` | framework | wave, resume, status | Phase order, transition rules, gates |
| `integration-points.md` | (milestone-specific) | execute, integrate | Dependency graph, checkpoints |
| `qa-agent-contract.md` | qa-agent-spec domain | command-integration (10 commands) | QA agent spawn interface, output per phase, communication protocol |

## Key Abstractions

### Command File Pattern

Every command file (`commands/gsd-t-*.md`) follows a consistent structure:

```markdown
# GSD-T: {Name} — {Subtitle}

{Role statement: "You are..."}

## Step 1: Load State
Read: CLAUDE.md, .gsd-t/progress.md, relevant contracts

## Step 1.5: Spawn QA Agent (if applicable)
Teammate "qa": Read commands/gsd-t-qa.md ...

## Step N: {Action}
{Instructions with code blocks for team mode}

## Step N+1: Document Ripple
{List of docs to check/update}

## Step N+2: Test Verification
{Testing requirements}

## Step Final: Autonomy Behavior
Level 3: auto-advance
Level 1-2: pause for user

$ARGUMENTS
```

### QA Agent Spawn Pattern (NEW)

10 commands now include a "Step N.5: Spawn QA Agent" section:

```markdown
## Step X.5: Spawn QA Agent

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

`bin/gsd-t.js` (1300 lines) is organized into sections:

| Section | Lines (approx.) | Functions |
|---------|-----------------|-----------|
| Configuration | 23-43 | Path constants, package version |
| Guard Section | 46-65 | `GUARD_SECTION` template literal |
| Helpers | 67-296 | Logging, file ops, validation, project registry |
| Heartbeat | 309-389 | `installHeartbeat()`, `configureHeartbeatHooks()` |
| Commands | 391-466 | `installCommands()`, `installGlobalClaudeMd()` |
| Install/Update | 468-525 | `doInstall()`, `doUpdate()` |
| Init | 527-673 | `initClaudeMd()`, `initDocs()`, `initGsdtDir()`, `doInit()` |
| Status | 675-773 | `doStatus()` |
| Uninstall | 775-814 | `doUninstall()` |
| Update All | 816-981 | `updateProjectClaudeMd()`, `createProjectChangelog()`, `checkProjectHealth()`, `doUpdateAll()` |
| Doctor | 983-1103 | `checkDoctorEnvironment()`, `checkDoctorInstallation()`, `checkDoctorProject()`, `doDoctor()` |
| Register | 1105-1134 | `doRegister()` |
| Update Check | 1136-1218 | `isNewerVersion()`, `checkForUpdates()`, `showUpdateNotice()`, `doChangelog()` |
| Help | 1220-1250 | `showHelp()` |
| Main | 1252-1300 | Argument parsing, command dispatch |

## Entry Points

### CLI Entry Point (`bin/gsd-t.js`)

- **Triggers**: `npx @tekyzinc/gsd-t <command>` or global `gsd-t <command>`
- **Responsibilities**: install, update, update-all, init, register, status, uninstall, doctor, changelog, help
- **Dispatch**: Simple `switch` statement on `process.argv[2]` (line 1257)
- **Post-dispatch**: `checkForUpdates()` runs after every command (except install/update)

### Claude Code Commands (43 files in `commands/`)

- **Triggers**: User types `/user:gsd-t-{name}` or `/user:{utility-name}` in Claude Code
- **Responsibilities**: Each command defines a complete workflow phase
- **Discovery**: Claude Code auto-discovers all `.md` files in `~/.claude/commands/`
- **Breakdown**: 39 GSD-T workflow commands (`gsd-t-*.md`) + 4 utility commands (`gsd.md`, `branch.md`, `checkin.md`, `Claude-md.md`)

### Heartbeat Hook (`scripts/gsd-t-heartbeat.js`)

- **Triggers**: 9 Claude Code events (SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd)
- **Input**: JSON on stdin from Claude Code hook system
- **Output**: Appends JSONL events to `.gsd-t/heartbeat-{session_id}.jsonl`

### Background Update Check (`scripts/npm-update-check.js`)

- **Triggers**: Spawned detached by CLI when update cache is stale
- **Input**: Cache file path as argv[2]
- **Output**: Writes `{latest, timestamp}` JSON to cache file

## Error Handling

### CLI Error Handling Strategy

- **File operations**: Individual try/catch per operation with `error()` logging — continues on failure
- **Symlink defense**: Every file write checks `isSymlink()` first — refuses to follow symlinks
- **Safe file creation**: Uses `{ flag: "wx" }` (exclusive create) to avoid overwriting existing files during init
- **Version validation**: `validateVersion()` regex guards against malformed version strings
- **Project path validation**: `validateProjectPath()` checks absolute path, existence, directory status, and Unix ownership
- **Session ID validation**: `SAFE_SID = /^[a-zA-Z0-9_-]+$/` blocks path traversal in heartbeat filenames

### Command Error Handling

- Commands specify retry policies: "up to 2 fix attempts" for test failures
- Destructive Action Guard: mandatory user approval before any destructive operation
- Impact analysis gate: BLOCK verdict halts execution in wave mode
- Checkpoint verification: contract compliance checks at domain boundaries
- QA agent blocking: QA FAIL status blocks phase completion (user override available)

### Wave Error Recovery

| Failure Point | Recovery |
|---------------|----------|
| Impact BLOCK | Level 3: Spawn remediation agent, re-run impact (max 2). Level 1-2: Ask user |
| Test failures during execute | Execute agent handles internally (2 fix attempts) |
| Verify failure | Level 3: Spawn remediation agent, re-run verify (max 2). Level 1-2: Ask user |
| Phase agent fails to update status | Orchestrator stops and reports error |
| QA agent reports FAIL | Phase blocked until QA passes or user overrides |

## Cross-Cutting Concerns

### Security

- **Symlink protection**: All file writes in CLI and heartbeat check for symlinks
- **Input validation**: Project names, version strings, session IDs, and project paths are validated
- **Path traversal prevention**: Heartbeat resolves paths and verifies containment within `.gsd-t/`
- **Command injection mitigation**: Uses `execFileSync` (not `execSync`) for external commands
- **Stdin size limit**: Heartbeat caps input at 1MB to prevent OOM
- **No secrets handling**: Package stores no credentials; env var names (not values) in templates

### State Persistence

- All state in `.gsd-t/` is git-tracked Markdown — survives session loss, machine migration, and team sharing
- Heartbeat JSONL files auto-cleanup after 7 days
- Update check cache has 1-hour TTL
- Milestone archives preserve complete snapshot of contracts + domains + progress

### Documentation Synchronization

- **Pre-Commit Gate**: Mental checklist (not enforced programmatically) requiring doc updates with every commit
- **Document Ripple**: Each command specifies which documents it may affect
- **Four reference files** must stay synchronized: `README.md`, `docs/GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`

### Logging

- CLI: ANSI-colored console output via helper functions (`success()`, `warn()`, `error()`, `info()`)
- Commands: Decision Log entries in `.gsd-t/progress.md` with timestamps
- Heartbeat: Structured JSONL events per session

### Testing Strategy

- **No automated tests exist** for the CLI (`bin/gsd-t.js`) — `package.json` has `"test": "node --test"` but no test files
- **QA Agent** is the testing mechanism for _consumer projects_, not for GSD-T itself
- **Commands are validated by use** — manual CLI testing is the only verification method
- **Contract tests** defined in `gsd-t-qa.md` are generated for consumer projects' contracts, not GSD-T's own contracts

## Workflow Phase Architecture

The core GSD-T workflow is a linear pipeline with conditional branches, now orchestrated via agent-per-phase:

```
INITIALIZED
    │
    ▼
PARTITION ─── Decompose milestone into domains + contracts
    │           └── QA spawned: generate contract test skeletons
    ▼
DISCUSS ────── Explore design decisions (always pauses, even Level 3)
    │           └── Skippable (only phase that can be skipped)
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
COMPLETED ───── Archive to .gsd-t/milestones/{name}/
                ├── QA spawned: final gate check
                ├── Gap analysis gate (100% implemented)
                └── Create git tag
```

### Phase Ownership

| Phase | Mode | QA Agent | Why |
|-------|------|----------|-----|
| Partition | Solo only | YES — test skeletons | Needs full cross-domain context |
| Discuss | Solo only | No | Pauses for user input |
| Plan | Solo only | YES — acceptance scenarios | Needs full cross-domain context |
| Impact | Solo only | No | Cross-cutting analysis |
| Execute | Solo or Team | YES — continuous testing | Tasks within domains are independent |
| Test-Sync | Solo only | YES — coverage audit | Sequential verification |
| Integrate | Solo only | YES — boundary tests | Needs to see all seams |
| Verify | Solo or Team | YES — full audit | Dimensions are independent |
| Complete | Solo only | YES — final gate | Archival and tagging |

### Wave Orchestration (Agent-Per-Phase)

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
│  Each agent: fresh context window, reads state from files, dies when done   │
│  Each agent: may spawn QA teammate for testing within that phase            │
│  Orchestrator: ~30KB total, never compacts                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Patterns Observed

### Zero-Dependency CLI
Only Node.js built-ins: `fs`, `path`, `os`, `child_process`. This is intentional and enforced — CLAUDE.md explicitly states "NEVER add external npm dependencies to the installer."

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
Claude Code hook events are captured as append-only JSONL with structured schemas. Each event type produces a standardized record with timestamp, session ID, event type, and type-specific data. Tool usage is summarized (file paths shortened, command strings truncated to 150 chars).

### Contract-as-Specification
`.gsd-t/contracts/` files serve as the single source of truth for inter-domain interfaces. The QA agent generates test skeletons directly from these contracts, establishing a contract → test → implementation pipeline.

### Agent-Per-Phase Orchestration (NEW)
The wave command no longer executes phases itself. Instead it spawns an independent Task agent for each phase, giving each a fresh ~200K token context window. This eliminates context accumulation and mid-wave compaction. State handoff occurs exclusively through `.gsd-t/` files.

### QA Agent as Cross-Cutting Concern (NEW)
The QA agent (`commands/gsd-t-qa.md`) is spawned as a teammate within multiple phases. Its behavior is phase-dependent (test skeletons during partition, continuous testing during execute, full audit during verify). It follows a standardized communication protocol (`QA: {PASS|FAIL} — {summary}`) and its failure blocks phase completion.

## Architecture Concerns

### Command Count Drift (39 GSD-T + 4 utility = 43 total)
The actual `commands/` directory contains 43 files (39 `gsd-t-*` + 4 utility), but multiple reference documents still say "38 GSD-T commands + 4 utility commands (42 total)." The addition of `commands/gsd-t-qa.md` incremented the count but the following files were not updated:
- `README.md` line 21: says "38 GSD-T commands + 4 utility commands (42 total)"
- `package.json` description: says "42 slash commands"
- `CLAUDE.md` overview: says "42 slash commands (38 GSD-T workflow + 4 utility)"
- `bin/gsd-t.js` help output and command counting logic may reference stale counts

This is exactly the "four-file synchronization" problem identified in the previous scan — the manual synchronization requirement was violated during the QA Agent milestone.

### CLI Size (1300 lines, single file)
`bin/gsd-t.js` has grown from 641 lines (v1.0) to ~1300 lines. Functions are well-organized by section, but the file exceeds the project's own 200-line file limit convention. Since this is the only executable code file and the project explicitly avoids external dependencies, splitting introduces complexity for questionable benefit. This is a known, accepted deviation.

### Four-File Synchronization Requirement
Any command addition or change requires updating 4 reference files (`README.md`, `docs/GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`) plus `bin/gsd-t.js` command count logic. This is a manual process enforced only by the Pre-Commit Gate checklist — no automated validation exists. The QA Agent milestone demonstrates this is a recurring failure mode.

### Pre-Commit Gate is Unenforced
The Pre-Commit Gate is a mental checklist in CLAUDE.md, not a git hook or CI check. Its effectiveness depends entirely on Claude following the instructions. There is no programmatic enforcement.

### CLAUDE.md Merge Risk
When a user's `~/.claude/CLAUDE.md` exists without GSD-T content, the installer appends GSD-T config with a separator. If this is run multiple times or if the detection heuristic (`includes("GSD-T: Contract-Driven Development")`) fails, duplicate sections could accumulate.

### No Automated Testing
`package.json` has `"test": "node --test"` but no test files exist. The project relies on manual CLI testing and "commands are validated by use." Given the CLI's 1300 lines of file-manipulating logic, this is a gap. The QA Agent is designed to generate tests for _consumer projects_, not for GSD-T itself.

### Heartbeat File Growth
Heartbeat JSONL files auto-cleanup after 7 days, but during active development sessions, they can grow unbounded within that window. No per-file size limit exists.

### QA Agent Context Window Overhead
The QA agent is spawned as a teammate in 9 different phases. Each spawn requires the QA agent to re-read all contracts and the full `gsd-t-qa.md` instruction file. In the wave model, the QA agent is spawned within each phase agent (not by the orchestrator), so this overhead is contained within each phase's context window. However, for complex projects with many contracts, the QA agent's context consumption within a phase could be significant.

### Wave Orchestrator Has No Rollback
If a phase agent fails midway (e.g., crashes, times out), the wave orchestrator can detect that the status was not updated in `progress.md`, but it has no mechanism to roll back partial changes made by the failed agent. The only recovery is `gsd-t-resume`, which picks up from the last completed phase — any work done by the failed agent is lost or left in an inconsistent state.

### Contract → Test Mapping is One-Way
The QA agent generates tests FROM contracts, but there is no mechanism to detect when a contract changes and automatically regenerate/update the corresponding tests. If a contract is updated during execute or integrate phases, the previously generated contract test skeletons may become stale. The test-sync command covers code-to-test alignment but not contract-to-test alignment.
