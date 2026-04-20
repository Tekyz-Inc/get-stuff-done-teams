# Requirements — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-03-09 (Scan #9 — M17 complete)

## Functional Requirements

| ID | Requirement | Priority | Status | Tests |
|----|-------------|----------|--------|-------|
| REQ-001 | CLI installer with install, update, status, doctor, init, uninstall, update-all, register, changelog subcommands | P1 | complete | manual CLI testing |
| REQ-002 | 41 GSD-T workflow slash commands for Claude Code (incl. QA agent, health, pause) | P1 | complete | validated by use |
| REQ-003 | 4 utility commands (gsd smart router, branch, checkin, Claude-md) | P1 | complete | validated by use |
| REQ-004 | Backlog management system (7 commands: add, list, move, edit, remove, promote, settings) | P1 | complete | validated by use |
| REQ-005 | Contract-driven development with domain partitioning | P1 | complete | validated by use |
| REQ-006 | Wave orchestration (full cycle: partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete) | P1 | complete | validated by use |
| REQ-007 | Heartbeat system via Claude Code hooks (9 events, JSONL output, 7-day cleanup) | P2 | complete | hook scripts installed |
| REQ-008 | Automatic update check against npm registry (1h cache, background refresh) | P2 | complete | CLI + slash command |
| REQ-009 | Document templates for living docs (9 templates with token replacement) | P1 | complete | used by gsd-t-init |
| REQ-010 | Smart router — natural language intent → command routing | P2 | complete | validated by use |
| REQ-011 | Triage and merge — auto-review, score, merge safe GitHub branches | P2 | complete | validated by use |
| REQ-012 | QA Agent — test-driven contract enforcement spawned in 10 phases | P1 | complete | validated by use |
| REQ-013 | Wave orchestrator — agent-per-phase execution with fresh context windows | P1 | complete | validated by use |
| REQ-014 | Token Efficiency — QA refactored (removed from partition/plan, Task subagent for execute/integrate, inline for test-sync/verify) | P2 | complete (M10) | validated by use |
| REQ-015 | Execution Quality — Deviation Rules (4-rule, 3-attempt), per-task commits, wave spot-check | P2 | complete (M11) | validated by use |
| REQ-016 | Planning Intelligence — CONTEXT.md from discuss, plan fidelity enforcement, plan validation subagent, REQ traceability | P2 | complete (M12) | validated by use |
| REQ-017 | Tooling & UX — gsd-t-tools.js state CLI, gsd-t-statusline.js context bar, gsd-t-health command, gsd-t-pause command | P2 | complete (M13) | validated by use |
| REQ-018 | Execution Event Stream — append-only JSONL event log (.gsd-t/events/) capturing every command invocation, subagent spawn, phase transition, and decision with schema: ts, event_type, command, phase, agent_id, parent_agent_id, trace_id, reasoning, outcome | P1 | complete (M14) | test/event-stream.test.js |
| REQ-019 | Outcome-Tagged Decision Log — Decision Log entries prefixed with [success], [failure], [learning], [deferred] outcome tags for all new entries written by execute, debug, complete-milestone | P1 | complete (M14) | validated by use |
| REQ-020 | Pre-Task Experience Retrieval — execute and debug retrieve [failure]/[learning] Decision Log entries matching the current domain/task before spawning subagents (Reflexion pattern); warning injected into subagent prompt if relevant past failures found | P1 | complete (M14) | validated by use |
| REQ-021 | Milestone Distillation — complete-milestone runs a distillation step: scans the event stream for patterns found ≥3 times, proposes concrete constraints.md / CLAUDE.md rule additions, user confirms before write | P2 | complete (M14) | validated by use |
| REQ-022 | gsd-t-reflect command — reads .gsd-t/events/*.jsonl for the current milestone, generates structured retrospective (what worked, what failed, patterns found, proposed memory updates), outputs to .gsd-t/retrospectives/YYYY-MM-DD-{milestone}.md | P2 | complete (M14) | validated by use |
| REQ-023 | Real-Time Agent Dashboard — gsd-t-visualize command starts a zero-dependency SSE server watching .gsd-t/events/ and opens gsd-t-dashboard.html in the browser; dashboard renders agent hierarchy (React Flow + Dagre via CDN) with live event overlay; all 6 interaction patterns visualized (wave/execute, parallel domains, scan, brainstorm, debug, quick/error) | P2 | complete (M15) | test/dashboard-server.test.js (23 tests) |
| REQ-024 | Scan Schema Extraction — gsd-t-scan detects and parses ORM/schema definition files (TypeORM entities, Prisma schema, Drizzle schema, Mongoose models, SQLAlchemy models, raw SQL migrations) to extract: entity names, field names and types, primary/foreign keys, and relationships; outputs structured schema data consumed by REQ-025 ER diagram generation | P1 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-025 | Scan Diagram Generation — gsd-t-scan generates Mermaid diagram definition files (.mmd) for 6 diagram types derived from codebase analysis: (1) System Architecture — C4-style context diagram of services, databases, queues, and external integrations; (2) Application Architecture — layered diagram showing framework layers (controllers/guards/services/repositories) and their boundaries; (3) Workflow Diagram — state machine derived from status enums and state transition logic; (4) Data Flow Diagram — flowchart tracing data from user input through validation, persistence, async queues, and workers; (5) Sequence Diagram — request/response flow for the most critical API endpoint detected; (6) Database Schema — ER diagram generated from REQ-024 schema extraction | P1 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-026 | Scan Diagram Rendering — diagram definitions from REQ-025 are rendered to SVG using the configured backend (REQ-028); rendered SVGs are embedded inline in the HTML report; rendering backend is selected in priority order: Mermaid CLI → D2 → Kroki HTTP; if all backends fail a graceful fallback generates a "diagram unavailable" placeholder without blocking the report | P1 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-027 | Scan HTML Report — gsd-t-scan generates a self-contained HTML report (scan-report.html) containing: (a) sidebar navigation with scrollspy; (b) summary metric cards (files scanned, LoC, tech debt count by severity, test coverage %, outdated deps, API endpoint count); (c) domain health cards with file inventory and health score; (d) 6 diagram sections (REQ-025/026) each with title, type badge, inline SVG, expand-to-fullscreen button with scroll-to-zoom, and descriptive note; (e) tech debt register table with severity badges; (f) key findings with actionable recommendations; report uses dark theme, no external CDN required after generation | P1 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-028 | Scan Document Export — scan output exportable to two additional formats: (a) DOCX via Pandoc (GPL v2+) — converts scan-report.md + embedded images to .docx; upload to Google Drive auto-converts to Google Docs; (b) PDF via md-to-pdf (MIT) + Puppeteer — renders markdown with CSS styling to print-quality PDF; both export formats are triggered by optional flags (--export=docx, --export=pdf) and are independent of HTML report generation | P2 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-029 | Diagram Rendering Toolchain — three rendering backends supported, each free and open source, selected automatically based on availability: (1) Primary — Mermaid CLI (mmdc, @mermaid-js/mermaid-cli, MIT, npm) renders .mmd files to SVG via headless Chromium; (2) Enhanced — D2 (MPL-2.0, terrastruct/d2, Go binary) as optional renderer for architecture and dataflow diagrams — uses dagre/ELK/neato layouts (TALA excluded, paid); (3) Fallback — Kroki HTTP API (MIT, yuzutech/kroki) renders any supported format via single HTTP POST to kroki.io (public free tier) or self-hosted Docker instance | P2 | complete (M17) | test/scan.test.js + verify-gates.js |
| REQ-030 | MCP Diagram Server Support — gsd-t-scan supports optional MCP-based diagram generation when registered MCP servers are detected in Claude Code settings: diagram-bridge-mcp (MIT, tohachan) selects optimal format and renders via Kroki; C4Diagrammer (MIT, jonverrier) specialized for existing codebase → C4 architecture diagrams; mcp-mermaid (MIT, hustcc) for 22 Mermaid diagram types; MCP path is preferred over CLI when available | P3 | complete (M17) | test/scan.test.js + verify-gates.js |

| REQ-031 | Per-Task Telemetry Collection — metrics-collector.js emits structured records to task-metrics.jsonl with weighted signal taxonomy (5 signal types), pre-flight intelligence check warns on domain failure patterns | P1 | complete (M25) | test/metrics-collector.test.js |
| REQ-032 | Milestone Rollup & Process ELO — metrics-rollup.js aggregates task-metrics into rollup.jsonl with first_pass_rate, ELO scoring (K=32), trend comparison, 4 detection heuristics (first-pass-failure-spike, rework-rate-anomaly, context-overflow-correlation, duration-regression) | P1 | complete (M25) | test/metrics-rollup.test.js |
| REQ-033 | Metrics Dashboard Panel — Chart.js trend line (first_pass_rate over milestones), domain health heatmap, ELO display in existing dashboard via GET /metrics endpoint | P2 | complete (M25) | test/dashboard-server.test.js (extend) |
| REQ-034 | gsd-t-metrics Command — 50th command reads task-metrics.jsonl + rollup.jsonl, displays metrics summary, ELO, signal distribution, domain breakdown, trend comparison, heuristic warnings | P1 | complete (M25) | validated by use |
| REQ-035 | Process ELO in Status — gsd-t-status displays current ELO score and quality budget summary from rollup.jsonl | P2 | complete (M25) | validated by use |

| REQ-036 | Declarative Rule Engine — bin/rule-engine.js loads rules from rules.jsonl, evaluates triggers against task-metrics with 8 operators (gt, gte, lt, lte, eq, neq, in, pattern_count), tracks activation counts, flags inactive rules, consolidates related rules | P1 | planned | test/rule-engine.test.js |
| REQ-037 | Patch Template System — patch-templates.jsonl maps rule triggers to file edits (append, prepend, insert_after, replace), templates reference target files and edit content | P1 | planned | test/rule-engine.test.js |
| REQ-038 | Patch Lifecycle Manager — bin/patch-lifecycle.js manages 5-stage lifecycle (candidate->applied->measured->promoted->graduated) with promotion gate (>55% improvement over 2+ milestones) and graduation (3+ milestones sustained) | P1 | planned | test/patch-lifecycle.test.js |
| REQ-039 | Active Rule Injection in Execute — gsd-t-execute.md injects firing rules (max 10 lines) into subagent prompts before task dispatch | P1 | planned | validated by use |
| REQ-040 | Rule-Based Pre-Mortem in Plan — gsd-t-plan.md Step 1.7 enhanced with getPreMortemRules to surface historical rule matches for domain types | P2 | planned | validated by use |
| REQ-041 | Distillation Extension — gsd-t-complete-milestone.md distillation step extended with rule evaluation, patch candidate generation, promotion gate check, graduation, consolidation, and quality budget governance | P1 | planned | validated by use |
| REQ-042 | Quality Budget Governance — per-milestone rework ceiling (default 20%), auto-tightens constraints (force discuss, require contract review, split large tasks) when exceeded | P2 | planned | validated by use |

| REQ-043 | Global Sync Manager — bin/global-sync-manager.js reads local metrics, writes global aggregated files to ~/.claude/metrics/, provides APIs for global rollup, global rules, signal distribution comparison, universal rule promotion | P1 | planned | test/global-sync-manager.test.js |
| REQ-044 | Cross-Project Rule Propagation — gsd-t-version-update-all syncs global rules (universal or promotion_count >= 2) to all registered projects as candidates | P1 | planned | test/global-rule-sync.test.js |
| REQ-045 | Universal Rule Promotion — rules promoted in 3+ projects marked universal, 5+ projects become npm distribution candidates shipped in examples/rules/ | P1 | planned | test/global-sync-manager.test.js |
| REQ-046 | Cross-Project Signal Comparison — gsd-t-metrics --cross-project displays signal-type distribution comparison across registered projects | P2 | planned | validated by use |
| REQ-047 | Global ELO & Rankings — gsd-t-status displays global ELO score and cross-project rank when global metrics exist | P2 | planned | validated by use |
| REQ-048 | Global Rule Promotion on Milestone Completion — gsd-t-complete-milestone copies promoted rules to global-rules.jsonl and updates global rollup after local promotion | P1 | planned | validated by use |
| REQ-049 | E2E Enforcement Rule — when playwright.config.* or cypress.config.* exists, ALL test-running commands (execute, quick, debug, test-sync, integrate, verify, complete-milestone) MUST run the full E2E suite. Unit-only results are NEVER sufficient. QA subagent prompts explicitly mandate E2E detection and execution. | P1 | complete | enforced in 7 command files + CLAUDE.md + pre-commit-gate contract |
| REQ-050 | Functional E2E Test Quality Standard — Playwright specs MUST verify functional behavior (state changes, data flow, content updates after actions), NOT just element existence (isVisible, toBeEnabled). Shallow layout tests that would pass on an empty HTML page are flagged and block verification. QA subagent audits for shallow tests. | P1 | complete | enforced in execute, qa, test-sync, verify, quick, debug, integrate, complete-milestone + global CLAUDE.md + CLAUDE-global template |
| REQ-051 | Document Ripple Completion Gate — when a change affects multiple files, identify the full blast radius BEFORE starting, complete ALL updates in one pass, and only report completion after every downstream document is updated. Partial delivery is never acceptable. The user should never need to ask "did you update everything?" | P1 | complete | enforced in global CLAUDE.md + CLAUDE-global template + project CLAUDE.md |
| REQ-052 | Doc-Ripple Subagent — dedicated agent auto-spawned after code-modifying commands (execute, integrate, quick, debug, wave) that analyzes git diff, identifies full blast radius of affected documents, and spawns parallel subagents to update them. Produces manifest audit trail. Threshold logic skips trivial changes. | P1 | complete | M28: contract ACTIVE, command file, 43 tests, wired into execute/integrate/quick/debug/wave |
| REQ-053 | Debug Ledger Protocol — structured JSONL ledger (.gsd-t/debug-state.jsonl) persists hypothesis/fix/learning entries across debug sessions. Supports read, append, compact (at 50KB), anti-repetition preamble generation, and clear. | P1 | complete | M29: bin/debug-ledger.js, test/debug-ledger.test.js (46 tests) |
| REQ-054 | Headless Debug-Loop — `gsd-t headless --debug-loop` runs test-fix-retest cycles as separate `claude -p` sessions with fresh context each. External loop controller (pure Node.js, zero AI context). Escalation tiers: sonnet 1-5, opus 6-15, STOP 16-20. --max-iterations enforced externally. | P1 | complete | M29: bin/gsd-t.js headless extension, test/headless-debug-loop.test.js (37 tests) |
| REQ-055 | Anti-Repetition Preamble — each debug-loop iteration injects a preamble listing all failed hypotheses, current narrowing direction, and tests still failing. Prevents repeat of eliminated approaches. | P1 | complete | M29: bin/debug-ledger.js generateAntiRepetitionPreamble, test/debug-ledger.test.js |
| REQ-056 | Debug-Loop Command Integration — execute, wave, test-sync, verify, and debug commands delegate to headless debug-loop after 2 in-context fix attempts fail. Preserves existing try-twice behavior for quick fixes. | P1 | complete | M29: 5 command files (execute, debug, wave, test-sync, verify) |
| REQ-057 | Stack Rule Templates — best practice rule files in `templates/stacks/` for React, TypeScript, and Node.js API. Each file follows a standard structure (mandatory framing, numbered sections, GOOD/BAD examples, verification checklist) and stays under 200 lines. Universal templates (`_` prefix) always injected; stack-specific templates injected when detected. | P1 | complete | M30: templates/stacks/ (4 files: _security.md, react.md, typescript.md, node-api.md) |
| REQ-058 | Stack Detection Engine — auto-detect project tech stack from manifest files (package.json, requirements.txt, go.mod, Cargo.toml) at subagent spawn time. Match detected stacks against available templates. Inject matched rules into subagent prompts with mandatory enforcement framing. Resilient: skip silently if no templates exist or no matches found. | P1 | complete | M30: 5 command files (execute, quick, integrate, wave, debug) |
| REQ-059 | Stack Rule QA Enforcement — QA subagent prompts include stack rule compliance validation. Stack rule violations have the same severity as contract violations — they fail the task, not warn. Report format includes "Stack rules: compliant/N violations". | P1 | complete | M30: execute QA prompt + all 5 commands |
| REQ-060 | Quality North Star Persona — project CLAUDE.md can define a `## Quality North Star` section (1-3 sentences) with a project quality identity. gsd-t-init auto-detects preset (library/web-app/cli) or prompts user. gsd-t-setup offers persona config for existing projects. Persona is injected at subagent spawn time; skips silently if section absent (backward compatible). | P2 | complete | M32: templates/CLAUDE-project.md, gsd-t-init.md, gsd-t-setup.md |
| REQ-061 | Design Brief Generation — during partition, if UI/frontend signals detected (React/Vue/Svelte/Flutter, CSS/SCSS, component files, or Tailwind config), generate `.gsd-t/contracts/design-brief.md` with color palette, typography, spacing, component patterns, layout principles, interaction patterns, and tone/voice. Skip for non-UI projects. Do not overwrite existing briefs. Referenced in plan for UI task descriptions. | P2 | complete | M32: gsd-t-partition.md, gsd-t-plan.md, gsd-t-setup.md |
| REQ-062 | Exploratory Testing Blocks — after scripted tests pass, if Playwright MCP is registered, QA agents get 3 minutes and Red Team gets 5 minutes of interactive exploration using Playwright MCP. All findings tagged [EXPLORATORY] in qa-issues.md and red-team-report.md. Feeds into M31 QA calibration as separate category. Silent skip when Playwright MCP absent. Injected into execute, quick, integrate, debug. | P2 | complete | M32: gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md |

## Technical Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TECH-001 | Zero external npm dependencies | P1 | complete |
| TECH-002 | Node.js >= 16 compatibility | P1 | complete |
| TECH-003 | Cross-platform support (macOS, Linux, Windows) | P1 | complete |
| TECH-004 | Semantic versioning with git tags | P1 | complete |
| TECH-005 | Pre-Commit Gate enforced on every commit | P1 | complete (manual, not automated) |
| TECH-006 | Symlink protection on all file write operations | P1 | complete |
| TECH-007 | Input validation on project names, versions, paths, session IDs | P1 | complete |
| TECH-008 | prepublishOnly gate — `npm test` runs before `npm publish` | P1 | complete (M8) |
| TECH-009 | Mermaid CLI (@mermaid-js/mermaid-cli, MIT) is the primary diagram renderer — requires Node.js (already required by GSD-T); installed on demand if absent; renders .mmd → SVG/PNG via headless Chromium (Puppeteer peer dependency) | P1 | complete (M17) |
| TECH-010 | D2 diagram renderer (MPL-2.0, terrastruct/d2) is optional — detected by `which d2`; used in preference to Mermaid CLI for architecture and dataflow diagram types when present; free layouts only: dagre, ELK, neato | P2 | complete (M17) |
| TECH-011 | Kroki HTTP API (MIT, yuzutech/kroki) is the zero-install fallback renderer — single HTTP POST, no local dependencies; defaults to public kroki.io; configurable to self-hosted instance via KROKI_URL env var | P2 | complete (M17) |
| TECH-012 | Pandoc (GPL v2+) used for DOCX and HTML document export; detected by `which pandoc`; --export flags silently skip if absent with a warning in report output | P2 | complete (M17) |
| TECH-013 | All diagram and export tooling must be free and open source (MIT, MPL-2.0, GPL, or equivalent OSI-approved license) with no paid tiers, subscriptions, or per-request API fees required for core functionality | P1 | complete (M17) |

## Non-Functional Requirements

| ID | Requirement | Metric | Status |
|----|-------------|--------|--------|
| NFR-001 | CLI install completes quickly | < 5s | complete |
| NFR-002 | No runtime crashes on missing files | graceful fallback | complete |
| NFR-003 | Command files are pure markdown (no frontmatter) | 100% compliance | complete |
| NFR-004 | Heartbeat auto-cleanup prevents unbounded growth | 7-day TTL | complete |
| NFR-005 | Update check is non-blocking after first run | background process | complete |
| NFR-006 | Scan HTML report renders all diagrams in browser within 5 seconds of opening | < 5s render | complete (M17) |
| NFR-007 | Scan HTML report is self-contained after generation — all SVG diagrams are embedded inline; no external CDN dependencies required to view the report | 100% offline-capable | complete (M17) |
| NFR-008 | Diagram generation degrades gracefully — if the primary renderer is unavailable the next backend is tried automatically; the scan report is always produced even if all renderers fail (placeholder shown instead of diagram) | zero blocking failures | complete (M17) |
| NFR-009 | Schema extraction completes within the scan time budget — ORM/schema file parsing adds no more than 10% to total scan duration | ≤ 10% overhead | complete (M17) |

## Test Coverage

| Requirement | Test File | Test Name | Status |
|-------------|-----------|-----------|--------|
| REQ-001 | test/helpers.test.js, test/filesystem.test.js | CLI subcommand + helper tests | passing (64 tests) |
| REQ-006 | test/cli-quality.test.js | Wave-related function tests (buildEvent, etc.) | passing (22 tests) |
| REQ-007 | test/security.test.js | Heartbeat security (scrubSecrets, scrubUrl) | passing (30 tests) |
| REQ-002–005, 008–013 | manual | Workflow validation by use | passing |

**Total automated tests**: 125 across 4 test files (M4: 64, M5: 30, M6: 22, M9: 9). Runner: `node --test` (zero dependencies).

## Requirements Traceability (updated by plan phase — M14)

| REQ-ID  | Requirement Summary                                         | Domain        | Task(s)         | Status  |
|---------|-------------------------------------------------------------|---------------|-----------------|---------|
| REQ-018 | Execution Event Stream — JSONL events/ with 9-field schema  | event-stream  | Task 1, Task 2, Task 3, Task 4 | complete |
| REQ-019 | Outcome-Tagged Decision Log — [success]/[failure] prefixes  | learning-loop | Task 1, Task 2  | complete |
| REQ-020 | Pre-Task Experience Retrieval — Reflexion pattern           | learning-loop | Task 1, Task 2  | complete |
| REQ-021 | Milestone Distillation — patterns → CLAUDE.md proposals     | reflect       | Task 1          | complete |
| REQ-022 | gsd-t-reflect command — retrospective from events/          | reflect       | Task 2, Task 3  | complete |
| REQ-023 | Real-Time Agent Dashboard — SSE server + React Flow dashboard + gsd-t-visualize command | server, dashboard, command | server T1, dashboard T1, command T1, T2, T3 | complete (M15) |

| REQ-024 | Scan Schema Extraction — ORM/schema parser → structured entity data       | scan-schema      | pending         | planned |
| REQ-025 | Scan Diagram Generation — 6 diagram type .mmd files from codebase analysis | scan-diagrams    | pending         | planned |
| REQ-026 | Scan Diagram Rendering — .mmd → SVG via Mermaid CLI / D2 / Kroki           | scan-diagrams    | pending         | planned |
| REQ-027 | Scan HTML Report — self-contained report with inline SVGs + all sections    | scan-report      | pending         | planned |
| REQ-028 | Scan Document Export — DOCX (Pandoc) + PDF (md-to-pdf) export flags        | scan-export      | pending         | planned |
| REQ-029 | Diagram Rendering Toolchain — Mermaid CLI → D2 → Kroki fallback chain      | scan-diagrams    | pending         | planned |
| REQ-030 | MCP Diagram Server Support — diagram-bridge-mcp / C4Diagrammer / mcp-mermaid | scan-diagrams  | pending         | planned |

## Requirements Traceability (updated by plan phase — M25)

| REQ-ID  | Requirement Summary                                         | Domain              | Task(s)                        | Status  |
|---------|-------------------------------------------------------------|---------------------|--------------------------------|---------|
| REQ-031 | Per-Task Telemetry Collection — collector + emission        | metrics-collection  | Task 1, 2, 3, 4, 5            | planned |
| REQ-032 | Milestone Rollup & Process ELO — rollup + heuristics       | metrics-rollup      | Task 1, 2, 3, 4, 5            | planned |
| REQ-033 | Metrics Dashboard Panel — /metrics endpoint + Chart.js     | metrics-dashboard   | Task 1, 2                      | planned |
| REQ-034 | gsd-t-metrics Command — 50th command                       | metrics-commands    | Task 1, 3, 4                   | planned |
| REQ-035 | Process ELO in Status — ELO display in status output       | metrics-commands    | Task 2                         | planned |

**Orphaned requirements**: REQ-001 through REQ-017 (all M1-M13 deliverables, complete — not mapped to M14+ tasks by design).
**Unanchored tasks**: metrics-commands Task 3 (CLI count) and Task 4 (4 reference files) are infrastructure supporting REQ-034 — implicitly mapped.

## Requirements Traceability (updated by plan phase — M26)

| REQ-ID  | Requirement Summary                                         | Domain              | Task(s)                        | Status  |
|---------|-------------------------------------------------------------|---------------------|--------------------------------|---------|
| REQ-036 | Declarative Rule Engine — rule evaluator + activation tracking | rule-engine       | Task 1, 2, 3                   | pending |
| REQ-037 | Patch Template System — templates.jsonl + seed data          | rule-engine         | Task 2, 4                      | pending |
| REQ-038 | Patch Lifecycle Manager — 5-stage lifecycle + promotion gate | patch-lifecycle     | Task 1, 2, 3                   | pending |
| REQ-039 | Active Rule Injection in Execute                             | command-integration | Task 1                         | pending |
| REQ-040 | Rule-Based Pre-Mortem in Plan                                | command-integration | Task 2                         | pending |
| REQ-041 | Distillation Extension — rules + patches + graduation        | command-integration | Task 3                         | pending |
| REQ-042 | Quality Budget Governance — rework ceiling + tightening      | command-integration | Task 3                         | pending |

**Orphaned requirements**: None — all M26 REQs mapped to tasks.
**Unanchored tasks**: rule-engine Task 5 (tests) and patch-lifecycle Task 4 (tests) are QA infrastructure supporting all REQs. command-integration Task 4 (reference docs) supports Pre-Commit Gate compliance.

## Requirements Traceability (updated by plan phase — M27)

| REQ-ID  | Requirement Summary                                         | Domain              | Task(s)                        | Status  |
|---------|-------------------------------------------------------------|---------------------|--------------------------------|---------|
| REQ-043 | Global Sync Manager — read local, write global, compare     | global-metrics      | Task 1, 2, 3, 4               | pending |
| REQ-044 | Cross-Project Rule Propagation — update-all syncs rules     | cross-project-sync  | Task 1, 3                      | pending |
| REQ-045 | Universal Rule Promotion — 3+ universal, 5+ npm candidate   | global-metrics, cross-project-sync | gm Task 3, cps Task 2 | pending |
| REQ-046 | Cross-Project Signal Comparison — metrics --cross-project    | command-extensions  | Task 1                         | pending |
| REQ-047 | Global ELO & Rankings — status global ELO display            | command-extensions  | Task 2                         | pending |
| REQ-048 | Global Rule Promotion on Milestone Completion                | command-extensions  | Task 3                         | pending |

**Orphaned requirements**: None — all M27 REQs mapped to tasks.
**Unanchored tasks**: global-metrics Task 4 (tests) and cross-project-sync Task 3 (tests) are QA infrastructure supporting REQ-043 through REQ-045. command-extensions Task 4 (reference docs) supports Pre-Commit Gate compliance.

## Requirements Traceability (updated by plan phase — M29)

| REQ-ID  | Requirement Summary                                          | Domain               | Task(s)        | Status  |
|---------|--------------------------------------------------------------|----------------------|----------------|---------|
| REQ-053 | Debug Ledger Protocol — JSONL ledger with read/write/compact | debug-state-protocol | Task 1, 2, 3   | complete |
| REQ-054 | Headless Debug-Loop — external loop controller               | headless-loop        | Task 1, 2, 3   | complete |
| REQ-055 | Anti-Repetition Preamble — failed hypothesis injection       | debug-state-protocol, headless-loop | dsp Task 2, hl Task 2 | complete |
| REQ-056 | Debug-Loop Command Integration — delegate after 2 failures   | command-integration  | Task 1, 2      | complete |

**Orphaned requirements**: None — all M29 REQs mapped to tasks.
**Unanchored tasks**: debug-state-protocol Task 3 (tests) and headless-loop Task 3 (tests) are QA infrastructure supporting REQ-053 through REQ-055. command-integration Task 3 (reference docs) supports Pre-Commit Gate compliance.

## Requirements Traceability (updated by plan phase — M30)

| REQ-ID  | Requirement Summary                                          | Domain               | Task(s)        | Status  |
|---------|--------------------------------------------------------------|----------------------|----------------|---------|
| REQ-057 | Stack Rule Templates — react.md, typescript.md, node-api.md  | stack-templates      | Task 1, 2, 3   | complete |
| REQ-058 | Stack Detection Engine — auto-detect + prompt injection      | command-integration  | Task 1, 2      | complete |
| REQ-059 | Stack Rule QA Enforcement — QA validates compliance          | command-integration  | Task 1, 2      | complete |

**Orphaned requirements**: None — all M30 REQs mapped to tasks.
**Unanchored tasks**: command-integration Task 3 (tests) is QA infrastructure supporting REQ-057 through REQ-059. command-integration Task 4 (reference docs) supports Pre-Commit Gate compliance.

## Requirements Traceability (updated by plan phase — M32)

| REQ-ID  | Requirement Summary                                          | Domain                  | Task(s) | Status  |
|---------|--------------------------------------------------------------|-------------------------|---------|---------|
| REQ-060 | Quality North Star Persona — CLAUDE-project template + init/setup detection and config | quality-persona | Task 1  | complete |
| REQ-061 | Design Brief Generation — partition detection + plan note + setup option               | design-brief    | Task 1  | complete |
| REQ-062 | Exploratory Testing Blocks — post-scripted Playwright MCP exploration in 4 commands    | evaluator-interactivity | Task 1 | complete |

**Orphaned requirements**: None — all M32 REQs mapped to tasks.
**Unanchored tasks**: None — all 3 domain tasks map directly to functional requirements.

## Requirements Traceability (updated by plan phase — M34)

| REQ-ID  | Requirement Summary                                                                     | Domain                      | Task(s)  | Status   |
|---------|------------------------------------------------------------------------------------------|-----------------------------|----------|----------|
| REQ-063 | Context Meter PostToolUse hook — count_tokens API call, state file, fail-open            | context-meter-hook          | Tasks 1–5 | complete |
| REQ-064 | Context Meter config schema — apiKeyEnvVar, modelWindowSize, thresholdPct, checkFrequency | context-meter-config        | Tasks 1–4 | complete |
| REQ-065 | Installer integration — install/init hook, doctor gate, status line, update-all migration | installer-integration       | Tasks 1–6 | complete |
| REQ-066 | bin/token-budget.js v2.0.0 — real-source `getSessionStatus()` reading the meter state file | token-budget-replacement    | Tasks 1–10 | complete |
| REQ-067 | Command file migration — execute/wave/quick/integrate/debug use CTX_PCT, no task-counter  | token-budget-replacement    | Tasks 6–10 | complete |
| REQ-068 | Docs + tests — README/GSD-T-README/templates/docs/CHANGELOG updated, integration tests added | m34-docs-and-tests          | Tasks 1–9 | in_progress |

**M34 Functional Requirements:**
- **REQ-063**: The PostToolUse hook must measure the real transcript token count after every tool call (subject to `checkFrequency`), write the result atomically to `.gsd-t/.context-meter-state.json`, and never crash Claude Code on error.
- **REQ-064**: The config loader must validate `apiKeyEnvVar` is a string, `modelWindowSize` > 0, `thresholdPct` in (0, 100), `checkFrequency` ≥ 1. Missing config = use defaults.
- **REQ-065**: `gsd-t doctor` must hard-gate on: API key set, hook registered, script present, config valid, live `count_tokens` dry-run succeeds. Exit code 1 if any RED.
- **REQ-066**: `bin/token-budget.js` `getSessionStatus()` must read `.gsd-t/.context-meter-state.json` when fresh (within 5 minutes of timestamp) and fall back to a historical heuristic otherwise. Public API shape unchanged from v1.x — callers see no breakage.
- **REQ-067**: No command file may reference `task-counter.cjs` or `CLAUDE_CONTEXT_TOKENS_*` env vars. All session-stop gates must call `token-budget.getSessionStatus()`.
- **REQ-068**: All downstream docs (README.md, docs/GSD-T-README.md, templates/CLAUDE-*, docs/*.md, CHANGELOG.md, package.json) must describe M34 by the time the milestone is marked complete.

**M34 Non-Functional Requirements:**
- Hook latency ≤ 200ms P99 (enforced by `req.setTimeout` + `req.destroy()` in the HTTPS client)
- Zero external npm dependencies (same as the rest of GSD-T)
- Zero message content in state files, log files, or diagnostics — only token counts, band names, error category codes
- Zero API-key material written to disk — env var read only, never persisted

**Orphaned requirements**: None — all M34 REQs mapped to tasks.
**Unanchored tasks**: None — all 34 M34 tasks map directly to functional or non-functional requirements.

---

## Requirements Traceability (updated by plan phase — M35)

| REQ-ID  | Requirement Summary                                                                     | Domain                      | Task(s)   | Status   |
|---------|-----------------------------------------------------------------------------------------|-----------------------------|-----------|----------|
| REQ-069 | Silent degradation bands removed — `getDegradationActions()` returns only `{band: 'normal'\|'warn'\|'stop'}` | degradation-rip-out | T1 | complete (Wave 1) |
| REQ-070 | Three-band model only — `WARN_THRESHOLD_PCT=70`, `STOP_THRESHOLD_PCT=85`, no model overrides or phase skips | degradation-rip-out | T1, T2 | complete (Waves 1–2) |
| REQ-071 | Surgical per-phase model selection via `bin/model-selector.js` — ≥8 phase mappings, declarative rules table | model-selector-advisor | T2 | complete (Wave 2) |
| REQ-072 | `/advisor` escalation with graceful fallback — convention-based if API not programmable | model-selector-advisor | T1, T3 | complete (Wave 2) |
| REQ-073 | Pre-flight runway estimator refuses runs projected to cross 85% stop threshold | runway-estimator | T1–T5 | SUPERSEDED by REQ-088 (M38) — runway-estimator deleted; headless-by-default replaces the refusal gate |
| REQ-074 | Per-spawn token telemetry to `.gsd-t/token-metrics.jsonl` with frozen 18-field schema | token-telemetry | T1–T3 | SUPERSEDED by REQ-092 (M38) — token-telemetry deleted; single-band meter obviates the feed |
| REQ-075 | `gsd-t metrics` CLI: `--tokens [--by ...]`, `--halts`, `--tokens --context-window` | token-telemetry | T4–T6 | SUPERSEDED by REQ-092 (M38) — `--tokens`/`--halts` emitters removed with telemetry deletion |
| REQ-076 | Optimization backlog — detect only, never auto-apply, user promotes or rejects | optimization-backlog | T1–T4 | SUPERSEDED by REQ-093 (M38) — self-improvement loop deleted; signal never produced action |
| REQ-077 | Headless auto-spawn on runway refusal — user never sees a `/clear` prompt | headless-auto-spawn | T1–T5 | SUPERSEDED by REQ-088 (M38) — headless-by-default promotes auto-spawn from emergency pivot to default primitive |
| REQ-078 | Structural elimination of native compact messages — `halt_type: native-compact` count is 0 during M35 execution | runway-estimator + headless-auto-spawn | T1–T5 (RE), T1–T5 (HAS) | SUPERSEDED by REQ-088 (M38) — achieved via structural headless-default spawn, not runway projection |
| REQ-079 | `gsd-t unattended` CLI subcommand runs an active milestone to completion unattended on macOS and Linux (24h+ multi-worker relay, detached OS process) | m36-supervisor-core | T1–T5 | complete (M36 Wave 1–2) |
| REQ-080 | `/gsd-t-unattended` slash command launches the supervisor from within a Claude session without blocking the terminal | m36-supervisor-core + m36-watch-loop | T1, T3 | complete (M36 Wave 1–3) |
| REQ-081 | In-session watch loop ticks every 270s via `ScheduleWakeup` (inside 5-min prompt-cache TTL) to report live supervisor state | m36-watch-loop | T1–T2 | complete (M36 Wave 3) |
| REQ-082 | `/clear` + `/gsd-t-resume` during a live unattended run transparently re-attaches to the watch loop (Step 0 auto-reattach, no user-visible disruption) | m36-watch-loop | T4 | complete (M36 Wave 3) |
| REQ-083 | Supervisor survives `/compact` and context resets — each worker is a fresh `claude -p` session; context exhaustion is structurally irrelevant | m36-supervisor-core | T1–T5 | complete (M36 Wave 1–2) |
| REQ-084 | Safety rails prevent infinite loops: gutter detection, blocker sentinels (`BLOCKED_NEEDS_HUMAN`, `DISPATCH_FAILED`), max-hours and max-iterations timeouts | m36-safety-rails | T1–T5 | complete (M36 Wave 2) |
| REQ-085 | Cross-platform support — macOS (caffeinate sleep-prevention) + Linux (systemd-inhibit or no-op) + Windows (claude.cmd via PATH; sleep-prevention not supported — see docs/unattended-windows-caveats.md) | m36-cross-platform | T1–T5 | complete (M36 Wave 2) |
| REQ-086 | Handoff-lock primitive (`bin/handoff-lock.js`) eliminates parent/child race in `headless-auto-spawn.js` runway handoffs (M35 gap fix) | m36-m35-gap-fixes | T1–T3 | complete (M36 Wave 2) |
| REQ-087 | 5 command files no longer emit "Run /clear" STOP — runway-exceeded handoff auto-invokes `autoSpawnHeadless()` seamlessly (M35 gap fix) | m36-m35-gap-fixes | T3 | complete (M36 Wave 3) |

**M35 Functional Requirements:**
- **REQ-069**: `bin/token-budget.js` `getDegradationActions()` must return `{band: 'normal'|'warn'|'stop', pct: number, message: string}` only. No `modelOverride`, no `skipPhases`, no `checkpoint` side-channel.
- **REQ-070**: `WARN_THRESHOLD_PCT = 70`, `STOP_THRESHOLD_PCT = 85`. `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" bin/ commands/ docs/ templates/` returns zero hits in live code.
- **REQ-071**: `bin/model-selector.js` exists with a declarative rules table, at least 8 phase mappings across all three tiers (haiku/sonnet/opus), and unit tests for each mapping.
- **REQ-072**: `bin/advisor-integration.js` exists. If `/advisor` is programmable: calls it. If not: convention-based fallback block injection. Graceful degradation: missed escalations logged, caller never blocked.
- **REQ-073**: _SUPERSEDED by REQ-088 (M38, v3.12.10)._ Original: runway estimator refusal at Step 0 of long-running commands. M38 deletes `bin/runway-estimator.cjs`; headless-by-default primitive handles context pressure structurally (no projection needed).
- **REQ-074**: _SUPERSEDED by REQ-092 (M38, v3.12.10)._ Original: 18-field per-spawn token telemetry to `.gsd-t/token-metrics.jsonl`. M38 deletes `bin/token-telemetry.cjs`; the single-band meter keeps only local-estimator readings — no bracketed per-spawn records.
- **REQ-075**: _SUPERSEDED by REQ-092 (M38, v3.12.10)._ Original: `gsd-t metrics --tokens|--halts|--context-window` CLI emitters. M38 retires those subcommands with telemetry deletion.
- **REQ-076**: _SUPERSEDED by REQ-093 (M38, v3.12.10)._ Original: `bin/token-optimizer.js` detect-only recommendations with user promote/reject. M38 deletes the self-improvement loop (4 commands + `qa-calibrator.js` + `token-optimizer.js`) — signal never produced action.
- **REQ-077**: _SUPERSEDED by REQ-088 (M38, v3.12.10)._ Original: `autoSpawnHeadless()` invoked only on runway refusal. M38 promotes it to the default spawn primitive for workflow commands; see `headless-default-contract.md` v1.0.0.
- **REQ-078**: _SUPERSEDED by REQ-088 (M38, v3.12.10)._ Original: runway-projection + STOP_THRESHOLD combo makes native-compact structurally unreachable. M38 achieves the same guarantee via headless-default spawning — context resets by design, not by projection.

**M35 Non-Functional Requirements:**
- Zero external npm dependencies (GSD-T mandate — token-telemetry.js, runway-estimator.js, headless-auto-spawn.js must use Node.js built-ins only)
- `autoSpawnHeadless()` must return control to the interactive session in < 500ms (detached spawn is immediate)
- `estimateRunway()` must complete in < 100ms (reads two local files, no network)
- Full test suite: target ~1030 tests total after M35; quality over count

**Orphaned requirements**: None — all M35 REQs mapped to tasks.
**Unanchored tasks**: None — all 38 M35 tasks trace to REQ-069–REQ-078 or REQ-063–068 (existing requirements that M35 code continues to satisfy).

**M36 Functional Requirements:**
- **REQ-079**: `bin/gsd-t-unattended.js` implements the supervisor relay loop: spawn worker → await exit → post-worker safety check → next iter. State written atomically to `.gsd-t/.unattended/state.json`. Contract: `unattended-supervisor-contract.md` v1.0.0.
- **REQ-080**: `commands/gsd-t-unattended.md` pre-flights branch + dirty tree, spawns supervisor detached, polls for PID readiness, displays initial watch block, and calls `ScheduleWakeup(270, '/gsd-t-unattended-watch')`.
- **REQ-081**: `commands/gsd-t-unattended-watch.md` implements the watch tick decision tree (§8 of contract): reads PID → liveness probe → reads state.json → reschedule or terminal report.
- **REQ-082**: `commands/gsd-t-resume.md` Step 0 checks `supervisor.pid` before any other resume logic. If live + non-terminal: skip normal resume, print watch block, call `ScheduleWakeup(270, '/gsd-t-unattended-watch')`.
- **REQ-083**: Supervisor relay architecture ensures each worker gets a fresh context window. No compaction state carries over between workers — only `.gsd-t/` milestone state files.
- **REQ-084**: `bin/gsd-t-unattended-safety.js` exports: `checkGitBranch`, `checkWorktreeCleanliness`, `validateState`, `checkIterationCap`, `checkWallClockCap`, `detectBlockerSentinel`, `detectGutter`. Called at all 4 supervisor hook points.
- **REQ-085**: `bin/gsd-t-unattended-platform.js` exports: `spawnSupervisor`, `preventSleep`, `releaseSleep`, `notify`, `resolveClaudePath`. Windows: `preventSleep` is a documented no-op. Windows caveats documented in `docs/unattended-windows-caveats.md`.
- **REQ-086**: `bin/handoff-lock.js` exports: `acquireLock(dir)`, `releaseLock(dir)`, `isLocked(dir)`. Used in `bin/headless-auto-spawn.js` `autoSpawnHeadless()` to guard the parent-exits-before-child-starts window.
- **REQ-087**: `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md` — runway-exceeded path calls `autoSpawnHeadless()` and exits cleanly. No "Run /clear" instruction emitted.

**M36 Non-Functional Requirements:**
- Zero external npm dependencies (all M36 bin/ modules use Node.js built-ins only)
- Supervisor launch → PID-ready in < 5 seconds (poll timeout in launch command)
- Worker spawn overhead: < 500ms before `claude -p` subprocess starts
- Test count: 1146 → 1226 (+80 net new tests across 6 M36 domain test files)

**Orphaned requirements**: None — all M36 REQs mapped to tasks.
**Unanchored tasks**: None — all M36 tasks trace to REQ-079–REQ-087.

**M38 Functional Requirements:**
- **REQ-088**: Workflow commands (execute, wave, integrate, debug repair loops) spawn detached by default via the unattended supervisor. Interactive session returns after printing a launch banner and event-stream log location. Contract: `headless-default-contract.md` v1.0.0. Traces to: m38-headless-spawn-default T1–T6.
- **REQ-089**: `--watch` flag keeps a live status block in the interactive session (270s `ScheduleWakeup` ticks, cache-window-safe). Without `--watch`, the session exits; the user is notified via macOS when work completes. Flag propagates through wave → phase commands. Traces to: m38-headless-spawn-default T4.
- **REQ-090**: Supervisor emits JSONL events to `.gsd-t/events/YYYY-MM-DD.jsonl` at every phase boundary (`task_start`, `task_complete`, `error`, `retry`). Cursor state at `.gsd-t/.unattended/event-cursor`. Shared library: `bin/event-stream.cjs`. Contract: `unattended-event-stream-contract.md` v1.0.0, supervisor contract bumped to v1.1.0. Traces to: m38-unattended-event-stream T1–T5.
- **REQ-091**: Smart Router classifies non-continuation messages as conversational or workflow. Conversational triggers (thinking/brainstorming/exploring) get inline responses with no command spawn. Workflow triggers route to the existing semantic evaluation. Default on ambiguity: conversational. Traces to: m38-router-conversational T1–T5.
- **REQ-092**: Context Meter collapses to a single-band model (`context-meter-contract.md` v1.3.0). One threshold, one action — hand off to a detached spawn. Three-band routing (`normal`/`warn`/`stop`) and `MANDATORY STOP` rule removed. Traces to: m38-meter-reduction T1–T6.
- **REQ-093**: Self-improvement loop deleted — 4 commands (`gsd-t-optimization-apply`, `gsd-t-optimization-reject`, `gsd-t-reflect`, `gsd-t-audit`) and 2 bin files (`qa-calibrator.js`, `token-optimizer.js`) removed. Their signal never produced action; the work that would close the loop is folded into the spawn decision. Traces to: m38-cleanup-and-docs T1–T10.

**M38 Non-Functional Requirements:**
- Net LOC decrease ≥ 5,000 (success criterion #11 of the milestone)
- `npm test` green through every domain commit
- Zero external npm dependencies (inherited — applies to `bin/event-stream.cjs`, `bin/unattended-watch-format.cjs`)

**Orphaned requirements**: None — all M38 REQs mapped to tasks.
**Unanchored tasks**: None — all M38 tasks trace to REQ-088–REQ-093.

---

## M17: Scan Visual Output — Feature Specification

**Goal**: Transform `gsd-t-scan` from a text-only analysis tool into a rich visual report generator. Every scan produces a beautiful, self-contained HTML report with live diagrams, a tech debt register, and domain health scores — plus optional export to Google Docs via DOCX or PDF.

### Scope

| Area | Description |
|------|-------------|
| Schema extraction | Detect and parse ORM/schema files to extract entity relationships |
| Diagram generation | Generate Mermaid (.mmd) diagram definitions for 6 diagram types |
| Diagram rendering | Render .mmd → SVG using Mermaid CLI, D2, or Kroki (auto-fallback) |
| HTML report | Self-contained dark-theme report with inline SVGs and expand-to-fullscreen |
| Document export | DOCX (Pandoc → Google Docs) and PDF (md-to-pdf) export via --export flag |
| MCP support | Optional MCP server integration when registered in Claude Code settings |

### Diagram Types (REQ-025)

| # | Diagram | Source Analysis | Mermaid Syntax |
|---|---------|-----------------|----------------|
| 1 | System Architecture | Config files, imports, env vars, API clients | `C4Context` or `graph TB` |
| 2 | Application Architecture | Module/class structure, framework layers, routing | `graph TB` with subgraphs |
| 3 | Workflow | Status enums, state transition methods, FSM patterns | `stateDiagram-v2` |
| 4 | Data Flow | Request handlers, validation pipes, DB calls, queue producers | `flowchart TD` |
| 5 | Sequence | Critical API endpoint: auth flow or primary resource creation | `sequenceDiagram` |
| 6 | Database Schema | ORM entities / Prisma schema / SQL migrations (REQ-024) | `erDiagram` |

### ORM Detection Matrix (REQ-024)

| ORM / Tool | Detection Signal | Schema Source |
|------------|-----------------|---------------|
| TypeORM | `@Entity()`, `typeorm` import | `*.entity.ts` files |
| Prisma | `prisma/schema.prisma` exists | `schema.prisma` |
| Drizzle | `drizzle-orm` import | `schema.ts` / `*.schema.ts` |
| Mongoose | `mongoose.Schema`, `new Schema` | `*.model.ts` / `*.schema.ts` |
| Sequelize | `DataTypes`, `Model.init` | `*.model.js/ts` |
| SQLAlchemy | `declarative_base`, `Column` | `models.py` / `*.model.py` |
| Raw SQL | `CREATE TABLE` in `.sql` files | `migrations/*.sql` |

### Rendering Toolchain (REQ-029)

```
RENDER REQUEST
  ├── Is `mmdc` (Mermaid CLI) available?
  │     YES → mmdc -i diagram.mmd -o diagram.svg -t dark   (primary)
  │     NO  ↓
  ├── Is `d2` available AND diagram type is arch/dataflow?
  │     YES → d2 diagram.d2 diagram.svg --layout=dagre      (enhanced)
  │     NO  ↓
  ├── Is network available?
  │     YES → POST diagram src to kroki.io → SVG response   (fallback)
  │     NO  ↓
  └── Embed "diagram unavailable" placeholder in report     (graceful degrade)
```

### HTML Report Structure (REQ-027)

```
scan-report.html
  ├── Sidebar navigation (scrollspy, domain/diagram/analysis sections)
  ├── Compact page header (project name, version, date, stack)
  ├── Summary (metric cards: files, LoC, debt counts, coverage, deps, endpoints)
  ├── Domains (health cards with file inventory and health % bar)
  ├── Diagram sections × 6 (title bar + type badge + SVG + expand button + note)
  ├── Tech Debt Register (table: severity badge, domain, issue, location, effort)
  └── Key Findings (actionable cards: security, architecture, reliability, quality)
```

### Document Export (REQ-028)

| Flag | Tool | Output | Google Docs Path |
|------|------|--------|-----------------|
| `--export=docx` | Pandoc (GPL) | `scan-report.docx` | Upload to Drive → Open with Google Docs |
| `--export=pdf` | md-to-pdf (MIT) | `scan-report.pdf` | Upload to Drive → open directly |
| _(none)_ | — | `scan-report.html` | Copy/paste markdown, or File → Import |

### Free & Open Source Toolchain Confirmation

| Tool | License | Free? | Paid Components |
|------|---------|-------|-----------------|
| Mermaid CLI (`@mermaid-js/mermaid-cli`) | MIT  | Yes | None |
| D2 (terrastruct/d2) | MPL-2.0  | Yes | TALA layout only (excluded) |
| Kroki (yuzutech/kroki) | MIT  | Yes | None (self-host or free kroki.io) |
| diagram-bridge-mcp (tohachan) | MIT  | Yes | None |
| C4Diagrammer (jonverrier) | MIT  | Yes | None |
| mcp-mermaid (hustcc) | MIT  | Yes | None |
| Pandoc | GPL v2+  | Yes | None |
| md-to-pdf (simonhaenisch) | MIT  | Yes | None |

### Mock Reference

A reference implementation of the HTML report output is at `scan-report-mock.html` (project root). It demonstrates all 6 diagram types, the tech debt register, domain health cards, and the expand-to-fullscreen interaction. Use this as the visual specification for the HTML report (REQ-027).

---

## Gaps Identified

### Open (Scan #6 — 2026-02-18, Post-M10-M13)
- 14 new items: TD-066 through TD-079 (1 high: untestable new scripts; 5 medium: contract drift + doc staleness + stateSet injection; 7 low: cleanup)
- See `.gsd-t/techdebt.md` for full list

### Resolved (Milestone 9 + Milestones 10-13, 2026-02-18)
- ~~Scan #5 items (TD-056-TD-065)~~ — RESOLVED (M9, Cleanup Sprint)
- ~~Token efficiency gaps~~ — RESOLVED (M10)
- ~~Execution quality gaps (no deviation rules, no per-task commits)~~ — RESOLVED (M11)
- ~~Planning intelligence gaps (no CONTEXT.md, no plan validation)~~ — RESOLVED (M12)
- ~~Tooling gaps (no state CLI, no statusline, no health command, no pause)~~ — RESOLVED (M13)

### Resolved (Milestones 3-8, 2026-02-18/19)
- ~~All scan #4 items (TD-044-TD-055)~~ — RESOLVED (M8)
- ~~No automated test suite (TD-003)~~ — RESOLVED (116 tests, M4)
- ~~Command count 42→43 not updated (TD-022)~~ — RESOLVED (M3)
- ~~QA agent contract missing test-sync (TD-042)~~ — RESOLVED (M3)
- ~~Wave bypassPermissions not documented (TD-035)~~ — RESOLVED (M5)
- ~~All 15 scan #3 functions >30 lines (TD-021)~~ — RESOLVED (M6, all 81 functions ≤30 lines)
- ~~34 fractional step numbers (TD-031)~~ — RESOLVED (M7, all renumbered)
- ~~Backlog file format drift (TD-014)~~ — RESOLVED
- ~~Progress.md format drift (TD-015)~~ — RESOLVED
- ~~7 backlog commands missing from GSD-T-README (TD-016)~~ — RESOLVED

## M40 Requirements Traceability (plan phase — 2026-04-19)

Milestone 40 (External Task Orchestrator + Streaming Watcher UI) decomposes into 5 measurable requirements drawn directly from `progress.md` Current Milestone § Success criteria. Task numbers reference `.gsd-t/domains/*/tasks.md`.

| REQ-ID | Requirement Summary | Domain | Task(s) | Status |
|--------|---------------------|--------|---------|--------|
| REQ-M40-01 | Speed parity or better vs in-session (D0 kill-switch gate) | d0-speed-benchmark | Tasks 1, 2, 3 | pending |
| REQ-M40-02 | No compaction — one task per spawn, fresh context each time | d1-orchestrator-core | Tasks 3, 4, 6 | pending |
| REQ-M40-03 | Live streaming UI on localhost:7842 at zero Claude token cost | d4-stream-feed-server, d5-stream-feed-ui | D4 Tasks 1–5, D5 Tasks 1–5 | pending |
| REQ-M40-04 | Per-wave Promise.all parallelism with Team Mode §15 ceiling (15 max) | d1-orchestrator-core | Tasks 1, 4, 6 | pending |
| REQ-M40-05 | Recovery from durable JSONL + progress.md on orchestrator crash | d6-recovery-and-resume | Tasks 1, 2, 3, 4 | pending |

Supporting contracts (no direct REQ mapping — shared infrastructure):
- `task-brief-contract.md` (d2-task-brief-builder Tasks 1–3) — enables REQ-M40-02 via self-contained briefs
- `completion-signal-contract.md` (d3-completion-protocol Tasks 1–3) — enables REQ-M40-02 and REQ-M40-05 via deterministic done-signal
- `wave-join-contract.md` (d1-orchestrator-core) — enables REQ-M40-04
- `stream-json-sink-contract.md` (d1↔d4 joint) — enables REQ-M40-03

All 5 REQs map to at least one task; no orphaned requirements. All 25 tasks across 7 domains trace to at least one REQ (task-brief/completion tasks support via contract infra).
