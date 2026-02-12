# GSD-T: Contract-Driven Development for Claude Code

A methodology for reliable, parallelizable development using Claude Code with optional Agent Teams support.

## What It Does

**Solves context rot** — the quality degradation that happens as Claude fills its context window.

**Enables parallel execution** — contract-driven domains can be worked on simultaneously.

**Maintains test coverage** — automatically keeps tests aligned with code changes.

**Catches downstream effects** — analyzes impact before changes break things.

---

## Quick Start

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

## Resuming After a Break

```bash
claude
/user:gsd-t-resume
```

GSD-T reads all state files and tells you exactly where you left off.

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
| `/user:gsd-t-version-update` | Update GSD-T to latest version |
| `/user:gsd-t-version-update-all` | Update GSD-T + all registered projects |
| `/user:gsd-t-debug` | Systematic debugging with state |

---

## Workflow Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GSD-T Wave Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  milestone → partition → discuss → plan → impact → execute → test-sync     │
│                                              │         │                    │
│                                              │         └──────┐             │
│                                              │                ▼             │
│                                              │    ┌───────────────────┐     │
│                                              │    │ (runs after each  │     │
│                                              │    │  task + at verify)│     │
│                                              │    └───────────────────┘     │
│                                              ▼                              │
│  complete-milestone ◄── verify ◄── integrate ◄──────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

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

## Project Structure

```
your-project/
├── CLAUDE.md                          # Project conventions + GSD-T reference
├── docs/
│   ├── requirements.md                # Functional + technical requirements
│   ├── architecture.md                # System design, components, data flow
│   ├── workflows.md                   # User journeys, technical processes
│   └── infrastructure.md             # Dev setup, DB, cloud, deployment
├── .gsd-t/
│   ├── progress.md                    # Master state file
│   ├── roadmap.md                     # Milestone roadmap
│   ├── techdebt.md                    # Technical debt register
│   ├── verify-report.md               # Latest verification results
│   ├── impact-report.md               # Downstream effect analysis
│   ├── test-coverage.md               # Test sync report
│   ├── contracts/
│   │   ├── api-contract.md            # API endpoint specifications
│   │   ├── schema-contract.md         # Database/data model specs
│   │   ├── component-contract.md      # UI component interfaces
│   │   └── integration-points.md      # Dependency graph + checkpoints
│   ├── domains/
│   │   └── {domain-name}/
│   │       ├── scope.md               # What this domain owns
│   │       ├── tasks.md               # Atomic task list
│   │       └── constraints.md         # Rules and boundaries
│   ├── milestones/                    # Archived completed milestones
│   │   └── {milestone-name}-{date}/
│   │       ├── summary.md
│   │       ├── progress.md
│   │       ├── verify-report.md
│   │       ├── contracts/
│   │       └── domains/
│   └── scan/                          # Codebase analysis outputs
│       ├── architecture.md
│       ├── business-rules.md
│       ├── security.md
│       └── quality.md
└── src/
```

---

## Key Principles

1. **Contracts are the source of truth.** Code implements contracts, not the other way around. If code and contract disagree, fix one or the other — never leave them inconsistent.

2. **Domains own files exclusively.** No two domains should modify the same file. If they need shared state, that's a contract.

3. **Impact before execution.** Always analyze downstream effects before making changes. Surprises are expensive.

4. **Tests stay synced.** Every code change triggers test analysis. Gaps are caught immediately, not in production.

5. **State survives sessions.** Everything is in `.gsd-t/`. A fresh Claude Code session can resume from any point by reading the state files.

6. **Plan is single-brain, execute is multi-brain.** Planning, impact analysis, and integration require full context (always solo). Execution and verification can parallelize.

7. **Every decision is logged.** The Decision Log in progress.md captures why, not just what. Future sessions don't need to re-derive decisions.

---

## Enabling Agent Teams

Agent Teams is an experimental feature. Enable it:

```bash
# Environment variable
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Or in settings.json
{ "experimental": { "agentTeams": true } }
```

Teams are optional — all commands work in solo mode without teams enabled.

### When to Use Teams

- 3+ domains with independent starting work
- Codebase scanning and feature impact analysis
- Complex design questions with multiple viable approaches
- Verification of large milestones
- Debugging cross-domain issues

---

## Installation

Copy all `.md` files from this package to `~/.claude/commands/`:

```bash
# Windows
copy *.md %USERPROFILE%\.claude\commands\

# Mac/Linux
cp *.md ~/.claude/commands/
```

Verify with: `/user:gsd-t-help`

---

## Configuration

GSD-T respects your project's `CLAUDE.md` for conventions and autonomy level.

### Autonomy Levels

| Level | Phase Behavior |
|-------|---------------|
| **Level 1: Supervised** | Pauses at each phase for confirmation |
| **Level 2: Standard** | Pauses at milestones |
| **Level 3: Full Auto** (default) | Auto-advances through all phases. Only stops for: Destructive Action Guard, impact BLOCK verdicts, unrecoverable errors (after 2 fix attempts), and the Discuss phase |

Set in your project's `CLAUDE.md` under `## Autonomy Level`.

Recommended `.gsd-t/config.json`:

```json
{
  "mode": "yolo",
  "model_profile": "quality",
  "workflow": {
    "research": true,
    "impact_check": true,
    "test_sync": true,
    "verifier": true
  }
}
```

---

## License

MIT
