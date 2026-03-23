# GSD-T Roadmap — Tech Debt Reduction

---

## Feature: Multi-Consumer Surface Identification
**Added**: 2026-03-11
**Context**: GSD-T failed to identify the need for shared backend functions when multiple client surfaces (web, mobile, CLI) consume the same backend. The partition phase was provider-centric and single-consumer-assumed, never asking "who are all the consumers?" before decomposing domains.

### Milestone M18: Multi-Consumer Surface Identification
**Goal**: GSD-T surfaces shared backend functions before any code is written, when 2+ client surfaces consume the same system.
**Scope**:
- `commands/gsd-t-partition.md` — add Consumer Surface Enumeration step (Step 1.6) before domain decomposition
- `commands/gsd-t-plan.md` — add cross-domain duplicate operation detection in Step 2
- `commands/gsd-t-impact.md` — add new-consumer reuse analysis in Step 3
- `templates/shared-services-contract.md` — new template for shared function contracts
**Impact on existing**:
- Additive only — no existing steps removed or renamed
- No breaking changes to contracts or domain structure
**Success criteria**:
- [ ] partition prompts for consumer surfaces before domain decomposition
- [ ] partition auto-suggests SharedCore domain when 2+ surfaces share operations
- [ ] plan flags duplicate operations across domains
- [ ] impact identifies reuse opportunities when new consumer is added
- [ ] shared-services-contract.md template installed and usable

---

## Milestone 3: Count Fix + QA Contract Alignment — Tech Debt (COMPLETED v2.23.1)
**Source**: Promoted from tech debt scan #3 (2026-02-18)
**Items**: TD-022, TD-042, TD-043
**Goal**: All command counts accurate, QA contract complete, orphaned files cleaned up
**Success criteria**:
- [x] All count references show 43/39 across CLAUDE.md, README.md, package.json, docs/*
- [x] gsd-t-qa.md has "During Test-Sync" section
- [x] qa-agent-contract.md lists test-sync in phase contexts and Output table
- [x] .gsd-t/domains/doc-alignment/ archived
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 4: Testing Foundation — Tech Debt (COMPLETED v2.24.0)
**Source**: Promoted from tech debt scan #1 (2026-02-07)
**Items**: TD-003
**Goal**: Automated test suite covering CLI and helper functions
**Success criteria**:
- [x] Test files exist in test/ directory
- [x] `npm test` runs and passes 20+ tests (64 tests passing)
- [x] CLI subcommands (status, doctor, help, --version) have test coverage
- [x] Helper functions (isNewerVersion, validateProjectName, applyTokens, etc.) tested
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 5: Security Hardening — Tech Debt (COMPLETED v2.24.1)
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035
**Goal**: All known security concerns addressed or documented
**Success criteria**:
- [x] Heartbeat scrubs common secret patterns before logging
- [x] npm-update-check.js validates path within ~/.claude/
- [x] npm-update-check.js checks symlink before write
- [x] HTTP response accumulation bounded (1MB limit)
- [x] ensureDir validates parent symlinks
- [x] Wave bypassPermissions documented with security implications
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 6: CLI Quality Improvement — Tech Debt (COMPLETED v2.24.2)
**Source**: Promoted from tech debt scans #1-3 (2026-02-18)
**Items**: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034
**Goal**: CLI code meets project quality standards (30-line functions, no duplication, consistent config)
**Success criteria**:
- [x] doUpdateAll() continues on per-project failures
- [x] No function exceeds 30 lines in bin/gsd-t.js or scripts/
- [x] Heartbeat cleanup only fires on SessionStart
- [x] .gitattributes and .editorconfig exist with correct settings
- [x] No repeated code patterns (3 duplication types resolved)
- [x] checkForUpdates uses external script instead of inline JS
- [x] No regression in existing functionality — 76/76 tests pass
**Completed**: 2026-02-19

---

## Milestone 7: Command File Cleanup — Tech Debt (COMPLETED v2.24.3)
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041
**Goal**: All command files follow consistent structure and conventions
**Success criteria**:
- [x] discuss.md and impact.md have Autonomy Behavior sections
- [x] Zero fractional step numbers across all command files (85 renumbered across 17 files)
- [x] QA agent has file-path boundary constraints
- [x] Wave reads progress.md with integrity check
- [x] gsd-t-qa.md has Document Ripple section
- [x] All QA-spawning commands have consistent blocking language (9 active spawners)
- [x] QA agent supports multiple test frameworks (Playwright, Jest, Vitest, node:test, pytest)
- [x] Wave discuss-skip uses structured signal (domain count + contracts + open questions)
- [x] No regression in existing functionality — 76/76 tests pass
**Completed**: 2026-02-19

---

## Milestone 8: Housekeeping + Contract Sync — Tech Debt (COMPLETED v2.24.4)
**Source**: Promoted from tech debt scan #4 (2026-02-18)
**Items**: TD-029, TD-044, TD-045, TD-046, TD-047, TD-048, TD-049, TD-050, TD-051, TD-052, TD-053, TD-054, TD-055
**Goal**: All 13 scan #4 findings resolved — contracts synced, docs updated, orphans cleaned, quality gates added
**Success criteria**:
- [x] progress.md Status uses contract-recognized values
- [x] CHANGELOG.md has entries for v2.24.0 through v2.24.3
- [x] Zero orphaned domain directories
- [x] All contracts reflect current implementation
- [x] CLAUDE.md version reference accurate or pattern-resistant
- [x] All JS files have LF line endings after git renormalization
- [x] 116/116 tests pass with no regressions
**Completed**: 2026-02-18

---

## Milestone 10: Token Efficiency (COMPLETED v2.25.10)
**Source**: Promoted from backlog items #2, #3, #4 (2026-02-18)
**Goal**: Reduce wave token consumption by ~124K+ tokens with zero quality loss, and prevent context compaction during consecutive standalone command invocations
**Backlog items**: #2 QA Agent Optimization, #3 Inline Test Steps for Quick/Debug, #4 Subagent Execution for Standalone Commands
**Scope**:
- QA optimization: skip QA spawn on partition, plan, complete-milestone; fold QA into test-sync and verify agents inline; change execute and integrate QA from TeamCreate teammate to Task subagent
- Inline tests: add mandatory "run affected tests" step to gsd-t-quick.md and gsd-t-debug.md
- Subagent execution: wrap debug, quick, scan, status invocations as Task subagents for fresh context windows
**Success criteria**:
- [ ] QA not spawned in partition, plan, complete-milestone command files
- [ ] test-sync and verify agents perform contract testing and gap analysis inline (no separate QA spawn)
- [ ] execute and integrate spawn QA via Task tool (not TeamCreate)
- [ ] gsd-t-quick.md includes explicit "run all affected tests" step
- [ ] gsd-t-debug.md includes explicit "run tests confirming fix" step
- [ ] standalone commands spawn as subagents with fresh context
- [ ] All 125 tests pass with no regressions
- [ ] No quality gates removed — testing still happens at every appropriate phase

---

## Milestone 11: Execution Quality (COMPLETED v2.26.10)
**Source**: Promoted from backlog items #5, #7, #8 (2026-02-18)
**Goal**: Make the execution loop more reliable and correct across milestones — formalized deviation handling, per-task git commits, and filesystem-verified phase completion
**Backlog items**: #5 Deviation Rules, #7 Atomic Commits Per Task, #8 Spot-Check Verification
**Scope**:
- Deviation rules: add 4-rule protocol to execute, quick, debug — auto-fix bugs/blockers/missing functionality, STOP for architectural changes, 3-attempt limit, deferred-items.md for pre-existing issues
- Atomic commits: change execute phase from per-phase to per-task commits (format: `feat(domain/task-N): description`), update team mode teammate instructions
- Spot-check: add filesystem + git verification step to wave orchestrator's between-phase check — verify files exist, commits present, no FAILED markers
**Success criteria**:
- [ ] gsd-t-execute.md, gsd-t-quick.md, gsd-t-debug.md contain Deviation Rules section with 4 rules and 3-attempt limit
- [ ] execute commits after each task (not at phase end)
- [ ] Team mode teammate instructions include per-task commit requirement
- [ ] Wave orchestrator's between-phase verification checks filesystem and git, not just agent-reported status
- [ ] All 125 tests pass with no regressions

---

## Milestone 12: Planning Intelligence (COMPLETED v2.27.10)
**Source**: Promoted from backlog items #6, #9, #10 (2026-02-18)
**Goal**: Improve correctness across milestones by preventing assumption drift between discuss→plan, catching bad plans before execute runs, and tracking requirement coverage automatically
**Backlog items**: #6 CONTEXT.md from Discuss Phase, #9 Plan Validation Loop, #10 Requirements Traceability
**Scope**:
- CONTEXT.md: restructure discuss output into Locked Decisions / Deferred Ideas / Claude's Discretion sections; add fidelity enforcement step to plan (planner must map each locked decision to a task)
- Plan validation: spawn checker agent after plan phase to validate REQ coverage, task acceptance criteria, cross-domain dependencies, contract existence; max 3 iterations; replaces/absorbs existing QA spawn in plan
- Requirements traceability: during plan, map each REQ-ID to implementing domain/task; after verify, mark requirements complete; orphan detection for planning gaps and scope creep; traceability table in requirements.md
**Note**: Requires discuss phase — do NOT skip to plan. Locked decisions from discuss feed the plan validator.
**Success criteria**:
- [ ] gsd-t-discuss.md produces CONTEXT.md with three named sections
- [ ] gsd-t-plan.md reads CONTEXT.md locked decisions and maps each to a task (fidelity enforcement step)
- [ ] Plan validation checker spawned after plan generation, blocks on failure (max 3 iterations)
- [ ] Plan phase outputs REQ-ID → domain/task traceability table in requirements.md
- [ ] Verify phase marks matched requirements as complete
- [ ] Orphan detection reports requirements with no task and tasks with no REQ reference
- [ ] All 125 tests pass with no regressions

---

## Milestone 13: Tooling & UX (COMPLETED v2.28.10)
**Source**: Promoted from backlog items #11, #12, #13, #14, #15 (2026-02-18)
**Goal**: Infrastructure and UX improvements — CLI state utility, smarter parallel execution, health diagnostics, reliable pause/resume, context usage visibility
**Backlog items**: #11 gsd-t-tools.js Utility CLI, #12 Wave-Based Parallel Execution, #13 Health Command, #14 Pause/Resume with Continue-Here Files, #15 Statusline Context Usage Bar
**Scope**:
- gsd-t-tools.js: new Node.js CLI (zero external deps) with subcommands: state get/set, validate, parse progress --section, list domains/contracts, git pre-commit-check, template scope/tasks; returns compact JSON
- Wave parallel execution: dependency analysis in plan outputs wave groupings to integration-points.md; execute uses groupings for automatic parallel/sequential ordering with file conflict detection
- Health command: new gsd-t-health slash command + optional CLI subcommand; validates .gsd-t/ integrity; --repair creates missing files
- Pause/resume: new /pause command creates .continue-here-{timestamp}.md; gsd-t-resume reads most recent continue-here file before progress.md
- Statusline bar: extend statusline script to show context usage % color-coded (green/yellow/orange/red)
**Success criteria**:
- [x] gsd-t-tools.js exists with all 6 subcommand categories, returns JSON, zero external deps
- [x] plan phase outputs wave groupings in integration-points.md
- [x] execute uses wave groupings for parallel task scheduling
- [x] gsd-t-health.md command validates structure and --repair creates missing files
- [x] /pause creates timestamped continue-here file
- [x] gsd-t-resume.md reads continue-here file if present
- [x] Statusline shows context usage bar
- [x] All 125 tests pass with no regressions
**Completed**: 2026-02-18

---

## Milestone 14: Execution Intelligence Layer (COMPLETE — v2.32.10, 2026-03-04)
**Source**: Brainstorm session 2026-03-04 — user goals: audit log + GSD-T learning from past decisions
**Goal**: Instrument GSD-T's execution with a structured JSONL event stream and learning loop. Every command invocation, subagent spawn, phase transition, and decision is captured with outcome tagging. Pre-task experience retrieval (Reflexion pattern) surfaces past failures before similar tasks. Distillation at milestone completion converts repeated episodic patterns to semantic memory. New `gsd-t-reflect` command for on-demand retrospective.
**Scope**:
- `.gsd-t/events/YYYY-MM-DD.jsonl` — append-only event stream, one event per line
- `scripts/gsd-t-event-writer.js` — zero-dep helper for structured event writes from hooks
- Outcome-tagged Decision Log — `[success]`, `[failure]`, `[learning]`, `[deferred]` prefixes on all new entries
- Pre-task experience retrieval — execute/debug grep Decision Log for `[failure]`/`[learning]` entries matching current domain before spawning subagent
- Phase transition events — every wave phase transition logs event with rationale and outcome
- Distillation step in `complete-milestone` — scan events for patterns seen ≥3 times, propose constraints.md / CLAUDE.md updates
- `gsd-t-reflect` command — reads milestone events, generates structured retrospective, proposes memory updates
- Heartbeat hook enrichment — SubagentStart/Stop/PostToolUse write to events/ in addition to existing JSONL
**Out of scope**: Visualization UI (M15), SigNoz integration (backlog #6), external eval frameworks (backlog #7)
**Success criteria**:
- [x] `.gsd-t/events/YYYY-MM-DD.jsonl` written during wave/execute with schema: ts, event_type, command, phase, agent_id, parent_agent_id, trace_id, reasoning, outcome
- [x] execute and debug retrieve past `[failure]`/`[learning]` entries from Decision Log before task subagent spawn
- [x] complete-milestone distillation step runs and proposes CLAUDE.md updates for patterns found ≥3 times
- [x] `gsd-t-reflect` command generates structured retrospective from event stream
- [x] All existing tests pass with no regressions (153 tests, baseline was 127)
- [x] New tests cover event-writer.js and heartbeat enrichment (26 new tests)

---

## Milestone 15: Real-Time Agent Dashboard (COMPLETE — v2.33.10, 2026-03-04)
**Source**: Brainstorm session 2026-03-04 — user goal: real-time visualization of workflow and agents
**Goal**: Render GSD-T's live execution as an interactive browser-based dashboard. An SSE server watches the M14 event stream and pushes updates to a React Flow + Dagre visualization showing the agent hierarchy, tool call activity, phase progression, and memory system interactions in real time.
**Reference mockup**: `scripts/gsd-t-dashboard-mockup.html` (6 scenarios: wave/execute, parallel domains, scan, brainstorm, debug, quick/error)
**Scope**:
- `scripts/gsd-t-dashboard-server.js` — Node.js SSE server (141 lines, zero external deps) watching `.gsd-t/events/*.jsonl`
- `scripts/gsd-t-dashboard.html` — React Flow + Dagre via CDN (194 lines, no build step), agent hierarchy + live event overlay
- `gsd-t-visualize` command (104 lines, #48) — launches dashboard server + opens browser, stops server via stop argument
- bin/gsd-t.js update — UTILITY_SCRIPTS array includes both dashboard files
**Out of scope**: SigNoz/OpenTelemetry export, cloud telemetry, WebSocket (SSE sufficient), npm publish of dashboard
**Blocked by**: M14 (event stream must exist and be populated)
**Success criteria**:
- [x] `gsd-t-visualize` starts server and opens browser in < 3s
- [x] Agent hierarchy renders correctly (parent → child via parent_agent_id from events)
- [x] Live events appear in dashboard within 1s of JSONL write
- [x] All 6 mockup scenarios visualized with real event data
- [x] Dashboard server is zero external dependencies (Node.js built-ins only)
- [x] All existing tests pass with no regressions (176/176)

---

## Milestone 9: Cleanup Sprint — Tech Debt (COMPLETED v2.24.5)
**Source**: Promoted from tech debt scan #5 (2026-02-18)
**Items**: TD-056, TD-057, TD-058, TD-059, TD-060, TD-061, TD-062, TD-063, TD-064, TD-065
**Goal**: Resolve all 10 LOW-severity scan #5 findings — dead code, untested exports, documentation errors, minor security gap, contract drift
**Scope**:
- Remove dead code: PKG_EXAMPLES constant (TD-057), dead test imports (TD-058)
- Code quality: summarize() case fallthrough (TD-056), redundant condition (TD-061)
- Test coverage: add tests for readSettingsJson() (TD-059) and shortPath() (TD-060)
- Documentation: correct SEC-N16 note (TD-062)
- Security: scrub notification title (TD-063)
- Contract sync: update wave integrity check contract (TD-064), remove duplicate format contract (TD-065)
**Success criteria**:
- [x] Zero dead code (PKG_EXAMPLES removed, dead imports removed)
- [x] summarize() uses case fallthrough, under 27 lines
- [x] checkForUpdates() condition simplified
- [x] readSettingsJson() and shortPath() have direct unit tests
- [x] SEC-N16 informational note is factually accurate
- [x] Notification title scrubbed via scrubSecrets()
- [x] wave-phase-sequence.md integrity check matches implementation
- [x] file-format-contract.md deleted (backlog-file-formats.md is authoritative)
- [x] All tests pass with no regressions (125/125)
- [x] No new tech debt introduced
**Completed**: 2026-02-18

---

## Feature: Self-Learning & Self-Improvement System
**Added**: 2026-03-22
**Context**: Brainstorm session (2026-03-20) identified that GSD-T captures execution events but lacks structured per-task telemetry, milestone-level aggregation, trend analysis, anomaly detection, and a quality composite score. The existing event stream (M14) and dashboard (M15) provide infrastructure; this feature adds the metrics, rules, and cross-project learning layers. OpenClaw analysis (2026-03-22) validated the architecture and contributed three additions: pre-flight intelligence checks (adapted from OpenClaw's heartbeat), weighted downstream signal taxonomy (from OpenClaw-RL's next-state feedback), and patch graduation to permanent methodology artifacts (from OpenClaw's procedural skill generation).
**Research basis**: DORA metrics, Google SRE error budgets, AlphaZero policy promotion, manufacturing SPC, immune system affinity maturation, UPS ORION pre-mortem, OpenClaw proactive agent architecture, OpenClaw-RL reinforcement learning from conversational feedback
**North Star metric**: First-pass success rate — if every task passes QA on the first attempt, everything else follows

### Milestone M25: Telemetry Collection & Metrics Dashboard (Tier 1) — v2.43.10
**Goal**: Every task emits structured telemetry with weighted signal classification. Milestone completion produces rollup with trend comparison. Dashboard shows metric charts. Process ELO tracks overall quality using weighted signals. Pre-flight intelligence check surfaces historical patterns before execution.
**Scope**:
- `.gsd-t/metrics/task-metrics.jsonl` — per-task structured telemetry (duration, token usage, pass/fail, fix cycles, context %, signal type, signal weight)
- `.gsd-t/metrics/rollup.jsonl` — milestone-level aggregation with trend comparison to previous milestones
- 4 detection heuristics — first-pass failure rate spike, rework rate anomaly, context overflow correlation, duration regression
- Pre-flight intelligence check — execute reads `task-metrics.jsonl` before dispatch, surfaces warnings for domain types with historically high failure/fix-cycle rates (adapted from OpenClaw heartbeat)
- Weighted downstream signal taxonomy — classify follow-up actions as distinct signal types with weights (from OpenClaw-RL):
  - `pass-through` (+1.0): task passed QA, next task proceeded
  - `fix-cycle` (-0.5): task required rework before passing
  - `debug-invoked` (-0.8): user ran /debug immediately after
  - `user-correction` (-1.0): user manually intervened/corrected
  - `phase-skip` (+0.3): phase was clean enough to skip
- Process ELO score — single composite scalar updated per milestone using weighted signal taxonomy (not binary pass/fail)
- Chart.js dashboard panel — metric charts integrated into existing gsd-t-visualize dashboard
- `gsd-t-metrics` command — on-demand metric queries (first-pass rate, ELO history, domain breakdown, trend comparison)
- `commands/gsd-t-execute.md` — emit task-metrics record after each task + pre-flight check before dispatch
- `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md` — emit task-metrics record
- `commands/gsd-t-complete-milestone.md` — produce rollup entry, compute ELO delta
- `commands/gsd-t-verify.md` or `commands/gsd-t-complete-milestone.md` — run 4 detection heuristics
- `scripts/gsd-t-dashboard.html` — add metrics chart panel
- `commands/gsd-t-status.md` — display ELO and key metrics summary
**Not in scope (Tier 2+)**: Declarative rule engine (rules.jsonl), patch templates, promotion gates, activation tracking, cross-project integration
**Predecessor**: M14 (Execution Intelligence Layer), M15 (Real-Time Agent Dashboard), M22 (Context Observability)
**Brainstorm**: `.gsd-t/brainstorm-2026-03-20-telemetry.md`
**Impact on existing**:
- Extends `commands/gsd-t-execute.md` — adds pre-flight check step + task-metrics emission step
- Extends `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md` — adds task-metrics emission step
- Extends `commands/gsd-t-complete-milestone.md` — adds rollup + ELO computation + heuristic detection steps
- Extends `commands/gsd-t-status.md` — adds ELO and metrics summary display
- Extends `scripts/gsd-t-dashboard.html` — adds Chart.js metrics panel
- Extends `commands/gsd-t-verify.md` — adds heuristic detection step
- New command: `commands/gsd-t-metrics.md` — on-demand metric queries
- New directory: `.gsd-t/metrics/` — task-metrics.jsonl and rollup.jsonl
- No breaking changes to existing contracts or workflows
**Success criteria**:
- [ ] Every task in execute/quick/debug emits a record to `.gsd-t/metrics/task-metrics.jsonl` with signal_type and signal_weight fields
- [ ] Pre-flight check in execute reads historical metrics and surfaces warnings for high-risk domain/task patterns
- [ ] `complete-milestone` produces rollup entry in `.gsd-t/metrics/rollup.jsonl` with trend delta
- [ ] 4 detection heuristics flag anomalies during verify or complete-milestone
- [ ] Dashboard renders metric charts from task-metrics.jsonl and rollup.jsonl
- [ ] Process ELO computed using weighted signals and stored per milestone, displayed in status output
- [ ] `gsd-t-metrics` command returns structured metric queries
- [ ] All existing tests pass with no regressions (329+ tests)

### Milestone M26: Declarative Rule Engine & Patch Lifecycle (Tier 2) — v2.44.10
**Goal**: Auto-detect failure patterns, generate candidate patches, and manage their lifecycle through promotion gates with measurable improvement thresholds. Promoted patches that sustain improvement graduate into permanent methodology artifacts.
**Scope**:
- `.gsd-t/metrics/rules.jsonl` — declarative rule engine: pattern detection triggers as JSON objects (not hardcoded heuristics). Adding a new detection pattern = JSON append, not code deploy
- `.gsd-t/metrics/patch-templates.jsonl` — maps triggers to specific command file / constraints.md edits. Each template defines: trigger pattern, target file, edit type, edit content
- Patch lifecycle with 5 stages: `candidate → applied → measured → promoted → graduated`
  - **candidate**: auto-generated when heuristic detects repeated pattern (≥3 occurrences in task-metrics)
  - **applied**: patch template executed, edit applied to target file
  - **measured**: next 2+ milestones track whether the target metric improved
  - **promoted**: patch exceeds improvement threshold (>55% win rate, adapted from AlphaZero)
  - **graduated**: promoted patch sustained for 3+ milestones → absorbed into permanent methodology artifact (constraints.md, verify checks, plan pre-conditions) → removed from rules.jsonl (inspired by OpenClaw procedural skill generation)
- Promotion gates — patches must measurably improve target metric before becoming permanent. Gate check runs during `complete-milestone` distillation step
- Activation count tracking — each rule records how many times it fires. Rules that haven't prevented a failure in N milestones are flagged for deprecation (from immune system affinity maturation)
- Periodic consolidation — every 5 milestones, related rules distilled into single cleaner rule (anti-bloat mechanism)
- Quality budget governance — define per-milestone rework ceiling (e.g., max 20% of tasks require fix cycles). When budget exhausted, system automatically tightens constraints: force discuss phase, require contract review, split large tasks (from Google SRE error budget)
- `commands/gsd-t-complete-milestone.md` — extends distillation step with rule evaluation, patch candidate generation, promotion gate check, graduation
- `commands/gsd-t-execute.md` — pre-task step reads active rules and injects relevant constraints into subagent prompts
- `commands/gsd-t-plan.md` — pre-mortem step: cross-reference domain types against historical failure data in rules, embed mitigations before execution (from UPS ORION)
**Not in scope (Tier 3)**: Neo4j cross-project causal inference, cross-project rule propagation
**Predecessor**: M25 (task-metrics.jsonl must exist and be populated for pattern detection)
**Impact on existing**:
- Extends `commands/gsd-t-complete-milestone.md` — adds rule evaluation + patch generation + promotion + graduation steps to distillation
- Extends `commands/gsd-t-execute.md` — adds active rule injection to task subagent prompts (in addition to M25's pre-flight check)
- Extends `commands/gsd-t-plan.md` — adds pre-mortem step reading rules for domain-type failure patterns
- New directory: `.gsd-t/metrics/patches/` — individual patch files with status tracking
- New contract: `.gsd-t/contracts/rule-engine-contract.md` — rule schema, patch template schema, promotion gate thresholds, graduation criteria
- No breaking changes to existing contracts — all additive
**Success criteria**:
- [ ] Rules.jsonl stores detection patterns as declarative JSON objects
- [ ] Patch templates auto-generate candidate patches when patterns detected (≥3 occurrences)
- [ ] Promotion gate blocks patch advancement unless >55% improvement measured
- [ ] Graduated patches write themselves into constraints.md or verify checks and exit rules.jsonl
- [ ] Activation count tracking flags inactive rules for deprecation
- [ ] Quality budget governance triggers constraint tightening when rework ceiling exceeded
- [ ] Pre-mortem in plan surfaces historical failure patterns for current domain types
- [ ] All existing tests pass with no regressions

### Milestone M27: Cross-Project Learning & Global Sync (Tier 2.5) — v2.45.10
**Goal**: Propagate proven rules across projects, enable cross-project comparison using signal-type distributions, and eventually ship validated rules in the npm package.
**Scope**:
- Dual-layer learning architecture:
  - Project-specific: `.gsd-t/metrics/` (task-metrics, rollup, rules, patches) — stays local
  - Cross-project: `~/.claude/metrics/` (global rollup, global rules, signal distributions) — shared across all registered GSD-T projects
- Global patch propagation — when a rule is promoted in one project:
  1. Copy to `~/.claude/metrics/global-rules.jsonl` with source project tag
  2. On `gsd-t-version-update-all`, propagate global rules to all registered projects as candidates (not promoted — each project must re-validate)
  3. Rules that achieve promotion in 3+ projects → marked as universal
- Cross-project signal-type comparison — compare weighted signal distributions (not just raw pass/fail rates) across projects. "Project A has 3x the user-correction rate on auth domains" is more actionable than "Project A has lower first-pass rate" (from OpenClaw-RL insight)
- Cross-project rollup aggregation — domain-type pattern matching: compare similar domain types (auth, payments, UI) across projects to identify systemic patterns
- npm distribution pipeline — universal rules that achieve promotion in 5+ projects are candidates for shipping in the GSD-T npm package itself (in `templates/` or `examples/rules/`), making the methodology self-improving across all users
- `gsd-t-version-update-all` — extends with global rule sync step
- `gsd-t-metrics` command — extends with cross-project comparison mode
- `gsd-t-status` — extends with global ELO and cross-project rank
**Not in scope**: Neo4j graph database (optional power tier, not required for cross-project learning)
**Predecessor**: M26 (rule engine must exist with promotion gates for cross-project propagation to work)
**Impact on existing**:
- Extends `bin/gsd-t.js` `doUpdateAll()` — adds global rule sync step during update-all
- Extends `commands/gsd-t-metrics.md` — adds cross-project comparison queries
- Extends `commands/gsd-t-status.md` — adds global ELO display
- Extends `commands/gsd-t-complete-milestone.md` — adds global rule promotion check after local promotion
- New directory: `~/.claude/metrics/` — global rollup, global rules, signal distributions
- New contract: `.gsd-t/contracts/cross-project-sync-contract.md` — global rule schema, propagation protocol, universal promotion criteria
- No breaking changes to existing contracts — all additive
**Success criteria**:
- [ ] Promoted rules propagate to `~/.claude/metrics/global-rules.jsonl`
- [ ] `gsd-t-version-update-all` syncs global rules to all registered projects as candidates
- [ ] Rules achieving promotion in 3+ projects marked as universal
- [ ] Cross-project comparison uses signal-type distributions, not just raw rates
- [ ] `gsd-t-metrics --cross-project` returns domain-type comparison across projects
- [ ] All existing tests pass with no regressions
