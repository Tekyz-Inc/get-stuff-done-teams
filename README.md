# GSD-T: Contract-Driven Development for Claude Code

A methodology for reliable, parallelizable development using Claude Code CLI with optional Agent Teams support.

## The Problem

**Context rot** — Claude's output quality degrades as conversations grow. By the time you're deep into a feature, Claude has forgotten the architecture decisions from earlier.

**Downstream breakage** — "Quick" changes cascade into unexpected failures because nobody traced the dependencies.

**Test drift** — Tests fall out of sync with code, coverage gaps accumulate, and you find out in production.

## The Solution

GSD-T solves these with:

- **Contract-driven domains** — Code is partitioned into domains with explicit contracts. Each domain owns specific files. Contracts are the source of truth.
- **Persistent state** — Everything lives in `.gsd-t/` files. Resume any session instantly with full context.
- **Impact analysis** — Before any change, trace what depends on it. Block execution if breaking changes aren't addressed.
- **Automated test sync** — Every code change triggers test analysis. Gaps are caught immediately.
- **Milestone archival** — Completed work is archived with git tags. Clean handoffs, clear history.

## Quick Start

```bash
# 1. Install GSD-T commands (one-time)
# Windows: Run PC/install-gsd-t.ps1
# Mac/Linux: Run Mac/install-gsd-t.sh

# 2. Initialize your project
cd your-project
claude
/user:gsd-t-init

# 3. Define what you're building
/user:gsd-t-milestone "User Authentication System"

# 4. Let it rip (auto-runs all phases)
/user:gsd-t-wave
```

## Workflow

```
milestone → partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete
```

| Phase | What Happens |
|-------|--------------|
| **Partition** | Decompose into domains with contracts |
| **Discuss** | Explore design decisions |
| **Plan** | Create atomic task lists |
| **Impact** | Analyze downstream effects (blocks if breaking) |
| **Execute** | Build it (solo or team mode) |
| **Test-Sync** | Keep tests aligned with changes |
| **Integrate** | Wire domains together |
| **Verify** | Run quality gates |
| **Complete** | Archive + git tag |

## Commands

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-help` | List all commands |
| `/user:gsd-t-prompt` | Help formulate your idea |
| `/user:gsd-t-project` | Full project → milestone roadmap |
| `/user:gsd-t-feature` | Add major feature to existing code |
| `/user:gsd-t-scan` | Analyze existing codebase |
| `/user:gsd-t-milestone` | Define a deliverable |
| `/user:gsd-t-wave` | Auto-run full cycle |
| `/user:gsd-t-status` | View progress |
| `/user:gsd-t-resume` | Continue after break |
| `/user:gsd-t-quick` | Fast task with GSD-T guarantees |

See `/user:gsd-t-help` for the full list of 22 commands.

## Project Structure

```
your-project/
├── CLAUDE.md                    # Project conventions
├── .gsd-t/
│   ├── progress.md              # Current state
│   ├── roadmap.md               # Milestone roadmap
│   ├── impact-report.md         # Downstream effect analysis
│   ├── test-coverage.md         # Test sync report
│   ├── contracts/               # API, schema, component specs
│   ├── domains/                 # Domain scopes and tasks
│   └── milestones/              # Archived completed work
└── docs/
```

## Installation

### Windows
```powershell
cd PC
.\install-gsd-t.ps1
```

### Mac/Linux
```bash
cd Mac
chmod +x install-gsd-t.sh
./install-gsd-t.sh
```

See [readme-install.md](readme-install.md) for detailed installation options.

## Key Principles

1. **Contracts are source of truth** — Code implements contracts, not vice versa
2. **Domains own files exclusively** — No two domains modify the same file
3. **Impact before execution** — Always analyze downstream effects first
4. **Tests stay synced** — Every change triggers test analysis
5. **State survives sessions** — Resume anytime from `.gsd-t/` files
6. **Plan solo, execute parallel** — Planning needs full context; execution can parallelize

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- Git
- Optional: Agent Teams (experimental feature for parallel execution)

## License

MIT
