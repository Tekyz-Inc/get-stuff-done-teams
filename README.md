# GSD-T: Contract-Driven Development for Claude Code

A methodology for reliable, parallelizable development using Claude Code with optional Agent Teams support.

**Solves context rot** — the quality degradation that happens as Claude fills its context window.
**Enables parallel execution** — contract-driven domains can be worked on simultaneously.
**Maintains test coverage** — automatically keeps tests aligned with code changes.
**Catches downstream effects** — analyzes impact before changes break things.
**Protects existing work** — destructive action guard prevents schema drops, architecture replacements, and data loss without explicit approval.

---

## Quick Start

### Install with npm

```bash
npx @tekyzinc/gsd-t install
```

This installs 32 GSD-T commands + 3 utility commands to `~/.claude/commands/` and the global CLAUDE.md to `~/.claude/CLAUDE.md`. Works on Windows, Mac, and Linux.

### Start Using It

```bash
# 1. Start Claude Code in your project
cd my-project
claude

# 2. Need help articulating your idea?
/user:gsd-t-prompt

# 3. Initialize GSD-T
/user:gsd-t-init my-project

# 4. Define what you're building
/user:gsd-t-milestone "User Authentication System"

# 5. Let it rip (auto-advances through all phases)
/user:gsd-t-wave

# Or go phase by phase for more control:
/user:gsd-t-partition
/user:gsd-t-discuss
/user:gsd-t-plan
/user:gsd-t-impact
/user:gsd-t-execute
/user:gsd-t-test-sync
/user:gsd-t-integrate
/user:gsd-t-verify
/user:gsd-t-complete-milestone
```

### Resuming After a Break

```bash
claude
/user:gsd-t-resume
```

GSD-T reads all state files and tells you exactly where you left off.

---

## CLI Commands

```bash
npx @tekyzinc/gsd-t install        # Install commands + global CLAUDE.md
npx @tekyzinc/gsd-t update         # Update global commands + CLAUDE.md
npx @tekyzinc/gsd-t update-all     # Update globally + all registered project CLAUDE.md files
npx @tekyzinc/gsd-t init [name]    # Scaffold GSD-T project (auto-registers)
npx @tekyzinc/gsd-t register       # Register current directory as a GSD-T project
npx @tekyzinc/gsd-t status         # Check installation + version
npx @tekyzinc/gsd-t doctor         # Diagnose common issues
npx @tekyzinc/gsd-t uninstall      # Remove commands (keeps project files)
```

### Updating

When a new version is published:
```bash
npx @tekyzinc/gsd-t@latest update
```

This will replace changed command files, back up your CLAUDE.md if customized, and track the installed version.

---

## Commands Reference

### Help & Onboarding

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-help` | List all commands with descriptions |
| `/user:gsd-t-help {cmd}` | Detailed help for specific command |
| `/user:gsd-t-prompt` | Help formulate your idea before committing |
| `/user:gsd-t-brainstorm` | Creative exploration and idea generation |

### Project Initialization

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-setup` | Generate or restructure project CLAUDE.md |
| `/user:gsd-t-init` | Initialize GSD-T structure in project |
| `/user:gsd-t-project` | Full project → milestone roadmap |
| `/user:gsd-t-feature` | Major feature → impact analysis + milestones |
| `/user:gsd-t-scan` | Deep codebase analysis → techdebt.md |
| `/user:gsd-t-promote-debt` | Convert techdebt items to milestones |
| `/user:gsd-t-populate` | Auto-populate docs from existing codebase |

### Milestone Workflow

| Command | Purpose | Auto-Invoked |
|---------|---------|--------------|
| `/user:gsd-t-milestone` | Define new milestone | No |
| `/user:gsd-t-partition` | Decompose into domains + contracts | In wave |
| `/user:gsd-t-discuss` | Multi-perspective design exploration | In wave |
| `/user:gsd-t-plan` | Create atomic task lists per domain | In wave |
| `/user:gsd-t-impact` | Analyze downstream effects | In wave (plan→execute) |
| `/user:gsd-t-execute` | Run tasks (solo or team) | In wave |
| `/user:gsd-t-test-sync` | Sync tests with code changes | In wave (during execute + verify) |
| `/user:gsd-t-integrate` | Wire domains together | In wave |
| `/user:gsd-t-verify` | Run quality gates | In wave |
| `/user:gsd-t-complete-milestone` | Archive + git tag | In wave (after verify) |

### Automation & Utilities

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-wave` | Full cycle, auto-advances all phases |
| `/user:gsd-t-status` | Cross-domain progress view |
| `/user:gsd-t-resume` | Restore context, continue |
| `/user:gsd-t-quick` | Fast task with GSD-T guarantees |
| `/user:gsd-t-debug` | Systematic debugging with state |

### Backlog Management

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-backlog-add` | Capture item, auto-categorize, append to backlog |
| `/user:gsd-t-backlog-list` | Filtered, ordered view of backlog items |
| `/user:gsd-t-backlog-move` | Reorder items by position (priority) |
| `/user:gsd-t-backlog-edit` | Modify backlog entry fields |
| `/user:gsd-t-backlog-remove` | Drop item with optional reason |
| `/user:gsd-t-backlog-promote` | Refine, classify, launch GSD-T workflow |
| `/user:gsd-t-backlog-settings` | Manage types, apps, categories, defaults |

### Git Helpers

| Command | Purpose |
|---------|---------|
| `/user:branch` | Create and switch to a new git branch |
| `/user:checkin` | Auto-bump version, stage, commit, and push |
| `/user:Claude-md` | Reload CLAUDE.md directives mid-session |

---

## Workflow Phases

| Phase | Purpose | Solo/Team |
|-------|---------|-----------|
| **Prompt** | Formulate idea (pre-workflow) | Solo |
| **Project/Feature/Scan** | Initialize work | Solo (team for large scans) |
| **Milestone** | Define deliverable | Solo |
| **Partition** | Decompose into domains + contracts | Solo |
| **Discuss** | Explore design decisions | Both |
| **Plan** | Create atomic task lists | Solo (always) |
| **Impact** | Downstream effect analysis | Solo |
| **Execute** | Build it | Both |
| **Test-Sync** | Maintain test coverage | Solo |
| **Integrate** | Wire domains together | Solo (always) |
| **Verify** | Quality gates | Both |
| **Complete** | Archive + tag | Solo |

---

## Entry Points

- **"I have an idea"** → `gsd-t-project` → milestone roadmap → partition → execute
- **"I have a codebase and need to add something"** → `gsd-t-feature` → impact analysis → milestones
- **"I have a codebase and need to understand/fix it"** → `gsd-t-scan` → techdebt.md → promote to milestones

---

## Project Structure (What GSD-T Creates)

```
your-project/
├── CLAUDE.md
├── docs/
│   ├── requirements.md                # Functional + technical requirements
│   ├── architecture.md                # System design, components, data flow
│   ├── workflows.md                   # User journeys, technical processes
│   └── infrastructure.md             # Dev setup, DB, cloud, deployment
├── .gsd-t/
│   ├── progress.md                    # Master state file
│   ├── backlog.md                    # Captured backlog items (priority ordered)
│   ├── backlog-settings.md           # Types, apps, categories, defaults
│   ├── roadmap.md                     # Milestone roadmap
│   ├── techdebt.md                    # Technical debt register
│   ├── verify-report.md               # Latest verification results
│   ├── impact-report.md               # Downstream effect analysis
│   ├── test-coverage.md               # Test sync report
│   ├── contracts/
│   │   ├── api-contract.md
│   │   ├── schema-contract.md
│   │   ├── component-contract.md
│   │   └── integration-points.md
│   ├── domains/
│   │   └── {domain-name}/
│   │       ├── scope.md
│   │       ├── tasks.md
│   │       └── constraints.md
│   ├── milestones/                    # Archived completed milestones
│   │   └── {milestone-name}-{date}/
│   └── scan/                          # Codebase analysis outputs
└── src/
```

---

## Key Principles

1. **Contracts are the source of truth.** Code implements contracts, not the other way around.
2. **Domains own files exclusively.** No two domains should modify the same file.
3. **Impact before execution.** Always analyze downstream effects before making changes.
4. **Tests stay synced.** Every code change triggers test analysis.
5. **State survives sessions.** Everything is in `.gsd-t/`.
6. **Plan is single-brain, execute is multi-brain.** Planning and integration always solo; execution and verification can parallelize.
7. **Every decision is logged.** The Decision Log captures why, not just what.

---

## Enabling Agent Teams

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Teams are optional — all commands work in solo mode.

---

## Manual Installation (without npm)

```bash
# Windows
copy commands\*.md %USERPROFILE%\.claude\commands\

# Mac/Linux
cp commands/*.md ~/.claude/commands/
```

Verify with: `/user:gsd-t-help`

---

## Repo Contents

```
get-stuff-done-teams/
├── README.md
├── package.json
├── LICENSE
├── bin/
│   └── gsd-t.js                       # CLI installer
├── commands/                          # 35 slash commands
│   ├── gsd-t-*.md                     # 32 GSD-T workflow commands
│   ├── branch.md                      # Git branch helper
│   ├── checkin.md                     # Auto-version + commit/push helper
│   └── Claude-md.md                   # Reload CLAUDE.md directives
├── templates/                         # Document templates
│   ├── CLAUDE-global.md
│   ├── CLAUDE-project.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── workflows.md
│   ├── infrastructure.md
│   ├── progress.md
│   ├── backlog.md
│   └── backlog-settings.md
├── examples/
│   ├── settings.json
│   └── .gsd-t/
├── docs/
│   ├── GSD-T-README.md                # Detailed methodology + usage guide
│   └── methodology.md
```

---

## License

MIT
