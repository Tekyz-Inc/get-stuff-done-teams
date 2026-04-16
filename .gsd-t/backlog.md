# Backlog

## 1. Agentic Workflow Architecture
- **Type:** feature | **App:** gsd-t | **Category:** architecture
- **Added:** 2026-02-13
- Evolve GSD-T commands from markdown instruction files into independent, spawnable agents. Each command becomes an agent that can: receive work requests and bid on them, work in parallel with other agents, communicate through contracts as shared interfaces, and self-organize into teams. Blocked by: Claude Code agent teams graduating from experimental status, agent spawn cost/latency improvements. See brainstorm session 2026-02-13 for full pros/cons analysis.

## 2. Living docs staleness detection
- **Type:** improvement | **App:** gsd-t | **Category:** commands
- **Added:** 2026-02-19
- gsd-t-health should flag docs with only placeholder content as STALE, not OK — existence check is insufficient if the file is full of `{description}` tokens. gsd-t-scan Step 5 should self-check after writing living docs and warn if infrastructure.md still contains only placeholder text (no commands, URLs, or real content found in codebase). Commands that depend on infrastructure knowledge should verify the doc has real content before proceeding, not silently consume placeholder text and fall back to guessing.

## 3. Auto-cleanup test data after test runs
- **Type:** improvement | **App:** gsd-t | **Category:** cli
- **Added:** 2026-02-19
- All temporary files, directories, or state created during the test suite must be automatically removed when the test run completes (pass or fail). Tests that currently leave artifacts behind can cause false positives/negatives in subsequent runs and pollute the working directory.

## 4. DB integration testing capability in QA agent
- **Type:** feature | **App:** gsd-t | **Category:** commands
- **Added:** 2026-02-19
- GSD-T currently has no built-in DB testing — it only runs whatever test suite already exists in the project. Add a DB testing step to the QA agent (or a new gsd-t-db-test command) that reads docs/infrastructure.md for the test DB connection, runs migrations against it, seeds test data, executes the project's DB test suite, and tears down the test DB on completion. Should be DB-agnostic (Postgres, SQLite, Supabase, etc.) and driven by commands documented in infrastructure.md.

## 5. GSD-T Workflow Visualizer
- **Type:** feature | **App:** gsd-t | **Category:** ux
- **Added:** 2026-02-25
- Add a `gsd-t-visualize` command (or `gsd-t-status --visual` flag) that renders the current project's workflow state as a visual diagram. Should show: milestone → domain → phase progression with status indicators (✅ complete, 🔄 in-progress, ⏳ pending, 🔴 blocked); contract connections between domains; task-level detail on demand; and the full GSD-T phase pipeline (partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete) with the current position highlighted. Output options: ASCII/Unicode tree for terminal display, an HTML report for sharing, or a Mermaid diagram that renders in GitHub/VS Code. Reads from `.gsd-t/progress.md`, `.gsd-t/domains/*/tasks.md`, and `.gsd-t/contracts/` — no extra state needed. Goal: give the user an at-a-glance picture of where a milestone stands without having to parse markdown files manually.

## 6. Observability: Measurement, Logging, and Telemetry (SigNoz)
- **Type:** feature | **App:** gsd-t | **Category:** commands
- **Added:** 2026-02-25
- Integrate SigNoz (https://github.com/SigNoz/signoz) as the recommended observability stack for GSD-T-managed projects. SigNoz is an open-source, self-hosted alternative to Datadog/New Relic that provides distributed tracing, metrics, and logs in a single pane. GSD-T should support: gsd-t-setup detecting or prompting for observability choice, infrastructure.md documenting the SigNoz connection and dashboard URL, gsd-t-execute optionally wiring OpenTelemetry SDK into new services, and a health check for whether the project has observability configured. Enables teams to measure performance, debug production issues, and track error rates without vendor lock-in.

## 7. AI Evals Framework Integration
- **Type:** feature | **App:** gsd-t | **Category:** commands
- **Added:** 2026-02-25
- Add AI evaluation capabilities to GSD-T for projects that use LLMs. Reference: https://github.com/aishwaryanr/awesome-generative-ai-guide/blob/main/free_courses/ai_evals_for_everyone/README.md. GSD-T should support: a `gsd-t-evals` command (or integration into gsd-t-qa) that runs LLM output evaluation suites, defines eval criteria in contracts (expected output shape, quality thresholds, hallucination checks), integrates with eval frameworks (RAGAS, LangSmith, PromptFoo, or custom), and reports pass/fail against defined quality gates. The QA agent should be aware of eval steps when the project contains AI components. Living docs (requirements.md, architecture.md) should document eval criteria alongside functional requirements.

## 8. Auto-Setup Graph Dependencies
- **Type:** feature | **App:** gsd-t | **Category:** cli
- **Added:** 2026-03-19
- Graph Readiness Check that runs during `gsd-t-version-update` and `gsd-t-version-update-all`. Hybrid approach: auto-fix what's safe, report and prompt for heavyweight installs. Checks: (1) Docker installed — if missing, show install instructions with copy-paste commands; (2) Neo4j container running — if missing, offer to pull and start `docker run -d --name gsd-t-neo4j ...`; (3) CGC (CodeGraphContext) installed — if missing, offer `pip install codegraphcontext`; (4) Project graph indexed — if missing, run `indexProject()` automatically. Diagnostic mode outputs a checklist with status indicators (pass/fail) and exact commands needed. Should not silently install heavyweight dependencies (Docker) without user confirmation — report what's needed and let the user decide.

## 9. Provider Failure Warnings + Auto-Recovery
- **Type:** feature | **App:** gsd-t | **Category:** commands
- **Added:** 2026-03-19
- When the graph provider chain falls back (CGC → native → grep), warn the user clearly instead of silently degrading. Each fallback should display: what failed, why it failed, what the user loses, and how to fix it. Examples: "⚠ CGC unavailable (Neo4j container stopped) — falling back to native. Deep call chain analysis disabled. Fix: `docker start gsd-t-neo4j`" or "⚠ Native index missing — falling back to grep. Entity lookup, dead code detection, and contract mapping unavailable. Fix: run `gsd-t graph index`". Auto-recovery should attempt corrective actions before falling back: check if Docker container exists but is stopped (start it), check if index files exist but are corrupt (rebuild). Only fall back after recovery attempts fail. Priority: high — silent fallback means silent quality degradation.

## 10. Cross-Project Shared Learning via Git
- **Type:** feature | **App:** gsd-t | **Category:** commands
- **Added:** 2026-03-31
- Enable GSD-T learning (ELO scores, metrics, QA patterns, event history) to be shared across users and machines via a centralized git repository. Currently, `.gsd-t/metrics/`, `.gsd-t/events/`, and `.gsd-t/qa-issues.md` are per-project and travel with each project's git repo — but cross-project ELO comparisons and aggregated pattern learning are local-only. Proposed approach: a `gsd-t-learning` command that syncs anonymized metrics to a shared "learning hub" repo (e.g., `gsd-t-learning-hub` on GitHub). Hub stores: aggregated ELO benchmarks by stack/project-type, common QA failure patterns and fixes, task duration baselines by complexity, stack rule effectiveness scores. Privacy: only aggregate metrics are shared — no source code, file paths, or proprietary content. Users opt-in per project. Benefits: new GSD-T users start with community-learned baselines instead of cold-start, teams share institutional knowledge across projects, stack rules evolve based on real-world effectiveness data.

## 11. Docker Support (Enterprise)
- **Type:** feature | **App:** gsd-t | **Category:** infrastructure
- **Added:** 2026-03-22
- Containerized GSD-T execution for enterprise security compliance. Dockerfile + docker-compose with Node.js + Claude Code + GSD-T pre-installed. Vault-injected secrets (no API keys on developer machines). Ephemeral containers — no credential persistence after run. Volume-mounted project directory. Egress-only network config. Primary interface is `gsd-t headless` (M23). PRD: docs/prd-gsd2-hybrid.md section 4.8, milestone M24. Exit criteria: `docker-compose up` runs a headless milestone, secrets via env vars (Vault-compatible), container is ephemeral, documentation complete. Depends on M23 (Headless Mode) being complete.

## 12. Integration smoke test for infrastructure config changes
- **Type:** improvement | **App:** gsd-t | **Category:** cli
- **Added:** 2026-04-04
- After writing infrastructure config, verify it took effect by running the corresponding check command. Currently the Red Team can't catch "wrote to the wrong file" bugs because tests validate code correctness, not environment integration. Add a post-config verification step to the install/update flow that confirms each config is discoverable by the target system. Origin: Figma MCP was written to settings.json but Claude Code reads MCP servers from ~/.claude.json — only caught by manual testing in a live session. Verification matrix: MCP servers → `claude mcp list` (confirm server appears); Heartbeat hooks → read settings.json hooks array (confirm entry exists); Update check hook → read settings.json SessionStart hook (confirm entry exists); Auto-route hook → read settings.json UserPromptSubmit hook (confirm entry exists); Global CLAUDE.md → read `~/.claude/CLAUDE.md` (confirm GSD-T section present); Slash commands → `ls ~/.claude/commands/` (confirm expected files exist); CGC/graph engine → `cgc --version` or equivalent health check; Utility scripts → `ls ~/.claude/scripts/` (confirm expected files exist).

## 13. Agent Topology Dashboard Redesign
- **Type:** ux | **App:** gsd-t | **Category:** commands
- **Added:** 2026-04-15
- Redesign `scripts/gsd-t-agent-dashboard.html` to match the reference design (dark card-based layout with colored borders, icons, status indicators). Key changes: (1) Agent names should reflect GSD-T roles (Research, Audit, Impact, Coding, Doc Update, QA, Red Team) — map from events data instead of showing generic types (General, Explore). (2) Each node card shows: agent role name, status indicator (Active/Thinking/Idle/Tool Call), current activity description, model name, elapsed time, tool call count, iteration count, token count. (3) Layout should be a proper directed graph with parent-child edges and clear connection lines — not the current flat row of tiny crammed nodes. (4) Clicking a node opens a right-side detail panel showing: full list of tool calls made by that agent, tokens consumed per tool call, timeline of actions, total duration and token summary. (5) Server (`scripts/gsd-t-agent-dashboard-server.js`) may need enriched SSE events to supply tool-call-level detail per agent. Reference image provided by user 2026-04-15.
