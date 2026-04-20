# Milestone Complete: M40 — External Task Orchestrator + Streaming Watcher UI

**Completed**: 2026-04-20
**Duration**: 2026-04-19 (defined) → 2026-04-20 (verified)
**Status**: VERIFIED
**Version**: 3.13.16 → 3.14.10

## What Was Built

An external JS orchestrator that drives in-session Claude one task per spawn — short-lived, fresh context per task, never long enough to compact — paired with a zero-Claude-cost local streaming watcher UI that renders all workers' stream-json output as a continuous claude.ai-style feed.

Core problem solved: M8-sized work (~40 tasks across 8 domains) exceeds one Claude Code session's context budget. In-session risks mid-execute compaction. The unattended supervisor is 5–10× slower. Both failed on the same workload. M40 ships a third option that is (a) architecturally compaction-free, (b) faster than in-session on 20-task workloads (0.72× wall-clock in the operator D0 gate), and (c) fully observable via a local HTML dashboard.

## Domains

| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| D0 d0-speed-benchmark | 3 | `bin/gsd-t-benchmark-orchestrator.js` + 20-task/3-wave/4-domain fixture; PASS verdict 226s orch vs 316s in-session |
| D1 d1-orchestrator-core | 7 | `bin/gsd-t-orchestrator.js` (queue + claude-p spawn + wave-join + SIGINT), `bin/gsd-t-orchestrator-worker.cjs`, `bin/gsd-t-orchestrator-queue.cjs`, `bin/gsd-t-orchestrator-config.cjs`; task-boundary + wave-boundary frames; workerPid attribution; stream-feed client wiring |
| D2 d2-task-brief-builder | 3 | `templates/prompts/m40-task-brief.md` + compactor (2–5 KB self-contained per-task briefs) |
| D3 d3-completion-protocol | 2 | `bin/gsd-t-completion-check.cjs` assertCompletion (commit on expected branch + progress.md entry + test exit) |
| D4 d4-stream-feed-server | 6 | `scripts/gsd-t-stream-feed-server.js` (POST /ingest, WS /feed?from=N replay, 127.0.0.1:7842, JSONL persist-before-broadcast), `scripts/gsd-t-token-aggregator.js` (parses assistant + result usage, writes `token-usage.jsonl` v1, rewrites token-log.md in place) |
| D5 d5-stream-feed-ui | 6 | `scripts/gsd-t-stream-feed.html` (47.5 KB, zero-dep, dark-mode, task/wave banners with duration + usage chips, token corner bar, localStorage filters, auto-scroll pause + jump-to-live) |
| D6 d6-recovery-and-resume | 4 | `bin/gsd-t-orchestrator-recover.cjs` (recoverRunState + writeRecoveredState + archiveState; ambiguous tasks flagged for operator triage, never silently claimed done), `--resume` + `--no-archive` CLI flags, `/gsd-t-resume` Step 0.3 integration, 24 unit tests |

## Contracts Defined/Updated
- `stream-json-sink-contract.md` v1.0.0 → **v1.1.0** — new §"Usage field propagation" documenting `{type:"assistant"}.message.usage` (per-turn) vs `{type:"result"}.usage` (authoritative)
- `wave-join-contract.md` — codified SIGINT-mid-wave + second-fail-halt + 3-wave success scenarios
- `completion-signal-contract.md` — assertCompletion surface: ok / missing[] / details{}
- `metrics-schema-contract.md` — token-usage.jsonl schema v1

## Key Decisions
- 2026-04-20 13:25 **[benchmark-gate] PASS** — orchestrator 226s vs in-session 316s (0.72×, threshold 1.05×). No sunk-cost commitment. Waves 2–4 unlocked.
- 2026-04-20 13:45 **[milestone-scope-change]** — fold token-aggregator into M40 D4 (+ token-usage panel into D5); define M41 Universal Token Capture as follow-on milestone. Target version unchanged at v3.14.10.
- 2026-04-20 02:45 **[debug]** three completion-check bugs fixed: (1) task ID form mismatch (`bench-d1:T1` vs `bench-d1-t1`), (2) ownedPatterns never plumbed, (3) fixture byproducts counted as uncommitted.
- 2026-04-20 13:12 **[debug]** benchmark baseline integrity fix — enforced one-commit-per-task discipline on in-session side + new INVALID verdict when audit fails. Prior run was apples-to-oranges (1 bulk commit vs 20 per-task commits).
- D6 ambiguous-task policy — commit present but no progress.md entry → `status=ambiguous` + flagged for operator triage, never silently claimed done. Matches user standing directive.

## Test Coverage
- Unit tests: **1421/1421 pass** (up from 1240 at M39 close, +181 across M40)
- M40-specific test files: 16
- E2E: N/A (CLI package)
- Coverage gaps: 0
- Stale/dead tests: 0
- First-pass rate: 100% on D6

## Git Tag
`v3.14.10`

## Files Changed (high-level)
- **New**: `bin/gsd-t-orchestrator.js`, `bin/gsd-t-orchestrator-worker.cjs`, `bin/gsd-t-orchestrator-queue.cjs`, `bin/gsd-t-orchestrator-config.cjs`, `bin/gsd-t-orchestrator-recover.cjs`, `bin/gsd-t-completion-check.cjs`, `bin/gsd-t-benchmark-orchestrator.js`, `scripts/gsd-t-stream-feed-server.js`, `scripts/gsd-t-stream-feed.html`, `scripts/gsd-t-token-aggregator.js`, `templates/prompts/m40-task-brief.md`, 16 M40 test files, `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0, `.gsd-t/contracts/wave-join-contract.md`, `.gsd-t/contracts/completion-signal-contract.md`, `.gsd-t/contracts/metrics-schema-contract.md`.
- **Modified**: `bin/gsd-t.js` (added `orchestrate`, `benchmark-orchestrator`, `stream-feed` subcommands), `commands/gsd-t-resume.md` (Step 0.3 orchestrator recovery), `CHANGELOG.md`, `package.json` version bump.
