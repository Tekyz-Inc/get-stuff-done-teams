# Architecture Analysis — 2026-02-18

## Stack

- **Language**: JavaScript (Node.js >= 16), enforced via `engines` in `package.json`
- **Framework**: None — zero external npm dependencies
- **Database**: None — all state is filesystem-based (Markdown files)
- **Cache**: Update check cache at `~/.claude/.gsd-t-update-check` (JSON, 1-hour TTL)
- **Deployment**: npm registry (`@tekyzinc/gsd-t`), `bin/gsd-t.js` as CLI entry point
- **Runtime Node modules**: `fs`, `path`, `os`, `child_process` (execFileSync, spawn)
- **Current version**: 2.21.1

## Structure

```
get-stuff-done-teams/
├── bin/
│   └── gsd-t.js              — CLI installer (1300 lines, 10 subcommands)
├── commands/                  — 42 slash command files (Claude Code custom commands)
│   ├── gsd-t-*.md            — 38 GSD-T workflow commands
│   ├── gsd.md                — Smart router (semantic intent → command dispatch)
│   ├── branch.md             — Git branch helper
│   ├── checkin.md            — Auto-version + commit/push helper
│   └── Claude-md.md          — Reload CLAUDE.md directives
├── scripts/                   — 2 hook/utility scripts
│   ├── gsd-t-heartbeat.js    — Claude Code hook event writer (JSONL)
│   └── npm-update-check.js   — Background npm version checker
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
│   └── GSD-T-README.md       — Detailed command reference
├── .gsd-t/                    — GSD-T's own state (meta: project manages itself)
│   ├── progress.md           — Project progress and decision log
│   ├── backlog.md            — Backlog items
│   ├── backlog-settings.md   — Backlog configuration
│   ├── techdebt.md           — Tech debt register
│   ├── contracts/            — Active domain contracts (8 files)
│   ├── domains/              — Active domain definitions (empty between milestones)
│   ├── scan/                 — Codebase analysis outputs (4 files)
│   └── milestones/           — Archived completed milestones
│       └── backlog-management-system-2026-02-10/
├── package.json               — npm package config (v2.21.1)
├── CLAUDE.md                  — Project instructions for GSD-T itself
├── README.md                  — User-facing npm/repo documentation
├── CHANGELOG.md               — Release history
├── LICENSE                    — MIT license
└── .gitignore                 — OS, editor, node_modules exclusions
```

## Architecture Pattern

**Distributed Markdown Instruction System with CLI Lifecycle Manager**

This is not a traditional application. It is a methodology framework where:

1. **Command files** (`commands/*.md`) are the "source code" — they contain structured instructions that Claude Code interprets as slash commands. Each is a self-contained workflow definition with no inter-command code dependencies.

2. **The CLI** (`bin/gsd-t.js`) is a lifecycle manager that handles install/update/init/status/uninstall/doctor operations. It has zero runtime involvement — once commands are installed, the CLI is not needed until the next update.

3. **State files** (`{project}/.gsd-t/`) persist across Claude Code sessions and are read/written by commands at runtime. State is human-readable Markdown, git-tracked, and session-surviving.

4. **Templates** (`templates/`) provide initial document scaffolding with `{Project Name}` and `{Date}` token replacement.

5. **Hook scripts** (`scripts/`) are async event listeners installed into Claude Code's settings.json hook system.

### Key Architectural Characteristics

- **No runtime code path**: The CLI installs files; Claude Code interprets them. There is no application server, no running process, no shared runtime state.
- **Self-referential**: This project uses GSD-T on itself — `.gsd-t/` coexists with the files that _define_ `.gsd-t/`.
- **Convention over configuration**: Commands follow predictable naming (`gsd-t-{verb}.md`), templates use consistent token format, state files follow documented schemas.
- **Parallel-safe by design**: Domain isolation (each domain owns distinct files) enables Claude Code Agent Teams to execute concurrently.

## Data Flow

### Installation Flow

```
npm install @tekyzinc/gsd-t
       │
       ▼
bin/gsd-t.js install
       │
       ├── Copy commands/*.md → ~/.claude/commands/
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
       ├── Step 2-N: Execute workflow logic (analyze, generate, modify files)
       ├── Pre-Commit Gate: Update all affected docs before committing
       └── Final: Update .gsd-t/progress.md with decision log entry
```

### Heartbeat Event Flow

```
Claude Code event (SessionStart, PostToolUse, etc.)
       │
       ▼
settings.json hook fires → node ~/.claude/scripts/gsd-t-heartbeat.js
       │
       ├── Read JSON from stdin (hook payload)
       ├── Validate session_id (alphanumeric only, anti-traversal)
       ├── Build structured event (ts, sid, evt, data)
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
| **Global** | `~/.claude/CLAUDE.md` | CLI install | Framework defaults: autonomy rules, code standards, pre-commit gate, naming conventions, workflow preferences |
| **Project** | `{cwd}/CLAUDE.md` | CLI init or gsd-t-init command | Project-specific: tech stack, branch guard, conventions, deployed URLs, overrides of global defaults |
| **State** | `{cwd}/.gsd-t/` | gsd-t-init, then commands | Live state: progress.md (master), contracts/, domains/, backlog, scan results, impact/verify reports |

### State Files Schema

| File | Read By | Written By | Content |
|------|---------|------------|---------|
| `progress.md` | All commands | Most commands | Project name, version, status, milestones table, domains table, decision log, session log |
| `contracts/*.md` | execute, integrate, verify, quick, resume | partition, execute, integrate | API shapes, schema definitions, component interfaces, integration points |
| `domains/{name}/scope.md` | execute, quick | partition | File ownership, responsibilities, exclusions |
| `domains/{name}/tasks.md` | execute, status, resume | plan, execute | Task list with completion status |
| `domains/{name}/constraints.md` | execute | partition | Patterns to follow, boundaries |
| `backlog.md` | backlog-list, status | backlog-add, backlog-edit, backlog-move, backlog-remove | Priority-ordered backlog entries |
| `backlog-settings.md` | backlog-add, backlog-edit, backlog-settings | backlog-settings, init | Types, apps, categories, defaults |
| `techdebt.md` | promote-debt, scan, milestone | scan | Prioritized tech debt register |
| `scan/*.md` | scan (synthesis step), setup | scan (teammates) | Architecture, business rules, security, quality findings |
| `impact-report.md` | wave, execute | impact | Downstream effect analysis |
| `verify-report.md` | complete-milestone, wave | verify | Quality gate results |
| `milestones/{name}-{date}/` | status, resume | complete-milestone | Archived milestone with all contracts, domains, progress |

## Key Abstractions

### Command File Pattern

Every command file (`commands/gsd-t-*.md`) follows a consistent structure:

```markdown
# GSD-T: {Name} — {Subtitle}

{Role statement: "You are..."}

## Step 1: Load State
Read: CLAUDE.md, .gsd-t/progress.md, relevant contracts

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

### Claude Code Commands (42 files in `commands/`)

- **Triggers**: User types `/user:gsd-t-{name}` or `/user:{utility-name}` in Claude Code
- **Responsibilities**: Each command defines a complete workflow phase
- **Discovery**: Claude Code auto-discovers all `.md` files in `~/.claude/commands/`

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
- **Four reference files** must stay synchronized: `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`

### Logging

- CLI: ANSI-colored console output via helper functions (`success()`, `warn()`, `error()`, `info()`)
- Commands: Decision Log entries in `.gsd-t/progress.md` with timestamps
- Heartbeat: Structured JSONL events per session

## Workflow Phase Architecture

The core GSD-T workflow is a linear pipeline with conditional branches:

```
INITIALIZED
    │
    ▼
PARTITION ─── Decompose milestone into domains + contracts
    │
    ▼
DISCUSS ────── Explore design decisions (always pauses, even Level 3)
    │
    ▼
PLAN ────────── Create atomic task lists per domain
    │
    ▼
IMPACT ──────── Analyze downstream effects (BLOCK → remediate → re-check)
    │
    ▼
EXECUTE ─────── Run tasks (solo or team mode)
    │              └── test-sync after each task
    ▼
TESTS_SYNCED ── Full test coverage analysis
    │
    ▼
INTEGRATED ──── Wire domains at boundaries
    │
    ▼
VERIFIED ────── Quality gates pass
    │
    ▼
COMPLETED ───── Archive to .gsd-t/milestones/{name}/
                Create git tag
```

### Phase Ownership

| Phase | Mode | Why |
|-------|------|-----|
| Partition | Solo only | Needs full cross-domain context |
| Discuss | Solo only | Pauses for user input |
| Plan | Solo only | Needs full cross-domain context |
| Impact | Solo only | Cross-cutting analysis |
| Execute | Solo or Team | Tasks within domains are independent |
| Test-Sync | Solo only | Sequential verification |
| Integrate | Solo only | Needs to see all seams |
| Verify | Solo or Team | Dimensions are independent |
| Complete | Solo only | Archival and tagging |

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

## Architecture Concerns

### CLI Size (1300 lines, single file)
`bin/gsd-t.js` has grown from 641 lines (v1.0) to 1300 lines. Functions are well-organized by section, but the file is beyond the project's own 200-line file limit convention. However, since this is the only executable code file and the project explicitly avoids external dependencies, splitting introduces complexity for questionable benefit.

### Four-File Synchronization Requirement
Any command addition or change requires updating 4 reference files (`README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`) plus `bin/gsd-t.js` command count logic. This is a manual process enforced only by the Pre-Commit Gate checklist — no automated validation exists.

### Pre-Commit Gate is Unenforced
The Pre-Commit Gate is a mental checklist in CLAUDE.md, not a git hook or CI check. Its effectiveness depends entirely on Claude following the instructions. There is no programmatic enforcement.

### CLAUDE.md Merge Risk
When a user's `~/.claude/CLAUDE.md` exists without GSD-T content, the installer appends GSD-T config with a separator. If this is run multiple times or if the detection heuristic (`includes("GSD-T: Contract-Driven Development")`) fails, duplicate sections could accumulate.

### No Automated Testing
`package.json` has `"test": "node --test"` but no test files exist. The project relies on manual CLI testing and "commands are validated by use." Given the CLI's 1300 lines of file-manipulating logic, this is a gap.

### Template CLAUDE-global.md Not Included in Templates Count
The `templates/` directory contains 9 files, but CLAUDE.md (project) incorrectly references "7 templates" and the README references "9 templates" — these counts have drifted over time.

### Heartbeat File Growth
Heartbeat JSONL files auto-cleanup after 7 days, but during active development sessions, they can grow unbounded within that window. No per-file size limit exists.
