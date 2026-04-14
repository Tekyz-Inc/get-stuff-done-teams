# GSD-T Progress

## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: IN PROGRESS
## Date: 2026-04-13
## Version: 2.74.11

## Active Milestone

**Pre-Milestone: Refined Model Tiers** — COMPLETE (v2.51.11)
- QA model promotion Haiku → Sonnet, Red Team → Opus, Haiku narrowed to mechanical-only
- Files: gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md, CLAUDE-global.md, project CLAUDE.md
- Note: ~/.claude/CLAUDE.md syncs on next version-update-all (not edited directly to avoid permission prompt)

**M31: Self-Calibrating QA + Token-Aware Orchestration** — COMPLETE (v2.52.10)
- Enhancements 3.1 (Harness Audit) + 3.2 (QA Calibration) + 3.7 (Token-Aware Orchestration)
- PRD: docs/prd-harness-evolution.md
- 4 domains: harness-audit (3 tasks), qa-calibrator (2 tasks), token-orchestrator (2 tasks), command-integration (4 tasks) = 11 tasks
- New: bin/component-registry.js, bin/qa-calibrator.js, bin/token-budget.js, commands/gsd-t-audit.md
- Wired into: execute, quick, integrate, wave, complete-milestone, status, help
- Tests: 828 total (88 new for M31 modules)
- Archived: .gsd-t/milestones/M31-self-calibrating-qa-2026-04-01/

**M32: Quality Culture & Design** — COMPLETE (v2.53.10)
- Enhancements 3.3 (Quality North Star) + 3.4 (Design Brief) + 3.5 (Evaluator Interactivity)
- 3 domains: quality-persona (1 task), design-brief (1 task), evaluator-interactivity (1 task) = 3 tasks
- All domains independent; gsd-t-setup.md shared between quality-persona and design-brief (different sections)
- Contracts: quality-persona-contract.md, design-brief-contract.md, exploratory-testing-contract.md
- Domain artifacts: scope.md + tasks.md (expanded with acceptance criteria) + constraints.md for all 3 domains
- REQ coverage: REQ-060 (quality-persona T1), REQ-061 (design-brief T1), REQ-062 (evaluator-interactivity T1)
- Wave: Single Wave 1 — all parallel-safe; quality-persona before design-brief for gsd-t-setup.md sequential edit
- Execution order: quality-persona T1 → design-brief T1 → evaluator-interactivity T1 (parallel) → checkpoint
- Archived: .gsd-t/milestones/M32-quality-culture-design-2026-04-01/

**M33: Adaptive Iteration** — DEFINED (v2.54.10)
- Enhancement 3.6 (Configurable Iteration Budget)

**M30: Stack Rules Engine — Execute-Time Best Practice Enforcement** — COMPLETE (v2.48.10)
- Stack detection + best practice injection: 4 templates (_security.md, react.md, typescript.md, node-api.md), detection wired into execute/quick/integrate/wave/debug, QA enforcement, 135 new tests
- 2 domains: stack-templates (3 tasks), command-integration (4 tasks)
- Archived: .gsd-t/milestones/M30-stack-rules-engine-2026-03-24/

**M29: Compaction-Proof Debug Loop** — COMPLETE (v2.49.10)
- External debug-loop controller (bin/debug-ledger.js + gsd-t headless --debug-loop): JSONL ledger persists hypothesis/fix/learning across sessions, anti-repetition preamble injection, escalation tiers (sonnet 1-5, opus 6-15, STOP 16-20), 50KB compaction, 5 commands delegate fix-retest loops externally, 83 new tests (671 total)
- 3 domains: debug-state-protocol (3 tasks), headless-loop (3 tasks), command-integration (3 tasks)
- Archived: .gsd-t/milestones/M29-compaction-proof-debug-loop-2026-03-24/

**M28: Doc-Ripple Subagent — Automated Document Ripple Enforcement** — COMPLETE (v2.46.10)
- Automated doc-ripple agent: threshold check (7 FIRE/3 SKIP), blast radius analysis, manifest generation, parallel document updates
- 2 domains: doc-ripple-agent (contract + command + tests), command-integration (wired into execute/integrate/quick/debug/wave)
- Archived: .gsd-t/milestones/M28-doc-ripple-subagent-2026-03-24/

**M25: Telemetry Collection & Metrics Dashboard (Tier 1)** — COMPLETE (v2.43.10)
- Task telemetry with weighted signal taxonomy, rollups, process ELO, pre-flight intelligence check, Chart.js dashboard, gsd-t-metrics command
- 4 domains: metrics-collection, metrics-rollup, metrics-dashboard, metrics-commands
- Archived: .gsd-t/milestones/M25-telemetry-metrics-2026-03-23/

**M26: Declarative Rule Engine & Patch Lifecycle (Tier 2)** — COMPLETE (v2.44.10)
- Declarative rule engine (bin/rule-engine.js) + patch lifecycle (bin/patch-lifecycle.js), 5-stage lifecycle (candidate->applied->measured->promoted->graduated), promotion gate (>55%), quality budget governance
- 3 domains: rule-engine, patch-lifecycle, command-integration
- Archived: .gsd-t/milestones/M26-rule-engine-patch-lifecycle-2026-03-23/
- **Goal**: Auto-detect failure patterns, generate candidate patches, and manage their lifecycle through promotion gates with measurable improvement thresholds. Promoted patches that sustain improvement graduate into permanent methodology artifacts.
- **Scope**:
  - `.gsd-t/metrics/rules.jsonl` — declarative rule engine: pattern detection triggers as JSON objects (not hardcoded heuristics). Adding a new detection pattern = JSON append, not code deploy
  - `.gsd-t/metrics/patch-templates.jsonl` — maps triggers to specific command file / constraints.md edits. Each template defines: trigger pattern, target file, edit type, edit content
  - Patch lifecycle with 5 stages: `candidate → applied → measured → promoted → graduated`
    - **candidate**: auto-generated when heuristic detects repeated pattern (>=3 occurrences in task-metrics)
    - **applied**: patch template executed, edit applied to target file
    - **measured**: next 2+ milestones track whether the target metric improved
    - **promoted**: patch exceeds improvement threshold (>55% win rate, adapted from AlphaZero)
    - **graduated**: promoted patch sustained for 3+ milestones → absorbed into permanent methodology artifact (constraints.md, verify checks, plan pre-conditions) → removed from rules.jsonl
  - Promotion gates — patches must measurably improve target metric before becoming permanent
  - Activation count tracking — each rule records how many times it fires. Rules that haven't prevented a failure in N milestones flagged for deprecation
  - Periodic consolidation — every 5 milestones, related rules distilled into single cleaner rule (anti-bloat)
  - Quality budget governance — per-milestone rework ceiling (e.g., max 20% of tasks require fix cycles). When budget exhausted, system auto-tightens constraints: force discuss phase, require contract review, split large tasks
  - Extends `commands/gsd-t-complete-milestone.md` — rule evaluation + patch generation + promotion + graduation in distillation step
  - Extends `commands/gsd-t-execute.md` — pre-task active rule injection into subagent prompts
  - Extends `commands/gsd-t-plan.md` — pre-mortem step reading rules for domain-type failure patterns
  - New directory: `.gsd-t/metrics/patches/` — individual patch files with status tracking
  - New contract: `.gsd-t/contracts/rule-engine-contract.md` — rule schema, patch template schema, promotion gate thresholds, graduation criteria
- **Not in scope (Tier 3)**: Neo4j cross-project causal inference, cross-project rule propagation
- **Predecessor**: M25 (task-metrics.jsonl must exist and be populated for pattern detection)
- **Brainstorm**: `.gsd-t/brainstorm-2026-03-20-telemetry.md`
- **Impact on existing**: All additive — no breaking changes to existing contracts

**Success criteria**:
- [x] Rules.jsonl stores detection patterns as declarative JSON objects
- [x] Patch templates auto-generate candidate patches when patterns detected (>=3 occurrences)
- [x] Promotion gate blocks patch advancement unless >55% improvement measured
- [x] Graduated patches write themselves into constraints.md or verify checks and exit rules.jsonl
- [x] Activation count tracking flags inactive rules for deprecation
- [x] Quality budget governance triggers constraint tightening when rework ceiling exceeded
- [x] Pre-mortem in plan surfaces historical failure patterns for current domain types
- [x] All existing tests pass with no regressions (373+ tests)

**M27: Cross-Project Learning & Global Sync (Tier 2.5)** — COMPLETE (v2.45.10)
- **Goal**: Propagate proven rules across projects, enable cross-project comparison using signal-type distributions, and eventually ship validated rules in the npm package.
- **Scope**:
  - Dual-layer learning architecture:
    - Project-specific: `.gsd-t/metrics/` (task-metrics, rollup, rules, patches) — stays local
    - Cross-project: `~/.claude/metrics/` (global rollup, global rules, signal distributions) — shared across all registered GSD-T projects
  - Global patch propagation — when a rule is promoted in one project:
    1. Copy to `~/.claude/metrics/global-rules.jsonl` with source project tag
    2. On `gsd-t-version-update-all`, propagate global rules to all registered projects as candidates (not promoted — each project must re-validate)
    3. Rules that achieve promotion in 3+ projects → marked as universal
  - Cross-project signal-type comparison — compare weighted signal distributions (not just raw pass/fail rates) across projects
  - Cross-project rollup aggregation — domain-type pattern matching: compare similar domain types across projects to identify systemic patterns
  - npm distribution pipeline — universal rules achieving promotion in 5+ projects are candidates for shipping in the GSD-T npm package itself (in `templates/` or `examples/rules/`)
  - Extends `bin/gsd-t.js` `doUpdateAll()` — adds global rule sync step during update-all
  - Extends `commands/gsd-t-metrics.md` — adds cross-project comparison queries
  - Extends `commands/gsd-t-status.md` — adds global ELO display
  - Extends `commands/gsd-t-complete-milestone.md` — adds global rule promotion check after local promotion
  - New directory: `~/.claude/metrics/` — global rollup, global rules, signal distributions
  - New contract: `.gsd-t/contracts/cross-project-sync-contract.md` — global rule schema, propagation protocol, universal promotion criteria
- **Not in scope**: Neo4j graph database (optional power tier, not required for cross-project learning)
- **Predecessor**: M26 (rule engine must exist with promotion gates for cross-project propagation to work)
- **Brainstorm**: `.gsd-t/brainstorm-2026-03-20-telemetry.md`
- **Impact on existing**: All additive — no breaking changes to existing contracts

**Success criteria**:
- [x] Promoted rules propagate to `~/.claude/metrics/global-rules.jsonl`
- [x] `gsd-t-version-update-all` syncs global rules to all registered projects as candidates
- [x] Rules achieving promotion in 3+ projects marked as universal
- [x] Cross-project comparison uses signal-type distributions, not just raw rates
- [x] `gsd-t-metrics --cross-project` returns domain-type comparison across projects
- [x] All existing tests pass with no regressions (481 tests, 48 new)

**M28: Doc-Ripple Subagent — Automated Document Ripple Enforcement** — COMPLETE (v2.46.10)
- **Goal**: Eliminate the "forgot to update X" failure mode by creating a dedicated agent that automatically identifies and updates all downstream documents after any code change. When doc-ripple completes, the user should never need to ask "did you update everything?"
- **Scope**:
  - `commands/gsd-t-doc-ripple.md` — new command file defining the doc-ripple agent behavior: reads `git diff`, cross-references against pre-commit gate checklist, produces a manifest of affected documents, spawns parallel subagents to update each one
  - `.gsd-t/contracts/doc-ripple-contract.md` — trigger conditions, manifest format, update protocol, threshold logic
  - Integration into 5 command files that produce code changes: `gsd-t-execute.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md`, `gsd-t-wave.md` — auto-spawn doc-ripple before reporting completion
  - Threshold logic: skip on trivial changes (single-file, no cross-cutting impact), fire on changes that touch contracts, standards, conventions, APIs, or patterns used across multiple files
  - Manifest-based audit trail: doc-ripple produces a `.gsd-t/doc-ripple-manifest.md` showing what was checked, what was updated, and what was already current
- **Not in scope**: Replacing the Pre-Commit Gate (doc-ripple supplements it, doesn't replace it). Auto-committing (doc-ripple updates files, the lead agent still commits). Modifying non-GSD-T projects.
- **Predecessor**: REQ-051 (Document Ripple Completion Gate — the rule this agent enforces structurally)
- **Impact on existing**: All additive — no breaking changes to existing contracts. Existing Document Ripple sections in commands remain as documentation; doc-ripple agent provides automated enforcement.

**Success criteria**:
- [ ] `commands/gsd-t-doc-ripple.md` exists and defines blast radius analysis + parallel update dispatch
- [ ] Contract `.gsd-t/contracts/doc-ripple-contract.md` defines trigger conditions, manifest format, update protocol
- [ ] Doc-ripple auto-spawns in execute, integrate, quick, debug, and wave commands before reporting completion
- [ ] Threshold logic correctly skips trivial single-file changes and fires on cross-cutting changes
- [ ] Manifest audit trail shows what was checked/updated/skipped
- [ ] All existing tests pass with no regressions (480+ tests)

**M29: Compaction-Proof Debug Loop** — VERIFIED
- **Goal**: Eliminate context compaction during debug-fix-retest cycles by moving the retry loop to an external process (headless exec) with a cumulative debug ledger that preserves all hypothesis/fix/learning history across fresh sessions. When done, a 20-iteration debug session should produce zero compaction events.
- **Scope**:
  - `.gsd-t/debug-state.jsonl` — structured debug ledger protocol: each entry records iteration, test, error, hypothesis, fix attempted, result (PASS/STILL_FAILS), and learning. Serves as cross-session memory that survives context resets
  - Ledger compaction: when ledger exceeds 50KB, spawn a summarizer session (haiku) to condense into a summary + last 5 raw entries. Prevents the ledger itself from overwhelming fresh sessions
  - Anti-repetition prompt injection: headless exec generates a preamble from the ledger listing all failed hypotheses and the current narrowing direction, injected into each new session's prompt
  - `gsd-t headless --debug-loop` mode in `bin/gsd-t.js`: external iteration manager that runs test→fix→retest cycles as separate `claude -p` sessions. Each session starts fresh (zero accumulated context). Loop controller is pure Node.js with zero AI context
  - Escalation tiers: iterations 1-5 use sonnet, 6-15 use opus, 16-20 STOP and present full diagnostic history to user
  - `--max-iterations N` flag (default 20) for hard ceiling enforced externally
  - Integration into `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-test-sync.md`, `commands/gsd-t-verify.md`, `commands/gsd-t-debug.md` — when fix-retest loops are needed, delegate to headless debug-loop instead of looping in-context
- **Not in scope**: Changing the orchestrator context self-check (M22 Step 3.5 — that remains as defense-in-depth). Modifying the core headless exec/query functionality. Adding new slash commands.
- **Predecessor**: M23 (headless exec must exist), M22 (context observability for CTX_PCT tracking)
- **Impact on existing**: Additive to bin/gsd-t.js (new subcommand mode). Command file changes are behavioral (delegate loops externally instead of running in-context) — no new commands, no removed functionality.

**Success criteria**:
- [x] `.gsd-t/debug-state.jsonl` protocol defined with iteration/test/error/hypothesis/fix/result/learning fields
- [x] `gsd-t headless --debug-loop` runs test→fix→retest as separate `claude -p` sessions with fresh context each
- [x] Anti-repetition preamble auto-generated from ledger and injected into each session's prompt
- [x] Escalation tiers: sonnet (1-5), opus (6-15), hard stop (16-20) with full diagnostic output
- [x] Ledger compaction triggers at 50KB threshold, preserving summary + last 5 entries
- [x] `--max-iterations N` flag enforced by external process (not by AI in-context)
- [x] Execute, wave, test-sync, verify, and debug commands delegate fix-retest loops to headless debug-loop
- [x] All existing tests pass with no regressions (671 tests, 83 new)

**M30: Stack Rules Engine — Execute-Time Best Practice Enforcement** — DEFINED
- **Goal**: Auto-detect project tech stack at execute-time, inject mandatory best practice rules from `templates/stacks/` into subagent prompts, and enforce compliance via QA. When done, a React project should automatically get React/TypeScript/security rules injected into every subagent — no manual setup required. Violations fail the task, same weight as contract violations.
- **Scope**:
  - `templates/stacks/` directory — stack-specific best practice rule files:
    - `_security.md` — universal, always injected regardless of detected stack (XSS, prompt injection, OWASP Top 10, auth token handling, input sanitization, AI-specific security)
    - `react.md` — React patterns (React Query, hooks rules, component design, Container/Presenter, a11y, anti-patterns)
    - `typescript.md` — strict TypeScript (no `any`, interfaces for props, generics, strict tsconfig)
    - `node-api.md` — Node.js API patterns (Express/Fastify, error handling, middleware, service layer)
  - Stack detection engine — reads project files to determine tech stack:
    - `package.json` → detect react, express, fastify, hono, tailwindcss, typescript, etc.
    - `requirements.txt` / `pyproject.toml` → detect python, fastapi, django, flask
    - `go.mod` → detect go
    - `Cargo.toml` → detect rust
    - Detection runs at subagent spawn time, not at init/setup
  - Subagent prompt injection — for every subagent-spawning command (execute, quick, integrate, wave, debug):
    1. Run stack detection against project files
    2. Match detected stacks against available `templates/stacks/*.md` files
    3. Always include `_security.md` (underscore prefix = universal)
    4. Append matched rules to subagent prompt with: "These are MANDATORY standards. Violations fail the task."
    5. No on-disk modifications — rules injected into prompt only
  - QA enforcement — QA subagent receives the same stack rules and validates compliance:
    - Stack rule violations reported alongside contract violations
    - Stack violation = task failure (not warning)
  - Convention: `_` prefix = universal (always injected), no prefix = stack-specific (injected when detected)
  - Extensible: adding a new stack = dropping a `.md` file in `templates/stacks/`. No code changes to the engine.
- **Not in scope**: Writing stack rule files for every language day 1 (ship with 4: _security, react, typescript, node-api). Modifying project CLAUDE.md on disk. Creating new slash commands. Changing `gsd-t-setup` or `gsd-t-init`.
- **Predecessor**: None (standalone feature, uses existing subagent spawn patterns)
- **Impact on existing**: Modifies subagent prompt construction in execute, quick, integrate, wave, debug. All additive — existing behavior unchanged for projects with no matching stack templates.

**Success criteria**:
- [ ] `templates/stacks/` directory exists with `_security.md`, `react.md`, `typescript.md`, `node-api.md`
- [ ] Stack detection correctly identifies React, TypeScript, Node.js, Python, Go, Rust from project manifest files
- [ ] `_security.md` injected into every subagent prompt regardless of detected stack
- [ ] Stack-specific rules injected only when matching stack detected
- [ ] Subagent prompt includes "MANDATORY standards — violations fail the task" framing
- [ ] QA subagent receives and validates against the same stack rules
- [ ] Stack rule violations block task completion (same severity as contract violations)
- [ ] Adding a new stack rule = dropping a `.md` file in `templates/stacks/` with no code changes
- [ ] All existing tests pass with no regressions (536+ tests)

## Domains (M30)
| Domain              | Status  | Tasks | Completed |
|---------------------|---------|-------|-----------|
| stack-templates     | done    | 3     | 3         |
| command-integration | done    | 4     | 4         |

## Contracts (M30)
- [x] stack-rules-contract.md — detection protocol, template conventions, prompt injection format, QA enforcement
- [x] integration-points.md — UPDATED with M30 dependency graph, 2 waves, 2 checkpoints

## Execution Order (M30)
Wave 1: stack-templates (foundation — produces template files consumed by command-integration)
Wave 2: command-integration (wiring — modifies 5 commands + QA prompts + 4 reference docs)

## Queued Milestones

None — backlog item #10 (Docker Enterprise) available when ready.

## Previous Milestones (Archived)

**M23: GSD 2 Tier 2 — Headless Mode** — COMPLETE
- Result: 3 domains (headless-exec, headless-query, pipeline-integration). `gsd-t headless` CLI subcommand wraps `claude -p` with exit codes 0-4, --json/--timeout/--log flags. `gsd-t headless query` returns JSON from .gsd-t/ file parsing in ~50ms (no LLM). 7 query types: status, domains, contracts, debt, context, backlog, graph. CI examples: GitHub Actions + GitLab CI. 36 new tests (329 total). v2.41.10.

**M20: Graph Abstraction Layer + Native Indexer + CGC Integration** — COMPLETE
- Result: 6 new files (graph-store, graph-parsers, graph-overlay, graph-indexer, graph-query, graph-cgc), 3 CLI subcommands (graph index/status/query), 4 new contracts, 70 new tests. Self-indexed: 264 entities, 725 relationships. 280/280 tests pass.

**M21: Graph-Powered Commands** — COMPLETE
- Result: Graph-enhanced analysis in 21 of 49 commands across 4 tiers. All steps guarded with "if graph available." 280/280 tests pass.

## Milestones Roadmap
| #   | Milestone                             | Status  | Version | Domains |
|-----|---------------------------------------|---------|---------|---------|
| M22 | GSD 2 Tier 1 — Execution Quality      | COMPLETE    | 2.40.10 | 5       |
| M23 | GSD 2 Tier 2 — Headless Mode          | COMPLETE | 2.41.10 | 3       |
| M24 | Docker (Enterprise)                                | BACKLOG | 2.42.10 | 2       |
| M25 | Telemetry Collection & Metrics Dashboard (Tier 1)  | COMPLETE | 2.43.10 | 4       |
| M26 | Declarative Rule Engine & Patch Lifecycle (Tier 2)  | COMPLETE    | 2.44.10 | 3       |
| M27 | Cross-Project Learning & Global Sync (Tier 2.5)    | COMPLETE   | 2.45.10 | 3       |
| M28 | Doc-Ripple Subagent                                | EXECUTED    | 2.46.10 | 2       |
| M29 | Compaction-Proof Debug Loop                        | COMPLETE    | 2.49.10 | 3       |
| M30 | Stack Rules Engine                                  | COMPLETE    | 2.48.10 | 2       |

## Domains (M29)
| Domain               | Status  | Tasks | Completed |
|----------------------|---------|-------|-----------|
| debug-state-protocol | complete | 3     | 3         |
| headless-loop        | complete | 3     | 3         |
| command-integration  | complete | 3     | 3         |

## Contracts (M29)
- [x] debug-loop-contract.md — ledger schema, API definitions, escalation tiers, CLI interface, command integration pattern
- [x] integration-points.md — UPDATED with M29 dependency graph, 3 waves, 2 checkpoints

## Execution Order (M29)
Wave 1: debug-state-protocol (foundation — produces ledger API consumed by headless-loop)
Wave 2: headless-loop (loop controller — consumes ledger, produces debug-loop CLI mode)
Wave 3: command-integration (wiring — modifies 5 commands + 4 reference docs)

## Domains (M28)
| Domain              | Status      | Tasks | Completed |
|---------------------|-------------|-------|-----------|
| doc-ripple-agent    | complete    | 3     | 3         |
| command-integration | complete | 4     | 4         |

## Contracts (M28)
- [x] doc-ripple-contract.md — trigger conditions, manifest format, update protocol, threshold logic, integration pattern
- [x] integration-points.md — UPDATED with M28 dependency graph, 2 waves, 1 checkpoint

## Execution Order (M28)
Wave 1: doc-ripple-agent (foundation — produces command file + contract consumed by integration)
Wave 2: command-integration (wiring — adds spawn blocks to 5 commands + updates 4 reference docs)

## Domains (M27 — archived)
| Domain              | Status   | Tasks | Completed |
|---------------------|----------|-------|-----------|
| global-metrics      | complete | 4     | 4         |
| cross-project-sync  | complete | 3     | 3         |
| command-extensions   | complete | 4     | 4         |

## Contracts (M27)
- [x] cross-project-sync-contract.md — global-rules.jsonl, global-rollup.jsonl, global-signal-distributions.jsonl schemas, propagation protocol, universal promotion thresholds, global ELO
- [x] integration-points.md — UPDATED with M27 dependency graph, 3 checkpoints, 3 wave groups

## Execution Order (M27)
Wave 1: global-metrics (foundation — produces global-sync-manager.js consumed by all others)
Wave 2: cross-project-sync (propagation layer — extends doUpdateAll)
Wave 3: command-extensions (wiring — extends metrics, status, complete-milestone commands)

## Domains (M26 — archived)
| Domain              | Status   | Tasks | Completed |
|---------------------|----------|-------|-----------|
| rule-engine         | complete | 5     | 5         |
| patch-lifecycle     | complete | 4     | 4         |
| command-integration | complete | 4     | 4         |

## Domains (M25 — archived)
| Domain               | Status  | Tasks | Completed |
|----------------------|---------|-------|-----------|
| metrics-collection   | complete | 5     | 5         |
| metrics-rollup       | complete | 5     | 5         |
| metrics-dashboard    | complete | 2     | 2         |
| metrics-commands     | complete | 4     | 4         |

## Contracts (M25)
- [x] metrics-schema-contract.md — task-metrics.jsonl + rollup.jsonl schemas, signal taxonomy, ELO formula, pre-flight check, heuristic types
- [x] event-schema-contract.md — EXTENDED with task_complete event type + event-writer.js updated
- [x] dashboard-server-contract.md — EXTENDED with GET /metrics endpoint + readMetricsData export

## Execution Order (M25)
Wave 1: metrics-collection (foundation — produces task-metrics.jsonl consumed by all others)
Wave 2: metrics-rollup (aggregation — reads task-metrics.jsonl, produces rollup.jsonl + ELO)
Wave 3: metrics-dashboard + metrics-commands (parallel — terminal consumers, no shared files)

## Domains (M22 — archived)
| Domain                 | Status  | Tasks | Completed |
|------------------------|---------|-------|-----------|
| context-observability  | complete | 4     | 4         |
| fresh-dispatch         | complete | 4     | 4         |
| worktree-isolation     | complete | 4     | 4         |
| goal-backward          | complete | 3     | 3         |
| adaptive-replan        | complete | 3     | 3         |

## Contracts (M22)
- [x] fresh-dispatch-contract.md — Task-level subagent dispatch interface (dispatch payload, summary format, plan constraint)
- [x] worktree-isolation-contract.md — Worktree lifecycle + atomic merge protocol (creation, merge, rollback, ownership validation)
- [x] goal-backward-contract.md — Behavior verification interface (placeholder patterns, findings report, severity levels)
- [x] adaptive-replan-contract.md — Post-domain replan check + plan revision protocol (constraint categories, cycle guard, revision format)
- [x] context-observability-contract.md — Context window tracking + token breakdown format (extended token-log, alerts, aggregation)

## Execution Order (M22)
Wave 1: context-observability (foundation — tracking needed by all other domains)
Wave 2: fresh-dispatch (core dispatch mechanism — consumed by worktree + replan)
Wave 3a: worktree-isolation (filesystem isolation + merge protocol)
Wave 3b: goal-backward (behavior verification — sequential after worktree, both touch gsd-t-wave.md)
Wave 4: adaptive-replan (consumes fresh-dispatch summaries, integrates with worktree merge flow)

## Completed Milestones
| Milestone | Version | Completed | Tag |
|-----------|---------|-----------|-----|
| Compaction-Proof Debug Loop      | 2.49.10 | 2026-03-24 | v2.49.10  |
| Stack Rules Engine               | 2.48.10 | 2026-03-24 | v2.48.10  |
| GSD 2 Tier 1 — Execution Quality | 2.40.10 | 2026-03-22 | v2.40.10  |
| Graph-Powered Commands       | 2.38.10 | 2026-03-18 | v2.38.10  |
| Graph Engine                 | 2.37.10 | 2026-03-18 | v2.37.10  |
| Shared Service Detection     | 2.35.10 | 2026-03-11 | v2.35.10  |
| Multi-Consumer Surface ID    | 2.34.11 | 2026-03-11 | v2.34.11  |
| Scan Visual Output           | 2.34.10 | 2026-03-09 | v2.34.10  |
| Real-Time Agent Dashboard    | 2.33.10 | 2026-03-04 | v2.33.10  |
| Execution Intelligence Layer | 2.32.10 | 2026-03-04 | v2.32.10  |
| Backlog Management System | 2.8.0 | 2026-02-10 | v2.8.0 |
| QA Agent — Test-Driven Contracts | 2.22.0 | 2026-02-17 | v2.22.0 |
| Contract & Doc Alignment (Tech Debt Fix) | 2.21.2 | 2026-02-18 | v2.21.2 |
| Count Fix + QA Contract Alignment | 2.23.1 | 2026-02-18 | v2.23.1 |
| Testing Foundation | 2.24.0 | 2026-02-18 | v2.24.0 |
| Security Hardening | 2.24.1 | 2026-02-18 | v2.24.1 |
| CLI Quality Improvement | 2.24.2 | 2026-02-19 | v2.24.2 |
| Command File Cleanup | 2.24.3 | 2026-02-19 | v2.24.3 |
| Housekeeping + Contract Sync | 2.24.4 | 2026-02-18 | v2.24.4 |
| Cleanup Sprint | 2.24.5 | 2026-02-18 | v2.24.5 |
| Token Efficiency | 2.25.10 | 2026-02-18 | v2.25.10 |
| Execution Quality | 2.26.10 | 2026-02-18 | v2.26.10 |
| Planning Intelligence | 2.27.10 | 2026-02-18 | v2.27.10 |
| Tooling & UX | 2.28.10 | 2026-02-18 | v2.28.10 |

## Domains (M19)
| Domain | Status | Tasks | Completed |
|--------|--------|-------|-----------|
| partition-shared-first   | complete | 3 | 3 |
| feature-multiclient-guard | complete | 3 | 3 |
| plan-sharedcore-first    | complete | 2 | 2 |

## Contracts (M19)
- [x] No new contracts — internal step enhancements only

## Blockers
<!-- No active blockers -->

## Decision Log

> Older entries archived under `progress-archive/` — see `progress-archive/INDEX.md` for the date-range index.

- 2026-04-09: [fix] Unlimited human review cycles with auto-review reset — human review loop no longer capped. After each human fix: re-measure → re-run auto-review (fresh cycle counter) → re-queue for human. Repeats until zero changes submitted. (v2.73.27)

- 2026-04-09: [feat] AI prompt assistant in review panel — expandable header panel (Ctrl+K) for component Q&A and correction prompt help. Uses Claude Code CLI (claude -p) for Max subscription support. "Use as comment" copies refined text to per-component feedback. New /review/api/contract and /review/api/ai-assist endpoints. Zero deps. (v2.73.26)

- 2026-04-09 00:15: [feat] Permitted value dropdowns + enhanced visual cue — enum CSS properties (display, flexDirection, textAlign, alignItems, justifyContent, fontWeight, overflow, position) now show a select dropdown instead of text input. Generic flashZone fallback enhanced with bright outline + value label. All properties now editable (added overflow, position, top, left, boxShadow, fontFamily). Playwright-verified: display→select with 9 options, textAlign→select. (v2.73.18)

- 2026-04-09 00:05: [feat] Fixture data tree in property inspector — /review/api/fixture endpoint returns extracted test fixture data. Inspector renders expandable tree showing columns, rows, segments, etc. with color swatches. Collapsible at every level. Playwright-verified: TableStripedHeader shows columns[5] and rows[5] tree. (v2.73.17)

- 2026-04-13 17:25: [feat] Rolling Decision Log archival to fix mid-session compaction regression — added bin/archive-progress.js (keeps last 5 entries live, rolls older into 20-entry windows under .gsd-t/progress-archive/), bin/log-tail.js (truncates test/build output), bin/context-budget-audit.js (preamble cost diagnostic). Auto-migrated this project: 163KB → 42KB, Decision Log section dropped 100KB+ → 13KB. Wired into version-update-all to copy bin tools into every registered project and run a one-time archive migration (gated by .gsd-t/.archive-migration-v1 marker). Root-cause fix for the "manual /compact prompts started 2026-04-10" regression — every command that read progress.md was paying 25% of the context window per read. (v2.74.10)

- 2026-04-13 17:55: [fix] Renamed bin tools .js → .cjs to support ESM projects — first version-update-all hit a CommonJS/ESM error on BDS-Analytics-UI (which has "type": "module" in package.json). archive-progress.js, log-tail.js, and context-budget-audit.js now use .cjs extension so they run as CommonJS regardless of the host project's module type. Cleaned up broken .js copies from 13 already-updated projects, retried update-all successfully. 11 of 13 projects ran their one-time migration on first update-all. (v2.74.11)

## Session Log
| Date | Session | What was accomplished |
|------|---------|----------------------|
| 2026-02-07 | 1 | Project initialized, full codebase scan completed |
| 2026-02-09 | 2 | Doc ripple + test verify enforcement, Destructive Action Guard, CLI update-all/register, Milestone 1 defined |
| 2026-02-10 | 3 | Milestone 1: plan → execute → verify → complete. 14 tasks, 3 domains, v2.8.0 tagged. |
| 2026-02-17 | 4 | Milestone 2: QA Agent — Test-Driven Contracts. 11 tasks, 3 domains, v2.22.0. Wave rewrite v2.23.0. |
| 2026-02-18 | 5 | Full scan (5 agents), Contract & Doc Alignment milestone (6 TDs resolved, v2.21.2). Merged origin/main (v2.23.0). Scan #3: 10 new items, 1 regressed, 1 worsened. 26 open items. |
| 2026-02-18 | 6 | Promoted 25/26 debt items → 5 milestones (M3-M7). Executed all 5 milestones: M3 count fix (v2.23.1), M4 testing (v2.24.0, 64 tests), M5 security (v2.24.1, 30 tests), M6 CLI quality (v2.24.2, 22 tests), M7 command cleanup (v2.24.3). Scan #4: 25/26 resolved, 12 new (all small), 116/116 tests pass. |
| 2026-02-18 | 7 | M8: Housekeeping + Contract Sync. 6 tasks, 1 domain, 13 tech debt items (12 resolved + TD-029 accepted as risk). Zero open tech debt. v2.24.4 |
| 2026-02-18 | 8 | Scan #5: post-M8 analysis. 10 new LOW items (TD-056-TD-065). 0 critical/high/medium. 87 functions, 54 exports, 116 tests all pass. Codebase in excellent health. |
| 2026-02-18 | 9 | Promoted 10 items → M9 Cleanup Sprint. Executed 6 tasks (dead code, case fallthrough, condition fix, title scrub, 9 new tests, contract fixes). 125/125 tests. Zero open tech debt. v2.24.5 |
| 2026-02-18 | 10 | Versioning scheme changed (patches ≥10). M10 Token Efficiency (QA refactor, subagent wraps, v2.25.10). M11 Execution Quality (Deviation Rules, per-task commits, wave spot-check, v2.26.10). M12 Planning Intelligence (CONTEXT.md, plan validation, REQ traceability, v2.27.10). M13 Tooling & UX (gsd-t-tools.js, statusline, health/pause commands, wave groupings, v2.28.10). All 4 milestones from roadmap.md complete. |
| 2026-02-18 | 11 | Full codebase scan #6 (lead agent, 5 dimensions parallel). Post-M10-M13 analysis at v2.28.10. 14 new items found (TD-066 through TD-079): 0 critical, 1 high, 5 medium, 7 low. Key findings: (1) gsd-t-tools.js + gsd-t-statusline.js have no module.exports — zero test coverage (TD-066, HIGH); (2) qa-agent-contract.md still lists partition/plan as QA phases post-M10 (TD-067); (3) living docs not updated after M10-M13 — addressed in this scan (TD-068); (4) wave-phase-sequence contract missing M11/M12 additions (TD-069); (5) progress-file-format contract missing M11-M13 state artifacts (TD-070); (6) stateSet allows markdown injection via newlines (TD-071). 125/125 tests still passing. Updated all living docs (architecture, workflows, infrastructure, requirements). |
| 2026-02-19 | 13 | Added backlog item #2: "Living docs staleness detection" (type: improvement, app: gsd-t, category: commands) — gsd-t-health STALE flag for placeholder-only docs + scan self-check after writing living docs |
| 2026-02-19 | 16 | Added backlog item #4: "DB integration testing capability in QA agent" (type: feature, app: gsd-t, category: commands) — DB-agnostic test phase reading infrastructure.md for connection, migrations, seed, teardown |
| 2026-02-22 | 18 | Token logging coverage extended to all subagent-spawning commands (v2.28.14): added OBSERVABILITY LOGGING block to gsd-t-quick (Step 0), gsd-t-debug (Step 0), gsd-t-verify (Step 4 Team Mode), gsd-t-wave (Phase Agent Spawn Pattern), gsd-t-brainstorm (Step 3 Team Mode), gsd-t-discuss (Step 3 Team Mode); CLAUDE.md updated with new-command convention (Command Files), Pre-Commit Gate check, and Don't Do These Things rule; 127/127 tests pass |
| 2026-02-22 | 20 | Fix getRegisteredProjects to strip `|display name` suffix from project registry entries (v2.29.11): split each line on `|` and take the path segment before it, so entries written as `path|label` (legacy format) are handled correctly without warnings |
| 2026-02-22 | 19 | Added gsd-t-prd command — GSD-T-optimized PRD generator (v2.29.10): new command reads all project context (CLAUDE.md, progress.md, docs/, contracts/), runs adaptive intake, generates PRD with REQ-IDs/field-level data model/file-path components/milestone sequence, outputs to docs/prd.md; spawns subagent via Step 0 pattern with OBSERVABILITY LOGGING; updated 6 reference files (gsd-t-help.md, GSD-T-README.md, README.md, CLAUDE-global.md template, CLAUDE.md, package.json 2.28.14→2.29.10, count 45→46) |
| 2026-02-19 | 17 | Token-log compaction-aware schema (v2.28.13): new columns Datetime-start/end + Tokens + Compacted; bash snippet reads CLAUDE_CONTEXT_TOKENS_USED before/after each spawn; compaction detected when end<start and approximates total via (TOK_MAX-TOK_START)+TOK_END; heartbeat SubagentStart/Stop now emit token snapshot; 127/127 tests pass |
| 2026-02-19 | 15 | Added backlog item #3: "Auto-cleanup test data after test runs" (type: improvement, app: gsd-t, category: cli) — temp files/dirs from test suite must be removed on completion |
| 2026-02-19 | 14 | Fix heartbeat hooks for dashboard agent graph (v2.28.12): PostToolUse now writes agent_id (null when absent); SubagentStart + SubagentStop now write parent_id (parent_agent_id if available, else session_id as root). Enables dashboard to draw agent edges and attribute tool calls to correct nodes. 127/127 tests pass. |
| 2026-02-23 | 23 | GSD-T project guard for auto-route hook (v2.31.11): added fs.existsSync guard for .gsd-t/progress.md in cwd to gsd-t-auto-route.js — hook now silent in non-GSD-T directories; CLAUDE-global.md + live CLAUDE.md note updated; 127/127 tests pass |
| 2026-02-23 | 22 | Auto-Route feature (v2.31.10): added scripts/gsd-t-auto-route.js (UserPromptSubmit hook — plain text prompts auto-routed through /gsd, slash commands pass through unchanged); updated bin/gsd-t.js with installAutoRoute()/configureAutoRouteHook() called from doInstall(); updated templates/CLAUDE-global.md and live ~/.claude/CLAUDE.md Conversation vs. Work section with [GSD-T AUTO-ROUTE] signal recognition; updated commands/gsd-t-help.md, docs/GSD-T-README.md, README.md with auto-route documentation. 127/127 tests pass. |
| 2026-02-22 | 21 | Auto-clear context window after safe commands (v2.30.10): added `## Auto-Clear` section to 41 of 42 gsd-t-* command files — instructs Claude to execute `/clear` after each command completes, freeing the context window for the next command. Excluded: gsd-t-resume.md (would defeat purpose of restoring session context). gsd-t-wave.md gets auto-clear only at the very end of the full wave cycle (after all phases complete). All work is committed to project files so clearing is safe. 127/127 tests pass. |
| 2026-03-04 | 25 | M14 Execution Intelligence Layer (partition→verify→complete, v2.32.10): JSONL event stream (gsd-t-event-writer.js), heartbeat enrichment, outcome-tagged Decision Log, Reflexion pre-task retrieval (execute/debug), phase_transition events (wave), distillation step (complete-milestone), gsd-t-reflect command (#47). 153 tests. |
| 2026-03-04 | 26 | M15 Real-Time Agent Dashboard (partition→verify→complete, v2.33.10): gsd-t-dashboard-server.js (141 lines, zero deps, SSE), gsd-t-dashboard.html (194 lines, React Flow + Dagre CDN), gsd-t-visualize command (#48, 104 lines). 176/176 tests. |
| 2026-02-19 | 12 | Observability & model optimization (v2.28.11): (1) model: haiku for execute QA, integrate QA, plan validation, status, health, scan architecture/business-rules/contracts teammates; (2) model: sonnet kept for scan security/quality teammates; (3) MANDATORY observability logging added to execute/integrate/plan — before/after Bash timestamps + append to .gsd-t/token-log.md and .gsd-t/qa-issues.md; (4) Observability Logging directive added to CLAUDE.md; (5) init.md creates token-log.md + qa-issues.md with header rows; (6) TD-080 added for log archiving/summarizing. 125/125 tests pass. |
- 2026-04-06 10:27: [feat] Added Design System Detection step to design pipeline — gsd-t-design-decompose.md (Step 0.4), gsd-t-design-audit.md (Step 0), design-to-code.md (new Section 1, all subsequent sections renumbered 2→18). Agents now ask for design system/component library URL upfront, fetch docs, catalog available components, and map design elements to library primitives. Reduces custom-build effort and improves fidelity for projects using libraries like shadcn-vue, Vuetify, Radix, MUI. Verification checklist updated with 2 new items.
- 2026-04-06 10:37: [feat] Added SVG Structural Overlay Comparison as a mandatory verification layer in the design pipeline. Exports Figma frame as SVG, parses element positions/dimensions/colors, maps to built DOM bounding boxes, compares geometry (≤2px = MATCH). Catches aggregate spacing drift, alignment issues, and proportion errors that pass property-level checks. Added to: gsd-t-execute.md (Step 5 inside Design Verification Agent), gsd-t-quick.md (step 7 inside Design Verification Agent), gsd-t-design-audit.md (Step 3.5), design-to-code.md (Target 3 + verification workflow step 7 + checklist item). Three verification layers now: property comparison (values), SVG structural overlay (geometry), Red Team (behavior).
- 2026-04-06 16:07: [feat] Added DOM Box Model Inspection + Layout Arithmetic + Flex Anti-Pattern Rule (v2.70.11). Three verification gaps closed from BDS 5-round fix analysis: (1) Playwright-based offsetHeight vs scrollHeight check catches inflated flex elements, (2) widget contract mandatory height budget math prevents gap miscalculation, (3) explicit prohibition on flex:1 for content centering. Updated: gsd-t-execute.md (Step 5.5), gsd-t-quick.md (step 8), gsd-t-design-audit.md (Step 3.75), design-to-code.md (Section 8 anti-patterns + checklist), widget-contract.md (Internal Layout Arithmetic section + 3 checklist items).
- 2026-04-06 16:14: [feat] Added Element Count Reconciliation (v2.70.12). Counts widgets/elements from Figma INDEX.md, compares against built DOM count via Playwright. Missing widget = CRITICAL. Added to execute (Step 0), quick (Step 0), design-audit (Step 1.5), design-decompose (Figma Element Counts table in INDEX.md). Design-to-code.md now documents 5-layer verification model: Target 0 (count) → Target 1 (contracts) → Target 2 (Figma) → Target 3 (SVG overlay) → Target 4 (DOM box model).
- 2026-04-06 16:20: [feat] Added auto-create project dir + GitHub repo to gsd-t-init and gsd-t-init-scan-setup (v2.70.13). Configurable via ~/.claude/.gsd-t-config: projects_dir (base path for new projects) and github_org (org for repo creation). Skips entirely for existing projects.
- 2026-04-06 22:15: [feat] Hierarchical Build Order for design pipeline (v2.70.14). Root cause fix: decomposition creates element→widget→page hierarchy, but plan/execute ignored it — creating monolithic "build the page" tasks. Now: gsd-t-plan auto-generates tasks in Wave 1 (elements, one task per contract) → Wave 2 (widgets, import built elements) → Wave 3 (pages, import built widgets). Execute adds Design Hierarchy Build Rule in subagent prompt (no inline rebuilds, contract is authoritative over screenshots) + per-wave design verification checkpoints. Previous v2.70.10-12 enhancements (SVG overlay, box model, element count) remain as verification safety net, but primary enforcement moves from post-build verification to build-time structure.
