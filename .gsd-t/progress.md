# GSD-T Progress

## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: Ready for next milestone
## Date: 2026-05-06
## Version: 3.21.10

## Current Milestone

None — M47 Focused Visualizer Redesign completed 2026-05-06 (v3.21.10). Ready for next milestone.

**Most recent milestone (M47 Focused Visualizer Redesign)** — COMPLETE 2026-05-06. Shipped v3.21.10. See Completed Milestones below.

## Milestones

| # | Milestone | Status | Version | Domains |
|---|-----------|--------|---------|---------|
| M47 | Focused Visualizer Redesign | COMPLETE | 3.21.10 | 2 domains, 12 tasks, single-day in-session build. D1 viewer-redesign (7 tasks): split-pane HTML scaffolding (`#main-stream` + splitter + `#spawn-stream`); 3-section left rail (Main Session / Live / Completed[≤100, newest first, status-badged, collapsible]); dual SSE wiring via new `connectMain(sessionId)` + bottom-pane `connect()`; bucketing logic consumes D2 `status` field; mouse + keyboard splitter (ArrowUp/Down ±5%, Home/End snap); 4 sessionStorage keys (`selectedSpawnId`, `splitterPct`, `completedExpanded`, `rightRailCollapsed`); right-rail collapse toggle; `appendFrame`/`renderFrame` refactored to thread an optional target via module-scope `renderTarget`. D2 server-helpers (5 tasks): 30s-window `status` field on `listInSessionTranscripts`; new `handleMainSession` + `GET /api/main-session` route (path-traversal guarded via `isValidSpawnId`, `Cache-Control: no-store`); `dashboard-server-contract.md` v1.2.0 → v1.3.0; 9 regression tests. Suite 2058/2060 pass (baseline 2045 + 13 M47 new; 2 pre-existing flakes preserved per success-criterion-5). Goal-Backward PASS (0 placeholder patterns). Red Team grudging pass (13 attack vectors, 0 bugs). |
| M46 | Unattended Iter-Parallel + Worker Fan-Out Completion | COMPLETE | 3.19.00 | 2 domains, single parallel wave, file-disjoint. D1 iter-parallel supervisor (helpers `_runOneIter`/`_computeIterBatchSize`/`_runIterParallel`/`_reconcile` in `bin/gsd-t-unattended.cjs` + `iter-parallel-contract.md` v1.0.0 + `test/m46-d1-iter-parallel.test.js` + `bin/m46-iter-proof.cjs` @ 3.35× speedup). D2 worker-side runDispatch hand-off (new `bin/gsd-t-worker-dispatch.cjs` + `commands/gsd-t-resume.md` additive block + `test/m46-d2-worker-subdispatch.test.js` + `bin/m46-worker-proof.cjs` @ 5.96× speedup + `headless-default-contract.md` v2.0.0 → v2.1.0). Closes five-surface audit gaps 2A (✗ → ✓) and 2B (⚠ → ✓). Iter-parallel scaffold production-default serial; engaged via opt-in `opts.maxIterParallel` — full concurrent-safe work-stealing tracked as backlog #24. |
| M45 | Conversation-Stream Observability | COMPLETE | 3.18.14 | 2 domains, Wave 1 parallel (file-disjoint test fixture for M44 parallelism). D1 viewer-route-fix (4 tasks, 4/4 tests — `GET /transcripts` now serves `gsd-t-transcript.html` with empty `__SPAWN_ID__`). D2 in-session-conversation-capture (6 tasks, 20/20 tests — new `scripts/hooks/gsd-t-conversation-capture.js`; compact-detector fallback target-selection; viewer left-rail `💬 conversation` badge; `conversation-capture-contract.md` v1.0.0). Red Team found BUG-1 MEDIUM (session_id path-traversal); sanitizer fix + regression test landed. |
| M44 | Cross-Domain & Cross-Task Parallelism (in-session AND unattended) | COMPLETE | 3.18.10 | 8 of 9 domains. Task-graph reader, `gsd-t parallel` CLI, file-disjointness prover, pre-spawn economics, spawn-plan visibility, per-CW attribution, command-file integration. |
| M43 | Token Attribution & Always-Headless Inversion | COMPLETED | 3.17.10 | 6 domains across 2 themes. Part A: per-turn in-session usage capture + per-tool attribution + sink unification. Part B: always-headless inversion (channel separation). Contracts: metrics-schema v2, tool-attribution v1.0.0, headless-default v2.0.0. |
| M42 | Live Spawn Transcript Viewer | COMPLETE | 3.16.10 | 3 domains (stream-json tee + SSE renderer + sidebar/kill). |
| M41 | Universal Token Capture Across GSD-T | COMPLETE | 3.15.10 | 5 domains. `captureSpawn`/`recordSpawnRow` wrapper + doc-ripple + backfill + dashboard + lint enforcement. |
| M40 | External Task Orchestrator + Streaming Watcher UI | COMPLETE | 3.14.10 | 7 domains, 30 tasks. D0 operator wall-clock 0.72× vs in-session. |
| M39 | Fast Unattended + Universal Watch-Progress Tree | COMPLETE | 3.13.10 | 3 domains + 6 follow-on patches. |
| M38 | Headless-by-Default + Meter Reduction | COMPLETE | 3.12.10 | Headless spawn default across 7 commands; single-band meter; smart router. |
| M37 | Universal Context Auto-Pause | COMPLETE | 3.11.10 | Strengthened context meter MANDATORY STOP across 5 loop commands. |
| M36 | Cross-Platform Unattended Supervisor Loop | COMPLETE | 3.10.10 | Detached supervisor relay; 3 new slash commands; ScheduleWakeup(270s) watch loop. |
| M35 | No Silent Degradation + Surgical Model Escalation + Token Telemetry | COMPLETE | 2.76.10 | 7 domains, 38 tasks. |
| M34 | Context Meter | COMPLETE | 2.75.10 | Anthropic count_tokens API; replaces task-counter proxy. |

## Completed Milestones

| Milestone | Version | Completed | Tag | Summary |
|-----------|---------|-----------|-----|---------|
| M47 Focused Visualizer Redesign | 3.21.10 | 2026-05-06 | v3.21.10 | 2 domains file-disjoint, single-day in-session build. D1 viewer-redesign (7 tasks): split-pane HTML + 3-section rail (Main/Live/Completed≤100) + dual SSE + mouse/keyboard splitter + 4 sessionStorage persistence keys + right-rail collapse + reactive Live→Completed transition. D2 server-helpers (5 tasks): 30s-window `status` field on `listInSessionTranscripts` + new `GET /api/main-session` (path-traversal guarded, no-cache) + contract v1.3.0 + 9 regression tests. Suite 2058/2060 (M47 +13/+13, 2 pre-existing flakes preserved). Goal-Backward PASS, Red Team grudging pass (0 bugs across 13 vectors). |
| M46 Unattended Iter-Parallel + Worker Fan-Out Completion | 3.19.00 | 2026-04-23 | v3.19.00 | 2 domains file-disjoint, same-day build. D1 iter-parallel scaffold + contract v1.0.0 + 12 unit tests + proof 3.35×; D2 worker sub-dispatch production path + contract v2.0.0 → v2.1.0 + 6 unit tests + proof 5.96×. Closes audit surfaces 2A + 2B. Production default gated serial pending concurrent-safe work-stealing rewrite (backlog #24). Full suite 1946/1946 pass, zero regressions. |
| M45 Conversation-Stream Observability | 3.18.14 | 2026-04-23 | v3.18.14 | 2 domains, parallel Wave 1. D1 viewer-route-fix; D2 in-session-conversation-capture with contract v1.0.0. Red Team caught session_id path-traversal (fix + regression test). |
| M44 Cross-Domain & Cross-Task Parallelism | 3.18.10 | 2026-04-23 | v3.18.10 | 8 of 9 domains. Task-graph, `gsd-t parallel` CLI, disjointness prover, economics estimator, spawn-plan visibility, per-CW attribution. |
| M43 Token Attribution & Always-Headless Inversion | 3.17.10 | 2026-04-21 | v3.17.10 | 6 domains across 3 waves. Part A universal token attribution; Part B always-headless channel separation. |
| M42 Live Spawn Transcript Viewer | 3.16.10 | 2026-04-20 | v3.16.10 | 3 domains. Claude-Code-style per-spawn transcript on `:7433`. |
| M41 Universal Token Capture Across GSD-T | 3.15.10 | 2026-04-20 | v3.15.10 | 5 domains. `bin/gsd-t-token-capture.cjs` + lint enforcement. |
| M40 External Task Orchestrator + Streaming Watcher UI | 3.14.10 | 2026-04-20 | v3.14.10 | 7 domains. Operator 0.72× wall-clock. |
| M39 Fast Unattended + Universal Watch-Progress Tree | 3.13.10 | 2026-04-18 | v3.13.10 | 3 domains + 6 patches. |
| M38 Headless-by-Default + Meter Reduction | 3.12.10 | 2026-04-17 | v3.12.10 | Default headless across 7 commands. |
| M37 Universal Context Auto-Pause | 3.11.10 | 2026-04-16 | v3.11.10 | MANDATORY STOP across 5 commands. |
| M36 Cross-Platform Unattended Supervisor Loop | 3.10.10 | 2026-04-15 | v3.10.10 | Detached supervisor relay. |
| M35 Runway-Protected Execution | 2.76.10 | 2026-04-15 | v2.76.10 | Surgical model selection. |
| M34 Context Meter | 2.75.10 | 2026-04-14 | v2.75.10 | Real CW measurement. |

Older milestones (M33 and earlier) archived under `.gsd-t/milestones/` — see directory listing for the full index.

## Blockers

<!-- No active blockers -->

## Decision Log

> Prior decision log entries preserved in `.gsd-t/milestones/*/progress.md` — see archive snapshots for pre-M47 history.

- 2026-05-06 09:02: [planned] M47 Focused Visualizer Redesign — PLANNED. 2 file-disjoint domains, 12 total tasks. D1 viewer-redesign (7 tasks, single file `scripts/gsd-t-transcript.html`). D2 server-helpers (5 tasks, single file `scripts/gsd-t-dashboard-server.js`). 1 cross-domain checkpoint after D2 publishes status field + `/api/main-session`. 11 REQ entries appended to docs/requirements.md.
- 2026-05-06 09:24: [success] M47 EXECUTED — all 12 tasks landed. D2 (5/5): 30s-window `status` field derivation; new `handleMainSession` + `GET /api/main-session` (path-traversal guarded via `isValidSpawnId`, `Cache-Control: no-store`); contract bumped to v1.3.0. D1 (7/7): split-pane scaffolding; 3-section left rail; dual SSE (`connectMain` + bottom-pane `connect`); rail bucketing consumes D2 status; mouse + keyboard splitter; 4 sessionStorage keys; right-rail collapse; 4 final-fence tests. Suite 2058/2060 (M47 +13/+13; 2 pre-existing flakes preserved). 4 existing viewer-route tests updated for new structure (regex relaxation, sandbox-friendly `_ssGet/_ssSet`).
- 2026-05-06 09:28: [success] M47 VERIFIED — verify-report.md written. All 9 verification dimensions PASS or N/A. Goal-Backward PASS (0 placeholder patterns across 11 requirements). Adversarial Red Team grudging pass (13 attack vectors, 0 bugs). Quality Budget PASS.
- 2026-05-06 09:32: [success] Milestone "M47 Focused Visualizer Redesign" completed — archived to `.gsd-t/milestones/m47-focused-visualizer-redesign-2026-05-06/`, version bumped 3.20.13 → **3.21.10** (minor: feature milestone). Tagged v3.21.10. 2 domains file-disjoint, 12 tasks, single-day in-session build. D1 viewer-redesign (split-pane + 3-section rail + dual SSE + splitter + sessionStorage persistence + reactive Live→Completed transition). D2 server-helpers (30s-window `status` field + `GET /api/main-session` + contract v1.3.0). Suite 2058/2060 (+13 new M47 tests, 0 regressions). Out-of-tree: visualizer redesign now ships via `gsd-t install` / `gsd-t update-all` — registered projects pull the new viewer on next sync.
- 2026-05-06 11:06: [debug] M48 viewer rendering regressions — 4 post-M47 bugs filed in `/tmp/m48-debug-prompt.txt`. Bug 1: header/title hardcoded to "GSD-T Transcript", should be project basename. Bug 2: frame timestamps all identical within a render batch (renderer used a per-batch `new Date()` instead of parsing `frame.ts`). Bug 3: `user_turn`/`assistant_turn`/`session_start` frames rendered as raw `JSON.stringify` dumps (no per-type handlers). Bug 4: clicking the in-session rail entry pinned the same content into both top and bottom panes (both connect()/connectMain() opened SSE to the same NDJSON). Reproduction: existing in-session NDJSON files (e.g. `.gsd-t/transcripts/in-session-2d4b41a3-...ndjson`) carry `{"type":"user_turn","ts":"2026-05-06T...","content":"..."}` frames — the previous renderer collapsed them to JSON dumps with identical batch timestamps.
- 2026-05-06 11:06: [success] M48 FIXED — 4 bugs landed in 2 files. `scripts/gsd-t-transcript.html`: `__PROJECT_NAME__` placeholder in `<title>` + header `.title` div; new `frameTs(frame, fallback)` helper parses per-frame `ts`; `connect()`/`connectMain()` thread `renderAt = frameTs(frame, arrivedAt)` through `renderFrame()`; defensive guard inside `renderFrameInner`; 4 new chat-bubble renderers (`renderUserTurn`/`renderAssistantTurn`/`renderSessionStart`/`renderToolUseLine`) + dispatch arms before the JSON.stringify fallback; 4 separate guards keep `in-session-*` ids out of the bottom pane (rail click, initial bottom-pane resolution, hashchange handler, maybeAutoFollow filter); CSS rules for new bubble types + `(truncated)` tag. `scripts/gsd-t-dashboard-server.js`: `_escapeHtml()` helper; `__PROJECT_NAME__` substitution in `handleTranscriptsList` + `handleTranscriptPage` (function-form `replace` to defuse `$&`/`$1` backreferences in basename — Red Team BUG-1).
- 2026-05-06 11:06: [success] M48 VERIFIED — `test/m48-viewer-rendering-fixes.test.js` 23/23 pass (4 Bug-1 HTTP-server tests, 4 Bug-2 static + 1 functional eval-extract probe, 7 Bug-3 dispatch+CSS+truncation tests, 4 Bug-4 guard tests, 3 Red Team regression tests). `test/m44-transcript-timestamp.test.js` updated for the `renderAt`/`arrivedAt` rename (semantics preserved). Full suite 2081/2083 — only 2 failing tests are pre-existing env-sensitive flakes (`buildEventStreamEntry`, `writer_shim_safe_empty_agent_id_auto_mints_id`) carried over from the M47 2058/2060 baseline. Red Team adversarial QA: initial sweep found 1 MEDIUM (`$&`-corruption) + 1 LOW (legacy renderTree click handler) + 1 test-quality recommendation; all addressed. Re-verification: GRUDGING PASS — no new bugs introduced.
