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
