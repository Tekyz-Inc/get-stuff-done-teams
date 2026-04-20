# GSD-T Progress

## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: M40 PLANNED — External Task Orchestrator + Streaming Watcher UI
## Date: 2026-04-19
## Version: 3.13.16 (targeting 3.14.10 at M40 complete)

## Current Milestone

**M40 — External Task Orchestrator + Streaming Watcher UI** (DEFINED)

### Goal
Build an external JS orchestrator that drives in-session Claude one task per spawn — short-lived, fresh context per task, never long enough to compact. Pair it with a dumb local streaming watcher UI that renders all workers' stream-json output as a continuous claude.ai-style feed at zero Claude token cost.

### Core problem it solves
M8-sized work (~40 tasks across 8 domains) exceeds one Claude Code session's context budget. In-session risks mid-execute compaction that loses cross-file reasoning chains. The unattended supervisor is 5–10× slower and gives only per-iter (5-min) visibility. Both fail on the same workload.

### Success criteria (measurable)
1. **Speed parity or better**: orchestrator wall-clock ≤ in-session wall-clock on a single-domain benchmark (D0 go/no-go gate). Ideal: faster due to process-level parallelism.
2. **No compaction**: no worker session exceeds one task; compaction is architecturally impossible during an M40 run.
3. **Live streaming UI**: `localhost:7842` renders stream-json from all active workers with claude.ai-style layout, task-boundary banners, and durable JSONL backlog. Zero Claude token cost in the UI process.
4. **Parallelism**: per-wave `Promise.all` over parallel-safe tasks, default 3 concurrent workers, max 15 (Team Mode contract §15). Each worker is a separate OS process with its own context window.
5. **Recovery**: if orchestrator crashes mid-run, resume from durable JSONL + progress.md state.

### Scope
**In scope**: orchestrator-core (task queue + claude-p spawn + completion detection + kill/respawn + wave join), task-brief-builder (2–5KB self-contained per-task briefs), completion-protocol contract (commit on expected branch + progress.md entry + test exit), stream-feed-server (ws + JSONL persistence), stream-feed-ui (HTML/JS claude.ai-style renderer), recovery-and-resume.

**Explicitly NOT in scope**: retiring `gsd-t-unattended` (stays for overnight/idle), rewriting `gsd-t-execute` subagent flow (unchanged — M40 is a new orchestrator, not a replacement), mobile UI, remote/hosted watcher (localhost only), multi-project orchestration (single project per orchestrator run).

### Go/no-go gate (D0, built first)
Benchmark orchestrator vs in-session on the same domain. If orchestrator is not ≥ in-session, kill M40 before building the UI (D4/D5). No sunk-cost commitment. User requirement: *"It's not worth doing if it doesn't run at least as fast[er]."*

### Version target
v3.14.10 (minor bump — new major feature, not a fix).

## Milestones

| # | Milestone | Status | Version | Domains |
|---|-----------|--------|---------|---------|
| M40 | External Task Orchestrator + Streaming Watcher UI | PLANNED | 3.14.10 (target) | 7 domains, 28 tasks in 4 waves: W0 = 15 tasks (5 sub-groups including D0 gate) + W2 = 1 task + W3 = 11 tasks + W4 = 4 tasks |
| M39 | Fast Unattended + Universal Watch-Progress Tree | COMPLETE | 3.13.10 | 3 domains: D2 progress-watch, D3 parallel-exec, D4 cache-warm-pacing |
| M38 | Headless-by-Default + Meter Reduction | COMPLETE | 3.12.10 | 5 domains in 2 waves: Wave 1 sequential (m38-headless-spawn-default → m38-meter-reduction); Wave 2 parallel (m38-unattended-event-stream + m38-router-conversational + m38-cleanup-and-docs) |
| M37 | Universal Context Auto-Pause | COMPLETE | 3.11.10 | Archived (1 domain: m37-auto-pause; context-meter-contract v1.2.0; 5 command files updated; 1228/1228 tests) |
| M36 | Cross-Platform Unattended Supervisor Loop | COMPLETE | 3.10.10 | Archived (6 domains) |
| M35 | No Silent Degradation + Surgical Model Escalation + Token Telemetry | COMPLETE | 2.76.10 | Archived (7 domains; 38 tasks) |
| M34 | Context Meter | COMPLETE | 2.75.10 | Archived |

## Completed Milestones

| Milestone | Version | Completed | Tag | Summary |
|-----------|---------|-----------|-----|---------|
| M39 Fast Unattended + Universal Watch-Progress Tree | 3.13.10 | 2026-04-18 | v3.13.10 | 3 domains (D2 progress-watch + D3 parallel-exec + D4 cache-warm-pacing); 1240/1240 tests; Red Team GRUDGING PASS; plus 6 follow-on patches v3.13.11–3.13.16 |
| M38 Headless-by-Default + Meter Reduction | 3.12.10 | 2026-04-17 | v3.12.10 | Headless spawn default across 7 commands; context meter reduced to single-band; 7 commands deleted; event stream JSONL; smart router intent classifier; 5 contracts folded; 1176/1177 tests |
| M37 Universal Context Auto-Pause | 3.11.10 | 2026-04-16 | v3.11.10 | Strengthened context meter additionalContext from suggestion to MANDATORY STOP instruction; context-meter-contract v1.2.0; CLAUDE-global Universal Auto-Pause Rule section; Step 0.2 in 5 loop commands; 1228/1228 tests |
| M36 Cross-Platform Unattended Supervisor Loop | 3.10.10 | 2026-04-15 | v3.10.10 | Detached supervisor relay for 24h+ unattended milestone execution; 3 new slash commands (unattended/unattended-watch/unattended-stop); ScheduleWakeup(270s) in-session watch loop; /clear+/resume auto-reattach via Step 0; cross-platform (macOS/Linux/Windows except sleep-prevention); safety rails (gutter/blocker/timeout); 1226/1226 tests |
| M35 Runway-Protected Execution | 2.76.10 | 2026-04-15 | v2.76.10 | Removed silent quality degradation; surgical per-phase model selection; pre-flight runway estimator with headless auto-spawn; 18-field per-spawn token telemetry; detect-only optimization backlog; 985/985 tests |
| M34 Context Meter | 2.75.10 | 2026-04-14 | v2.75.10 | Real context-window measurement via Anthropic count_tokens API; replaces task-counter proxy entirely; 941/941 tests |

Older milestones (M33 and earlier) archived under `.gsd-t/milestones/` — see directory listing for the full index.

## Blockers
<!-- No active blockers -->

## Decision Log

> Prior decision log entries preserved in `.gsd-t/milestones/*/progress.md` — see archive snapshots (most recently `M39-fast-unattended-watch-progress-2026-04-18/progress.md`) for pre-M39 history.

- 2026-04-18 13:15: [verify] M39 Fast Unattended + Universal Watch-Progress Tree → VERIFIED. Retrospective book-keeping verify: M39 code shipped across v3.13.10 (Wave 1 baseline with Red Team GRUDGING PASS) + six follow-on patches v3.13.11–v3.13.16 covering unattended supervisor triple-fix, debug-ledger tolerance, sweep self-protection by package-name identity, narrow gitignore, and `/gsd-t-unattended` overnight-only positioning. Tests: 1240/1240 unit pass (net +12 vs 1228 at M37 close). E2E: N/A (CLI package, no playwright.config.*). All 4 success criteria met: (1) parallel-within-iter Team Mode prompt shipped in `_spawnWorker` with §15 v1.3.0, (2) universal watch-progress tree renders under every `--watch` via `bin/watch-progress.js` + 189 shims across 17 commands + `watch-progress-contract.md` v1.0.0, (3) cache-warm pacing DEFAULT_WORKER_TIMEOUT_MS=270000 + `--worker-timeout` flag + §16 v1.3.0, (4) bee-poc speedup inherited on v3.13.11+ after supervisor relaunch. No CRITICAL/HIGH findings; no remediation required. Status: IN PROGRESS → VERIFIED. Next: auto-invoke /gsd-t-complete-milestone.
- 2026-04-17 21:30: [debug] v3.13.10→3.13.11 — unattended supervisor reliability triple-fix (bee-poc 15-min hang fallout). Bug 1 (P0): supervisor watchdog visibility — `runMainLoop` now writes a deterministic `[worker_timeout] iter=N budget=Nms elapsed=Nms` line to `run.log` when the spawnSync timeout fires (exit 124), so operators tailing the log can see when the 270 s watchdog (§16) kicks in. State.json still gets a fresh lastTick + lastExit=124 post-timeout. Note: the real root cause of bee-poc's hang was that v3.13.10 (which had the 270 s timeout) was never published to npm — bee-poc was running against installed v3.12.15 with the 1-hour timeout. Shipping v3.13.11 propagates the fix. Bug 2 (P0): worker cwd invariant — `_spawnWorker` prompt now carries an explicit `# CWD Invariant` section instructing the worker to (a) compare `$(pwd)` to `$GSD_T_PROJECT_DIR` as the first Bash call and (b) scope any `cd` inside a subshell. Closes the "Shell cwd was reset" silent-wrong-repo failure mode. Bug 3 (P2): IS_STALE determinism — Step 2 of `commands/gsd-t-unattended-watch.md` now computes `const IS_STALE = tickAgeMs !== null && tickAgeMs > 540000;` and emits it via `out('IS_STALE', …)`. Step 6a reads the flag verbatim instead of re-interpreting the threshold — fixes Haiku's occasional "⚠️  stale" at 6-min tick age (358 s). Boundary cases locked in: 539 s=false, 540 s=false (strict >), 541 s=true. Reproduction tests: `test/unattended-triple-fix-v3-13-11.test.js` (8 assertions across 8 it-blocks). Files: `bin/gsd-t-unattended.cjs`, `commands/gsd-t-unattended-watch.md`, `test/unattended-triple-fix-v3-13-11.test.js` (NEW), `package.json`, `CHANGELOG.md`. Tests: Unit 1235/1235 pass (was 1227, +8 new). E2E: N/A.
- 2026-04-17 13:33: [execute] M39 Wave 1 — all 3 domains landed + Red Team GRUDGING PASS. D2 progress-watch: `scripts/gsd-t-watch-state.js` CLI, `bin/watch-progress.js` tree builder + renderer, `.gsd-t/contracts/watch-progress-contract.md` v1.0.0, 189 shims across 17 workflow commands, append-below-banner integration in 3 watch printers. D3 parallel-exec: `_spawnWorker` prompt teaches Team Mode (intra-wave ≤15 parallel subagents, inter-wave sequential), contract §15 v1.3.0. D4 cache-warm-pacing: `DEFAULT_WORKER_TIMEOUT_MS=270000` (was 3600000) + `--worker-timeout` CLI flag parsed + config.workerTimeoutMs merge, contract §16 v1.3.0. Red Team (opus) FAIL→fix→GRUDGING PASS: fixed BUG-1 through BUG-8. Tests: 1227/1227 pass (1186 baseline + 41 new tests across 6 new test files).
- 2026-04-17 20:00: [milestone-planned] M39 PLANNED — D2: 12 tasks (progress-watch renderer + 17 command shims), D3: 4 tasks (worker Team Mode prompt + contract §15), D4: 3 tasks (270s worker timeout + contract §16). Total: 19 tasks, all in Wave 1 parallel.
- 2026-04-17 19:45: [milestone-partitioned] M39 PARTITIONED into 3 domains, all in Wave 1 (parallel). D2 d2-progress-watch, D3 d3-parallel-exec, D4 d4-cache-warm-pacing. Shared files: `bin/gsd-t-unattended.cjs` and `unattended-supervisor-contract.md` — additive, no coordination required.
- 2026-04-17 19:30: [milestone-defined] M39 — Fast Unattended + Universal Watch-Progress Tree committed to progress.md. Target version 3.13.10. 3 domains: D2 progress-watch, D3 parallel-exec, D4 cache-warm-pacing. Rationale: bee-poc pid 69481 has been grinding unattended on v3.12.13 for 45+ min on a milestone that in-session finishes in 10–15 min — root cause is worker prompt at `bin/gsd-t-unattended.cjs::_spawnWorker` not teaching Team Mode. Ready for partition.
- 2026-04-18 15:00: [complete-milestone] M39 Fast Unattended + Universal Watch-Progress Tree COMPLETED — v3.13.16 (shipping tag v3.13.10 + patches v3.13.11–v3.13.16). Archived to `.gsd-t/milestones/M39-fast-unattended-watch-progress-2026-04-18/`. Tests: 1240/1240 unit pass. E2E: N/A. [goal-backward-pass] 4/4 success criteria verified. [distillation] No repeating patterns from event stream. [patch-lifecycle] No promotions/deprecations. Token optimizer: no new recommendations.
- 2026-04-19 18:00: [milestone-planned] M40 PLANNED — 28 tasks across 7 domains. Wave 0 (foundation+gate): 15 tasks in 5 sub-groups (0a independent starts: D3-T1, D1-T1, D2-T1, D0-T1; 0b same-domain unlock; 0c cross-domain integration; 0d orchestrator CLI ready; 0e THE GATE = D0-T2 benchmark driver → D0-T3 verdict). Wave 2 (after D0 PASS): D1-T6 full worker. Wave 3 (stream feed): D4 Tasks 1-5 + D5 Tasks 1-5 + D1-T7 stream wiring. Wave 4 (recovery): D6 Tasks 1-4. REQ traceability appended to `docs/requirements.md` with 5 M40 REQs (REQ-M40-01 through REQ-M40-05), all mapped to tasks. Scope-validation: no task >5 files, no cross-domain dep >3 per task. No duplicate operations across domains (D1/D2/D3 roles are orthogonal; D4/D5 split by transport vs rendering). Tests baseline 1240/1240 pass. Ready for Wave 0 execute.
- 2026-04-19 17:45: [milestone-partitioned] M40 PARTITIONED into 7 domains across 5 waves. D0 speed-benchmark (KILL-SWITCH GATE — Wave 0), D1 orchestrator-core, D2 task-brief-builder, D3 completion-protocol (contract-only, lands first), D4 stream-feed-server, D5 stream-feed-ui, D6 recovery-and-resume. Wave 0 assembles D3 contract + D1/D2 minimal slices + D0 benchmark run — if benchmark FAIL, milestone halts before D4/D5 ever start (per user: "It's not worth doing if it doesn't run at least as fast[er]"). 4 new contracts written: task-brief-contract.md v1.0.0, completion-signal-contract.md v1.0.0, stream-json-sink-contract.md v1.0.0, wave-join-contract.md v1.0.0. Existing code dispositions locked in: `bin/gsd-t-unattended.cjs` INSPECT, existing events JSONL USE, `scripts/gsd-t-agent-dashboard*` (untracked, 424+1043 LOC) INSPECT-then-decide for D4/D5 promotion-or-rewrite, `bin/model-selector.js` + `bin/token-budget.cjs` NOT USED inside workers (one-shot workers don't need context meter), `commands/gsd-t-execute.md` UNCHANGED, unattended supervisor UNCHANGED. Five ambiguity-locks recorded (claude.ai-style = visual conventions not clone; streaming = replay+tail; zero-token = no LLM at all; parallelism = child_process.spawn; recovery = operator-initiated not auto). Baseline tests: 1240/1240 pass. Domains ready for `/gsd-t-plan` to fill tasks.md files.
- 2026-04-19 11:00: [milestone-defined] M40 — External Task Orchestrator + Streaming Watcher UI committed to progress.md. Target v3.14.10 (minor bump, new major feature). Rationale: M8-sized work exceeds single-session context; in-session compaction loses cross-file reasoning; unattended is 5–10× slower with 5-min visibility gap. Solution: external node orchestrator spawns short-lived `claude -p` workers (one task per spawn = no compaction possible), pipes stream-json to a dumb local watcher UI (`localhost:7842`) that renders claude.ai-style continuous feed at zero Claude token cost. Per-wave Promise.all parallelism (default 3, max 15 per Team Mode §15) — true process-level, not subagent-level. D0 speed-benchmark gate built first: if orchestrator ≯ in-session on same domain, kill M40 before D4/D5 UI work. Seven proposed domains (D0–D6) — partition will validate/adjust. Ready for partition.
