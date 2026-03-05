# GSD-T Brainstorm — 2026-02-18
## Topic: Expanding GSD-T's Power — Research-Backed Ideas from Across the Delivery Landscape

> **Session type**: Blue Sky (Mode E) + Enhancement (Mode B)
> **Research depth**: 4 parallel agents, ~140k tokens of research across AI dev systems, DevOps/platform engineering, software methodologies, and design-to-code/ML delivery

---

## The Central Insight

**Context is the bottleneck, not capability.**

This finding appeared independently in all four research streams. 65% of developers cite missing context as their #1 quality problem — more than hallucinations. Aider built their entire architecture around repository maps for this reason. Dagster tracks *what was produced* not just *whether tasks ran*. Design tokens work because they're structured data about design decisions consumable by any downstream system.

**GSD-T's contract system is correct for exactly this reason** — contracts are context architecture. The opportunity is to go deeper on dynamic, queryable, machine-consumable context rather than just broader in features.

---

## Part 1: Competitive Landscape — GSD-T vs. GSD

### Where the Original Comparison Was Accurate

- **GSD's plan-checker loop is a genuine gap** — GSD verifies plans before executing; GSD-T relies on contracts but has no automated "does this plan conform to the contract?" check
- **Context compacting (GSD-T 6/10)** — wave runs in a single session; GSD's fresh-context-per-plan is a structural win
- **Solo dev ergonomics (GSD-T 6/10)** — 9 phases feels enterprise-heavy for small tasks
- **Ecosystem gap (GSD-T 3/10 vs GSD 9/10)** — 12.8k stars means real-world edge cases found and fixed

### Where the Comparison Was Wrong

- **Command count**: The comparison said "27 commands" — actual count is 46. The token efficiency advantage is architectural (no mandatory research agents), not from fewer commands.
- **Context compacting is partially solved**: `gsd-t-wave` already spawns per-phase agents; `gsd-t-execute` in team mode spawns per-domain agents. Compacting score should be 7/10, not 6/10.

### The Key Strategic Gap to Close

Fresh-context execution is **opt-in** (team mode) rather than the default. Making subagents the default for domain execution would structurally close the compacting gap without changing the methodology.

---

## Part 2: Ideas from AI Dev Workflow Research

### Idea 1 — `gsd-t-patch`: Agentless Mode for Simple Changes
**Source**: Agentless framework (MIT) — outperforms agent frameworks on targeted changes at 1/10th the cost

The agentless three-phase pipeline: **Localize → Repair → Validate**

For well-understood surgical changes (bug fixes, dependency updates, config tweaks), skip the full phase ceremony:
1. Locate relevant files/functions using contract context
2. Make the minimal targeted change
3. Run only affected tests

This is the "right tool for small jobs" that GSD-T currently lacks. `gsd-t-quick` is close but still heavyweight for truly simple patches.

---

### Idea 2 — Repository Map Command
**Source**: Aider's tree-sitter AST + PageRank approach — entire codebase in ~1,000 tokens

Before any milestone executes, auto-generate a ranked repository map:
- Parse function signatures and class definitions (tree-sitter)
- Rank by cross-domain reference frequency (PageRank analog)
- Output: dynamic context artifact telling executing agents which symbols are most referenced, which files cross domain boundaries, which functions appear in contracts

**Not documentation — a dynamic context artifact that rebuilds as the codebase evolves.**

Possible command: `gsd-t-map` or built into the wave pre-flight step.

---

### Idea 3 — Execution Manifest (Machine-Readable SOP)
**Source**: MetaGPT's Standard Operating Procedures — agents communicate via documents, not dialogue; scored 3.9 vs ChatDev's 2.1

Before execute runs, generate a structured execution manifest:
```
Domain: auth-service
Artifacts to produce: auth.contract.v2, session-schema.v1
Contracts to satisfy: auth-contract.md (section 3.1), api-contract.md (section 5)
Done condition: all three auth flows pass tests, session tokens expire correctly
Subagent receives: [manifest + contracts + repository map]
```

This is the bridge between plan (human-readable) and execute (machine-executable). Subagents read the manifest, annotate it with their outputs, return it to the lead.

---

### Idea 4 — Pre-Execution File Localization Step
**Source**: AutoCodeRover — $0.43/issue at 19% SWE-bench vs competitors at 10× the cost

Before writing any code, executing agents must complete: *"Find the 5 most relevant files/functions for this task."* This stratified search (file → class → function) reduces hallucination and avoids the "confident wrong answer" failure mode.

This is already implicit in good Claude behavior but should be **explicit and enforced** in the execute command's first step.

---

### Idea 5 — Context as First-Class Infrastructure
**Source**: 65% of developers cite missing context as #1 problem; context engineering > prompt engineering

GSD-T currently has static contracts (true at planning time). The upgrade is **dynamic context**:
- Repository map (what exists now, how it's connected)
- Asset lineage (what produced this artifact, what depends on it)
- ADR query (why was this decision made, what contracts does it affect)
- Design token stream (what are the current design values, live from Figma)

Static contracts tell agents what was true at planning time. Dynamic context tells them what's true right now.

---

## Part 3: Ideas from DevOps & Platform Engineering Research

### Idea 6 — Golden Path Library
**Source**: Netflix ("paved roads"), Red Hat ("well-lit paths"), platform engineering consensus

GSD-T's wave command is a single golden path. The upgrade: **a library of milestone-type templates**, each with predefined domain structures, required contracts, and known failure modes.

```
Auth Milestone Golden Path:
  Domains: user-store, auth-service, session-management
  Required contracts: auth-contract.md, session-contract.md
  Mandatory security checks: OWASP auth checklist
  Known failure modes: token expiry edge cases, session fixation

API Integration Golden Path:
  Domains: client, service, contract-layer
  Required contracts: api-contract.md, openapi.yaml
  Mandatory gate: API documentation before merge

Database Migration Golden Path:
  Domains: schema, migration, backfill
  Required contracts: schema-contract.md, rollback-plan.md
  Mandatory: rollback tested before integration
```

Possible command: `gsd-t-milestone --type auth` auto-populates from the golden path library.

---

### Idea 7 — DORA Metrics for GSD-T Itself
**Source**: DORA + SPACE + DevEx + DX Core 4 — complementary frameworks for complete delivery feedback

Apply delivery metrics to GSD-T milestones:

| Metric | GSD-T Equivalent |
|--------|-----------------|
| Deployment Frequency | Milestones completed per week |
| Lead Time for Changes | Requirements → complete-milestone cycle time |
| Change Failure Rate | Contract violations caught in verify vs. found in production |
| MTTR | Time to resolve a blocked domain or failed integration |

After 5+ milestones, `gsd-t-status` can show velocity trends: "Your last 5 milestones averaged 3.2 hours. Auth milestones average 5.1 hours."

---

### Idea 8 — Actionable Observability Loop
**Source**: 64% of cloud-native enterprises now have AI-driven observability that triggers automatic remediation; OpenTelemetry is adding AI agent spans

Phase transitions should emit structured events (phase started, contract checked, test passed, cost logged). These feed into:
- Automatic phase blocking when contracts violated
- Cost spikes surfaced before the next phase starts
- Production error rates feeding back into next planning cycle

Long-term: OpenTelemetry compatibility means GSD-T traces show up in standard observability dashboards (DataDog, Grafana, etc.) alongside application traces.

---

### Idea 9 — Service Catalog / Contract Registry
**Source**: Internal Developer Platforms (Backstage, Port, Cortex) — single system of record for service ownership and compliance posture

`gsd-t-catalog`: a queryable view of all contracts, domains, and their relationships.

- "Show me every API contract in this project, their versions, and which domains depend on them"
- "What domains modified the auth schema in the last 3 milestones?"
- "Which contracts are currently in violation?"

Cross-project extension: portfolio view across all GSD-T projects, shared contract library for reusable patterns.

---

## Part 4: Ideas from Software Methodology Research

### Idea 10 — Hill Charts in `gsd-t-status`
**Source**: Shape Up (Basecamp) — most underrated delivery innovation

Progress ≠ tasks completed. A domain that's 80% done on tasks might still be in the uncertainty half of the hill (still figuring out *how*). Hill charts show the honest picture:

```
Domain Progress (Hill View)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
auth-service    ████████████▲                    (peak — problem solved)
user-store      ████████████████████████         (right slope — execution)
session-mgmt    ████                    ◀ BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Left side = uncertainty | Peak = problem understood | Right side = execution
```

This gives a truer progress picture than "6/12 tasks done."

---

### Idea 11 — `gsd-t-adr`: Architecture Decision Records
**Source**: ADR pattern — one file per decision, version-controlled, links to contracts it influenced

Every time a meaningful architectural decision is made during discuss or plan, generate a formal ADR:

```markdown
# ADR-007: Use JWT over session cookies for auth

**Status**: Accepted
**Date**: 2026-02-18
**Context**: Multi-domain architecture requires stateless auth across API/frontend/mobile
**Decision**: JWT with 15-minute expiry + refresh token rotation
**Consequences**: Must handle token invalidation; session-contract.md updated to reflect refresh flow
**Contracts affected**: auth-contract.md, session-contract.md
```

Future agents query ADRs to understand WHY, not just WHAT. Prevents: repeated suggestions of rejected approaches, re-litigating settled decisions, agents making incompatible assumptions.

Stored in `.gsd-t/adrs/` — linked from the relevant contracts.

---

### Idea 12 — `gsd-t-spec`: BDD as Contract Bridge
**Source**: Specification by Example — highest-transferability finding from methodology research; BDD specs are contracts in human-readable form

Given-When-Then scenarios are already contracts. The bridge:
1. `gsd-t-spec` generates BDD scenarios from contracts + requirements
2. Scenarios serve as both test specs AND planning context for execute
3. Tests are the contracts made executable

```gherkin
Feature: User Authentication
  Scenario: Successful login (from auth-contract.md §3.1)
    Given a registered user with valid credentials
    When they submit the login form
    Then they receive a JWT with 15-minute expiry
    And a refresh token is stored in httpOnly cookie
```

This spec is *both* the plan context for the execute agent AND the test the QA agent validates against.

---

### Idea 13 — `gsd-t-storm`: Event Storming Before Partition
**Source**: Event Storming (DDD) — takes weeks of domain modeling to hours; produces richer bounded contexts

Before partition, run a lightweight event storming session. Input: requirements + constraints. Output: a structured event map feeding directly into partition.

Domain events discovered: `UserRegistered`, `PasswordResetRequested`, `SessionExpired`, `PaymentProcessed` → aggregates → bounded contexts → GSD-T domains.

Domains created via event storming are grounded in *what the system does* rather than *what functions we guessed it needed*. They align naturally with ubiquitous language (DDD) — shared vocabulary between requirements and code.

---

### Idea 14 — Pact-Executable API Contracts
**Source**: Consumer-Driven Contract Testing (Pact framework) — industry standard for microservices, absent from AI dev workflows

Currently, API contracts in `.gsd-t/contracts/` are documentation. The upgrade: make them **runnable**.

Consumer (frontend domain) writes: "I expect `GET /user/:id` to return `{name, email, role}`"
Provider (API domain) verifies: "Can I satisfy this contract?"
Integrate phase gate: "Can all consumers deploy?"

GSD-T could generate Pact-compatible contracts from its existing contract files, then run consumer-driven tests as part of the verify phase.

---

## Part 5: Ideas from Design-to-Code & MLOps Research

### Idea 15 — Design Contracts (Figma MCP Integration)
**Source**: Figma's MCP Server (Config 2025) — design metadata streams as structured context to coding agents; W3C Design Token spec (October 2025)

Design tokens are now a W3C standard: a contract layer between design and code. GSD-T could introduce `.gsd-t/contracts/design-contract.md`:

```markdown
# Design Contract: Dashboard UI

**Source**: Figma frame [link]
**Design tokens**: --color-primary: #2563eb, --spacing-base: 16px
**Component states**: loading, empty, error, populated
**Required breakpoints**: 375px (mobile), 768px (tablet), 1280px (desktop)
**Accessibility**: WCAG 2.1 AA required
**Token source**: tokens.json (auto-updated via Figma MCP)
```

When a UI domain executes, it gets current design token values and component specs as live context — not from a human-maintained doc, but from the live design system.

---

### Idea 16 — Asset-Oriented Execution (Dagster Pattern)
**Source**: Dagster — "asset lineage over task orchestration"; reframes orchestration around *what was produced*

GSD-T currently tracks tasks (did they run?). The upgrade: track **versioned artifacts** with provenance.

Each domain execution produces:
- `auth.contract.v2` (updated contract)
- `users.schema.v3` (schema change)
- `auth-service.test.coverage.94%` (test artifact)

These become queryable: "What version of the auth contract was in effect when the integration failure occurred?" This is audit trail + lineage combined — critical for debugging production issues that trace back to specific domain executions.

---

### Idea 17 — Token Budget Tracking & AI FinOps
**Source**: 85% of enterprises exceed AI budgets by >10%; AI FinOps emerging as practice

Key optimization tactics with real savings:
- **Semantic caching**: 30–90% token reduction for repetitive operations (same contract reads, repeated file patterns)
- **Intelligent model routing**: Haiku for mechanical tasks, Sonnet for reasoning, Opus for architecture (~25% savings)
- **Prompt compression**: 20–30% input token reduction by removing redundancy

**GSD-T application**:
- Each wave execution logs tokens per domain per phase
- Running cost shown in `gsd-t-status`
- Milestone completion includes cost report: "340k tokens across 4 domains, ~$7.80"
- Token log feeds into estimation engine for future milestones

The CLAUDE.md update (Observability Logging section) is already the foundation for this.

---

### Idea 18 — Reference Class Estimation Engine
**Source**: Reference Class Forecasting — most accurate estimation method for large projects; outperforms Monte Carlo and EVM on accuracy, stability, and timeliness

Instead of bottom-up risk analysis, use the statistical distribution of similar past milestones.

After 5+ milestones, GSD-T has your personal reference class. New milestone scope → historical matching:

```
Estimation for: "Add OAuth integration"
Reference class: API integration milestones (6 completed)
  Min: 1.8 hours / 120k tokens
  P50: 3.1 hours / 195k tokens
  P80: 4.7 hours / 280k tokens
  Max: 6.2 hours / 390k tokens

Recommendation: Budget 4 hours and 250k tokens (P65)
Note: Your last auth-adjacent milestone ran 20% over P50 estimate.
```

**Nobody is doing this in AI development tooling yet.** This is a genuine first-mover opportunity.

---

### Idea 19 — Prompt Versioning for GSD-T Commands
**Source**: Langfuse, LaunchDarkly prompt versioning — prompts as APIs with gradual rollouts and A/B testing

GSD-T's commands in `commands/` are essentially prompts. They should behave like versioned APIs:
- When a command changes, the old version stays available
- New versions can be A/B tested before full rollout
- Rollback is instant (just reference previous version)
- Usage metrics per version: which version produces fewer failures?

This is also how GSD-T can validate improvements: does v2.29 of `gsd-t-execute` produce better results than v2.28? Track it.

---

### Idea 20 — Execution Trace Files
**Source**: LangSmith, Langfuse, Arize — traces as first-class artifacts, not just dashboards

Each wave execution writes a structured trace file: `.gsd-t/traces/milestone-{name}.json`

Contents: every file read, every decision made, every contract check, every test result, token usage per step, phase durations.

**Use cases**:
- Replay a milestone execution for debugging
- Compare traces between two milestone executions (why did this one take longer?)
- Feed into estimation engine as historical data
- AI-assisted retrospective: "Based on the trace, here's what caused the integration phase to take 3× longer than expected"

---

## Part 6: Synthesis — Failure Mode Analysis

### Why AI Projects Fail (Research Finding)

The research surfaced a sobering statistic: **95% of AI agent projects see no measurable return. 80%+ fail to deploy.** Primary causes:

1. **Missing context** (65% of developers) — agents guess when they can't see relevant code
2. **Hallucinated API parameters** — confident wrong answers based on naming conventions
3. **PoC success ≠ production viability** — lab demos don't handle edge cases
4. **Cost spirals** — mitigation layers (validation, oversight) consume projected ROI

**GSD-T directly addresses #1 and #2** through the contract system. The remaining risk is #3 and #4 — which the estimation engine and AI FinOps ideas address.

### GSD-T's Structural Advantage

Contracts exist to give agents the right context at the right time. This is the right design. The research validates it. The upgrade path is making contracts *dynamic* and *executable*, not just documented.

---

## Priority Matrix

Ranked by: Impact × Implementability (today, with GSD-T's markdown-first architecture)

| Priority | Idea | Impact | Effort | Why Now |
|----------|------|--------|--------|---------|
| 🔴 High | **Reference Class Estimation Engine** | Very High | Medium | First-mover; uses existing milestone data |
| 🔴 High | **Token Budget Tracking** | High | Low | Foundation already in CLAUDE.md |
| 🔴 High | **Pre-Execution File Localization** | High | Low | Hardened into execute command's Step 1 |
| 🟡 Med | **`gsd-t-patch` Agentless Mode** | High | Medium | Fills gap for small tasks |
| 🟡 Med | **`gsd-t-adr` ADR Command** | High | Low | High-value, low-complexity |
| 🟡 Med | **Hill Charts in Status** | Medium | Medium | Better progress visibility |
| 🟡 Med | **Execution Manifest** | High | Medium | Stronger subagent coordination |
| 🟡 Med | **BDD Spec Bridge** | High | Medium | Specs → contracts → tests unified |
| 🟢 Later | **Repository Map Command** | Very High | High | Requires code parsing infrastructure |
| 🟢 Later | **Golden Path Library** | Very High | High | Needs milestone-type taxonomy first |
| 🟢 Later | **Design Contract + Figma MCP** | High | High | Depends on Figma MCP adoption |
| 🟢 Later | **Pact-Executable Contracts** | High | High | Requires Pact tooling integration |
| 🟢 Later | **Asset-Oriented Execution** | High | High | Architectural shift in tracking |
| 🔵 Future | **Execution Trace Files** | Very High | High | Needs trace infrastructure |
| 🔵 Future | **DORA Metrics Dashboard** | Medium | High | Needs multi-milestone data |
| 🔵 Future | **Event Storming Command** | Medium | Medium | Pre-requisite: good prompting |

---

## The Three-Phase Evolution of GSD-T

**Phase 1 — Now: Hardening the Core**
- Token budget tracking (observability already in CLAUDE.md)
- Pre-execution file localization (enforce in execute Step 1)
- ADRs as first-class command
- Estimation engine using accumulated milestone data

**Phase 2 — Next: Expanding the Surface**
- `gsd-t-patch` agentless mode
- BDD spec bridge
- Hill charts in status
- Execution manifest for subagent coordination
- Golden path library (at least 3-4 milestone types)

**Phase 3 — Future: Platform Intelligence**
- Repository map generation
- Execution trace files + replay
- Design contract + Figma MCP integration
- Pact-executable API contracts
- Asset-oriented execution with lineage
- Cross-project portfolio intelligence
- Prompt versioning for commands

---

## Key Reframes from This Session

| Old Frame | New Frame |
|-----------|-----------|
| GSD-T is a workflow orchestrator for Claude | GSD-T is a software delivery intelligence system |
| Complex = more agents = better | Simpler procedural beats agents for targeted changes |
| Progress = tasks completed | Progress = uncertainty reduced (hill chart model) |
| Tokens are a cost | Tokens are a business metric to attribute and forecast |
| Contracts are documentation | Contracts are executable, dynamic context infrastructure |
| Delivery ends at deployment | Delivery loops: production → backlog → planning → execution |

---

## Parking Lot (Interesting but Not Now)

- **Voice-driven domain management** — pause/redirect domains via voice
- **GSD-T Marketplace** — community golden path templates and contract libraries
- **Multi-LLM routing** — Opus for architecture decisions, Haiku for file reads
- **GSD-T as web application** — visual drag-and-drop wave orchestration
- **Cognitive load budgets** — warn when a single agent is assigned too many high-complexity domains
- **The Mirror Milestone** — GSD-T periodically runs a milestone *on itself*, improving its own workflow
- **Time-travel debugging** — replay any milestone from any state in its execution
- **Chaos engineering contracts** — "This service MUST handle dependency failure gracefully"

---

*Session conducted: 2026-02-18 | Research: 4 agents, ~140k tokens | Ideas captured: 20 primary + parking lot*
