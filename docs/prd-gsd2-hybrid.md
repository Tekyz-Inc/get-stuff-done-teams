# PRD: GSD 2 Hybrid Enhancements

## Document Info
| Field | Value |
|-------|-------|
| **PRD ID** | PRD-GSD2-001 |
| **Date** | 2026-03-18 |
| **Author** | GSD-T Team |
| **Status** | DRAFT |
| **Milestones** | M22 (Tier 1), M23 (Tier 2), M24 (Docker) |
| **Version Target** | 2.39.10 (M22), 2.40.10 (M23), 2.41.10 (M24) |
| **Priority** | P0 — critical for enterprise delivery quality |
| **Predecessor** | M21 (Graph-Powered Commands) + scan validation |
| **Successor** | Production deployment readiness |
| **Related** | PRD-GRAPH-001 (M20-M21 must complete first) |

---

## 1. Problem Statement

GSD-T has the strongest development methodology for AI-assisted software engineering: contracts, domains, quality gates, impact analysis, multi-surface awareness. But it has gaps in **delivery runtime** that prevent it from achieving zero-impact releases at enterprise scale:

1. **Context rot** — Long milestones with many tasks degrade subagent quality. By task 9 of 12, context is 75% full, and the agent makes mistakes in the last tasks where quality matters most.
2. **Checklist blindness** — 8 quality gates can all pass while the actual user-facing behavior doesn't work. A function returns a hardcoded value, a UI component renders static text, a webhook handler is a console.log. Gates check structure, not behavior.
3. **Static plans** — Plans are created once and never revised. If execution reveals new constraints (API rate limits, data format surprises, missing dependencies), remaining domains execute against an outdated plan.
4. **Unbounded cost** — Token spend is logged but never enforced. A complex milestone can burn 40%+ of monthly budget before anyone notices.
5. **No CI/CD integration** — GSD-T requires a human at the keyboard. Can't run overnight builds, automated hotfixes, or release gates in a pipeline.
6. **No programmatic state access** — Reading `.gsd-t/` state requires an LLM call. Can't feed status into dashboards, standup scripts, or monitoring systems.
7. **Agent file conflicts** — Parallel domain execution in `execute` and `wave` can cause file conflicts when multiple agents work in the same working tree.

These gaps come from GSD 2 (github.com/gsd-build/gsd-2), which solves them with patterns that can be adopted into GSD-T without its runtime or LLM-agnostic architecture.

---

## 2. Objective

Integrate 8 enhancements from GSD 2 into GSD-T across 3 tiers, preserving GSD-T's contract-driven methodology while adding enterprise delivery capabilities.

**Core principle**: Quality comes from the methodology (contracts, gates, impact analysis), not from the LLM. These enhancements strengthen the methodology's execution, not replace it.

**Key architectural decision**: LLM agnosticism is NOT a goal. GSD-T stays Claude-committed. Model tiering (haiku/sonnet/opus) already provides multi-model value. Optional model failover is added ONLY in headless mode as a resilience feature.

---

## 3. The Trifecta: Worktree + Fresh Dispatch + Graph

The combination of three capabilities creates safe, high-quality parallel domain execution:

```
┌─────────────────────────────────────────────────────────┐
│                   PARALLEL EXECUTION                     │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ Domain A  │    │ Domain B  │    │ Domain C  │          │
│  │           │    │           │    │           │          │
│  │ Worktree  │    │ Worktree  │    │ Worktree  │          │
│  │ (own fs)  │    │ (own fs)  │    │ (own fs)  │          │
│  │           │    │           │    │           │          │
│  │ Fresh ctx │    │ Fresh ctx │    │ Fresh ctx │          │
│  │ (scope +  │    │ (scope +  │    │ (scope +  │          │
│  │ contracts)│    │ contracts)│    │ contracts)│          │
│  │           │    │           │    │           │          │
│  │ Graph     │    │ Graph     │    │ Graph     │          │
│  │ (knows    │    │ (knows    │    │ (knows    │          │
│  │ boundaries│    │ boundaries│    │ boundaries│          │
│  │ & deps)   │    │ & deps)   │    │ & deps)   │          │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘          │
│        │                │                │                │
│        ▼                ▼                ▼                │
│  ┌─────────────────────────────────────────────┐         │
│  │     Contract-Validated Atomic Merges          │        │
│  │  merge A → test → merge B → test → merge C   │        │
│  └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

Each agent gets:
- **Its own filesystem** (worktree) — can't step on other agents' files
- **Its own context** (fresh dispatch) — only sees relevant domain scope + contracts
- **Full code awareness** (graph) — knows exactly what it owns and what crosses boundaries

---

## 4. Enhancement Details

### 4.1 Fresh Context Dispatch (Tier 1)

**Problem**: All domain tasks currently execute in one growing context. By task 9 of 12, context utilization is 75%+. The agent makes mistakes because it's reasoning through noise.

**Solution**: Each domain task dispatched to a subagent with a fresh context containing ONLY:
- Domain's `scope.md` (file list, constraints)
- Relevant contracts (only those the domain implements or consumes)
- Domain's `tasks.md` (current task + dependencies)
- Graph context for the domain's files (if graph available)
- Prior failure/learning entries for this domain from Decision Log

**Real-World Scenario**: Payment processing milestone with 12 tasks across 4 domains. Today, by task 9 (fraud scoring in the risk domain), context is 75% full with payment, cart, and notification domain residue. The agent hallucinates a function name from the cart domain and introduces a bug. With fresh dispatch, the risk domain agent gets 15% context utilization — only risk-domain files, risk contracts, and risk-relevant graph data. Clean reasoning, no hallucination.

**Commands affected**: execute, wave, integrate (any command that dispatches domain tasks)

### 4.2 Worktree Isolation (Tier 1)

**Problem**: Parallel domain agents share one working tree. Two agents editing adjacent files can create merge conflicts. If domain A breaks, its partially-written files contaminate the tree for domain B.

**Solution**: Each domain agent works in its own git worktree. Merges are atomic and sequential with contract validation between each merge.

**Workflow**:
```
1. execute creates N worktrees (one per domain)
2. Each domain agent works in its worktree (isolated filesystem)
3. Domain A completes → merge A's worktree to main → run integration tests
4. Tests pass → Domain B's worktree merges → run integration tests
5. Tests fail → rollback domain B, keep domain A. Debug domain B.
6. Clean up worktrees after all merges
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

**Solution**: After each domain completes in `execute`, check:
1. Did execution reveal any new constraints? (API rate limits, missing dependencies, data format surprises)
2. Do remaining domains' plans depend on assumptions that are now invalid?
3. If yes → revise remaining domain plans before dispatching next domain

**Real-World Scenario**: Notification system. Plan says "use SendGrid API for bulk email." During payments domain execution, the agent discovers SendGrid has a 100-email/second rate limit. The notifications domain plan calls for 10,000 emails on order confirmation. Without replanning, the notifications domain builds a synchronous loop that takes 100 seconds per batch. With adaptive replanning, execute pauses after payments domain, revises notifications plan to add a queue architecture, then dispatches notifications domain with the updated plan.

**Commands affected**: execute, wave (execute phase dispatches replanning check between domains)

### 4.5 Budget Ceilings (Tier 1)

**Problem**: Token spend is logged in `token-log.md` but never enforced. A complex milestone can consume 40%+ of monthly budget without warning.

**Solution**:
- Add `budget` field to milestone definition in `progress.md` (tokens or USD)
- After each subagent returns, check cumulative spend against ceiling
- At 80% threshold → warn user
- At 100% threshold → pause execution, present options (continue, descope, abort)

**Real-World Scenario**: SSO integration milestone budgeted at 500K tokens. OAuth provider documentation is massive and the agent over-researches. By domain 2 of 4, cumulative spend is 420K (84%). Budget ceiling warns the user. User reviews and sees research consumed 200K tokens unnecessarily. Pauses, descopes SSO to its own simpler milestone, reallocates remaining budget. Without ceilings, the milestone would burn through 800K tokens — 42% of monthly budget — before user notices.

**Commands affected**: execute, wave, integrate (any command that spawns subagents)

---

### 4.6 Headless CLI Mode (Tier 2)

**Problem**: GSD-T requires a human at the keyboard. Can't run in CI/CD pipelines, overnight builds, or automated release gates.

**Solution**: `gsd-t headless` CLI mode that runs milestones/commands without interactive prompts.

**Exit codes**:
| Code | Meaning |
|------|---------|
| 0 | Success — all phases passed |
| 1 | Verify failure — quality gates didn't pass |
| 2 | Budget exceeded — ceiling reached |
| 3 | Error — unrecoverable failure |
| 4 | Blocked — requires human decision |

**Capabilities**:
- Run a full wave (partition → execute → verify → complete) unattended
- Output structured JSON results for pipeline consumption
- Integrate with CI/CD systems (GitHub Actions, GitLab CI, Jenkins)
- Optional model failover for resilience (if Claude is down, try secondary model)
- Respect budget ceilings (exit code 2 instead of burning through budget)

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
gsd-t headless query budget          # token spend vs ceiling
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

| Command | Fresh Context | Worktree | Goal-Backward | Adaptive Replan | Budget Ceiling | Headless |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| **execute** | X | X | | X | X | X |
| **wave** | X | X | X | X | X | X |
| **integrate** | X | X | | | X | X |
| **verify** | | | X | | | X |
| **complete-milestone** | | | X | | | X |
| **scan** | | | | | X | X |
| **impact** | | | | | | X |
| **debug** | X | | | | X | X |
| **quick** | | | | | | X |
| **partition** | | | | | | X |
| **plan** | | | | | | X |
| **test-sync** | | | | | | X |
| **qa** | | | | | X | X |
| **gap-analysis** | | | | | | X |
| **status** | | | | | | X |
| **visualize** | | | | | | X |

### Commands Unchanged

milestone, project, prd, feature, discuss, setup, triage-and-merge, reflect, brainstorm, prompt, health, log, resume, pause, help, all backlog commands, branch, checkin, Claude-md, global-change, populate, promote-debt, init, init-scan-setup, version-update, version-update-all

---

## 6. Milestone Breakdown

### M22: GSD 2 Tier 1 — Execution Quality

**Scope**: Fresh context dispatch, worktree isolation, goal-backward verification, adaptive replanning, budget ceilings.

| Domain | Deliverables |
|--------|-------------|
| **fresh-dispatch** | Context builder (scope + contracts + graph → subagent prompt), dispatch coordinator |
| **worktree-isolation** | Worktree lifecycle (create/merge/discard), per-domain branch naming, atomic merge with contract validation |
| **goal-backward** | Requirement-to-behavior verifier, placeholder detector (console.log/TODO/hardcoded patterns), end-to-end behavior check |
| **adaptive-replan** | Post-domain constraint checker, plan revision engine, remaining-domain impact assessor |
| **budget-ceilings** | Budget field in progress.md, cumulative spend tracker, threshold alerts (80%/100%), pause/descope/abort options |

**Exit Criteria**:
- Execute in parallel mode uses worktrees — zero file conflicts
- Fresh dispatch reduces context utilization to <25% per domain task
- Goal-backward catches at least 1 placeholder that gates missed (tested on synthetic project)
- Adaptive replanning revises a remaining domain plan when a constraint is discovered
- Budget ceiling pauses execution at threshold
- All changes reflected in contracts, Pre-Commit Gate, and 4 reference docs

### M23: GSD 2 Tier 2 — Headless Mode

**Scope**: Headless CLI execution, headless query, optional model failover.

| Domain | Deliverables |
|--------|-------------|
| **headless-exec** | `gsd-t headless` subcommand, non-interactive execution, meaningful exit codes, structured JSON output |
| **headless-query** | `gsd-t headless query` subcommand, 7 query types, ~50ms response, no LLM calls |
| **model-failover** | Optional secondary model config, auto-failover on primary timeout/error, headless-only feature |
| **pipeline-integration** | GitHub Actions example workflow, documentation |

**Exit Criteria**:
- `gsd-t headless wave` runs a milestone end-to-end without prompts
- Exit codes match specification (0-4)
- `gsd-t headless query status` returns JSON in <100ms
- Model failover activates when primary model times out (tested with mock)
- GitHub Actions example workflow runs successfully
- Documentation in infrastructure.md

### M24: Docker (Enterprise)

**Scope**: Containerized GSD-T execution.

| Domain | Deliverables |
|--------|-------------|
| **docker** | Dockerfile, docker-compose.yml, Vault secret injection, volume mount config |
| **docs** | Infrastructure.md Docker section, README Docker quickstart |

**Exit Criteria**:
- `docker-compose up` runs a headless milestone
- Secrets injected via environment variables (Vault-compatible)
- Container is ephemeral — no state persists after run
- Documentation complete

---

## 7. Non-Goals

- **LLM agnosticism** — GSD-T stays Claude-committed. Model failover is a resilience feature in headless mode only.
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
| Goal-backward verification is too slow (requires behavior analysis) | Medium | Medium | Scope to critical requirements only; skip for trivial tasks |
| Adaptive replanning causes infinite loops (new constraint → replan → new constraint) | Low | High | Max 2 replanning cycles per execute; after that, pause for user |
| Headless mode Claude Code API changes | Medium | Medium | Abstract Claude Code interaction behind adapter; pin to known-good version |
| Budget ceiling is too aggressive and blocks productive work | Low | Medium | Default ceiling is generous (80% of monthly); user can override per-milestone |

---

## 9. Dependencies

| Dependency | Type | Risk |
|-----------|------|------|
| Graph Engine (M20-M21) | Required predecessor | Must complete and validate before starting M22 |
| Claude Code worktree support | Required (existing) | EnterWorktree already available |
| Claude Code subagent API | Required (existing) | Agent tool already available |
| Git worktree support | Required (existing) | Standard git feature |
| Docker | Optional (M24 only) | Standard tooling |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Context utilization per domain task (fresh dispatch) | < 25% (down from 60-75%) |
| File conflicts in parallel execution (worktree) | 0 (down from occasional) |
| Placeholder implementations caught (goal-backward) | ≥ 1 per milestone that gates missed |
| Plan revisions triggered (adaptive replan) | When execution reveals constraints |
| Budget overruns (ceilings) | 0 — always pauses at threshold |
| Headless execution success rate | ≥ 90% (exit code 0) |
| Headless query response time | < 100ms |
| Docker startup time | < 30 seconds |

---

## 11. Timeline

| Milestone | Estimated Effort | Sequence |
|-----------|-----------------|----------|
| M22: GSD 2 Tier 1 | 5 domains, high complexity | After M21 validation |
| M23: GSD 2 Tier 2 | 4 domains, medium complexity | After M22 |
| M24: Docker | 2 domains, low complexity | After M23 |

---

## 12. Relationship to Graph Engine (PRD-GRAPH-001)

The graph engine (M20-M21) is a **hard prerequisite** for GSD 2 enhancements:

- **Fresh dispatch** uses graph context to build minimal, relevant prompts for each domain
- **Worktree isolation** uses graph to validate that no domain agent modified files outside its graph-defined ownership
- **Goal-backward** uses graph to trace requirement → code path → behavior chain
- **Adaptive replanning** uses graph to assess which remaining domains are affected by new constraints
- **Headless query** can expose graph data (entity counts, domain mapping) via `gsd-t headless query graph`

The trifecta (worktree + fresh dispatch + graph) is the foundation for everything in this PRD. Without the graph, these enhancements work but are significantly less effective.
