# GSD-T Progress

## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: Ready for next milestone
## Date: 2026-05-03
## Version: 3.20.10

## Current Milestone

None — ready for next milestone.

**Most recent milestone (M46 Unattended Iter-Parallel + Worker Fan-Out Completion)** — COMPLETE 2026-04-23. Shipped v3.19.00. See Completed Milestones below. Full snapshot preserved in `.gsd-t/milestones/m46-unattended-iter-parallel-2026-04-23/`.

## Milestones

| # | Milestone | Status | Version | Domains |
|---|-----------|--------|---------|---------|
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

> Prior decision log entries preserved in `.gsd-t/milestones/*/progress.md` — see archive snapshots for pre-next-milestone history.

- 2026-04-23: [success] Milestone "M46 Unattended Iter-Parallel + Worker Fan-Out Completion" completed — 2 domains file-disjoint, same-day in-session build. D1 iter-parallel supervisor scaffold (4 helpers + contract v1.0.0 + 12 tests + 3.35× proof). D2 worker sub-dispatch (new `bin/gsd-t-worker-dispatch.cjs` + contract v2.0.0→v2.1.0 + 6 tests + 5.96× proof). Audit surfaces 2A (✗→✓) + 2B (⚠→✓) closed. Production default for iter-parallel gated serial pending concurrent-safe rewrite (backlog #24). Full suite 1946/1946 pass. v3.19.00.
- 2026-05-03: [feature] Date+version+currency banner unified across 3 emission sites — `dateStamp()` helper added to `scripts/gsd-t-update-check.js` (exported); session-start hook, `/gsd-t-status` Step 0.0, and `bin/headless-auto-spawn.cjs` orchestrator banner all now emit `Day: Mon DD, YYYY,  GSD-T v{version} — CURRENT` (system local time). "up to date" → "CURRENT" everywhere in version-status output. `~/.claude/CLAUDE.md` Update Notices section updated to match. Solves multi-day session continuity — every read-back is dated at the top. Suite 1946/1946 pass post-change.
- 2026-05-03: [feature] Live-clock dated banner + PreToolUse date guard (v3.20.10) — `scripts/gsd-t-auto-route.js` UserPromptSubmit hook now emits `[GSD-T NOW] Day: Mon DD, YYYY HH:MM:SS TZ` once per user turn (live system clock, every project). New `scripts/gsd-t-date-guard.js` PreToolUse hook on Write|Edit blocks any tool call whose content contains a timestamp drifting more than ±5 min from the live clock. Validates decision-log entries, `continue-here` filenames, banners, and labeled stamps; ignores pre-existing context in Edit; allowlists machine-written paths (`events/`, `transcripts/`, `metrics/`, archives, log files); fails open on internal error. 10/10 smoke tests pass. CURRENT-state version banner stripped of changelog URL (was noise — kept on UPDATE/AUTO-UPDATE). `~/.claude/CLAUDE.md` + `templates/CLAUDE-global.md` rewritten: §Update Notices now mandates `[GSD-T NOW]` as the only date source; new §Live Clock Rule documents the guard. Why: hand-written timestamps were silently sourced from `currentDate` (frozen at session start), corrupting decision logs / archive filenames / memory entries on multi-day sessions. Red Team principle applied — directives are not safety properties; the hook is the enforcement.
