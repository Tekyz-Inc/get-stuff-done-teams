# Changelog

All notable changes to GSD-T are documented here. Updated with each release.

## [2.68.11] - 2026-04-05

### Changed (widget-contract template)
- **Alignment column in Card Chrome Slots** — every slot now requires explicit alignment (left/center/right) extracted from Figma. Incorrect legend alignment was the #2 cause of "looks off" results.
- **Internal Element Layout section (MANDATORY)** — new section replacing the flat layout table. Documents: body_layout (flex-row/column/grid), body_justify, body_align, body_gap, chart_width/height, legend_width, footer_legend_justify, header_to_body_gap, body_to_footer_gap. These are the exact values that control spacing and sizing of elements within a widget card.
- **Verification checklist expanded** — now checks: chrome alignment, internal layout, inter-element spacing, element sizing, legend alignment, card container values (6 new items).

### Why
BDS Analytics comparison revealed consistent intra-widget layout errors: legends left-aligned instead of centered, inconsistent spacing between chart and legend, wrong element sizing within cards. The widget contract template had a Layout section but it specified only container-level properties (padding, border, gap) — not how elements were sized, spaced, and aligned WITHIN the card body. These new fields close that gap.

## [2.68.10] - 2026-04-05

### Changed (gsd-t-design-decompose)
- **Node-level Figma decomposition (MANDATORY)** — Step 1 now requires `get_metadata` to map page tree, then `get_design_context` on EACH widget node individually. No more classifying from page screenshots alone. Extracted text content (titles, subtitles, column headers, legend items) becomes mandatory data inventory column.
- **Classification reasoning (MANDATORY)** — Step 2 now requires written decision-tree walkthrough for every chart element: "I see [description]. Decision tree: [walkthrough]. Classification: [entry]. Confidence: [HIGH/MEDIUM/LOW]". Low/medium confidence entries flagged for human review.
- **Human contract review checkpoint** — Step 5 now presents classification reasoning table + data inventory alongside decomposition summary. User reviews chart type assignments and text content before contracts are written. 5-minute gate that catches misclassification before it propagates.
- **Contract-vs-Figma verification gate (MANDATORY)** — New Step 6.5 re-reads each Figma node after contracts are written and produces a mismatch report. Catches: wrong chart types, hallucinated column headers, missing elements, invented data models. Mismatches must be fixed before proceeding to build.

### Changed (design-to-code stack rule)
- **Visual verification against FIGMA, not just contracts** — Section 15 now requires the Design Verification Agent to compare the built screen against the original Figma screenshot (Target 2), not just against design contracts (Target 1). This closes the gap where wrong contracts produce wrong code that still scores 50/50 against itself.

### Why
Post-validation comparison of the built BDS Analytics screen against the original Figma design revealed: wrong chart types (donuts instead of stacked bars in Member Segmentation), hallucinated column headers (Video Playlist), invented data models (Tool Engagement). All scored 50/50 against their contracts — because the contracts were wrong. The contracts→code pipeline is airtight; the Figma→contracts pipeline was unverified. These changes close that gap at four layers: node-level extraction, classification reasoning, human review, and contract-vs-Figma gate.

## [2.67.10] - 2026-04-05

### Added (design-chart-taxonomy)
- **Lists section** — new category between Tables and Controls: `list-simple-vertical`, `list-icon-vertical`, `list-avatar-vertical`, `list-thumbnail-vertical`. Includes decision rule: columns across rows = table; self-contained rows = list.
- **Table-vs-list decision rule** in Tables section — prevents catastrophic misclassification (jamming list-style repeating items into `table-*` entries).
- **Naming grammar** — documents the `{category}-{variant}-{orientation}` pattern with common modifiers. Prevents ad-hoc name invention.
- **Formalized extension workflow** — proposal-first process with: section placement, sibling-diff rationale, catastrophic-misclassification argument, companion-entries-flagged field. Replaces the terse 4-step extension guide.

### Milestone
- **Extensibility VALIDATED** — task-012 forced the taxonomy-extension workflow (picked `list-thumbnail-vertical`, not previously in taxonomy). Proposal-first process worked cleanly; `$ref` composition chain unaffected by new entries. 12 consecutive 50/50 scores across element/widget/page/scale/extensibility tiers.

## [2.66.10] - 2026-04-05

### Changed (page-contract template)
- **Composes Elements (direct)** split into two sub-lists: "Existing element contracts used directly" vs "Inline stubs (promotion candidates)". Closes gap P8 from page-tier run 3.
- **Route guards stub convention** — if a guard is declared but not yet wired, prefix with `(stub)` and link the milestone that will wire it. Closes gap P9.
- **Skip link `tabindex="-1"` note** — `<main>` must be programmatically focusable for skip-link navigation. Closes gap P10.

### Milestone
- **Hierarchical contract system CONVERGED** — 3×3 matrix complete: element/widget/page tiers × 3 convergence runs each × 50/50 score. 11 of 14 gaps resolved across v2.59.10–v2.66.10; remaining 3 are widget-template refinements, non-blocking.

## [2.65.10] - 2026-04-05

### Changed (page-contract template)
- **Boundary grep regex tightened** — line-anchored (`^\s*`) + requires opening `{` — avoids false positives on JS identifiers like `donutProps` or property access `obj.donut`. Only matches actual CSS rules. Closes gap P5 from page-tier run 2.

### Added (page-contract template)
- **Multi-state Page Fixture convention** — for pages whose state swaps widget data, declare one full fixture per state under `__states__` keys, referencing named widget sub-fixtures (`#/fixture-sessions`). Prefer full duplication over override deltas. Closes gap P6.
- **Inline-stub promotion guidance** — if a page-scope control is used in ≥2 pages, promote to its own widget contract; until then list in Composes Elements (direct) with `(promotion candidate)` tag. Closes gap P7.

## [2.64.10] - 2026-04-05

### Added (page-contract template)
- **Page Fixture (OPTIONAL)** section — formalizes the composition chain (element → widget → page) by referencing each widget's fixture via `$ref:{widget-name}#/fixture`. Closes gap P2 from page-tier convergence run 1.
- **Boundary Rules (MANDATORY)** section — explicit rules on what a page may vs may not do (pass data through widget props = OK; declare CSS for widget internal classes = VIOLATION). Adds a grep-based enforcement check. Closes gap P3.
- **Grid position format** clarification — use `grid[row=N, col=M]` OR named CSS grid areas, consistently within one page. Closes gap P4.

### Changed
- **Widgets Used** table: renamed "Notes" column → "Layout Notes" with positioning-only guidance (spans/stacking/sticky — NOT widget configuration). Closes gap P1.

## [2.63.10] - 2026-04-05

### Added
- **Taxonomy filename rule** in `gsd-t-design-decompose.md` Step 0: element contract filenames MUST match the closed-set taxonomy name exactly (`chart-bar-vertical-single.contract.md`, not `bar-vertical-single.contract.md`). Closes widget-tier gap W5 — shortened aliases create taxonomy drift and break link-integrity. Prefer renaming legacy contracts over creating parallel files.

## [2.62.10] - 2026-04-05

### Added
- **Widget-contract Test Fixture section (MANDATORY)** — `templates/widget-contract.md` now requires a `## Test Fixture` section at widget scope, with the same `__fixture_source__` / `__figma_template__` requirements as element contracts. Widget fixtures reference element sub-fixtures via `$ref:{element-name}#/fixture` rather than re-inlining element values — enforces the widget↔element boundary in the fixture layer. Closes gap W4 from widget-tier convergence run 1. Also adds a widget-level Verification Harness subsection.
- **Widget fixture boundary rule**: widget fixture fields MUST NOT duplicate element visual-spec fields (colors, font sizes, padding, radii) — those live in the element contract. A field name matching an element slot (segments, centerValue, xLabels) belongs in the element fixture.

## [2.61.10] - 2026-04-05

### Added
- **Circular charts `-percentage` clarification** — `design-chart-taxonomy.md` now explicitly states that `chart-pie` and `chart-donut` do NOT take a `-percentage` suffix, because circular charts are inherently part-to-whole (circle = 100%). Whether segment labels show percentages or absolute values is a labelling choice recorded in the Test Fixture, not a distinct element. Prevents agents from inventing `chart-donut-percentage` when it doesn't exist in the closed set. Closes gap A from convergence run 2.
- **Figma MCP size guard** in `gsd-t-design-decompose.md` Step 1: call `get_metadata` first to map the tree, then `get_design_context` only on leaf nodes (< 100KB). Avoids the 250KB+ tool-results file dump when called on full-page frames. Closes gap #3 from convergence runs 1 and 2.

## [2.60.10] - 2026-04-05

### Added
- **Shared Templates installer** — `installSharedTemplates()` in `bin/gsd-t.js` copies design-chart-taxonomy.md, element-contract.md, widget-contract.md, page-contract.md, design-contract.md, and shared-services-contract.md into `~/.claude/templates/` on install/update. Fresh-context workers (including Terminal 2 subprocesses) can now reference these at a predictable path instead of hunting through npx caches. Closes framework gap #1 surfaced by v2.59.10 convergence run 1.

### Changed
- **Element template `Test Fixture`** now documents a **Fixture Resolution Order** for Figma designs that use template tokens like `{num}%`: (1) concrete Figma text, (2) existing flat contract, (3) requirements sample data, (4) engineered stub matching visible proportions. Adds mandatory `__fixture_source__` and `__figma_template__` fields so verifiers distinguish extracted-from-design vs engineered-to-match-visual. Closes gap #4.
- **Element template** adds a **Verification Harness** subsection clarifying what card chrome / controls to include vs strip when rendering the element on `/design-system/{name}`. Closes gap #5 ("element-only, no widget chrome" ambiguity).

## [2.59.10] - 2026-04-05

### Added
- **Chart & Atom Taxonomy** — `templates/design-chart-taxonomy.md` — closed enumeration of ~70 valid element names across charts, axes, legends, cards, tables, controls, atoms (icons/badges/chips/dividers), typography, and layout primitives. Fixes catastrophic failure mode where agents invented element names and picked wrong chart variants (e.g., `chart-bar-grouped-vertical` when design was `chart-bar-stacked-horizontal-percentage`). `gsd-t-design-decompose` now REQUIRES element names to come from this closed set.
- **Visual distinguisher decision rules** per chart category (stacked vs grouped vs percentage, pie vs donut vs gauge, line vs area, categorical vs histogram) to prevent near-match pattern-matching.
- **Atoms taxonomy** — icons, badges, chips, dividers, avatars, status-dots, spinners, tooltips, breadcrumbs, pagination, tags — the most-forgotten element tier.

### Changed
- **Element template**: `Test Fixture` section is now MANDATORY with the EXACT labels/values/percentages extracted from the design source. Placeholder data (Calculator/Planner/Tracker instead of real labels) is FORBIDDEN. Verifier compares labels verbatim.
- **Widget template**: adds mandatory **Card Chrome Slots** section (title, subtitle, header_right_control, kpi_header, body, body_sidebar, footer, footer_legend) — each must be filled or explicitly marked N/A. Fixes the "missing subtitle, missing per-card filter dropdown, missing KPI-above-chart" defect.
- **Design Verification Agent** (gsd-t-execute Step 5.25 + gsd-t-quick Step 5.25): adds mandatory **Step 0 — Data-Labels Cross-Check** that runs BEFORE visual comparison. Verifies every label/value/percentage from the Test Fixture appears verbatim in the rendered UI. Wrong data = CRITICAL deviation, no visual polish can redeem it.
- **gsd-t-design-decompose**: MUST ingest existing flat `design-contract.md` when present (especially the `## Verification Status` section from prior verified builds) as ground truth for Test Fixture data — no re-inventing labels.

## [2.58.10] - 2026-04-05

### Added
- **Hierarchical design contracts** — `element` → `widget` → `page` contract hierarchy for design-to-code projects. Element contracts are the single source of truth for visual spec (one contract per visual variant, e.g., `chart-bar-stacked-horizontal` and `chart-bar-stacked-vertical` are separate). Widgets compose elements with layout + data binding. Pages compose widgets with routing + grid layout.
- **Precedence rule**: element > widget > page. Widgets and pages SELECT and POSITION elements but cannot override element visual spec. Structural drift becomes impossible.
- **New templates**: `templates/element-contract.md`, `templates/widget-contract.md`, `templates/page-contract.md`
- **New command**: `/user:gsd-t-design-decompose` — surveys a design (Figma/image/prototype), classifies elements (reuse count ≥2 or non-trivial spec → promoted to element contract), identifies widgets and pages, writes the full contract hierarchy under `.gsd-t/contracts/design/{elements,widgets,pages}/` plus an `INDEX.md` navigation map.

### Changed
- `design-to-code.md` stack rule adds Section 0 explaining flat vs. hierarchical contract modes and detection at execute-time (presence of `.gsd-t/contracts/design/` triggers hierarchical verification: elements first, then widgets, then pages)
- Command count: 48 GSD-T + 5 utility = 53 total

## [2.57.10] - 2026-04-04

### Added
- **Design Verification Agent** — dedicated subagent (Step 5.25) spawned after QA and before Red Team when `.gsd-t/contracts/design-contract.md` exists. Opens a browser with both the built frontend AND the original design (Figma/image) side-by-side for direct visual comparison. Produces a 30+ row structured comparison table with MATCH/DEVIATION verdicts. Artifact gate enforces completion — missing table triggers re-spawn.
- Wired into `gsd-t-execute` (Step 5.25) and `gsd-t-quick` (Step 5.25)

### Changed
- **Separation of concerns**: Coding agents no longer perform visual verification inline (removed 45-line Step 7 from task subagent prompt). Coding agents write precise code from design tokens; the verification agent proves it matches.
- `design-to-code.md` Section 15 slimmed from 120 lines to 20 lines — now points to the dedicated agent instead of embedding the full verification loop in the stack rule
- `CLAUDE-global.md` updated with Design Verification Agent section between QA and Red Team
- Red Team now runs after Design Verification (previously ran directly after QA)
- Non-design projects are completely unaffected (gate checks for design-contract.md existence)

## [2.52.11] - 2026-04-01

### Added
- **M32: Quality Culture & Design** milestone planning — 3 new domains (design-brief, evaluator-interactivity, quality-persona) with scope and task definitions
- **CI examples** — GitHub Actions and GitLab CI pipeline templates in `docs/ci-examples/`
- **Framework comparison scorecard** — `docs/framework-comparison-scorecard.md`

### Changed
- `.gitignore` updated to exclude Windows `desktop.ini` artifacts, temp files (`.tmp.driveupload/`, `.gsd-t/dashboard.pid`), and generated PDFs
- Fixed package.json version drift (was 2.51.10, should have been 2.52.10 after M31)

### Removed
- `.claude/settings.local.json` — no longer tracked (managed locally)

## [2.51.10] - 2026-03-25

### Added
- **Red Team — Adversarial QA agent** added to `execute`, `quick`, `integrate`, and `debug` commands. Spawns after the builder's tests pass with inverted incentives — success is measured by bugs found, not tests passed.
- **Exhaustive attack categories**: contract violations, boundary inputs, state transitions, error paths, missing flows, regression, E2E functional gaps, cross-domain boundaries (integrate only), fix regression variants (debug only).
- **False positive penalty**: reporting non-bugs destroys credibility, preventing phantom bug inflation.
- **VERDICT system**: `FAIL` (bugs found — blocks phase completion) or `GRUDGING PASS` (exhaustive search, nothing found — must prove thoroughness).
- **Red Team report**: findings written to `.gsd-t/red-team-report.md`; bugs appended to `.gsd-t/qa-issues.md`.
- Red Team documented in CLAUDE-global template, global CLAUDE.md, GSD-T-README wave diagram, README command table.

## [2.50.12] - 2026-03-25

### Added
- **23 new stack rule files** — python, flutter, tailwind, react-native, vite, nextjs, vue, docker, postgresql (with graph-in-SQL section), github-actions, rest-api, supabase, firebase, graphql, zustand, redux, neo4j, playwright, fastapi, llm (with RAG patterns section), prisma, queues, _auth (universal). Total: 27 stack rules (was 4).
- **`_auth.md`** (universal) — email-first registration, auth provider abstraction (Cognito/Firebase/Google), token management, password policy, session management, social auth/OAuth, email verification, MFA, authorization/RBAC, auth security, auth UI patterns.
- **`fastapi.md`** — dependency injection, Pydantic request/response models, lifespan events, BackgroundTasks, async patterns, auto-generated OpenAPI docs.
- **`llm.md`** — provider-agnostic LLM patterns: structured outputs, streaming, error/retry, token management, conversation state, tool/function calling, RAG patterns (chunking, embeddings, retrieval), prompt management, testing, cost/observability.
- **`prisma.md`** — schema modeling, migrations, typed client usage, relation queries, transactions, seeding, N+1 prevention.
- **`queues.md`** — BullMQ/Bull, SQS, RabbitMQ, Celery patterns: idempotent handlers, dead letter queues, retry/backoff, job deduplication, graceful shutdown.
- **Playwright best practices** — coverage matrix per feature, pairwise combinatorial testing, state transition testing, multi-step workflow testing, Page Object Model, API mocking patterns. Enforces rigorous test depth across permutations.
- **react.md expanded** — added state management decision table, form management (react-hook-form + zod), React naming conventions (3 new sections from external best practices review).
- **Project-level stack overrides** — `.gsd-t/stacks/` directory for per-project customization of global stack rules. Local files replace global files of the same name.

### Changed
- Stack detection in execute, quick, and debug commands updated to cover all 27 stack files with conditional detection per project dependencies.
- Detection refactored from one-liner to structured bash with `_sf()` (local override resolver) and `_add()` helper functions.
- PostgreSQL graph-in-SQL patterns (adjacency lists, junction tables, recursive CTEs) added to postgresql.md based on real project analysis.
- GSD-T-README.md stack detection table expanded to list all 27 files with their detection triggers.

## [2.46.11] - 2026-03-24

### Added
- **M28: Doc-Ripple Subagent** — automated document ripple enforcement agent. Threshold check (7 FIRE/3 SKIP conditions), blast radius analysis, manifest generation, parallel document updates. New command: `gsd-t-doc-ripple`. 43 new tests. Wired into execute, integrate, quick, debug, wave.
- **Orchestrator context self-check** — execute and wave orchestrators now check their own context utilization after every domain/phase. If >= 70%, saves progress and stops to prevent session breaks.
- **Functional E2E test quality standard (REQ-050)** — Playwright specs must verify functional behavior, not just element existence. Shallow test audit added to qa, test-sync, verify, complete-milestone commands.
- **Document Ripple Completion Gate (REQ-051)** — structural rule preventing "done" reports until all downstream documents are updated.

### Changed
- Command count: 50 → 51 (added `gsd-t-doc-ripple`)
- Package description updated to include doc-ripple enforcement

## [2.39.12] - 2026-03-19

### Added
- **Graph auto-sync at command boundary** — every GSD-T command now checks index freshness automatically; both native JSON and CGC/Neo4j are re-indexed when files change (500ms TTL deduplication)
- **Neo4j setup guide** — `docs/neo4j-setup.md` with full instructions for Docker container, CGC install, project indexing, and scanning
- Backlog items #8 (Auto-Setup Graph Dependencies) and #9 (Provider Failure Warnings + Auto-Recovery)

### Fixed
- CGC sync uses `cgc index` CLI instead of broken `add_code_to_graph` MCP tool call (CGC 0.3.1 Windows bug workaround)
- CGC sync retries with `--force` on failure, warns user clearly instead of silently swallowing errors
- CGC sync sets `PYTHONIOENCODING=utf-8` to prevent crash on emoji/Unicode in source code on Windows

## [2.39.10] - 2026-03-19

### Added
- **M20: Graph Abstraction Layer + Native Indexer** — 6 new files (`graph-store`, `graph-parsers`, `graph-overlay`, `graph-indexer`, `graph-query`, `graph-cgc`), 3 CLI subcommands (`graph index/status/query`), 4 new contracts, 70 new tests. Self-indexed: 264 entities, 725 relationships.
- **M21: Graph-Powered Commands** — 21 commands now query code structure via graph instead of grep, with automatic fallback chain (CGC → native → grep)
- `/global-change` command for bulk file changes across all registered GSD-T projects (49th command)
- 3-tier model assignments (haiku/sonnet/opus) with mandatory model display before subagent spawns
- Graph vs grep comparison analysis (`scan/graph-vs-grep-comparison.md`)
- PRDs: `prd-graph-engine.md`, `prd-gsd2-hybrid.md`

### Fixed
- **TD-097 (CRITICAL)**: Command injection in `graph-query.js` — replaced `execSync` with `execFileSync` + input validation
- **TD-081/TD-082 (HIGH)**: Shell injection in `gsd-t-update-check.js` — added semver validation, `execFileSync`, `module.exports`
- **TD-083 (HIGH)**: Contract drift — added `session_start`/`session_end` to event writer, removed phantom `mcp` renderer
- **TD-071 (MEDIUM)**: Markdown injection in `stateSet()` — now strips `\r\n` from values
- **TD-084**: `execSync` in `scan-export.js` and `scan-renderer.js` replaced with `execFileSync`
- **TD-085**: Dashboard event loading now handles cross-midnight sessions
- **TD-087**: Command count corrected to 49 in CLI installer
- **TD-072**: Path traversal protection in `templateScope`/`templateTasks`
- **TD-073**: `execSync` in `preCommitCheck()` replaced with `execFileSync`
- **TD-074**: `findProjectRoot()` now returns `null` instead of cwd on failure
- **TD-092**: `scan-report.html` now written to `.gsd-t/` instead of project root
- **TD-099**: `graph-store.js` symlink protection added

### Changed
- 293/294 tests passing (1 pre-existing failure in `scan.test.js`)
- Total command count: 49 (45 GSD-T workflow + 4 utility)

## [2.33.12] - 2026-03-06

### Fixed
- **Dashboard graph now shows the current session** — heartbeat.js now emits `session_start`/`session_end` events (agent_id=session_id) so the session appears as a root node
- **Tool calls attributed to session** — PostToolUse events now carry session_id as agent_id fallback; all activity visible in single-agent sessions
- **Readable node labels** — sessions display as "Session · Mar 6 · abc1234" (blue-bordered); subagents show their type
- 3 new tests (178/178 passing); event-schema-contract.md updated with new event types

## [2.33.11] - 2026-03-05

### Added
- `.gitignore` excludes `.claude/worktrees/` (Claude Code internal) and `nul` (Windows artifact)
- `ai-evals-analysis.md`, `gsd-t-command-doc-matrix.csv` — development reference documents
- `scripts/gsd-t-dashboard-mockup.html` — interactive mockup from M15 brainstorm (historical reference)
- `.gsd-t/brainstorm-2026-02-18.md` — brainstorm notes from Feb 18 ideation session

## [2.33.10] - 2026-03-04

### Added
- **Milestone 15: Real-Time Agent Dashboard** — Zero-dependency live browser dashboard for GSD-T execution:
  - **`scripts/gsd-t-dashboard-server.js`** (141 lines): Node.js HTTP+SSE server (zero external deps). Watches `.gsd-t/events/*.jsonl`, streams up to 500 existing events on connect, tails for new events, keepalive every 15s. Runs detached with PID file. All functions exported for testability (23 unit tests in `test/dashboard-server.test.js`).
  - **`scripts/gsd-t-dashboard.html`** (194 lines): Browser dashboard using React 17 + React Flow v11.11.4 + Dagre via CDN (no build step, no npm deps). Dark theme. Renders agent hierarchy as directed graph from `parent_agent_id` relationships. Live event feed (max 200 events, outcome color-coded: green=success, red=failure, yellow=learning). Auto-reconnects on disconnect.
  - **`commands/gsd-t-visualize`**: 48th GSD-T command. Starts server via `--detach`, polls `/ping` up to 5s, opens browser cross-platform (win32/darwin/linux). Accepts `stop` argument. Includes Step 0 self-spawn with OBSERVABILITY LOGGING.
  - Both `gsd-t-dashboard-server.js` and `gsd-t-dashboard.html` automatically installed to `~/.claude/scripts/` during `npx @tekyzinc/gsd-t install/update`
  - 23 new tests in `test/dashboard-server.test.js` — total: 176/176 passing

### Changed
- Total command count: 47 → **48** (44 GSD-T workflow + 4 utility)

## [2.32.10] - 2026-03-04

### Added
- **Milestone 14: Execution Intelligence Layer** — Structured observability, learning, and reflection:
  - **`scripts/gsd-t-event-writer.js`**: New zero-dependency CLI + module.exports. Writes structured JSONL events to `.gsd-t/events/YYYY-MM-DD.jsonl`. Validates 8 event_type values and 5 outcome values. Symlink-safe. Resolves events dir from `GSD_T_PROJECT_DIR` or cwd. 26 new tests.
  - **Heartbeat enrichment**: `scripts/gsd-t-heartbeat.js` maps `SubagentStart`/`SubagentStop`/`PostToolUse` hook events to the events/ schema, appending them to daily JSONL files alongside existing heartbeat writes.
  - **Outcome-tagged Decision Log**: `execute`, `debug`, and `wave` now prefix all new Decision Log entries with `[success]`, `[failure]`, `[learning]`, or `[deferred]`.
  - **Pre-task experience retrieval (Reflexion pattern)**: `execute` and `debug` grep the Decision Log for `[failure]`/`[learning]` entries matching the current domain before spawning subagents. Relevant past failures prepended as `⚠️ Past Failures` block in subagent prompt.
  - **Phase transition events**: `wave` writes `phase_transition` event with outcome:success/failure at each phase boundary.
  - **Distillation step** (Step 2.5 in `complete-milestone`): Scans event stream for patterns seen ≥3 times, proposes CLAUDE.md / constraints.md rule additions, requires user confirmation before any write.
  - **`commands/gsd-t-reflect`** (134 lines, 47th command): On-demand retrospective from event stream. Generates `.gsd-t/retrospectives/YYYY-MM-DD-{milestone}.md` with What Worked / What Failed / Patterns Found / Proposed Memory Updates. Includes Step 0 self-spawn with OBSERVABILITY LOGGING.
  - `gsd-t-event-writer.js` installed to `~/.claude/scripts/` during install/update

### Changed
- Total command count: 46 → **47** (43 GSD-T workflow + 4 utility)

## [2.28.10] - 2026-02-18

### Added
- **Milestone 13: Tooling & UX** — Infrastructure and UX improvements:
  - **`scripts/gsd-t-tools.js`**: New zero-dependency Node.js CLI utility returning compact JSON. Subcommands: `state get/set` (read/write progress.md keys), `validate` (check required files), `parse progress --section` (extract named sections), `list domains|contracts`, `git pre-commit-check` (branch/status/last-commit), `template scope|tasks <domain>`
  - **`scripts/gsd-t-statusline.js`**: New statusline script for Claude Code. Reads GSD-T project state and optionally reads `CLAUDE_CONTEXT_TOKENS_USED`/`CLAUDE_CONTEXT_TOKENS_MAX` env vars to show a color-coded context usage bar (green→yellow→orange→red). Configure via `"statusLine": "node ~/.claude/scripts/gsd-t-statusline.js"` in `settings.json`
  - **`gsd-t-health`**: New slash command validating `.gsd-t/` project structure. Checks all required files, directories, version consistency, status validity, contract integrity, and domain integrity. `--repair` creates any missing files from templates. Reports HEALTHY / DEGRADED / BROKEN
  - **`gsd-t-pause`**: New slash command saving exact position to `.gsd-t/continue-here-{timestamp}.md` with milestone, phase, domain, task, last completed action, next action, and open items
  - Both scripts automatically installed to `~/.claude/scripts/` during `npx @tekyzinc/gsd-t install/update`

### Changed
- **`gsd-t-resume`**: Now reads the most recent `.gsd-t/continue-here-*.md` file (if present) as the primary resume point before falling back to `progress.md`. Deletes the continue-here file after consuming it
- **`gsd-t-plan`**: Wave Execution Groups added to `integration-points.md` format — groups tasks into parallel-safe waves with checkpoints between them. Wave rules: same-wave tasks share no files and have no dependencies; different-wave tasks depend on each other's output or modify shared files
- **`gsd-t-execute`**: Reads Wave Execution Groups from `integration-points.md` and executes wave-by-wave. Tasks within a wave are parallel-safe; checkpoints between waves verify contract compliance before proceeding. Team mode now spawns teammates only within the same wave
- **`gsd-t-health`** and **`gsd-t-pause`** added to all reference files (help, README, GSD-T-README, CLAUDE-global template, user CLAUDE.md)
- Total command count: 43 → **45** (41 GSD-T workflow + 4 utility)

## [2.27.10] - 2026-02-18

### Changed
- **Milestone 12: Planning Intelligence** — Three improvements to correctness across milestones:
  - **CONTEXT.md from discuss**: `gsd-t-discuss` now creates `.gsd-t/CONTEXT.md` with three sections — Locked Decisions (plan must implement exactly), Deferred Ideas (plan must NOT implement), and Claude's Discretion (free to decide). New Step 5 added to discuss; steps renumbered
  - **Plan fidelity enforcement**: `gsd-t-plan` reads CONTEXT.md and maps every Locked Decision to at least one task. Also produces a REQ-ID → domain/task traceability table in `docs/requirements.md`
  - **Plan validation checker**: A Task subagent validates the plan after creation — checks REQ coverage, Locked Decision mapping, task completeness, cross-domain dependencies, and contract existence. Max 3 fix iterations before stopping
  - **Requirements close-out in verify**: `gsd-t-verify` marks matched requirements as `complete` in the traceability table and reports orphaned requirements and unanchored tasks

## [2.26.10] - 2026-02-18

### Changed
- **Milestone 11: Execution Quality** — Three improvements to execution reliability:
  - **Deviation Rules**: `execute`, `quick`, and `debug` now include a 4-rule deviation protocol — auto-fix bugs (3-attempt limit), add minimum missing dependencies, fix blockers, and STOP for architectural changes. Failed attempts log to `.gsd-t/deferred-items.md`
  - **Atomic per-task commits**: `execute` now commits after each task using `feat({domain}/task-{N}): {description}` format instead of batching at phase end. Team mode instructions updated with the same requirement
  - **Wave spot-check**: Between-phase verification in `wave` now checks git log (commits present), filesystem (output files exist), and FAILED markers in progress.md — not just agent-reported status

## [2.25.10] - 2026-02-18

### Changed
- **Milestone 10: Token Efficiency** — QA overhead significantly reduced across all phases:
  - `partition` and `plan`: QA spawn removed (no code produced in these phases)
  - `test-sync`, `verify`, `complete-milestone`: contract testing and gap analysis performed inline (no QA teammate)
  - `execute`, `integrate`: QA now spawned via lightweight Task subagent instead of TeamCreate teammate
  - `quick`, `debug`: QA spawn removed; tests run inline in the existing Test & Verify step; both commands now self-spawn as Task subagents (Step 0) for fresh context windows
  - `scan`, `status`: wrap themselves as Task subagents for fresh context on each invocation
  - Global CLAUDE.md QA Mandatory section updated to reflect the new per-command QA method

## [2.24.10] - 2026-02-18

### Changed
- **Versioning scheme: patch numbers are always 2 digits**: Patch segment now starts at 10 (not 0) after any minor or major reset. Incrementing continues normally (10→11→12…). Semver validity is preserved — no leading zeros. `checkin.md` and `gsd-t-complete-milestone.md` updated with the new convention. `gsd-t-init` will initialize new projects at `0.1.10`

## [2.24.9] - 2026-02-18

### Changed
- **Default model**: Example settings.json updated from `claude-opus-4-6` to `claude-sonnet-4-6` (faster, lower token usage)

## [2.24.8] - 2026-02-18

### Fixed
- **CLAUDE.md update no longer overwrites user content**: Installer now uses marker-based merging (`<!-- GSD-T:START -->` / `<!-- GSD-T:END -->`). Updates only replace the GSD-T section between markers, preserving all user customizations. Existing installs without markers are auto-migrated. Backup still created for reference

## [2.24.7] - 2026-02-18

### Changed
- **Next Command Hint redesigned**: Replaced plain `Next →` text with GSD-style "Next Up" visual block — divider lines, `▶ Next Up` header, phase name with description, command in backticks, and alternatives section. Format designed to trigger Claude Code's prompt suggestion engine, making the next command appear as ghost text in the user's input field

## [2.24.6] - 2026-02-18

### Added
- **Auto-update on session start**: SessionStart hook now automatically installs new GSD-T versions when detected — runs `npm install -g` + `gsd-t update-all`. Falls back to manual instructions if auto-update fails
- **Changelog link in all version messages**: All three output modes (`[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]`) now include the changelog URL
- **Update check installer**: `bin/gsd-t.js` now deploys the update check script and configures the SessionStart hook automatically during install, with auto-fix for incorrect matchers

### Fixed
- **SessionStart hook matcher**: Changed from `"startup"` to `""` (empty) to match all session types including compact/resumed sessions

## [2.24.5] - 2026-02-18

### Fixed
- **Dead code removed**: `PKG_EXAMPLES` constant in `bin/gsd-t.js` and dead imports (`writeTemplateFile`, `showStatusVersion`) in `test/cli-quality.test.js` (TD-057, TD-058)
- **summarize() case fallthrough**: Combined identical `Read`/`Edit`/`Write` cases using switch fallthrough, saving 4 lines (TD-056)
- **checkForUpdates() condition**: Simplified redundant `!cached && isStale` to `if (!cached) ... else if (stale)` (TD-061)
- **Notification title scrubbing**: Applied `scrubSecrets()` to `h.title` in heartbeat notification handler (TD-063)
- **SEC-N16 note corrected**: Updated informational note during scan #5 (TD-062)
- **Wave integrity check contract**: Updated `wave-phase-sequence.md` to match actual implementation — checks Status, Milestone name, Domains table (not version) (TD-064)
- **Duplicate format contract**: Deleted `file-format-contract.md` — `backlog-file-formats.md` is authoritative (TD-065)

### Added
- 9 new tests: 3 `readSettingsJson()` tests in `cli-quality.test.js`, 6 `shortPath()` tests in `security.test.js` (TD-059, TD-060)
- Total tests: 125 (was 116)

## [2.24.4] - 2026-02-18

### Fixed
- **progress.md status**: Now uses contract-recognized values (READY between milestones, not ACTIVE)
- **CLAUDE.md version**: Removed hardcoded version — references `package.json` directly to prevent recurring drift (TD-048)
- **CHANGELOG.md**: Added missing entries for v2.23.1 through v2.24.3 covering milestones 3-7 (TD-045)
- **Orphaned domains**: Deleted stale `cli-quality/` and `cmd-cleanup/` directories from previous milestones (TD-046)
- **Git line endings**: Applied `git add --renormalize .` to enforce LF across all tracked files (TD-049)
- **Notification scrubbing**: Applied `scrubSecrets()` to heartbeat notification messages (TD-052)

### Changed
- **Contracts synced**: `progress-file-format.md` enriched with milestone table + optional fields. `wave-phase-sequence.md` updated with integrity check (M7) and security considerations (M5). `command-interface-contract.md` renamed to `backlog-command-interface.md`. `integration-points.md` rewritten to reflect current state (TD-047, TD-053, TD-054, TD-055)
- **readSettingsJson()**: Extracted helper to deduplicate 3 `JSON.parse(readFileSync)` call sites in CLI (TD-050)
- **prepublishOnly**: Added `npm test` gate before `npm publish` (TD-051)
- **TD-029 (TOCTOU)**: Formally accepted as risk with 5-point rationale — single-threaded Node.js, user-owned dirs, Windows symlink requires admin

## [2.24.3] - 2026-02-19

### Changed
- **Command file cleanup**: 85 fractional step numbers renumbered to integers across 17 command files. Autonomy Behavior sections added to `gsd-t-discuss` and `gsd-t-impact`. QA agent hardened with file-path boundary constraints, multi-framework test detection, and Document Ripple section. Wave integrity check validates progress.md fields before starting. Structured 3-condition discuss-skip heuristic. Consistent "QA failure blocks" language across all 10 QA-spawning commands

### Fixed
- 8 tech debt items resolved: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041

## [2.24.2] - 2026-02-19

### Changed
- **CLI quality improvement**: All 86 functions across `bin/gsd-t.js` (80) and `scripts/gsd-t-heartbeat.js` (6) are now <= 30 lines. 3 code duplication patterns resolved (`readProjectDeps`, `writeTemplateFile`, `readPyContent` extracted). `buildEvent()` refactored to handler map pattern. `checkForUpdates` inline JS extracted to `scripts/gsd-t-fetch-version.js`. `doUpdateAll` has per-project error isolation

### Added
- `.gitattributes` and `.editorconfig` for consistent file formatting
- 22 new tests in `test/cli-quality.test.js` (buildEvent, readProjectDeps, readPyContent, insertGuardSection, readUpdateCache, addHeartbeatHook)

### Fixed
- Heartbeat cleanup now only runs on SessionStart (not every event)
- 7 tech debt items resolved: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034

## [2.24.1] - 2026-02-18

### Added
- **Security hardening**: `scrubSecrets()` and `scrubUrl()` in heartbeat script scrub sensitive data (passwords, tokens, API keys, bearer tokens) before logging. 30 new security tests in `test/security.test.js`
- `hasSymlinkInPath()` validates parent directories for symlink attacks
- HTTP response accumulation bounded to 1MB in both fetch paths
- Security Considerations section in `gsd-t-wave.md` documenting `bypassPermissions` implications

### Fixed
- `npm-update-check.js` validates cache path within `~/.claude/` and checks for symlinks before writing
- 6 tech debt items resolved: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035

## [2.24.0] - 2026-02-18

### Added
- **Testing foundation**: 64 automated tests in 2 test files (`test/helpers.test.js`: 27 tests, `test/filesystem.test.js`: 37 tests) using Node.js built-in test runner (`node --test`). Zero external test dependencies
- `module.exports` added to `bin/gsd-t.js` for 20 testable functions with `require.main` guard
- CLI subcommand tests (--version, help, status, doctor)
- Helper function tests (validateProjectName, applyTokens, normalizeEol, validateVersion, isNewerVersion)
- Filesystem tests (isSymlink, ensureDir, validateProjectPath, copyFile, hasPlaywright, hasSwagger, hasApi)
- Command listing tests (getCommandFiles, getGsdtCommands, getUtilityCommands with count validation)

### Fixed
- Tech debt item TD-003 (no test coverage) resolved

## [2.23.1] - 2026-02-18

### Fixed
- **Count fix**: All command count references updated to 43/39/4 across CLAUDE.md, README.md, package.json, and docs (TD-022)
- QA agent contract now includes test-sync phase with "During Test-Sync" section and updated output table (TD-042)
- Orphaned domain files from previous milestones archived to `.gsd-t/milestones/` (TD-043)

## [2.23.0] - 2026-02-17

### Changed
- **Wave orchestrator rewrite**: `gsd-t-wave` now spawns an independent agent for each phase instead of executing all phases inline. Each phase agent gets a fresh context window (~200K tokens), eliminating cross-phase context accumulation and preventing mid-wave compaction. The orchestrator stays lightweight (~30KB), reading only progress.md between phases. Phase sequence is unchanged — only the execution model changed. Estimated 75-85% reduction in peak context usage during waves

## [2.22.0] - 2026-02-17

### Added
- **gsd-t-qa**: New QA Agent command — dedicated teammate for test generation, execution, and gap reporting. Spawned automatically by 10 GSD-T phase commands
- **QA Agent spawn steps**: Added to partition (4.7), plan (4.7), execute (1.5 + team), verify (1.5 + team), complete-milestone (7.6), quick (2.5), debug (2.5), integrate (4.5), test-sync (1.5), wave (1.5)
- **Contract-to-test mapping rules**: API contracts → Playwright API tests, Schema contracts → constraint tests, Component contracts → E2E tests
- **QA Agent (Mandatory) section**: Added to global CLAUDE.md template — QA failure blocks phase completion

## [2.21.1] - 2026-02-18

### Fixed
- **PR #7 — Fix 12 scan items**: Security symlink validation gaps, contract/doc alignment, scope template hardening, heartbeat crash guard, progress template field ordering
- **PR #8 — Resolve final 4 scan items**: Function splitting in CLI (`doInit` helpers extracted), ownership validation for domain files, npm-update-check extracted to standalone script (`scripts/npm-update-check.js`)

## [2.21.0] - 2026-02-17

### Added
- **gsd-t-triage-and-merge**: New command to auto-review unmerged GitHub branches, score impact (auto-merge / review / skip), merge safe branches, and optionally version bump + publish. Publish gate respects autonomy level — auto in Level 3, prompted in Level 1-2. Sensitive file detection for commands, CLI, templates, and scripts

## [2.20.7] - 2026-02-17

### Added
- **Formal contracts**: 5 contract definitions for core GSD-T interfaces — backlog file formats, domain structure, pre-commit gate, progress.md format, and wave phase sequence. Formalizes existing conventions as machine-readable reference docs

## [2.20.6] - 2026-02-16

### Fixed
- Stale command/template counts in project CLAUDE.md (25→41 commands, 7→9 templates, v2.0.0→v2.20.x)
- Duplicate step numbering in `gsd-t-execute.md` (two step 10s)
- Windows CRLF/LF comparison causing false "changed" detection in CLI update

### Added
- Document Ripple sections to `gsd-t-execute`, `gsd-t-scan`, `gsd-t-test-sync`, `gsd-t-verify`
- Heartbeat auto-cleanup: files older than 7 days are automatically removed
- Error handling wrapping around file operations in CLI (copy, unlink, write)
- `applyTokens()` and `normalizeEol()` helpers to reduce duplication
- Extracted `updateProjectClaudeMd()`, `createProjectChangelog()`, `checkProjectHealth()` from `doUpdateAll()`

## [2.20.5] - 2026-02-16

### Added
- **Next Command Hint**: After each GSD-T phase completes, displays the recommended next command (e.g., `Next → /user:gsd-t-partition`). Full successor mapping for all workflow commands. Skipped during auto-advancing (Level 3 mid-wave)

## [2.20.4] - 2026-02-16

### Changed
- **Scan always uses team mode**: `gsd-t-scan` and `gsd-t-init-scan-setup` now spawn a team by default. Solo mode only for trivially small codebases (< 5 files) or when teams are explicitly disabled

## [2.20.3] - 2026-02-16

### Added
- **Playwright Cleanup**: After Playwright tests finish, kill any app/server processes that were started for the tests. Prevents orphaned dev servers from lingering after test runs

## [2.20.2] - 2026-02-16

### Added
- **CLI health checks**: `update-all` and `doctor` now check all projects for missing Playwright and Swagger/OpenAPI
- Smart API detection: scans `package.json`, `requirements.txt`, `pyproject.toml` for API frameworks (Express, Fastify, Hono, Django, FastAPI, etc.)
- Swagger detection: checks for spec files (`openapi.json/yaml`, `swagger.json/yaml`) and swagger packages in dependencies
- Health summary in `update-all` shows counts of missing Playwright and Swagger across all registered projects

## [2.20.1] - 2026-02-16

### Added
- **API Documentation Guard (Swagger/OpenAPI)**: Every API endpoint must be documented in Swagger/OpenAPI spec — no exceptions. Auto-detects framework and installs appropriate Swagger integration. Swagger URL must be published in CLAUDE.md, README.md, and docs/infrastructure.md
- Pre-Commit Gate now checks for Swagger spec updates on any API endpoint change

## [2.20.0] - 2026-02-16

### Added
- **Playwright Setup in Init**: `gsd-t-init` now installs Playwright, creates `playwright.config.ts`, and sets up E2E test directory for every project. Detects package manager (bun, npm, yarn, pnpm, pip) automatically
- **Playwright Readiness Guard**: Before any testing command (execute, test-sync, verify, quick, wave, milestone, complete-milestone, debug), checks for `playwright.config.*` and auto-installs if missing. Playwright must always be ready — no deferring to "later"

## [2.19.1] - 2026-02-16

### Changed
- **Quick**: Now runs the FULL test suite (not just affected tests), requires comprehensive test creation for new/changed code paths including Playwright E2E, and verifies against requirements and contracts. "Quick doesn't mean skip testing."

## [2.19.0] - 2026-02-16

### Changed
- **Execute**: "No feature code without test code" — every task must include comprehensive unit tests AND Playwright E2E specs for all new code paths, modes, and flows. Tests are part of the deliverable, not a follow-up
- **Test-Sync**: Creates tests immediately during execute phase instead of deferring gaps to verify. Missing Playwright specs for new features/modes are created on the spot
- **Verify**: Zero test coverage on new functionality is now a FAIL (not WARN). Coverage audit checks that every new feature, mode, page, and flow has comprehensive Playwright specs covering happy path, error states, edge cases, and all modes/flags

## [2.18.2] - 2026-02-16

### Added
- Gap Analysis Gate in `gsd-t-complete-milestone` — mandatory requirements verification before archiving
- Self-correction loop: auto-fixes gaps, re-verifies, re-analyzes (up to 2 cycles), stops if unresolvable
- Explicit Playwright E2E test execution in milestone test verification step

## [2.18.1] - 2026-02-16

### Added
- Auto-Init Guard — GSD-T workflow commands automatically run `gsd-t-init` if any init files are missing, then continue with the original command
- `gsd-t-init` copies `~/.claude/settings.local` → `.claude/settings.local.json` during project initialization
- Exempt commands that skip auto-init: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`

## [2.18.0] - 2026-02-16

### Added
- Heartbeat system — real-time event streaming from Claude Code sessions via async hooks
- `scripts/gsd-t-heartbeat.js` — hook handler that writes JSONL events to `.gsd-t/heartbeat-{session_id}.jsonl`
- 9 Claude Code hooks: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd
- Installer auto-configures heartbeat hooks in settings.json (all async, zero performance impact)
- Event types: session lifecycle, tool calls with file/command summaries, agent spawn/stop/idle, task completions

## [2.17.0] - 2026-02-16

### Added
- `/user:gsd-t-log` command — sync progress.md Decision Log with recent git activity by scanning commits since last logged entry
- Incremental updates (only new commits) and first-time full reconstruction from git history
- Total commands: 38 GSD-T + 3 utility = 41

## [2.16.5] - 2026-02-16

### Added
- `gsd-t-populate` now reconstructs Decision Log from git history — parses all commits, generates timestamped entries, merges with existing log
- Pre-Commit Gate explicitly lists all 30 file-modifying commands that must log to progress.md

### Changed
- Rebuilt GSD-T project Decision Log with full `YYYY-MM-DD HH:MM` timestamps from 54 git commits

## [2.16.4] - 2026-02-16

### Changed
- Smart router renamed from `/user:gsd-t` to `/user:gsd` — sorts first in autocomplete, shorter to type
- Pre-Commit Gate now requires timestamped progress.md entry (`YYYY-MM-DD HH:MM`) after every completed task, not just architectural decisions

## [2.16.3] - 2026-02-16

### Fixed
- Reverted smart router rename (`/gsd` back to `/gsd-t`) — superseded by 2.16.4 which re-applies the rename

## [2.16.2] - 2026-02-16

### Changed
- Smart router renamed from `/user:gsd-t` to `/user:gsd` (reverted in 2.16.3)

## [2.16.1] - 2026-02-16

### Fixed
- `gsd-t-init-scan-setup` now pulls existing code from remote before scanning — prevents treating repos with existing code as greenfield

## [2.16.0] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) replaced signal-word lookup table with **semantic evaluation** — evaluates user intent against each command's purpose and "Use when" criteria from help summaries
- Router shows runner-up command when confidence is close: `(also considered: gsd-t-{x} — Esc to switch)`
- New commands automatically participate in routing without updating a routing table

### Added
- Backlog item B1: Agentic Workflow Architecture (future exploration when Claude Code agents mature)

## [2.15.4] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team scaling: one teammate per requirement (3–10), cap at 10 with even batching for 11+, solo for 1–2

## [2.15.3] - 2026-02-13

### Fixed
- `gsd-t-gap-analysis` hard cap of 4 teammates max — scales by requirement count (2 for 5–10, 3 for 11–15, 4 for 16+), solo for < 5

## [2.15.2] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team mode now handles flat requirement lists — chunks into batches of ~8–10 per teammate instead of requiring sections

## [2.15.1] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` now uses agent team mode automatically — one teammate per requirement section for parallel scanning and classification, with solo fallback

## [2.15.0] - 2026-02-13

### Added
- `/user:gsd-t-gap-analysis` command — requirements gap analysis against existing codebase
- Parses spec into discrete numbered requirements, scans codebase, classifies each as implemented/partial/incorrect/not-implemented
- Evidence-based classification with file:line references for each requirement
- Severity levels: Critical (incorrect), High (partial), Medium (not implemented), Low (deferrable)
- Generates `.gsd-t/gap-analysis.md` with requirements breakdown, gap matrix, and summary stats
- Re-run support with diff against previous gap analysis (resolved, new, changed, unchanged)
- Optional merge of parsed requirements into `docs/requirements.md`
- Auto-groups gaps into recommended milestones/features/quick-fixes for promotion
- Autonomy-aware: Level 3 proceeds with flagged assumptions, Level 1-2 pauses for clarification
- Total commands: 37 GSD-T + 3 utility = 40

## [2.14.2] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) now displays selected command as the first line of output (mandatory routing confirmation)

## [2.14.1] - 2026-02-13

### Changed
- Update Notices section in CLAUDE-global template now handles both `[GSD-T UPDATE]` (update available) and `[GSD-T]` (up to date) version banners
- Update command in notification changed from raw npm command to `/user:gsd-t-version-update-all`

## [2.14.0] - 2026-02-12

### Added
- `/user:gsd-t` smart router command — describe what you need in plain language, auto-routes to the correct GSD-T command
- Intent classification routes to: quick, feature, project, debug, scan, brainstorm, milestone, wave, status, resume, backlog-add, and more
- Total commands: 36 GSD-T + 3 utility = 39

## [2.13.4] - 2026-02-12

### Added
- Auto-invoked status column on all command tables in README and GSD-T-README (Manual / In wave)
- `[auto]` markers on wave-invoked commands in `gsd-t-help` main listing
- Section headers in `gsd-t-help` now show Manual or Auto label

## [2.13.3] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks "Is {current folder} your project root?" before prompting for a folder name

## [2.13.2] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks for project folder name, creates it if needed, and `cd`s into it — can be run from anywhere

## [2.13.1] - 2026-02-12

### Changed
- Update notification now includes changelog link (https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md)

## [2.13.0] - 2026-02-12

### Added
- `/user:gsd-t-init-scan-setup` slash command — full project onboarding combining git setup, init, scan, and setup in one command
- Prompts for GitHub repo URL if not already connected; skips if remote exists
- Total commands: 35 GSD-T + 3 utility = 38

## [2.12.0] - 2026-02-12

### Added
- `/user:gsd-t-version-update` slash command — update GSD-T to latest version from within Claude Code
- `/user:gsd-t-version-update-all` slash command — update GSD-T + all registered projects from within Claude Code
- Total commands: 34 GSD-T + 3 utility = 37

## [2.11.6] - 2026-02-12

### Changed
- Update notice now shown at both beginning and end of Claude's first response

## [2.11.5] - 2026-02-12

### Added
- SessionStart hook script (`~/.claude/scripts/gsd-t-update-check.js`) for automatic update notifications in Claude Code sessions
- "Update Notices" instruction in global CLAUDE.md template — Claude relays update notices to the user on first response

## [2.11.4] - 2026-02-12

### Fixed
- First-run update check now fetches synchronously when no cache exists — notification shows immediately instead of requiring a second run

## [2.11.3] - 2026-02-12

### Changed
- Reduced update check cache duration from 24 hours to 1 hour — new releases are detected faster

## [2.11.2] - 2026-02-12

### Fixed
- CLI update check used `!==` instead of semver comparison — would show incorrect downgrade notices when cache had an older version
- Added `isNewerVersion()` helper for proper semver comparison in update notifications

## [2.11.1] - 2026-02-12

### Changed
- `gsd-t-resume` now detects same-session vs cross-session mode — skips full state reload when context is already available, auto-resumes at Level 3
- Added "Conversation vs. Work" rule to global CLAUDE.md template — plain text questions are answered conversationally, workflow only runs when a `/gsd-t-*` command is invoked

## [2.11.0] - 2026-02-12

### Added
- Autonomy-level-aware auto-advancing for all phase commands — at Level 3 (Full Auto), partition, plan, impact, execute, test-sync, integrate, verify, and complete-milestone auto-advance without waiting for user input
- Wave error recovery auto-remediates at Level 3 (up to 2 fix attempts before stopping)
- Discuss phase always pauses for user input regardless of autonomy level
- Autonomy levels documentation added to GSD-T-README Configuration section

## [2.10.3] - 2026-02-11

### Changed
- Default autonomy level changed from Level 2 (Standard) to Level 3 (Full Auto) across all templates and commands
- `gsd-t-init` now sets Level 3 in generated CLAUDE.md
- `gsd-t-setup` defaults to Level 3 when asking autonomy level

## [2.10.2] - 2026-02-11

### Added
- Version update check in `gsd-t-status` slash command — works inside Claude Code and ClaudeWebCLI sessions, not just the CLI binary

### Fixed
- Normalized `repository.url` in package.json (`git+https://` prefix)

## [2.10.1] - 2026-02-10

### Added
- Automatic update check — CLI queries npm registry (cached 24h, background refresh) and shows a notice box with update commands when a newer version is available

## [2.10.0] - 2026-02-10

### Added
- `CHANGELOG.md` release notes document with full version history
- `changelog` CLI subcommand — opens changelog in the browser (`gsd-t changelog`)
- Clickable version links in CLI output (OSC 8 hyperlinks to changelog)
- `checkin` command now auto-updates CHANGELOG.md on every version bump
- `update-all` now creates CHANGELOG.md for registered projects that don't have one

## [2.9.0] - 2026-02-10

### Added
- `gsd-t-setup` command — generates or restructures project CLAUDE.md by scanning codebase, detecting tech stack/conventions, and removing global duplicates

## [2.8.1] - 2026-02-10

### Added
- Workflow Preferences section in global and project CLAUDE.md templates (Research Policy, Phase Flow defaults with per-project override support)

## [2.8.0] - 2026-02-10

### Added
- Backlog management system: 7 new commands (`backlog-add`, `backlog-list`, `backlog-move`, `backlog-edit`, `backlog-remove`, `backlog-promote`, `backlog-settings`)
- 2 new templates (`backlog.md`, `backlog-settings.md`)
- Backlog initialization in `gsd-t-init` with auto-category derivation
- Backlog summary in `gsd-t-status` report
- Backlog section in `gsd-t-help`

### Changed
- Updated `gsd-t-init`, `gsd-t-status`, `gsd-t-help`, CLAUDE-global template, README with backlog integration

## [2.7.0] - 2026-02-09

### Added
- `update-all` CLI command — updates global install + all registered project CLAUDE.md files
- `register` CLI command — manually register a project in the GSD-T project registry
- Auto-registration on `gsd-t init`
- Project registry at `~/.claude/.gsd-t-projects`

## [2.6.0] - 2026-02-09

### Added
- Destructive Action Guard — mandatory safeguard requiring explicit user approval before destructive or structural changes (schema drops, architecture replacements, module removal)
- Guard enforced in global CLAUDE.md, project template, and all execution commands

## [2.5.0] - 2026-02-09

### Changed
- Audited all 27 command files — added Document Ripple and Test Verification steps to 15 commands that were missing them
- All code-modifying commands now enforce doc updates and test runs before completion

## [2.4.0] - 2026-02-09

### Added
- Automatic version bumping in `checkin` command — determines patch/minor/major from change type

## [2.3.0] - 2026-02-09

### Added
- Branch Guard — prevents commits on wrong branch by checking `Expected branch` in CLAUDE.md

## [2.2.1] - 2026-02-09

### Fixed
- `gsd-t-discuss` now stops for user review when manually invoked (was auto-continuing even in manual mode)

## [2.2.0] - 2026-02-09

### Added
- E2E test support in `test-sync`, `verify`, and `execute` commands

## [2.1.0] - 2026-02-09

### Added
- `gsd-t-populate` command — auto-populate living docs from existing codebase
- Semantic versioning system tracked in `progress.md`
- Auto-update README on version changes

## [2.0.2] - 2026-02-07

### Changed
- `gsd-t-init` now creates all 4 living document templates (`requirements.md`, `architecture.md`, `workflows.md`, `infrastructure.md`)
- `gsd-t-scan` cross-populates findings into living docs

## [2.0.1] - 2026-02-07

### Fixed
- Added `gsd-t-brainstorm` to all 4 reference files (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- Fixed workflow diagram alignment

## [2.0.0] - 2026-02-07

### Added
- Renamed package to `@tekyzinc/gsd-t`
- `gsd-t-brainstorm` command — creative exploration, rethinking, and idea generation
- Initialized GSD-T state (`.gsd-t/` directory) on itself

### Changed
- Complete framework rewrite from GSD to GSD-T (contract-driven development)
- npm package with CLI installer (`bin/gsd-t.js`)
- 6 CLI subcommands: install, update, init, status, doctor, uninstall

## [1.0.0] - 2026-02-07

### Added
- Initial GSD-T framework implementation
- Full milestone workflow: partition, discuss, plan, impact, execute, test-sync, integrate, verify, complete
- Agent Teams support for parallel execution
- Living documents system (requirements, architecture, workflows, infrastructure)
