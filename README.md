# GSD-T: Contract-Driven Development for Claude Code

**v4.0.27** - A methodology for reliable, parallelizable development using Claude Code with optional Agent Teams support.

**Eliminates context rot** — task-level fresh dispatch (one subagent per task, ~10-20% context each) means compaction never triggers.
**Compaction-proof debug loops** — `gsd-t headless --debug-loop` runs test-fix-retest cycles as separate `claude -p` sessions. A JSONL debug ledger persists all hypothesis/fix/learning history across fresh sessions. Anti-repetition preamble injection prevents retrying failed hypotheses. Escalation tiers (sonnet → opus → human) and a hard iteration ceiling enforced externally.
**Safe parallel execution** — file-disjointness gates (`gsd-t-file-disjointness.cjs`) verify no two concurrent domain workers claim the same write targets before spawning; sequential atomic merges prevent conflicts.
**Maintains test coverage** — automatically keeps tests aligned with code changes.
**Catches downstream effects** — analyzes impact before changes break things.
**Protects existing work** — destructive action guard prevents schema drops, architecture replacements, and data loss without explicit approval.
**Visualizes execution in real time** — live browser dashboard renders agent hierarchy, tool activity, and phase progression from the event stream.
**Generates visual scan reports** — every `/gsd-t-scan` runs a volume-scaled native Workflow (M66+): a volume-probe stage counts files/routes/tables/components and derives a slice list (1-40+ slices depending on codebase size), parallel deep-finder agents enumerate every module, a synthesis stage merges findings into a prioritized tech-debt register, and a deterministic render stage produces a self-contained HTML report with architectural diagrams, domain health scores, and living-doc cross-population. Optional DOCX/PDF export via `--export docx|pdf`.
**Self-learning rule engine** — declarative rules in rules.jsonl detect failure patterns from task metrics. Candidate patches progress through a 5-stage lifecycle (candidate, applied, measured, promoted, graduated) with >55% improvement gates before becoming permanent methodology artifacts.
**Cross-project learning** — proven rules propagate to `~/.claude/metrics/` and sync across all registered projects via `update-all`. Rules validated in 3+ projects become universal; 5+ projects qualify for npm distribution. Cross-project signal comparison and global ELO rankings available via `gsd-t-metrics --cross-project` and `gsd-t-status`.
**Stack Rules Engine** — auto-detects project tech stack from manifest files (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`) and injects mandatory best-practice rules into subagent prompts at execute-time. 29 stack templates currently ship (`templates/stacks/`), covering React, TypeScript, Vue, Next.js, Node API, Python, FastAPI, Flutter, Tailwind, Playwright, Prisma, PostgreSQL, Supabase, Firebase, Neo4j, GraphQL, Redux, Zustand, Vite, Docker, GitHub Actions, LLM integrations, queues, REST API, and more. Universal `_security.md` and `_auth.md` rules always apply. Includes **design-to-code** rules for pixel-perfect frontend implementation from Figma, screenshots, or design images - with Figma MCP integration, design token extraction, stack capability evaluation, and mandatory visual verification. Auto-bootstraps during partition when design references are detected. Extensible: drop a `.md` file in `templates/stacks/` to add a new stack.
**Native Workflow Orchestration (M61+)** — all major phases run as self-contained native Workflow scripts (`templates/workflows/`): execute, verify, wave, integrate, debug, quick, phase, and scan. The Workflow runtime owns spawning and context; no external orchestrator processes are needed for routine build/debug/deliver actions. Detached workers emit JSONL events to `.gsd-t/events/YYYY-MM-DD.jsonl` at every phase boundary, consumed by the real-time dashboard. The `/gsd` smart router handles plain-text messages via the auto-route hook.
**Real-Time Agent Dashboard** — `gsd-t-stream-feed-server.js` serves a streaming UI at `127.0.0.1:7842` that renders all workers' stream-json output as a continuous feed with task/wave banners, duration + usage chips, token corner bar, localStorage filters, and replay via `WS /feed?from=N`. Dashboard auto-starts idempotently on each spawn (`scripts/gsd-t-dashboard-autostart.cjs`). Port is project-scoped via `projectScopedDefaultPort(projectDir)` so multi-project workflows do not clobber each other.
**Rigorous User-Journey Coverage + Anti-Drift Test Quality** — `bin/journey-coverage.cjs` regex listener detector + `gsd-t check-coverage` CLI + `scripts/hooks/pre-commit-journey-coverage` commit gate blocks viewer-source commits when uncovered listeners exist. Journey specs in `e2e/journeys/` use functional assertions (zero `toBeVisible`-only tests) per the E2E Test Quality Standard in CLAUDE.md.
**Universal Playwright Bootstrap + Deterministic UI Enforcement (M50)** — three executable enforcement layers: (1) `bin/playwright-bootstrap.cjs` + `bin/ui-detection.cjs` - idempotent installer detects package manager, installs `@playwright/test` + chromium, scaffolds `e2e/`; (2) Workflow runtime runs `playwright-bootstrap.cjs::installPlaywright()` before any E2E stage when `hasUI && !hasPlaywright`; install failure halts with `blocked-needs-human`; (3) `scripts/hooks/pre-commit-playwright-gate` (opt-in via `gsd-t doctor --install-hooks`) blocks viewer-source commits when staged files are newer than `.gsd-t/.last-playwright-pass`. The `gsd-t setup-playwright [path]` subcommand handles manual install.
**Visualizer (`/gsd-t-visualize`)** — launches a real-time browser dashboard with dual-pane view: top pane streams the main session, bottom pane streams whichever spawn the user clicks. Left rail shows Live Spawns and Completed (last 100 spawns, status-badged, collapsible). Right rail shows Spawn Plan / Parallelism / Tool Cost. Powered by `gsd-t-stream-feed-server.js` + `gsd-t-dashboard.html`.
**Surgical model selection** — `bin/model-selector.js` assigns haiku/sonnet/opus per phase via a declarative rules table; `/advisor` escalation path with convention-based fallback.
**Token Telemetry** — `gsd-t-calibration-hook.js` records token usage per spawn to `.gsd-t/token-metrics.jsonl` (18-field rows). `gsd-t-token-aggregator.js` aggregates across tasks for the `/gsd-t-metrics` view. Use the native Claude Code `/context` command for live in-session context percentage.
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

This installs 46 GSD-T workflow commands + 5 utility commands (51 total) to `~/.claude/commands/` and the global CLAUDE.md to `~/.claude/CLAUDE.md`. Works on Windows, Mac, and Linux.

### Start Using It

```bash
# 1. Start Claude Code in your project
cd my-project
claude

# 2. Full onboarding (git + init + scan + setup in one)
/gsd-t-init-scan-setup

# Or step by step:
/gsd-t-init my-project

# 4. Define what you're building
/gsd-t-milestone "User Authentication System"

# 5. Let it rip (auto-advances through all phases)
/gsd-t-wave

# Or go phase by phase for more control:
/gsd-t-partition
/gsd-t-discuss
/gsd-t-plan
/gsd-t-impact
/gsd-t-execute
/gsd-t-test-sync
/gsd-t-integrate
/gsd-t-verify
/gsd-t-complete-milestone
```

### Resuming After a Break

```bash
claude
/gsd-t-resume
```

GSD-T reads all state files and tells you exactly where you left off.

---

## CLI Commands

```bash
npx @tekyzinc/gsd-t install        # Install commands + global CLAUDE.md (51 commands)
npx @tekyzinc/gsd-t update         # Update global commands + CLAUDE.md
npx @tekyzinc/gsd-t update-all     # Update globally + all registered project CLAUDE.md files
npx @tekyzinc/gsd-t init [name]    # Scaffold GSD-T project (auto-registers)
npx @tekyzinc/gsd-t register       # Register current directory as a GSD-T project
npx @tekyzinc/gsd-t status         # Check installation + version
npx @tekyzinc/gsd-t doctor         # Diagnose common issues
npx @tekyzinc/gsd-t changelog      # Open changelog in the browser
npx @tekyzinc/gsd-t uninstall      # Remove commands (keeps project files)
npx @tekyzinc/gsd-t setup-playwright [path]  # Install Playwright + chromium for a project

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

# Parallel CLI (M44 D2 — task-level parallelism, mode-aware gating)
gsd-t parallel --help                                   # Usage, flags, gates, contract ref
gsd-t parallel --dry-run                                # Print worker plan table + exit (no spawn)
gsd-t parallel --mode in-session --dry-run              # 85% orchestrator-CW ceiling; N=1 floor
gsd-t parallel --mode unattended --dry-run              # 60% per-worker ceiling; > 60% → task_split
gsd-t parallel --milestone M44 --domain m44-d2-parallel-cli --dry-run

# CLI-Preflight + Brief + Verify-Gate (M55 — deterministic state checks + parallel substrate)
gsd-t preflight --json                                  # 6 built-in state checks; exit 0/4
gsd-t brief --kind execute --domain X --spawn-id Y      # ≤2,500-token JSON snapshot for worker spawn
gsd-t verify-gate --json                                # Two-track gate: D1 preflight + D2 parallel CLIs
gsd-t verify-gate --skip-track1 --json                  # Diagnostic: Track 2 only
gsd-t verify-gate --max-concurrency 4 --json            # Override D3-map default
gsd-t build-coverage --json                             # M57: new top-level paths must be a real CI build input (structural parse)
gsd-t ci-parity --json                                  # M57: reproduce the project's actual CI build locally (auto docker build)
gsd-t test-data --list [--run ID] [--json]              # M58: list test-data ledger entries
gsd-t test-data --purge --run ID [--dry-run] [--json]   # M58: purge tagged test data after Verify (Step 4.5)
gsd-t competition-judge --in SPEC.json [--project-dir P] # M82: generate-and-judge selection oracle (partition / generic)
```

**Competition Mode (M82).** Opt-in `--competition N` (N 2–5) on upstream, pre-contract phases (`/gsd-t-partition`, `/gsd-t-milestone`, `/gsd-t-design-decompose`) fans out N parallel candidate producers and a judge selects the winner — the generative dual of the orthogonal validation triad. Partition uses an *objective* file-disjointness oracle as the judge (a calculator, not a biased critic); subjective phases use a blind + different-model + rubric judge. Default off. See `.gsd-t/contracts/competition-mode-contract.md`.

`gsd-t parallel` consumes the M44 task-graph (D1) and applies three pre-spawn gates (D4 depgraph validation → D5 file-disjointness → D6 economics) followed by mode-aware headroom/split math. Extends — does not replace — the M40 orchestrator. Contract: `.gsd-t/contracts/wave-join-contract.md` v1.1.0.

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
| `/gsd {request}` | Describe what you need → auto-routes to the right command | Manual |
| _(any plain text)_ | Auto-routed via UserPromptSubmit hook — no leading `/` needed | Auto |

### Help & Onboarding

| Command | Purpose | Auto |
|---------|---------|------|
| `/gsd-t-help` | List all commands with descriptions | Manual |
| `/gsd-t-help {cmd}` | Detailed help for specific command | Manual |
| `/gsd-t-prompt` | Help formulate your idea before committing | Manual |
| `/gsd-t-brainstorm` | Creative exploration and idea generation | Manual |
| `/gsd-t-prd` | Generate a GSD-T-optimized Product Requirements Document | Manual |

### Project Initialization

| Command | Purpose | Auto |
|---------|---------|------|
| `/gsd-t-setup` | Generate or restructure project CLAUDE.md | Manual |
| `/gsd-t-init` | Initialize GSD-T structure in project | Manual |
| `/gsd-t-init-scan-setup` | Full onboarding: git + init + scan + setup in one | Manual |
| `/gsd-t-project` | Full project → milestone roadmap | Manual |
| `/gsd-t-feature` | Major feature → impact analysis + milestones | Manual |
| `/gsd-t-scan` | Deep codebase analysis → techdebt.md | Manual |
| `/gsd-t-gap-analysis` | Requirements gap analysis — spec vs. existing code | Manual |
| `/gsd-t-promote-debt` | Convert techdebt items to milestones | Manual |
| `/gsd-t-populate` | Auto-populate docs from existing codebase | Manual |
| `/gsd-t-design-decompose` | Decompose design into element/widget/page contracts | Manual |

### Milestone Workflow

| Command | Purpose | Auto |
|---------|---------|------|
| `/gsd-t-milestone` | Define new milestone | Manual |
| `/gsd-t-partition` | Decompose into domains + contracts | In wave |
| `/gsd-t-plan` | Create atomic task lists per domain (tasks auto-split to fit one context window) | In wave |
| `/gsd-t-impact` | Analyze downstream effects | In wave |
| `/gsd-t-execute` | Run tasks — task-level fresh dispatch, worktree isolation, adaptive replanning | In wave |
| `/gsd-t-test-sync` | Sync tests with code changes | In wave |
| `/gsd-t-qa` | QA agent — test generation, execution, gap reporting | Auto-spawned |
| *Red Team* | Adversarial QA — finds bugs the builder missed (inverted incentives) | Auto-spawned |
| `/gsd-t-doc-ripple` | Automated document ripple — update downstream docs after code changes | Auto-spawned |
| `/gsd-t-integrate` | Wire domains together | In wave |
| `/gsd-t-verify` | Run quality gates + goal-backward behavior verification | In wave |
| `/gsd-t-complete-milestone` | Archive + git tag (goal-backward gate required) | In wave |

### Automation & Utilities

| Command | Purpose | Auto |
|---------|---------|------|
| `/gsd-t-wave` | Full cycle, auto-advances all phases | Manual |
| `/gsd-t-status` | Cross-domain progress view with token breakdown by domain/task/phase | Manual |
| `/gsd-t-resume` | Restore context, continue | Manual |
| `/gsd-t-quick` | Fast task with GSD-T guarantees | Manual |
| `/gsd-t-visualize` | Launch browser dashboard — SSE server + React Flow agent visualization | Manual |
| `/gsd-t-debug` | Systematic debugging with state | Manual |
| `/gsd-t-metrics` | View task telemetry, process ELO, signal distribution, domain health, and cross-project comparison (`--cross-project`) | Manual |
| `/gsd-t-health` | Validate .gsd-t/ structure, optionally repair | Manual |
| `/gsd-t-pause` | Save exact position for reliable resume | Manual |
| `/gsd-t-log` | Sync progress Decision Log with recent git activity | Manual |
| `/gsd-t-version-update` | Update GSD-T to latest version | Manual |
| `/gsd-t-version-update-all` | Update GSD-T + all registered projects | Manual |
| `/gsd-t-triage-and-merge` | Auto-review, merge, and publish GitHub branches | Manual |
| `/gsd-t-design-audit` | Compare built screen against Figma design — structured deviation report | Manual |
| `/gsd-t-design-build` | Build from design contracts with two-terminal review (Term 1 builder) | Manual |
| `/gsd-t-design-review` | Independent review agent for design build (Term 2 reviewer) | Auto |

### Backlog Management

| Command | Purpose | Auto |
|---------|---------|------|
| `/gsd-t-backlog-add` | Capture item, auto-categorize, append to backlog | Manual |
| `/gsd-t-backlog-list` | Filtered, ordered view of backlog items | Manual |
| `/gsd-t-backlog-move` | Reorder items by position (priority) | Manual |
| `/gsd-t-backlog-edit` | Modify backlog entry fields | Manual |
| `/gsd-t-backlog-remove` | Drop item with optional reason | Manual |
| `/gsd-t-backlog-promote` | Refine, classify, launch GSD-T workflow | Manual |
| `/gsd-t-backlog-settings` | Manage types, apps, categories, defaults | Manual |

### Git Helpers

| Command | Purpose | Auto |
|---------|---------|------|
| `/branch` | Create and switch to a new git branch | Manual |
| `/checkin` | Auto-bump version, stage, commit, and push | Manual |
| `/cpua` | Commit, Publish, Update All — bump version, publish to npm, propagate to all registered projects | Manual |
| `/Claude-md` | Reload CLAUDE.md directives mid-session | Manual |
| `/global-change` | Apply file changes across all registered GSD-T projects | Manual |

---

## Workflow Phases

| Phase | Purpose | Solo/Team |
|-------|---------|-----------|
| **Prompt** | Formulate idea (pre-workflow) | Solo |
| **Project/Feature/Scan** | Initialize work | Solo (team for large scans) |
| **Milestone** | Define deliverable | Solo |
| **Partition** | Decompose into domains + contracts | Solo |
| **Plan** | Create atomic task lists | Solo (always) |
| **Impact** | Downstream effect analysis | Solo |
| **Execute** | Build it - domain workers run in parallel (file-disjointness gated); Workflow: preflight → brief → disjointness → parallel workers → integrate → verify-gate | Both |
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

## Unattended / Background Runs

For zero-touch overnight or multi-hour runs, use the `/loop` skill with a GSD-T command, or the `/gsd-t-unattended` skill (via the Smart Router). State is written atomically to `.gsd-t/.unattended/state.json` between worker iterations.

The supervisor halts automatically when: the milestone reaches COMPLETED status, the wall-clock cap expires, `--max-iterations` is reached, safety rails detect a stall or unrecoverable error, or the stop sentinel is touched.

**State files** live under `.gsd-t/.unattended/`: `supervisor.pid`, `state.json`, `run.log`, `stop` (sentinel).

---

## Context and Token Monitoring

GSD-T uses the Claude Code native `/context` command for live in-session context usage. The `ANTHROPIC_API_KEY` env var is used for token count diagnostics and measurement only - not for inference (inference runs via Claude Max subscription).

```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # for count_tokens diagnostics
```

The `gsd-t-calibration-hook.js` hook auto-detects model window size (1M for Opus 4.7/4.8, Sonnet 4.5+) and records token usage to `.gsd-t/token-metrics.jsonl` (one 18-field row per spawn). The `gsd-t-token-aggregator.js` script aggregates JSONL data for the `/gsd-t-metrics` view.

If `.gsd-t/context-meter-config.json` exists, you can adjust `thresholdPct` and `modelWindowSize` (use `1000000` for current 1M-window models). Run `gsd-t doctor` to verify configuration.

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

Verify with: `/gsd-t-help`

---

## Repo Contents

```
get-stuff-done-teams/
├── README.md
├── package.json                       # @tekyzinc/gsd-t v4.0.27
├── LICENSE
├── bin/                               # CLI entry + orchestrators + support modules (52 modules)
│   ├── gsd-t.js                       # CLI installer + all subcommands
│   ├── orchestrator.js                # Design orchestrator
│   ├── cli-preflight.cjs              # Preflight gate (branch, ports, contracts)
│   ├── gsd-t-verify-gate.cjs          # Two-track verify gate (preflight + parallel CLIs)
│   ├── gsd-t-parallel.cjs             # Task-level parallelism + mode-aware gating
│   ├── gsd-t-task-graph.cjs           # Dependency graph + topological sort
│   ├── gsd-t-file-disjointness.cjs    # Pre-spawn file overlap gate
│   ├── gsd-t-context-brief.cjs        # <=2500-token JSON snapshot for worker spawns
│   ├── gsd-t-context-brief-kinds/     # 11 brief collectors (execute, verify, scan, qa, ...)
│   ├── scan-*.js                      # Scan data collection, schema, diagrams, HTML report
│   ├── graph-*.js                     # Code graph engine (CGC/Neo4j integration)
│   ├── journey-coverage.cjs           # Listener detector + coverage gap reporting
│   ├── playwright-bootstrap.cjs       # Idempotent Playwright installer
│   ├── model-selector.js              # Phase-to-model assignment (haiku/sonnet/opus)
│   ├── rule-engine.js                 # Declarative failure-pattern rules
│   ├── patch-lifecycle.js             # 5-stage patch candidate→graduated lifecycle
│   └── metrics-collector.js           # Task telemetry + ELO tracking
├── commands/                          # 51 slash commands
│   ├── gsd-t-*.md                     # 46 GSD-T workflow commands
│   ├── gsd.md                         # Smart router
│   ├── branch.md                      # Git branch helper
│   ├── checkin.md                     # Auto-version + commit/push
│   ├── cpua.md                        # Commit, Publish, Update All
│   └── global-change.md               # Cross-project file propagation
├── templates/
│   ├── CLAUDE-global.md               # Global CLAUDE.md template
│   ├── CLAUDE-project.md              # Project CLAUDE.md template
│   ├── requirements.md / architecture.md / workflows.md / infrastructure.md / progress.md
│   ├── backlog.md / backlog-settings.md
│   ├── design-contract.md / element-contract.md / widget-contract.md / page-contract.md
│   ├── workflows/                     # 9 native Workflow scripts
│   │   ├── gsd-t-execute.workflow.js
│   │   ├── gsd-t-verify.workflow.js
│   │   ├── gsd-t-wave.workflow.js
│   │   ├── gsd-t-scan.workflow.js     # Volume-scaled (M66+)
│   │   ├── gsd-t-integrate.workflow.js
│   │   ├── gsd-t-debug.workflow.js
│   │   ├── gsd-t-quick.workflow.js
│   │   ├── gsd-t-phase.workflow.js
│   │   └── _lib.js                    # Shared workflow helpers
│   ├── prompts/                       # Validation subagent protocols
│   │   ├── qa-subagent.md
│   │   ├── red-team-subagent.md
│   │   └── design-verify-subagent.md
│   └── stacks/                        # Stack Rules Engine (29 templates)
│       ├── _security.md               # Universal — always injected
│       ├── _auth.md                   # Universal auth rules
│       ├── react.md / typescript.md / vue.md / nextjs.md / node-api.md
│       ├── python.md / fastapi.md / flutter.md / tailwind.md
│       ├── playwright.md / prisma.md / postgresql.md / supabase.md
│       ├── firebase.md / neo4j.md / graphql.md / docker.md
│       └── ... (29 total — ls templates/stacks/ for full list)
├── scripts/                           # Runtime utility scripts
│   ├── gsd-t-tools.js                 # State CLI (get/set/validate/list)
│   ├── gsd-t-statusline.js            # Context usage bar
│   ├── gsd-t-event-writer.js          # Structured JSONL event writer
│   ├── gsd-t-stream-feed-server.js    # WebSocket + SSE streaming server
│   ├── gsd-t-stream-feed.html         # Streaming feed viewer
│   ├── gsd-t-dashboard.html           # Real-time agent dashboard
│   ├── gsd-t-dashboard-autostart.cjs  # Idempotent dashboard launcher
│   ├── gsd-t-token-aggregator.js      # JSONL token data aggregation
│   ├── gsd-t-date-guard.js            # PreToolUse timestamp validation hook
│   ├── gsd-t-auto-route.js            # UserPromptSubmit smart-router hook
│   └── gsd-t-design-review-server.js  # Design review proxy + queue server
├── test/                              # 78 test files (Node built-in test runner)
├── e2e/                               # Playwright E2E specs
├── examples/
│   ├── settings.json
│   └── .gsd-t/
└── docs/
    ├── GSD-T-README.md                # Detailed methodology + usage guide
    └── methodology.md
```

---

## License

MIT
