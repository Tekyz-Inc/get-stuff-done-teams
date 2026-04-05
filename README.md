# GSD-T: Contract-Driven Development for Claude Code

A methodology for reliable, parallelizable development using Claude Code with optional Agent Teams support.

**Eliminates context rot** — task-level fresh dispatch (one subagent per task, ~10-20% context each) means compaction never triggers.
**Compaction-proof debug loops** — `gsd-t headless --debug-loop` runs test-fix-retest cycles as separate `claude -p` sessions. A JSONL debug ledger persists all hypothesis/fix/learning history across fresh sessions. Anti-repetition preamble injection prevents retrying failed hypotheses. Escalation tiers (sonnet → opus → human) and a hard iteration ceiling enforced externally.
**Safe parallel execution** — worktree isolation gives each domain agent its own filesystem; sequential atomic merges prevent conflicts.
**Maintains test coverage** — automatically keeps tests aligned with code changes.
**Catches downstream effects** — analyzes impact before changes break things.
**Protects existing work** — destructive action guard prevents schema drops, architecture replacements, and data loss without explicit approval.
**Visualizes execution in real time** — live browser dashboard renders agent hierarchy, tool activity, and phase progression from the event stream.
**Generates visual scan reports** — every `/gsd-t-scan` produces a self-contained HTML report with 6 live architectural diagrams, a tech debt register, and domain health scores; optional DOCX/PDF export via `--export docx|pdf`.
**Self-learning rule engine** — declarative rules in rules.jsonl detect failure patterns from task metrics. Candidate patches progress through a 5-stage lifecycle (candidate, applied, measured, promoted, graduated) with >55% improvement gates before becoming permanent methodology artifacts.
**Cross-project learning** — proven rules propagate to `~/.claude/metrics/` and sync across all registered projects via `update-all`. Rules validated in 3+ projects become universal; 5+ projects qualify for npm distribution. Cross-project signal comparison and global ELO rankings available via `gsd-t-metrics --cross-project` and `gsd-t-status`.
**Stack Rules Engine** — auto-detects project tech stack (React, TypeScript, Node API, Python, Go, Rust) from manifest files and injects mandatory best-practice rules into subagent prompts at execute-time. Universal security rules always apply; stack-specific rules layer on top. Includes **design-to-code** rules for pixel-perfect frontend implementation from Figma, screenshots, or design images — with Figma MCP integration, design token extraction, stack capability evaluation, and mandatory visual verification: every screen is rendered in a real browser, screenshotted at mobile/tablet/desktop, and compared pixel-by-pixel against the Figma design. Auto-bootstraps during partition when design references are detected. Extensible: drop a `.md` file in `templates/stacks/` to add a new stack.
**Self-Calibrating QA** — `qa-calibrator.js` tracks QA miss-rates across milestones, detects weak-spot categories (error paths, boundaries, state transitions), and automatically injects targeted guidance into QA subagent prompts. Projects on the same stack share miss-rate data for faster calibration.
**Token-Aware Orchestration** — `token-budget.js` tracks session token consumption and applies graduated degradation: downgrade model assignments when approaching limits, checkpoint and skip non-essential operations to conserve budget, and halt cleanly with a resume instruction at the ceiling. Wave and execute phases check budget before each subagent spawn.
**Quality North Star** — projects define a `## Quality North Star` section in CLAUDE.md (1–3 sentences, e.g., "This is a published npm library. Every public API must be intuitive and backward-compatible."). `gsd-t-init` auto-detects preset (library/web-app/cli) from package.json signals; `gsd-t-setup` configures it for existing projects. Subagents read it as a quality lens; absent = silent skip (backward compatible).
**Design Brief Artifact** — during partition, UI/frontend projects (React, Vue, Svelte, Flutter, Tailwind) automatically get `.gsd-t/contracts/design-brief.md` with color palette, typography, spacing system, component patterns, and tone/voice. Non-UI projects skip silently. User-customized briefs are preserved. Referenced in plan phase for visual consistency.
**Design Verification Agent** — after QA passes on design-to-code projects, a dedicated verification agent opens a browser with both the built frontend AND the original design (Figma page, design image, or MCP screenshot) side-by-side for direct visual comparison. Produces a structured element-by-element comparison table (30+ rows) with specific design values vs. implementation values and MATCH/DEVIATION verdicts. An artifact gate enforces that the comparison table exists — missing it blocks completion. Separation of concerns: coding agents code, verification agents verify. Wired into execute (Step 5.25) and quick (Step 5.25). Only fires when `.gsd-t/contracts/design-contract.md` exists — non-design projects are unaffected.
**Exploratory Testing** — after scripted tests pass, if Playwright MCP is registered in Claude Code settings, QA agents get 3 minutes and Red Team gets 5 minutes of interactive browser exploration. All findings tagged `[EXPLORATORY]` and tracked separately in QA calibration. Silent skip when Playwright MCP absent. Wired into execute, quick, integrate, and debug.

---

## Quick Start

### Install with npm

```bash
npx @tekyzinc/gsd-t install
```

This installs 47 GSD-T commands + 5 utility commands (52 total) to `~/.claude/commands/` and the global CLAUDE.md to `~/.claude/CLAUDE.md`. Works on Windows, Mac, and Linux.

### Start Using It

```bash
# 1. Start Claude Code in your project
cd my-project
claude

# 2. Full onboarding (git + init + scan + setup in one)
/user:gsd-t-init-scan-setup

# Or step by step:
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
npx @tekyzinc/gsd-t changelog      # Open changelog in the browser
npx @tekyzinc/gsd-t uninstall      # Remove commands (keeps project files)

# Headless mode (CI/CD)
gsd-t headless verify --json --timeout=1200  # Run verify non-interactively
gsd-t headless query status                  # Get project state (no LLM, <100ms)
gsd-t headless query domains                 # List domains (no LLM)

# Headless debug-loop (compaction-proof automated test-fix-retest)
gsd-t headless --debug-loop                             # Auto-detect test cmd, up to 20 iterations
gsd-t headless --debug-loop --max-iterations=10         # Cap at 10 iterations
gsd-t headless --debug-loop --test-cmd="npm test"       # Override test command
gsd-t headless --debug-loop --fix-scope="src/auth/**"   # Limit fix scope
gsd-t headless --debug-loop --json --log                # Structured output + per-iteration logs
```

Each iteration runs as a fresh `claude -p` session. A cumulative debug ledger (`.gsd-t/debug-state.jsonl`) preserves hypothesis/fix/learning history across sessions. An anti-repetition preamble prevents retrying failed approaches.

**Escalation tiers**: sonnet (iterations 1–5) → opus (6–15) → STOP with diagnostic summary (16–20)

**Exit codes**: `0` all tests pass · `1` max iterations reached · `2` compaction error · `3` process error · `4` needs human decision

### Updating

When a new version is published:
```bash
npx @tekyzinc/gsd-t@latest update
```

This will replace changed command files, back up your CLAUDE.md if customized, and track the installed version.

---

## Commands Reference

### Smart Router

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd {request}` | Describe what you need → auto-routes to the right command | Manual |
| _(any plain text)_ | Auto-routed via UserPromptSubmit hook — no leading `/` needed | Auto |

### Help & Onboarding

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-help` | List all commands with descriptions | Manual |
| `/user:gsd-t-help {cmd}` | Detailed help for specific command | Manual |
| `/user:gsd-t-prompt` | Help formulate your idea before committing | Manual |
| `/user:gsd-t-brainstorm` | Creative exploration and idea generation | Manual |
| `/user:gsd-t-prd` | Generate a GSD-T-optimized Product Requirements Document | Manual |

### Project Initialization

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-setup` | Generate or restructure project CLAUDE.md | Manual |
| `/user:gsd-t-init` | Initialize GSD-T structure in project | Manual |
| `/user:gsd-t-init-scan-setup` | Full onboarding: git + init + scan + setup in one | Manual |
| `/user:gsd-t-project` | Full project → milestone roadmap | Manual |
| `/user:gsd-t-feature` | Major feature → impact analysis + milestones | Manual |
| `/user:gsd-t-scan` | Deep codebase analysis → techdebt.md | Manual |
| `/user:gsd-t-gap-analysis` | Requirements gap analysis — spec vs. existing code | Manual |
| `/user:gsd-t-promote-debt` | Convert techdebt items to milestones | Manual |
| `/user:gsd-t-populate` | Auto-populate docs from existing codebase | Manual |
| `/user:gsd-t-design-decompose` | Decompose design into element/widget/page contracts | Manual |

### Milestone Workflow

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-milestone` | Define new milestone | Manual |
| `/user:gsd-t-partition` | Decompose into domains + contracts | In wave |
| `/user:gsd-t-discuss` | Multi-perspective design exploration | In wave |
| `/user:gsd-t-plan` | Create atomic task lists per domain (tasks auto-split to fit one context window) | In wave |
| `/user:gsd-t-impact` | Analyze downstream effects | In wave |
| `/user:gsd-t-execute` | Run tasks — task-level fresh dispatch, worktree isolation, adaptive replanning | In wave |
| `/user:gsd-t-test-sync` | Sync tests with code changes | In wave |
| `/user:gsd-t-qa` | QA agent — test generation, execution, gap reporting | Auto-spawned |
| *Red Team* | Adversarial QA — finds bugs the builder missed (inverted incentives) | Auto-spawned |
| `/user:gsd-t-doc-ripple` | Automated document ripple — update downstream docs after code changes | Auto-spawned |
| `/user:gsd-t-integrate` | Wire domains together | In wave |
| `/user:gsd-t-verify` | Run quality gates + goal-backward behavior verification | In wave |
| `/user:gsd-t-complete-milestone` | Archive + git tag (goal-backward gate required) | In wave |

### Automation & Utilities

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-wave` | Full cycle, auto-advances all phases | Manual |
| `/user:gsd-t-status` | Cross-domain progress view with token breakdown by domain/task/phase | Manual |
| `/user:gsd-t-resume` | Restore context, continue | Manual |
| `/user:gsd-t-quick` | Fast task with GSD-T guarantees | Manual |
| `/user:gsd-t-reflect` | Generate retrospective from event stream, propose memory updates | Manual |
| `/user:gsd-t-visualize` | Launch browser dashboard — SSE server + React Flow agent visualization | Manual |
| `/user:gsd-t-debug` | Systematic debugging with state | Manual |
| `/user:gsd-t-metrics` | View task telemetry, process ELO, signal distribution, domain health, and cross-project comparison (`--cross-project`) | Manual |
| `/user:gsd-t-health` | Validate .gsd-t/ structure, optionally repair | Manual |
| `/user:gsd-t-pause` | Save exact position for reliable resume | Manual |
| `/user:gsd-t-log` | Sync progress Decision Log with recent git activity | Manual |
| `/user:gsd-t-version-update` | Update GSD-T to latest version | Manual |
| `/user:gsd-t-version-update-all` | Update GSD-T + all registered projects | Manual |
| `/user:gsd-t-triage-and-merge` | Auto-review, merge, and publish GitHub branches | Manual |
| `/user:gsd-t-audit` | Harness self-audit — analyze cost/benefit of enforcement components | Manual |

### Backlog Management

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-backlog-add` | Capture item, auto-categorize, append to backlog | Manual |
| `/user:gsd-t-backlog-list` | Filtered, ordered view of backlog items | Manual |
| `/user:gsd-t-backlog-move` | Reorder items by position (priority) | Manual |
| `/user:gsd-t-backlog-edit` | Modify backlog entry fields | Manual |
| `/user:gsd-t-backlog-remove` | Drop item with optional reason | Manual |
| `/user:gsd-t-backlog-promote` | Refine, classify, launch GSD-T workflow | Manual |
| `/user:gsd-t-backlog-settings` | Manage types, apps, categories, defaults | Manual |

### Git Helpers

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:branch` | Create and switch to a new git branch | Manual |
| `/user:checkin` | Auto-bump version, stage, commit, and push | Manual |
| `/user:Claude-md` | Reload CLAUDE.md directives mid-session | Manual |
| `/global-change` | Apply file changes across all registered GSD-T projects | Manual |

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
│   ├── events/                        # Execution event stream (JSONL, daily-rotated)
│   ├── retrospectives/                # Retrospective reports from gsd-t-reflect
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
8. **Agents learn from experience.** Every command invocation, phase transition, and subagent spawn is captured as a structured event. Past failures surface before each task (Reflexion pattern). Distillation converts repeated patterns into lasting CLAUDE.md rules.

---

## Security

- **Wave mode** spawns phase agents with `bypassPermissions` — agents execute without per-action user approval. Use Level 1 or Level 2 autonomy for sensitive projects to review each phase.
- **Heartbeat logs** scrub sensitive patterns (passwords, tokens, API keys) from bash commands and mask URL query parameters before writing to `.gsd-t/heartbeat-*.jsonl`.
- **File write paths** are validated (within `~/.claude/`) and checked for symlinks before writing.
- **HTTP responses** are bounded at 1MB to prevent memory exhaustion from oversized registry responses.
- **Directory creation** validates parent path components for symlinks to prevent path traversal.
- Run `gsd-t doctor` to verify installation integrity. Keep GSD-T updated with `gsd-t update`.

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
├── commands/                          # 51 slash commands
│   ├── gsd-t-*.md                     # 45 GSD-T workflow commands
│   ├── gsd.md                         # GSD-T smart router
│   ├── branch.md                      # Git branch helper
│   ├── checkin.md                     # Auto-version + commit/push helper
│   └── Claude-md.md                   # Reload CLAUDE.md directives
├── templates/                         # Document templates (10 base + stacks/)
│   ├── CLAUDE-global.md
│   ├── CLAUDE-project.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── workflows.md
│   ├── infrastructure.md
│   ├── progress.md
│   ├── backlog.md
│   ├── backlog-settings.md
│   ├── design-contract.md             # Design-to-code token extraction template
│   └── stacks/                        # Stack Rules Engine templates
│       ├── _security.md               # Universal — always injected
│       ├── react.md
│       ├── typescript.md
│       ├── design-to-code.md          # Pixel-perfect design implementation
│       └── node-api.md
├── scripts/                           # Runtime utility scripts (installed to ~/.claude/scripts/)
│   ├── gsd-t-tools.js                 # State CLI (get/set/validate/list)
│   ├── gsd-t-statusline.js            # Context usage bar
│   ├── gsd-t-event-writer.js          # Structured JSONL event writer
│   ├── gsd-t-dashboard-server.js      # Zero-dep SSE server for dashboard
│   └── gsd-t-dashboard.html           # React Flow + Dagre real-time dashboard
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
