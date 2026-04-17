# PRD: GSD 2 Hybrid Enhancements

## Document Info
| Field | Value |
|-------|-------|
| **PRD ID** | PRD-GSD2-001 |
| **Date** | 2026-03-18 |
| **Author** | GSD-T Team |
| **Status** | ACTIVE — M22 COMPLETE, M23 COMPLETE (2026-03-22), M24 QUEUED |
| **Milestones** | M22 (Tier 1), M23 (Tier 2), M24 (Docker) |
| **Version Target** | 2.40.10 (M22), 2.41.10 (M23), 2.42.10 (M24) |
| **Priority** | P0 — critical for enterprise delivery quality |
| **Predecessor** | M21 (Graph-Powered Commands) — DELIVERED |
| **Successor** | Production deployment readiness |
| **Related** | PRD-GRAPH-001 (M20-M21 — DELIVERED) |

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-18 | v1 | Initial DRAFT |
| 2026-03-20 | v2 | Revalidation: Fresh dispatch elevated to task-level (not domain-level); Budget ceilings reframed as Context Observability (context window %, token breakdown — not cost enforcement); Model failover dropped from M23; Plan command gains "single context window" constraint; No custom engine needed for M22 — all via Agent tool + team mode + worktree isolation; PRD-GRAPH-001 marked DELIVERED |
| 2026-03-22 | v3 | M22 COMPLETE — 18/18 tasks across 5 domains, 293 tests passing, v2.40.10 released |
| 2026-03-22 | v4 | M23 COMPLETE — 3 domains (headless-exec, headless-query, pipeline-integration), 36 new tests (329 total), v2.41.10 released |

---

## 1. Problem Statement

GSD-T has the strongest development methodology for AI-assisted software engineering: contracts, domains, quality gates, impact analysis, multi-surface awareness. But it has gaps in **delivery runtime** that prevent it from achieving zero-impact releases at enterprise scale:

1. **Context rot** — Long milestones with many tasks degrade subagent quality. By task 9 of 12, context is 75% full, and the agent makes mistakes in the last tasks where quality matters most. **This is the #1 problem.** Even with domain-level subagent dispatch (which GSD-T already does), context accumulates *within* a domain as tasks execute sequentially.
2. **Compaction dependency** — When context fills, Claude Code compacts (summarizes) prior context. This loses nuance, introduces drift, and is unpredictable. The goal is to **never trigger compaction** by keeping each unit of work small enough to complete in a fresh context window.
3. **Checklist blindness** — 8 quality gates can all pass while the actual user-facing behavior doesn't work. A function returns a hardcoded value, a UI component renders static text, a webhook handler is a console.log. Gates check structure, not behavior.
4. **Static plans** — Plans are created once and never revised. If execution reveals new constraints (API rate limits, data format surprises, missing dependencies), remaining domains execute against an outdated plan.
5. **No context observability** — Token spend is logged in `token-log.md` but there's no visibility into context window utilization per subagent, no breakdown of where tokens are consumed, and no warning before compaction triggers.
6. **No CI/CD integration** — GSD-T requires a human at the keyboard. Can't run overnight builds, automated hotfixes, or release gates in a pipeline.
7. **No programmatic state access** — Reading `.gsd-t/` state requires an LLM call. Can't feed status into dashboards, standup scripts, or monitoring systems.
8. **Agent file conflicts** — Parallel domain execution in `execute` and `wave` can cause file conflicts when multiple agents work in the same working tree.

These gaps come from GSD 2 (github.com/gsd-build/gsd-2), which solves them with patterns that can be adopted into GSD-T without its runtime or LLM-agnostic architecture.

---

## 2. Objective

Integrate 7 enhancements from GSD 2 into GSD-T across 3 tiers, preserving GSD-T's contract-driven methodology while adding enterprise delivery capabilities.

**Primary goals** (in priority order):
1. **Eliminate compaction** — Each task completes in a single fresh context window. Compaction never triggers.
2. **Reduce context utilization** — Each task agent uses ~10-20% of the context window, not 60-75%.
3. **Parallel orchestration with adaptive replanning** — Domains execute in parallel with worktree isolation. The orchestrator reads domain summaries and revises remaining plans when execution reveals new constraints.

**Core principle**: Quality comes from the methodology (contracts, gates, impact analysis), not from the LLM. These enhancements strengthen the methodology's execution, not replace it.

**Key architectural decisions**:
- LLM agnosticism is NOT a goal. GSD-T stays Claude-committed.
- No custom execution engine needed for M22. All capabilities are achieved via Claude Code's existing Agent tool (parallel subagent dispatch, `isolation: "worktree"`, team mode).
- Model failover is dropped entirely — not needed on max subscription plan.

---

## 3. The Trifecta: Worktree + Fresh Dispatch + Graph

The combination of three capabilities creates safe, high-quality parallel domain execution:

```
┌─────────────────────────────────────────────────────────────────┐
│                     PARALLEL EXECUTION                           │
│                                                                  │
│  Execute Orchestrator (lightweight — sees summaries only)        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Dispatches domains in dependency order (wave 1, wave 2)   │   │
│  │ Reads domain summaries → replan check → revise if needed  │   │
│  │ Context: ~4-8% utilization (summaries + plans on disk)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│        │                │                │                       │
│  ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐               │
│  │ Domain A   │    │ Domain B   │    │ Domain C   │              │
│  │            │    │            │    │            │              │
│  │ Worktree   │    │ Worktree   │    │ Worktree   │              │
│  │ (own fs)   │    │ (own fs)   │    │ (own fs)   │              │
│  │            │    │            │    │            │              │
│  │ Task 1 ──→ fresh subagent (10-20% ctx) → dies               │
│  │ Task 2 ──→ fresh subagent (10-20% ctx) → dies               │
│  │ Task N ──→ fresh subagent (10-20% ctx) → dies               │
│  │            │    │            │    │            │              │
│  │ Graph      │    │ Graph      │    │ Graph      │              │
│  │ (boundaries│    │ (boundaries│    │ (boundaries│              │
│  │  & deps)   │    │  & deps)   │    │  & deps)   │              │
│  └─────┬─────┘    └─────┴─────┘    └─────┴─────┘               │
│        │                │                │                       │
│        ▼                ▼                ▼                       │
│  ┌──────────────────────────────────────────────────┐           │
│  │     Contract-Validated Atomic Merges               │          │
│  │  merge A → test → merge B → test → merge C        │          │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

Each agent gets:
- **Its own filesystem** (worktree via Agent tool's `isolation: "worktree"`) — can't step on other agents' files
- **Its own context** (fresh dispatch per task) — only sees relevant domain scope + contracts + single task
- **Full code awareness** (graph) — knows exactly what it owns and what crosses boundaries

**Key distinction from v1**: Fresh dispatch is **task-level**, not domain-level. Each individual task within a domain gets its own fresh subagent. The domain dispatcher is lightweight — it sequences tasks and passes prior task summaries (not full context) to the next task agent.

---

## 4. Enhancement Details

### 4.1 Fresh Context Dispatch (Tier 1) — TASK-LEVEL

**Problem**: GSD-T currently dispatches one subagent per domain. That subagent runs all N tasks within the domain sequentially, and context grows with each task. By task 9 of 12, context utilization is 75%+. The agent makes mistakes because it's reasoning through noise. If context exceeds capacity, compaction triggers — losing nuance and introducing drift.

**Current architecture** (domain-level):
```
Execute orchestrator
  └── Domain-A subagent (fresh, but grows across tasks 1→2→3→...→12)
       └── task 1, task 2, ... task 12 (sequential, context accumulates)
```

**New architecture** (task-level):
```
Execute orchestrator
  └── Domain-A task-dispatcher (lightweight, stays small)
       ├── Task 1 subagent (fresh) → completes → summary saved to disk → dies
       ├── Task 2 subagent (fresh + task 1 summary) → completes → dies
       └── Task 12 subagent (fresh + prior summaries) → completes → dies
```

**Each task subagent receives ONLY**:
- Domain's `scope.md` (file list, constraints)
- Relevant contracts (only those the domain implements or consumes)
- The single task from `tasks.md` (not all tasks — just the current one)
- Graph context for files this task touches (if graph available)
- Prior task summaries (10-20 lines each, not full prior context)
- Prior failure/learning entries for this domain from Decision Log

**Context utilization per task**: ~10-20% (down from 60-75% cumulative)
**Compaction**: Never triggers — each task completes well within one context window

**Plan command constraint** (new): `gsd-t-plan` MUST enforce the rule: **"A task must fit in one context window. If it can't, it's two tasks."** This guarantees fresh dispatch works. The plan command validates task scope during generation and splits oversized tasks automatically.

**Real-World Scenario**: Payment processing milestone with 12 tasks across 4 domains. Today, by task 9 (fraud scoring in the risk domain), context is 75% full with accumulated residue from tasks 1-8. The agent hallucinates a function name from an earlier task and introduces a bug. With task-level fresh dispatch, the fraud scoring agent gets ~15% context utilization — only risk-domain files, the fraud scoring task, relevant contracts, and prior task summaries. Clean reasoning, zero hallucination, zero compaction risk.

**Commands affected**: execute, wave, integrate (any command that dispatches domain tasks)

### 4.2 Worktree Isolation (Tier 1)

**Problem**: Parallel domain agents share one working tree. Two agents editing adjacent files can create merge conflicts. If domain A breaks, its partially-written files contaminate the tree for domain B.

**Solution**: Each domain agent works in its own git worktree via the Agent tool's `isolation: "worktree"` parameter. Merges are atomic and sequential with contract validation between each merge.

**Implementation**: No custom worktree management code needed. Claude Code's Agent tool already supports `isolation: "worktree"` which creates a temporary git worktree, gives the agent an isolated copy of the repo, and returns the worktree path and branch when changes are made. The execute command's team-mode dispatch simply adds this parameter to each Agent spawn.

**Workflow**:
```
1. execute dispatches N agents with isolation: "worktree" (one per domain)
2. Each domain agent works in its worktree (isolated filesystem)
3. Domain A completes → merge A's worktree branch to main → run integration tests
4. Tests pass → Domain B's worktree branch merges → run integration tests
5. Tests fail → rollback domain B, keep domain A. Debug domain B.
6. Clean up worktrees after all merges (automatic for no-change agents)
```

**Real-World Scenario**: 3 domain agents working simultaneously on auth, payments, and notifications. Auth domain agent introduces a regression in shared middleware. With shared working tree, the other agents see the broken middleware and may adapt to it — propagating the bug. With worktree isolation, auth's regression is contained. When merge fails integration tests, only auth's worktree is discarded. Payments and notifications merge cleanly.

**Rollback granularity**: Per-domain, not per-commit. Discard one domain's entire contribution without affecting others.

**Commands affected**: execute (parallel mode), wave (parallel execution phase), integrate

### 4.3 Goal-Backward Verification (Tier 1)

**Problem**: 8 quality gates verify structure (tests pass, contracts match, files exist). They don't verify behavior. A function that returns `console.log("TODO")` passes all structural checks.

**Solution**: After all quality gates pass, run a goal-backward verification pass:
1. Read the milestone's stated goals and requirements
2. For each requirement, verify the behavior exists end-to-end
3. Check for placeholder implementations (console.log, TODO, hardcoded returns, static UI)
4. Verify from the user's perspective: "If I click this button / call this endpoint / trigger this event, does the expected thing happen?"

**Real-World Scenario**: Offline sync feature passes all 8 gates:
- Tests pass (unit tests mock the sync logic)
- Contracts match (API shapes are correct)
- Files exist (sync-service.ts, conflict-resolver.ts)
- Coverage looks good (80%)

Goal-backward verification finds:
- `conflictResolver.resolve()` returns `console.log("implement conflict resolution")`
- Sync status indicator in the UI is a static "Synced" string, never updates
- Offline delete is not implemented at all — the requirement says "delete offline items" but no code path exists

All 3 would ship to production and fail. Goal-backward catches them.

**Commands affected**: verify, complete-milestone, wave (at verification phase)

### 4.4 Adaptive Replanning (Tier 1)

**Problem**: Plans are static. Created during `plan` phase, never revised. If execution reveals new constraints, remaining domains execute against outdated assumptions.

**Solution**: After each domain completes in `execute`, the orchestrator reads the domain's result summary and checks:
1. Did execution reveal any new constraints? (API rate limits, schema mismatches, missing dependencies, data format surprises)
2. Do remaining domains' plans depend on assumptions that are now invalid?
3. If yes → revise remaining domain `tasks.md` files on disk before dispatching next domain

**How it works without an engine**: The execute orchestrator is an LLM agent. It dispatches domain agents and reads their summaries. Summaries are small (10-20 lines each). The replan check is LLM reasoning: "does this summary invalidate any remaining plan?" Plan revision writes updated `tasks.md` files to disk. Next domain agent reads the revised `tasks.md` from disk (fresh context). The orchestrator stays lightweight (~4-8% context utilization) because it only holds summaries and plan references, not full domain work.

**Orchestrator context budget**:
```
Execute command prompt:            ~2K tokens
Domain list + dependency order:    ~500 tokens
Summary from Domain A:             ~500 tokens
Replan reasoning:                  ~1K tokens
Summary from Domain B:             ~500 tokens
Replan reasoning:                  ~1K tokens
...
Total for 5 domains:               ~8K tokens = ~4% context utilization
```

**Guard**: Max 2 replanning cycles per execute run. After that, pause for user input to prevent infinite loops (new constraint → replan → new constraint).

**Real-World Scenarios**:

**API constraint discovery**: Plan says "use Stripe Charges API." Payments domain discovers Charges API is deprecated — must use PaymentIntents (async, webhook-based). Without replanning, subscriptions domain builds against Charges API (fails at runtime), notifications domain builds synchronous receipt sending (impossible with async confirmation). With replanning, orchestrator revises both domains' plans to use PaymentIntents API before they execute.

**Schema shape surprise**: Plan says "query users.org_id." Auth domain discovers existing table uses `organization_id`, not `org_id`. Without replanning, billing and reporting domains build queries referencing `org_id` — every query fails. With replanning, orchestrator updates both domains' plans to use `organization_id`.

**Dependency incompatibility**: Plan says "use Socket.io." Websocket domain discovers HTTP/2 incompatibility in the project's Node version, switches to native `ws` library. Without replanning, dashboard-ui imports `socket.io-client` (wrong library). With replanning, orchestrator revises dashboard-ui to use the `ws` client API.

**Commands affected**: execute, wave (execute phase dispatches replanning check between domains)

### 4.5 Context Observability (Tier 1)

**Problem**: Token spend is logged in `token-log.md` but there's no real-time visibility into context window utilization per subagent, no breakdown of where tokens are consumed across domains/tasks/phases, and no warning before compaction triggers.

**Solution**: Context-window-aware monitoring and token usage visibility. NOT cost enforcement — the user is on the max subscription plan and does not need spend limits.

**Capabilities**:
- **Context window % tracking**: After each subagent returns, log the peak context utilization (% of window used). Track via `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX`.
- **Compaction proximity warning**: If any subagent exceeds 70% context utilization, warn the user. This indicates a task is too large for fresh dispatch and should be split.
- **Token breakdown by scope**: Aggregate token usage by domain, by task, and by phase. Show where the most tokens are consumed so the user can identify optimization targets.
- **Dashboard-ready data**: Token usage data structured for `gsd-t-visualize` and `gsd-t headless query context` consumption.

**Data model** (extends existing `token-log.md`):
```
| Datetime | Command | Domain | Task | Model | Duration | Tokens | Ctx% | Compacted |
```

New fields: `Domain` (which domain), `Task` (which task within domain), `Ctx%` (peak context window utilization as percentage).

**Alerts**:
- `Ctx% > 70%` → ⚠️ Warning: task approaching compaction threshold. Consider splitting in plan.
- `Ctx% > 85%` → 🔴 Critical: compaction likely triggered. Task MUST be split.
- `Compacted = true` → 📊 Logged for visibility. Indicates fresh dispatch failed to prevent compaction for this task.

**Real-World Scenario**: After a milestone completes, user runs `gsd-t-status` and sees:
```
Token Usage by Domain:
  auth:           12,400 tokens (4 tasks, avg 3,100/task, peak ctx: 14%)
  payments:       28,600 tokens (7 tasks, avg 4,086/task, peak ctx: 18%)
  notifications:  45,200 tokens (3 tasks, avg 15,067/task, peak ctx: 52%)  ⚠️
  reporting:       8,100 tokens (2 tasks, avg 4,050/task, peak ctx: 12%)
```
User immediately sees that notifications domain is consuming disproportionate tokens with high context utilization. Investigation reveals one task ("build email template engine") is too large — should be split into 3 smaller tasks in future plans.

**Commands affected**: execute, wave, integrate (any command that spawns subagents); status and visualize (display); plan (validation — warn if task scope suggests >70% context)

---

### 4.6 Headless CLI Mode (Tier 2)

**Problem**: GSD-T requires a human at the keyboard. Can't run in CI/CD pipelines, overnight builds, or automated release gates.

**Solution**: `gsd-t headless` CLI mode that runs milestones/commands without interactive prompts. Built as a wrapper around `claude -p` (Claude Code's non-interactive piped mode), with parallel orchestration via multiple `claude -p` processes for domain-level parallelism.

**Architecture**:
```
gsd-t headless wave M25
  └── claude -p "/gsd-t-wave M25"
        └── Agent tool dispatches phases (fresh context per phase)
              └── Execute phase dispatches domains (parallel, worktree isolation)
                    └── Each domain dispatches tasks (fresh context per task)
```

For parallel domain execution in headless mode, the orchestrator (running inside `claude -p`) uses the same Agent tool + team mode + worktree isolation as interactive mode. No custom engine needed.

**Exit codes**:
| Code | Meaning |
|------|---------|
| 0    | Success — all phases passed |
| 1    | Verify failure — quality gates didn't pass |
| 2    | Context budget exceeded — compaction threshold reached |
| 3    | Error — unrecoverable failure |
| 4    | Blocked — requires human decision |

**Capabilities**:
- Run a full wave (partition → execute → verify → complete) unattended
- Output structured JSON results for pipeline consumption
- Integrate with CI/CD systems (GitHub Actions, GitLab CI, Jenkins)
- Respect context observability thresholds (exit code 2 if compaction detected)

**Real-World Scenarios**:

**Overnight feature build**: Developer defines milestone at 5pm, kicks off `gsd-t headless wave M25`. By 8am, the full feature is built, tested, and verified. Developer reviews the commit in the morning. If verification failed, exit code 1 and the developer sees exactly what failed.

**Automated hotfix**: PagerDuty fires at 3am. Runbook triggers `gsd-t headless quick "fix: null pointer in paymentHandler.processRefund"`. GSD-T creates the fix, runs tests, verifies contracts, commits. Oncall engineer reviews the PR in the morning.

**Release gate**: GitHub Actions runs `gsd-t headless verify` before allowing merge to main. If scan finds new tech debt, verify finds contract violations, or tests fail → merge blocked with detailed report.

**Metrics pipeline**: Post-run, parse the structured JSON output into Datadog/Grafana. Track: milestones/week, verification pass rate, mean time to complete, token spend per milestone.

**Commands affected**: New `headless` subcommand in `bin/gsd-t.js`; all commands gain headless-compatible output mode

### 4.7 Headless Query (Tier 2)

**Problem**: Reading `.gsd-t/` state requires spinning up an LLM session. A simple "what's the current milestone status?" takes 30+ seconds and costs tokens.

**Solution**: `gsd-t headless query` CLI that reads `.gsd-t/` state and returns JSON — no LLM call required. ~50ms response time.

**Queries**:
```bash
gsd-t headless query status          # current milestone, phase, domain progress
gsd-t headless query domains         # domain list with task counts
gsd-t headless query contracts       # contract compliance status
gsd-t headless query debt            # tech debt items by severity
gsd-t headless query context         # token usage breakdown + context utilization
gsd-t headless query backlog         # backlog items (filtered)
gsd-t headless query graph           # graph index summary (entity counts, domain mapping)
```

**Real-World Scenarios**:

**Standup prep**: Manager runs a 200ms script across 3 projects:
```bash
for project in api-service web-app mobile-app; do
  echo "=== $project ==="
  cd /projects/$project && gsd-t headless query status
done
```
Gets structured JSON status for all 3 projects in under a second. Previously: wait for each developer to paste status manually, or spend $0.50+ on LLM calls.

**Dashboard integration**: Grafana/Datadog polls `gsd-t headless query status` every 5 minutes. Displays real-time project health across the organization. No LLM cost.

**Pipeline scripting**: CI/CD step checks `gsd-t headless query debt --severity=high` before allowing deploy. If high-severity debt exists, block deployment.

**Commands affected**: New `headless query` subcommand in `bin/gsd-t.js`

### 4.8 Docker Support (Tier 3)

**Problem**: Enterprise security policies block API keys on developer laptops. Can't adopt GSD-T without running it in a controlled environment.

**Solution**: Dockerfile + docker-compose for containerized GSD-T execution.

**Architecture**:
```
┌─────────────────────────────────┐
│  Docker Container               │
│                                  │
│  Node.js + Claude Code + GSD-T   │
│                                  │
│  Secrets: Vault-injected         │
│  Volume: /project (mounted)      │
│  Network: egress-only            │
│                                  │
│  gsd-t headless wave M25         │
└─────────────────────────────────┘
```

**Real-World Scenario**: Financial services company. Security policy: no API keys on developer machines. All AI operations run in ephemeral containers with Vault-injected secrets. Container is destroyed after each run — no credential persistence. Audit log shows exactly which container, which secrets, which code was accessed.

**Deliverables**:
- `Dockerfile` with Node.js + Claude Code + GSD-T pre-installed
- `docker-compose.yml` with volume mounts, secret injection, network config
- Documentation in `docs/infrastructure.md`

**Commands affected**: All commands work inside the container; headless mode is primary interface

---

## 5. Command Impact Matrix

### Commands Modified by GSD 2 Enhancements

| Command              | Fresh Context | Worktree | Goal-Backward | Adaptive Replan | Context Obs. | Headless |
|----------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| **execute**          | X   | X   |     | X   | X   | X   |
| **wave**             | X   | X   | X   | X   | X   | X   |
| **integrate**        | X   | X   |     |     | X   | X   |
| **verify**           |     |     | X   |     |     | X   |
| **complete-milestone** |   |     | X   |     |     | X   |
| **plan**             |     |     |     |     |     | X   |
| **scan**             |     |     |     |     |     | X   |
| **impact**           |     |     |     |     |     | X   |
| **debug**            | X   |     |     |     | X   | X   |
| **quick**            |     |     |     |     |     | X   |
| **partition**        |     |     |     |     |     | X   |
| **test-sync**        |     |     |     |     |     | X   |
| **qa**               |     |     |     |     | X   | X   |
| **gap-analysis**     |     |     |     |     |     | X   |
| **status**           |     |     |     |     | X   | X   |
| **visualize**        |     |     |     |     | X   | X   |

**New constraint on plan**: Task-size validation — every task must fit in one context window. If estimated scope exceeds 70% context, plan splits the task automatically.

### Commands Unchanged

milestone, project, prd, feature, discuss, setup, triage-and-merge, reflect, brainstorm, prompt, health, log, resume, pause, help, all backlog commands, branch, checkin, Claude-md, global-change, populate, promote-debt, init, init-scan-setup, version-update, version-update-all

---

## 6. Milestone Breakdown

### M22: GSD 2 Tier 1 — Execution Quality — **COMPLETE** (2026-03-22, v2.40.10)

**Scope**: Fresh context dispatch (task-level), worktree isolation, goal-backward verification, adaptive replanning, context observability.

**Implementation approach**: All capabilities via Claude Code's existing Agent tool. No custom execution engine. Team mode for parallel domain dispatch. `isolation: "worktree"` for filesystem isolation. Subagent-per-task for fresh context.

| Domain               | Deliverables |
|----------------------|-------------|
| **fresh-dispatch**   | Task-level dispatch coordinator (one subagent per task, not per domain). Context builder (scope + contracts + graph + single task + prior summaries → subagent prompt). Summary capture and forwarding between tasks. |
| **worktree-isolation** | Agent tool `isolation: "worktree"` integration in execute team mode. Sequential merge with contract validation between each. Per-domain rollback. Worktree cleanup. |
| **goal-backward**    | Requirement-to-behavior verifier. Placeholder detector (console.log/TODO/hardcoded/static patterns). End-to-end behavior check against milestone goals. |
| **adaptive-replan**  | Post-domain summary reader. Constraint-vs-remaining-plan checker. Plan revision (writes updated `tasks.md` to disk). Max 2 replan cycles guard. |
| **context-observability** | Context window % tracking per subagent. Token breakdown by domain/task/phase. Compaction proximity alerts (70%/85%). Extended `token-log.md` format. Status/visualize integration. Plan validation (warn if task scope suggests >70% context). |

**Plan command update**: Add "single context window" constraint. During task generation, validate that each task's scope (files to touch, complexity estimate) fits within ~70% of a context window. If not, automatically split into smaller tasks. This is the guarantee that fresh dispatch works.

**Exit Criteria** — ALL MET:
- [x] Execute dispatches one subagent per TASK (not per domain) — verified by token-log entries
- [x] Context utilization per task subagent < 25% (measured via context observability)
- [x] Compaction triggers 0 times across a full milestone execution
- [x] Execute in parallel mode uses worktrees — zero file conflicts
- [x] Goal-backward catches at least 1 placeholder that gates missed (tested on synthetic project)
- [x] Adaptive replanning revises a remaining domain plan when a constraint is discovered
- [x] Context observability displays token breakdown by domain/task/phase in status output
- [x] All changes reflected in contracts, Pre-Commit Gate, and 4 reference docs

**Result**: 18/18 tasks complete, 293 tests pass, v2.40.10 tagged

### M23: GSD 2 Tier 2 — Headless Mode

**Scope**: Headless CLI execution (via `claude -p` wrapper), headless query, pipeline integration.

**Implementation approach**: `gsd-t headless` wraps `claude -p` for LLM-driven commands. `gsd-t headless query` is pure Node.js file parsing — no LLM call. Parallel orchestration uses the same Agent tool pattern as interactive mode (running inside the `claude -p` session).

| Domain                 | Deliverables |
|------------------------|-------------|
| **headless-exec**      | `gsd-t headless` subcommand. `claude -p` wrapper with argument forwarding. Non-interactive execution. Meaningful exit codes (0-4). Structured JSON output. |
| **headless-query**     | `gsd-t headless query` subcommand. 7 query types (status, domains, contracts, debt, context, backlog, graph). ~50ms response. No LLM calls. Pure file parsing. |
| **pipeline-integration** | GitHub Actions example workflow. GitLab CI example. Documentation in infrastructure.md. |

**Exit Criteria**:
- `gsd-t headless wave` runs a milestone end-to-end without prompts
- Exit codes match specification (0-4)
- `gsd-t headless query status` returns JSON in <100ms
- GitHub Actions example workflow runs successfully
- Documentation in infrastructure.md

### M24: Docker (Enterprise)

**Scope**: Containerized GSD-T execution.

| Domain     | Deliverables |
|------------|-------------|
| **docker** | Dockerfile, docker-compose.yml, Vault secret injection, volume mount config |
| **docs**   | Infrastructure.md Docker section, README Docker quickstart |

**Exit Criteria**:
- `docker-compose up` runs a headless milestone
- Secrets injected via environment variables (Vault-compatible)
- Container is ephemeral — no state persists after run
- Documentation complete

---

## 7. Non-Goals

- **LLM agnosticism** — GSD-T stays Claude-committed. No multi-provider support.
- **Model failover** — Dropped. Max subscription plan eliminates the need for fallback models.
- **Custom execution engine** — All M22 capabilities work via Claude Code's existing Agent tool, team mode, and worktree isolation. No separate orchestration process.
- **Cost-based budget enforcement** — Context observability tracks window utilization and token visibility, not dollar spend or monthly limits.
- **Standalone runtime** — GSD-T runs inside Claude Code. No Pi SDK, no separate process.
- **TUI** — Claude Code is the interface. No separate terminal UI.
- **VS Code extension** — Not needed; Claude Code handles IDE integration.
- **GSD 2 skill system** — GSD-T slash commands serve this role.
- **Two-terminal workflow** — GSD-T autonomy levels (1/2/3) handle the supervision spectrum.
- **Rust N-API bindings** — Claude Code handles file operations natively.

---

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Worktree merges create complex conflict resolution | Medium | High | Sequential merge with tests between each; discard and retry on conflict |
| Fresh dispatch loses cross-domain context needed for integration | Medium | Medium | Contracts are the explicit cross-domain interface; if context is needed, it's a contract gap |
| Task-level dispatch overhead (many small subagents vs fewer large ones) | Medium | Low | Subagent startup is fast (~1-2s). Net savings from avoiding compaction and context drift far outweigh overhead |
| Goal-backward verification is too slow (requires behavior analysis) | Medium | Medium | Scope to critical requirements only; skip for trivial tasks |
| Adaptive replanning causes infinite loops (new constraint → replan → new constraint) | Low | High | Max 2 replanning cycles per execute; after that, pause for user |
| Plan's "single context window" rule produces too many tiny tasks | Low | Medium | Target 70% ceiling, not 30%. Tasks should be meaningful units of work, just bounded in scope |
| Headless mode Claude Code API changes | Medium | Medium | Abstract Claude Code interaction behind adapter; pin to known-good version |

---

## 9. Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| Graph Engine (M20-M21) | Required predecessor | **DELIVERED** ✅  |
| Claude Code Agent tool (`isolation: "worktree"`) | Required (existing) | Available ✅  |
| Claude Code subagent API (Agent tool) | Required (existing) | Available ✅  |
| Claude Code piped mode (`claude -p`) | Required for M23 | Available ✅  |
| Git worktree support | Required (existing) | Standard git feature ✅  |
| Docker | Optional (M24 only) | Standard tooling |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Context utilization per task subagent (fresh dispatch) | < 25% (down from 60-75%) |
| Compaction events per milestone | 0 (down from multiple) |
| File conflicts in parallel execution (worktree) | 0 (down from occasional) |
| Placeholder implementations caught (goal-backward) | ≥ 1 per milestone that gates missed |
| Plan revisions triggered (adaptive replan) | When execution reveals constraints |
| Orchestrator context utilization (execute) | < 10% (summaries only) |
| Token breakdown visibility | By domain, task, and phase |
| Headless execution success rate | ≥ 90% (exit code 0) |
| Headless query response time | < 100ms |
| Docker startup time | < 30 seconds |

---

## 11. Timeline

| Milestone | Estimated Effort | Sequence |
|-----------|-----------------|----------|
| M22: GSD 2 Tier 1 | 5 domains, high complexity | **COMPLETE** (2026-03-22) ✅  |
| M23: GSD 2 Tier 2 | 3 domains, medium complexity | After M22 |
| M24: Docker        | 2 domains, low complexity  | After M23 |

---

## 12. Relationship to Graph Engine (PRD-GRAPH-001)

The graph engine (M20-M21) is a **completed prerequisite** for GSD 2 enhancements. PRD-GRAPH-001 status: **DELIVERED**.

- **Fresh dispatch** uses graph context to build minimal, relevant prompts for each task
- **Worktree isolation** uses graph to validate that no domain agent modified files outside its graph-defined ownership
- **Goal-backward** uses graph to trace requirement → code path → behavior chain
- **Adaptive replanning** uses graph to assess which remaining domains are affected by new constraints
- **Headless query** exposes graph data (entity counts, domain mapping) via `gsd-t headless query graph`

The trifecta (worktree + fresh dispatch + graph) is the foundation for everything in this PRD. The graph is now available — M22 can proceed.
