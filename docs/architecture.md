# Architecture — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18 (Post-M13, Scan #6)

## System Overview

GSD-T is an npm-distributed methodology framework for Claude Code. It provides slash commands (markdown files), a CLI installer (Node.js), and document templates that together enable contract-driven development with AI assistance.

The framework has no runtime — it is consumed entirely by Claude Code's slash command system and the user's shell. The CLI handles installation, updates, and diagnostics. The command files define the workflow methodology that Claude Code follows.

**Architecture Pattern**: Distributed Markdown Instruction System with CLI Lifecycle Manager. Command files are the "source code" interpreted by Claude Code. The CLI is a lifecycle manager (install/update/init/status/doctor/uninstall). State files persist across sessions as git-tracked Markdown.

## Components

### CLI Installer (bin/gsd-t.js)
- **Purpose**: Install, update, diagnose, and manage GSD-T across projects
- **Location**: `bin/gsd-t.js` (1,438 lines, 81+ functions, all ≤ 30 lines)
- **Dependencies**: Node.js built-ins only (fs, path, os, child_process, https)
- **Subcommands**: install, update, status, doctor, init, uninstall, update-all, register, changelog
- **Organization**: Configuration → Guard section → Helpers → Heartbeat → Commands → Install/Update → Init → Status → Uninstall → Update-All → Doctor → Register → Update Check → Help → Main dispatch
- **All functions ≤ 30 lines** (M6 refactoring). Largest: `doRegister()` at 30 lines, `summarize()` at 30 lines.

### Slash Commands (commands/*.md)
- **Purpose**: Define the GSD-T methodology as executable workflows for Claude Code
- **Location**: `commands/`
- **Count**: 45 (41 GSD-T workflow + 4 utility: gsd, branch, checkin, Claude-md) — includes gsd-t-health and gsd-t-pause added in M13
- **Format**: Pure markdown with step-numbered instructions, team mode blocks, document ripple sections, and $ARGUMENTS terminator

### Templates (templates/*.md)
- **Purpose**: Starter files for project initialization
- **Location**: `templates/`
- **Count**: 9 (CLAUDE-global, CLAUDE-project, requirements, architecture, workflows, infrastructure, progress, backlog, backlog-settings)
- **Tokens**: `{Project Name}` and `{Date}` replaced during init via `applyTokens()`

### Hook Scripts (scripts/)
- **gsd-t-heartbeat.js** (181 lines, 6 functions, 5 exports): Real-time event logging via Claude Code hooks. Captures 9 event types as structured JSONL. Input capped at 1MB. Session ID validated. Path traversal protection. Secret scrubbing via `scrubSecrets()`/`scrubUrl()` (M5). Notification message + title scrubbing (M8/M9). EVENT_HANDLERS map pattern (M6). Auto-cleanup after 7 days (SessionStart only, M6).
- **npm-update-check.js** (43 lines): Background npm registry version checker. Spawned detached by CLI when update cache is stale. Path validation within `~/.claude/` (M5). Symlink check before write (M5). 1MB response limit (M5).
- **gsd-t-fetch-version.js** (26 lines, NEW in M6): Synchronous npm registry fetch. Called by `fetchVersionSync()` via `execFileSync`. HTTPS-only, 5s timeout, 1MB limit. Silent failure on errors (caller validates).
- **gsd-t-tools.js** (163 lines, NEW in M13): State utility CLI returning compact JSON. Subcommands: state get/set (progress.md), validate (required file presence), parse progress --section, list domains/contracts, git pre-commit-check, template scope/tasks. Zero external dependencies. NOTE: No module.exports — untestable as module (TD-066).
- **gsd-t-statusline.js** (94 lines, NEW in M13): Context usage bar + project state for Claude Code `statusLine` setting. Reads CLAUDE_CONTEXT_TOKENS_USED/MAX env vars for usage percentage. Color-coded bar (green <50%, yellow <70%, orange <85%, red ≥85%). NOTE: No module.exports — untestable as module (TD-066).

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

## Known Architecture Concerns

1. **CLI single-file size**: bin/gsd-t.js at 1,438 lines exceeds the 200-line convention, but splitting adds complexity for questionable benefit given zero-dependency constraint. Accepted deviation.
2. **Four-file synchronization**: Any command change requires updating README, GSD-T-README, CLAUDE-global template, and gsd-t-help. Manual process — no automated validation.
3. **Pre-Commit Gate unenforced**: Mental checklist in CLAUDE.md, not a git hook or CI check.
4. **Progress.md Decision Log growth**: Unbounded append-only log. May need periodic archival strategy for long-lived projects.
