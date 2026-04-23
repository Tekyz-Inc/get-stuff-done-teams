# Milestone Complete: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)

**Completed**: 2026-04-23
**Duration**: 2026-04-22 (defined) → 2026-04-23 (archived)
**Status**: VERIFIED-WITH-WARNINGS (4 non-blocking warnings; M44-D9 grafted but left pending as follow-up)

## What Was Built

M44 delivers task-level parallelism to both execution modes on equal footing, with mode-aware gating math:
- **[in-session]** speed + reduce compaction, never throw pause/resume prompts (N=1 floor on CW headroom failure)
- **[unattended]** zero compaction across M1→M10, per-worker CW headroom is the binding gate (>60% splits into multiple iters)

Three pre-spawn gates run in sequence before any fan-out: **dep-graph validation → file-disjointness proof → economics estimation**. All three are read-only, side-effect-free (except event emits), zero external runtime deps.

Two delivery layers both shipped:
- **L1 parallel `claude -p` worker spawns** — primary lever for both modes; for unattended this is the compaction-elimination mechanism
- **L2 parallel tasks within one worker** — weaker lever, bounded by one CW, used when L1 isn't economic

Observability: every spawn (parallel or sequential) now writes a plan file at `.gsd-t/spawns/{spawnId}.json`; the dashboard surfaces it as a right-side two-layer task panel with per-task token attribution (populated by a post-commit git hook that joins commit messages against `.gsd-t/token-log.md`).

## Domains

| Domain | Tasks | Deliverable |
|--------|-------|-------------|
| D1 task-graph-reader | 5/5 | `bin/gsd-t-task-graph.cjs` — parses `.gsd-t/domains/*/tasks.md` + `scope.md` fallback into a typed DAG (nodes, edges, ready mask, cycle detection); `gsd-t graph --output json\|table` CLI; 22/22 unit tests; contract v1.0.0 locked |
| D7 per-cw-attribution | 5/5 | `cw_id` pass-through in `bin/gsd-t-token-capture.cjs`; post-spawn calibration hook wiring `compact-detector → compaction_post_spawn` event; contracts `metrics-schema v2.1.0` + `compaction-events v1.1.0`; 19/19 tests |
| D4 depgraph-validation | 4/4 | `bin/gsd-t-depgraph-validate.cjs::validateDepGraph` — pre-spawn veto of tasks with unmet deps; `dep_gate_veto` events; contract v1.0.0; 13/13 tests |
| D5 file-disjointness-prover | 4/4 | `bin/gsd-t-file-disjointness.cjs::proveDisjointness` — union-find overlap check with scope.md + git-history fallback chain; `disjointness_fallback` events; contract v1.0.0; 11/11 tests |
| D6 pre-spawn-economics | 5/5 | `bin/gsd-t-economics.cjs::estimateTaskFootprint` — three-tier corpus lookup (exact → fuzzy → global median), confidence tiers (HIGH/MEDIUM/LOW/FALLBACK), mode-aware thresholds (85% in-session, 60% unattended); contract v1.0.0 calibrated against the 528-row live corpus; 9/9 tests |
| D2 parallel-cli | 5/5 | `bin/gsd-t-parallel.cjs` + `gsd-t parallel` subcommand with `--mode`, `--dry-run`, `--milestone`, `--domain`; three-gate wiring (D4→D5→D6); mode-aware gating math in `bin/gsd-t-orchestrator-config.cjs` (`computeInSessionHeadroom` + `computeUnattendedGate`); wave-join-contract v1.0.0 → v1.1.0; 21/21 tests |
| D8 spawn-plan-visibility | 7/7 | `bin/spawn-plan-{writer,status-updater,derive}.cjs`, `scripts/gsd-t-post-commit-spawn-plan.sh` hook + template, `/api/spawn-plans` endpoint + `spawn-plan-update` SSE channel, right-side two-layer panel in `scripts/gsd-t-transcript.html`, writer integration at 3 chokepoints (`captureSpawn` / `autoSpawnHeadless` / unattended worker resume), `spawn-plan-contract.md` v1.0.0, 36/36 tests |
| D3 command-file-integration | 5/5 | Purely-additive "Optional — Parallel Dispatch (M44)" blocks in `commands/gsd-t-{execute,wave,integrate,quick,debug}.md` plus doc ripple in `commands/gsd-t-help.md`, `GSD-T-README.md`, `README.md`, `docs/requirements.md`, `docs/architecture.md`. No new tests (validated by use per D3 constraints). |
| D9 parallelism-observability | 0/4 | **GRAFTED-BUT-PENDING** — scope.md/tasks.md/constraints.md committed by a concurrent worker during Wave 3 (commit `da44190`). All 4 tasks remain `[ ] pending`. Closed as NOT IN M44 COMPLETE SCOPE; filed to backlog #16 as follow-up. |

## Contracts Defined/Updated

- **new** `task-graph-contract.md` v1.0.0
- **new** `depgraph-validation-contract.md` v1.0.0
- **new** `file-disjointness-contract.md` v1.0.0
- **new** `economics-estimator-contract.md` v1.0.0 (calibrated against 528-row corpus)
- **new** `spawn-plan-contract.md` v1.0.0
- **updated** `wave-join-contract.md` v1.0.0 → v1.1.0 (adds §Mode-Aware Gating Math)
- **updated** `metrics-schema-contract.md` → v2.1.0 (adds optional `cw_id` field)
- **updated** `compaction-events-contract.md` → v1.1.0 (adds `compaction_post_spawn` event type)
- **unchanged** `headless-default-contract.md` v2.0.0 (always-headless invariant preserved; no bump needed)

## Key Decisions

- **D8 grafted into M44 mid-run** (2026-04-23 00:25) — right-side two-layer task panel with per-task token cell; writer-derives-never-decides rule; atomic writes; silent-fail on all chokepoints; Layer 1 project / Layer 2 active spawn.
- **D9 grafted but DEFERRED** — concurrent worker added `m44-d9-parallelism-observability` scope + tasks during Wave 3; 4 tasks remain pending; graft commit preserved per destructive-action guard. Promoted to backlog follow-up.
- **Wave 2 three-way parallel** — D4, D5, D6 all landed concurrently via 3 Task subagents with zero cross-domain file conflicts; partition's shared-file conflict map held up cleanly.
- **Wave 3 two-way parallel** — D2 + D8 landed concurrently; one sibling-worker collision required D2-T4 re-landing its owned surfaces (D8-T3 had inadvertently reverted D2's edits to `bin/gsd-t-orchestrator-config.cjs` + `bin/gsd-t.js`). Not a contract gap — a filesystem race caught + fixed during the run.
- **D6 calibration numbers documented** — MAE HIGH 12.89%, MEDIUM tautological (n=5), LOW 13.08%, FALLBACK 15.06%. Current corpus dominated by `in-session|turn|-` rows; HIGH coverage for `gsd-t-execute` / `gsd-t-wave` domains will improve as D7-tagged rows accumulate.
- **Smoke-test fixtures deferred to backlog #15** — D3-T5 acceptance criteria for (a) in-session multi-domain fixture ≤ T/2 of sequential baseline and (b) `gsd-t unattended --max-iterations 5` with zero new compaction events — fixtures don't exist in-repo.

## Issues Encountered

- **Concurrent-supervisor incident during worker iter** — three `gsd-t-unattended` supervisor processes (PIDs 70139, 72747, 36897) were active against the same repo at one point. Sibling worker wrote an uncommitted D9 scope expansion and partially rewrote tasks.md + progress.md. Killed all supervisors + orphan `claude -p` workers; removed stop signal + stale supervisor.pid. Single-worker discipline restored. Flagging as a framework observation — no cron/launchd/hook identified as the respawn trigger; likely an external session restarting the supervisor.
- **D2/D8 working-tree race** — sibling writers raced on `bin/gsd-t-orchestrator-config.cjs` + `bin/gsd-t.js`. Resolution: D2-T4 re-landed its surface cleanly in the same commit as the wave-join-contract bump. Follow-up: when running disjoint-but-adjacent Wave-3 domains concurrently, the partition should explicitly call out whether the in-session parallel run is safe or should be sequenced.

## Test Coverage

- Unit tests (aggregate): **1903/1907 pass** (99.79%); 4 pre-existing unrelated fails carried from M42/M43 verification rounds
- New M44 tests: **111 new tests** — D1 22, D4 13, D5 11, D6 9, D7 19, D2 21, D8 36 (subset reuses existing M44-D7 suite counts)
- E2E tests: N/A — no `playwright.config.*` in repo
- Coverage: zero new regressions introduced by M44 work

## Git Tag

`v3.18.10`

## Files Changed

- **New files** (10): `bin/gsd-t-task-graph.cjs`, `bin/gsd-t-depgraph-validate.cjs`, `bin/gsd-t-file-disjointness.cjs`, `bin/gsd-t-economics.cjs`, `bin/gsd-t-parallel.cjs`, `bin/spawn-plan-writer.cjs`, `bin/spawn-plan-status-updater.cjs`, `bin/spawn-plan-derive.cjs`, `scripts/gsd-t-post-commit-spawn-plan.sh`, `templates/hooks/post-commit-spawn-plan.sh`
- **New contracts** (5): task-graph, depgraph-validation, file-disjointness, economics-estimator, spawn-plan
- **New tests** (7 suites): m44-task-graph, m44-depgraph-validate, m44-file-disjointness, m44-economics, m44-parallel-cli, m44-d8-spawn-plan-writer, m44-d8-spawn-plan-status-updater, m44-d8-post-commit-hook, m44-d8-dashboard-spawn-plans-endpoint, m44-d8-transcript-renderer-panel
- **Modified** (additive edits): `bin/gsd-t-orchestrator-config.cjs`, `bin/gsd-t.js`, `bin/gsd-t-token-capture.cjs`, `bin/headless-auto-spawn.cjs`, `scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-transcript.html`, `commands/gsd-t-{execute,wave,quick,debug,integrate,help,resume}.md`, `GSD-T-README.md`, `README.md`, `docs/{requirements,architecture}.md`, `.gsd-t/progress.md`, `.gsd-t/partition.md`, `.gsd-t/backlog.md`
