# M44-D9 — Parallelism Observability

**Status**: PLANNED
**Wave**: 3 (parallel-safe with D2, D3, D8)
**Date**: 2026-04-23

## Responsibility

Render a live **parallelism panel** in the dashboard / transcript visualizer
that answers two questions:

> "Is the orchestrator actually fanning out across workers, or is it
> serializing despite parallelism being available?"

> "When this wave finishes, did it hit the parallelism factor D6 estimated?"

The panel is a third layer below D8's two-layer task panel (or a left
column — implementation choice during build). It reads from spawn-plan
files (D8), event-stream gate decisions (D4/D5/D6), and per-CW token
attribution (D7). It writes nothing — pure observability.

A **Full Report** button dumps a markdown post-mortem covering wave summary,
per-spawn table, per-gate decisions, per-worker timeline, and token cost
vs. D6 estimate accuracy.

## Mode coverage

Both modes (per the M44 NON-NEGOTIABLE mode contracts):

- **[unattended]** — supervisor's worker iters get observed in real-time as
  they spawn parallel subagents (Team Mode). Panel reads spawn-plan files
  written by D8's `writeSpawnPlan` calls.
- **[in-session]** — `gsd-t parallel` invocations write spawn-plan files
  identically. Panel reads them the same way.

One protocol, one reader, two contexts.

## Files this domain owns (write)

- `bin/parallelism-report.cjs` — pure module: `computeParallelismMetrics({projectDir, wave?})` returns `{activeWorkers, readyTasks, parallelism_factor, gate_decisions, color_state, full_report_md}`
- `scripts/gsd-t-dashboard-server.js` — adds `GET /api/parallelism` (current state) + `GET /api/parallelism/report?wave=N` (markdown post-mortem). Additive — does NOT modify existing endpoints.
- `scripts/gsd-t-transcript.html` — adds parallelism panel below D8's two-layer task panel (or as left column). Additive CSS + JS, no existing transcript stream rendering touched.
- `commands/gsd-t-help.md` — note panel + report endpoint in observability section
- `docs/architecture.md` — Observability subsection: "Parallelism Panel"
- `.gsd-t/contracts/parallelism-report-contract.md` — new contract documenting metric definitions, color thresholds, report shape

## Files this domain READS (does not modify)

- `.gsd-t/spawns/*.json` — D8's spawn-plan files (active spawns + per-task duration)
- `.gsd-t/events/YYYY-MM-DD.jsonl` — D4 (`dep_gate_veto`), D5 (`disjointness_fallback`), D6 (`economics_decision`) events
- `.gsd-t/token-log.md` — D7's `cw_id`-tagged rows for per-spawn token attribution
- `.gsd-t/partition.md` — wave structure (for "Wave N" filtering in report)
- `.gsd-t/domains/*/tasks.md` — task ids + status for ready-task counting

## What this domain does NOT do (out of scope)

- Per-tool-call rendering (`gsd-t tool-cost` already does this)
- Token-cost rendering (existing `/api/token-breakdown` panel)
- Spawn-plan task-status rendering (D8's panel)
- Pausing or stopping spawns (Stop Supervisor button reuses existing `/gsd-t-unattended-stop` — no new write paths)
- Inferring parallelism from prose / heuristics (computed deterministically from spawn-plan timestamps + event log)

## Disjointness proof

- **New files only**: `bin/parallelism-report.cjs`, `.gsd-t/contracts/parallelism-report-contract.md`, `test/m44-d9-parallelism.test.js`
- **Additive edits to existing files**: `scripts/gsd-t-dashboard-server.js` (new endpoints), `scripts/gsd-t-transcript.html` (new panel), `commands/gsd-t-help.md` (single-line note), `docs/architecture.md` (new subsection)
- **Disjoint with D2/D3/D8**:
  - D2 owns `bin/gsd-t-parallel.js` + orchestrator gate-glue — D9 doesn't touch.
  - D3 owns command-file additive Team Mode blocks — D9 doesn't touch.
  - D8 owns `bin/spawn-plan-*` + the right-side task panel + `/api/spawn-plans` endpoint. D9 owns a separate panel + `/api/parallelism` endpoint. Both write to `scripts/gsd-t-dashboard-server.js` and `scripts/gsd-t-transcript.html`, but each adds a NEW non-overlapping code block (different endpoint paths, different DOM regions). Wave 3 sequencing: D8 lands first (writer protocol must exist before reader can use it), D9 lands after.
- **Disjoint with D1, D4-D7**: read-only consumer of their outputs.

## Token cost (per spawn)

- **Reader side**: dashboard server + browser. Zero LLM tokens.
- **Computation**: pure file I/O (read spawn-plan + event JSONL + token-log). Effectively zero added LLM tokens.
- **Full Report generation**: also pure I/O. Zero LLM tokens.

## Metric definitions

**activeWorkers**: count of spawn-plan files where `endedAt === null`.

**readyTasks**: count of tasks across all incomplete domains in the current wave whose deps are all satisfied (per D4 `validateDepGraph`).

**parallelism_factor (live)**: `summed_active_worker_age / max_active_worker_age`. A wave running 4 workers each ~5 min in = factor of ~4.0; one worker = factor of 1.0.

**parallelism_factor (post-wave)**: `sum(task.endedAt - task.startedAt) / (max(task.endedAt) - min(task.startedAt))` across all tasks in the wave. Captures actual speedup vs. sequential equivalent.

**gate_decisions**: tally of last 10 events of each gate type from `.gsd-t/events/*.jsonl`:
- D4 `dep_gate_veto` count + last reasons
- D5 `disjointness_fallback` count + last reasons (`unprovable` | `write-target-overlap`)
- D6 `economics_decision` count + last confidence distribution (HIGH/MEDIUM/LOW/FALLBACK)

**color_state**: per the M44 partition decision, computed against thresholds:

| Signal | Green | Yellow | Red |
|--------|-------|--------|-----|
| activeWorkers vs. readyTasks | ≥80% of ready | 50–80% | <50% (when ready>0 AND time_since_last_spawn>10min) |
| Last gate veto rate (D4) | <10% | 10–30% | >30% |
| parallelism_factor vs. D6 estimate | ≥80% of estimate | 50–80% | <50% |
| Spawn age (any active) | <30 min | 30–45 min | >45 min |
| Time since last `spawn_started` event (when ready>0) | <5 min | 5–10 min | >10 min (stuck) |

Overall panel color: WORST of the per-signal colors.

## Acceptance criteria

1. `/api/parallelism` returns `{activeWorkers, readyTasks, parallelism_factor, gate_decisions, color_state, lastSpawnAt}` shape
2. `/api/parallelism/report?wave=N` returns a markdown post-mortem (wave summary, per-spawn table, per-gate decisions, per-worker timeline, token cost vs. D6 estimate)
3. Transcript renderer panel updates live (SSE OR poll every 5s — implementation choice)
4. Panel goes RED when `readyTasks > 0 AND activeWorkers < 0.5*readyTasks AND time_since_last_spawn > 10min`
5. Panel goes RED when any active spawn age > 45 min
6. Full Report button dumps the markdown report (downloadable OR rendered inline)
7. Report includes Gantt-ish ASCII chart of per-worker time spans
8. When no active wave / no spawn-plan files exist, panel renders dimmed "no parallelism active" state (not red)
9. Reader is silent-fail: if a spawn-plan file is malformed or events JSONL is corrupt, log to stderr and continue with partial data
10. Zero new LLM token cost — all metrics are pure I/O

## Tests

- `test/m44-d9-parallelism.test.js` — covers:
  - `computeParallelismMetrics` shape with synthetic fixtures
  - parallelism_factor math (live and post-wave) on 1-worker, 4-worker, mixed-duration cases
  - color_state thresholds at boundaries
  - silent-fail on malformed spawn-plan / event JSONL
  - Full Report markdown contains all required sections
  - `/api/parallelism` endpoint returns expected shape (mock dashboard server)

## Doc ripple

- `docs/architecture.md` — add "Parallelism Panel (M44 D9)" subsection under Observability
- `commands/gsd-t-help.md` — note parallelism panel in observability section
- `.gsd-t/contracts/parallelism-report-contract.md` — new contract documenting metrics + thresholds + report shape
- `.gsd-t/progress.md` — Decision Log entry on D9 graft + landing
