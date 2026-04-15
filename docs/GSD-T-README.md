# GSD-T: Contract-Driven Development for Claude Code

A methodology for reliable, parallelizable development using Claude Code with optional Agent Teams support.

## What It Does

**Solves context rot** — the quality degradation that happens as Claude fills its context window.

**Enables parallel execution** — contract-driven domains can be worked on simultaneously.

**Maintains test coverage** — automatically keeps tests aligned with code changes.

**Catches downstream effects** — analyzes impact before changes break things.

**Self-learning rule engine** — declarative rules detect failure patterns from task metrics. Patches progress through 5 lifecycle stages with measurable improvement gates before graduating into permanent methodology.

---

## Quick Start

```bash
# 1. Start Claude Code in your project
cd my-project
claude

# 2. Full onboarding (git + init + scan + setup in one)
/user:gsd-t-init-scan-setup

# Or step by step:
/user:gsd-t-init my-project

# 3. Define what you're building
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
| `/user:gsd-t-execute` | Run tasks — task-level fresh dispatch, worktree isolation, adaptive replanning, stack rules injection | In wave |
| `/user:gsd-t-test-sync` | Sync tests with code changes | In wave |
| `/user:gsd-t-qa` | QA agent — test generation, execution, gap reporting | Auto-spawned |
| *Red Team* | Adversarial QA — spawns after QA passes to find bugs the builder missed | Auto-spawned |
| `/user:gsd-t-doc-ripple` | Automated document ripple — update downstream docs after code changes | Auto-spawned |
| `/user:gsd-t-integrate` | Wire domains together | In wave |
| `/user:gsd-t-verify` | Run quality gates + goal-backward verification → auto-invokes complete-milestone | In wave |
| `/user:gsd-t-complete-milestone` | Archive + git tag (auto-invoked by verify, also standalone) | In wave |

### Automation & Utilities

| Command | Purpose | Auto |
|---------|---------|------|
| `/user:gsd-t-wave` | Full cycle, auto-advances all phases | Manual |
| `/user:gsd-t-status` | Cross-domain progress view with token breakdown, global ELO and cross-project rankings | Manual |
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
| `/user:gsd-t-design-audit` | Compare built screen against Figma — per-widget deviation report with severity | Manual |
| `/global-change` | Apply file changes (copy/insert/update/delete) across all GSD-T projects | Manual |

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
│                                              │    │  QA + Design      │     │
│                                              │    │  Verification +   │     │
│                                              │    │  Red Team         │     │
│                                              │    │ (after each phase │     │
│                                              │    │  that writes code)│     │
│                                              │    └───────────────────┘     │
│                                              ▼                              │
│  verify+complete ◄──────────── integrate ◄──────────────────────┘          │
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
| **Execute** | Build it (+ Red Team adversarial QA) | Both |
| **Test-Sync** | Maintain test coverage | Solo |
| **Integrate** | Wire domains together (+ Red Team adversarial QA) | Solo (always) |
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

## Stack Rules Engine

GSD-T auto-detects your project's tech stack and injects mandatory best-practice rules into subagent prompts at execute-time. This ensures stack conventions are enforced at the same weight as contract compliance — violations are task failures, not warnings.

### How It Works

1. At subagent spawn time, GSD-T reads project manifest files to detect the active stack(s).
2. Universal rules (`templates/stacks/_security.md`, `_auth.md`) are **always** injected.
3. Stack-specific rules are injected when the corresponding stack is detected.
4. Project-level overrides in `.gsd-t/stacks/` replace global files of the same name.
5. Rules are appended to the subagent prompt as a `## Stack Rules (MANDATORY)` section.

### Stack Detection (28 files)

| Project File | Detected Stack(s) |
|---|---|
| *(always)* | `_security.md`, `_auth.md` |
| `package.json` with `"react"` | `react.md` |
| `package.json` with `"react-native"` | `react-native.md` |
| `package.json` with `"next"` | `nextjs.md` |
| `package.json` with `"vue"` | `vue.md` |
| `package.json` with `"typescript"` or `tsconfig.json` | `typescript.md` |
| `package.json` with `"tailwindcss"` | `tailwind.md` |
| `package.json` with `"express"`, `"fastify"`, `"hono"`, or `"koa"` | `node-api.md`, `rest-api.md` |
| `package.json` with `"vite"` | `vite.md` |
| `package.json` with `"@supabase/supabase-js"` | `supabase.md` |
| `package.json` with `"firebase"` | `firebase.md` |
| `package.json` with `"graphql"` or `"@apollo/server"` | `graphql.md` |
| `package.json` with `"zustand"` | `zustand.md` |
| `package.json` with `"@reduxjs/toolkit"` | `redux.md` |
| `package.json` with `"prisma"` or `"@prisma/client"` | `prisma.md` |
| `package.json` with `"pg"`, `"knex"`, or `"drizzle-orm"` | `postgresql.md` |
| `package.json` with `"neo4j-driver"` | `neo4j.md` |
| `package.json` with `"bullmq"`, `"bull"`, `"amqplib"`, or `"@aws-sdk/client-sqs"` | `queues.md` |
| `package.json` with `"openai"`, `"anthropic"`, `"langchain"` | `llm.md` |
| `Dockerfile` or `compose.yaml` | `docker.md` |
| `.github/workflows/*.yml` | `github-actions.md` |
| `playwright.config.*` | `playwright.md` |
| `requirements.txt` or `pyproject.toml` | `python.md` |
| `requirements.txt` with `fastapi` | `fastapi.md` |
| `requirements.txt` with `celery`, `dramatiq`, `rq`, or `arq` | `queues.md` |
| `requirements.txt` with `openai`, `anthropic`, `langchain` | `llm.md` |
| `pubspec.yaml` | `flutter.md` |
| `.gsd-t/contracts/design-contract.md`, `design-tokens.json`, `design-tokens/`, `.figmarc`, `figma.config.json`, or Figma MCP in `settings.json` | `design-to-code.md` |

### Commands That Inject Stack Rules

`gsd-t-execute`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-wave`, `gsd-t-debug`

### Extending

Drop a `.md` file into `templates/stacks/` to add a new stack. Files prefixed with `_` are universal (always injected). Files without a prefix are stack-specific (injected only when detected). If the `stacks/` directory is missing, detection skips silently — no error.

---

## Headless Mode

Run GSD-T non-interactively in CI/CD pipelines or automated workflows.

### headless exec

```bash
gsd-t headless verify --json --timeout=1200  # Run verify non-interactively
gsd-t headless execute --json                # Execute tasks without interactive prompts
```

### headless query

```bash
gsd-t headless query status   # Project state — no LLM, <100ms
gsd-t headless query domains  # Domain list with status
```

### headless debug-loop

Compaction-proof automated test-fix-retest cycles. Each iteration runs as a separate `claude -p` session with fresh context. A cumulative debug ledger (`.gsd-t/debug-state.jsonl`) preserves all hypothesis/fix/learning history across sessions. An anti-repetition preamble is injected into each session to prevent retrying failed approaches.

```bash
gsd-t headless --debug-loop [--max-iterations=N] [--test-cmd=CMD] [--fix-scope=PATTERN] [--json] [--log]
```

**Flags:**

| Flag               | Default | Description |
|--------------------|---------|-------------|
| `--max-iterations` | 20      | Hard ceiling on iterations |
| `--test-cmd`       | (auto)  | Override test command (auto-detected from project) |
| `--fix-scope`      | (all)   | Limit fix scope to specific files or patterns |
| `--json`           | false   | Structured JSON output after each iteration |
| `--log`            | false   | Write per-iteration logs to `.gsd-t/` |

**Escalation tiers:**

| Iterations | Model  | Behavior |
|------------|--------|----------|
| 1–5        | sonnet | Standard debug — one fix per session |
| 6–15       | opus   | Deeper reasoning — reads full ledger, may attempt multi-file fixes |
| 16–20      | STOP   | Write full diagnostic summary, present to user, exit code 4 |

**Exit codes:** `0` all tests pass · `1` max iterations reached · `2` compaction error · `3` process error · `4` needs human decision

**Auto-escalation from commands:** `gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-debug`, and `gsd-t-wave` delegate to `--debug-loop` automatically after 2 failed in-context fix attempts.

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

### Context Meter (M34)

The Context Meter is a PostToolUse hook that runs after every tool call, streams the current Claude Code transcript to the Anthropic `count_tokens` API, and writes the exact input-token count and threshold band to `.gsd-t/.context-meter-state.json`. The GSD-T orchestrator (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-debug`) reads this state file via `token-budget.getSessionStatus()` as the authoritative context-burn signal — replacing the v2.74.12 task-counter proxy.

Setup:

1. **Export an API key** — `export ANTHROPIC_API_KEY="sk-ant-..."` (free-tier key is sufficient; `count_tokens` is inexpensive).
2. **Install the hook** — `npx @tekyzinc/gsd-t install` (registers the PostToolUse hook globally) then `npx @tekyzinc/gsd-t init` in each project (copies the hook runtime and config template).
3. **Verify with doctor** — `npx @tekyzinc/gsd-t doctor` hard-gates on API key presence, hook registration, script existence, config validity, and a live `count_tokens` dry-run.
4. **Check status** — `npx @tekyzinc/gsd-t status` shows a Context line with `{pct}% of {window} tokens ({band}) — last check {time ago}`.

`.gsd-t/context-meter-config.json` controls the meter:

```json
{
  "enabled": true,
  "apiKeyEnvVar": "ANTHROPIC_API_KEY",
  "modelWindowSize": 200000,
  "thresholdPct": 85,
  "checkFrequency": 1
}
```

Threshold bands used by the orchestrator gate (v3.0.0 three-band model as of M35 / v2.76.10):

| Band      | Range       | Orchestrator action                                             |
|-----------|-------------|-----------------------------------------------------------------|
| normal    | 0–69%       | Proceed as normal                                               |
| warn      | 70–84%      | Surface warning; runway estimator refuses if projection crosses |
| stop      | ≥85%        | Halt cleanly; headless auto-spawn continues in a fresh context  |

**Zero silent quality degradation.** There is no `downgrade` or `conserve` band anymore. When the runway estimator (`bin/runway-estimator.js`) projects a run will cross the 85% stop threshold, the command refuses to start. Instead of printing "please `/clear` and resume," it calls `bin/headless-auto-spawn.js` which detaches a child process to continue the work. The interactive session receives a single ⛔ banner and exits cleanly; the user is never blocked.

**Per-phase model selection** — see `bin/model-selector.js` for the declarative rules table (≥13 phase mappings). Each command file carries a `## Model Assignment` block documenting which phases run on haiku / sonnet / opus. Complexity signals (`cross_module_refactor`, `security_boundary`, `data_loss_risk`, `contract_design`) escalate sonnet→opus at plan time.

**`/advisor` escalation** — mid-phase escalation channel. If `/advisor` is programmable in the runtime, subagents invoke it directly; otherwise, the convention-based fallback (`bin/advisor-integration.js`) appends a `missed_escalation` marker to `.gsd-t/token-log.md` that surfaces at `gsd-t-reflect`. See `.gsd-t/contracts/model-selection-contract.md` v1.0.0.

**`gsd-t metrics` CLI** — `gsd-t metrics --tokens [--by model,command,phase,milestone,domain,domain_type]` aggregates `.gsd-t/token-metrics.jsonl` into a count/total/mean/median/p95 table. `gsd-t metrics --halts` breaks halts down by type (`clean`, `runway-refusal`, `headless-handoff`, `native-compact`). `gsd-t metrics --tokens --context-window` buckets spawns by `context_window_pct_before` in 10% increments. See `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0.

**Optimization apply/reject** — `/user:gsd-t-optimization-apply {ID}` promotes a pending recommendation; `/user:gsd-t-optimization-reject {ID} [--reason "text"]` dismisses it with a 5-milestone cooldown. Both are idempotent. See `commands/gsd-t-optimization-apply.md` and `commands/gsd-t-optimization-reject.md`.

**Observability logging columns** — as of M34, the `.gsd-t/token-log.md` header includes `Ctx%` (the real session-wide context percentage at the time of the subagent spawn) replacing the earlier `Tasks-Since-Reset` column. The old column was a proxy count of how many tasks had run since the last `/clear`; the new column is the actual measurement.

**Upgrading from pre-M34** — `gsd-t update-all` handles the migration automatically:
- Copies the hook script, runtime files, and config template into every registered project
- Runs a one-time task-counter retirement (`bin/task-counter.cjs` + `.task-counter*` files deleted, `.gsd-t/.task-counter-retired-v1` marker written)
- Idempotent on second run

After upgrading, you **must** set `ANTHROPIC_API_KEY` or `gsd-t doctor` will fail.

**Historical note on v2.74.12–13**: between 2026-03 and 2026-04, the orchestrator used `bin/task-counter.cjs` as a proxy — it assumed N tasks ≈ M% context used. That was itself a replacement for an earlier env-var-based check (`CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX`) that never worked because Claude Code does not export those vars. The Context Meter (v2.75.10, M34) is the first version that measures context burn from the authoritative source: the Anthropic API itself.

---

## License

MIT
