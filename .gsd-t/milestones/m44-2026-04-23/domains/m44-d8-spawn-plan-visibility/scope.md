# M44-D8 — Spawn Plan Visibility

**Status**: PLANNED
**Wave**: 3 (parallel-safe with D2; independent of D3)
**Date**: 2026-04-23

## Responsibility

Render a two-layer task panel in the dashboard (and in the transcript visualizer)
that answers exactly one question:

> "Of the tasks that were supposed to happen in this spawn, which are done,
> which are in flight, which are pending?"

The panel sits to the right of the live transcript stream, persists across the
life of a spawn, and updates live as commits land.

## Mode coverage

Both modes (per the M44 NON-NEGOTIABLE mode contracts):

- **[unattended]** — every worker iteration writes a plan file at Step 0 of resume
  (under `GSD_T_UNATTENDED_WORKER=1`). The panel reads it, overlays commit-driven
  status flips, dims the card when the iter exits.
- **[in-session]** — every `captureSpawn` Pattern A wrap and every
  `autoSpawnHeadless` call writes a spawn-plan file at the chokepoint before
  the child launches. The panel reads it identically.

One protocol, three writers, one reader.

## Files this domain owns (write)

- `bin/spawn-plan-writer.cjs` — pure module: `writeSpawnPlan({spawnId, kind, milestone, wave, domains, tasks, projectDir})` derives + writes `.gsd-t/spawns/{spawnId}.json`
- `bin/spawn-plan-status-updater.cjs` — pure module: `markTaskDone({spawnId, taskId, commit})` patches a single task's status
- `scripts/gsd-t-post-commit-spawn-plan.sh` — git post-commit hook: greps message for `[M44-DX-TY]` style ids, calls status-updater for any active spawn plan
- `templates/hooks/post-commit-spawn-plan.sh` — shipped hook template
- `.gsd-t/spawns/.gitkeep` — directory the writer/reader share
- `scripts/gsd-t-dashboard-server.js` — add `/api/spawn-plans` endpoint + `spawn-plan-update` SSE channel (additive, no breaking change to existing endpoints)
- `scripts/gsd-t-transcript.html` — render two-layer right-side panel (Layer 1 project, Layer 2 active spawn)
- `bin/gsd-t-token-capture.cjs` — `captureSpawn` calls `writeSpawnPlan` before `spawnFn()` fires (additive: no token-log change, no envelope change)
- `bin/headless-auto-spawn.cjs` — `autoSpawnHeadless` calls `writeSpawnPlan` before launching the headless child (additive)
- `commands/gsd-t-resume.md` — Step 0 (under `GSD_T_UNATTENDED_WORKER=1`) calls `writeSpawnPlan` once at iteration start

## Files this domain READS (does not modify)

- `.gsd-t/partition.md` — wave structure
- `.gsd-t/domains/*/tasks.md` — task ids, titles, status from `[ ]`/`[x]`
- `.gsd-t/progress.md` — current milestone label
- `.gsd-t/.unattended/state.json` — current iter (for unattended writer)

## What this domain does NOT do (out of scope)

- Per-tool-call rendering (already in transcript stream)
- LLM reasoning rendering (transcript handles)
- Token-count rendering (separate panel handles via existing `/api/token-breakdown`)
- Inferring task plans from transcript heuristics (the write-side is deterministic from `tasks.md` + `partition.md`; we never derive from transcript)

## Disjointness proof

- New files only: `bin/spawn-plan-writer.cjs`, `bin/spawn-plan-status-updater.cjs`, `scripts/gsd-t-post-commit-spawn-plan.sh`, `templates/hooks/post-commit-spawn-plan.sh`, `.gsd-t/spawns/`
- Additive edits to 3 existing files (`bin/gsd-t-token-capture.cjs`, `bin/headless-auto-spawn.cjs`, `scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-transcript.html`, `commands/gsd-t-resume.md`) — each edit is a single net-new code block, no rewrites of existing logic
- Disjoint with D1-D7: D1-D6 own task-graph + gate libraries (no overlap with renderer/observability files); D7 owns `cw_id` pass-through (independent field, independent code path)

## Token cost (per spawn)

- **Writer side**: pure file I/O at chokepoint. Reads files the spawn was going to read anyway. Effectively zero added LLM tokens.
- **Reader side**: dashboard server + browser. Zero LLM tokens.
- **Status updater**: shell + node, no LLM. Zero tokens.

## Spawn-plan schema

```json
{
  "spawnId": "session-uuid OR iter-N",
  "kind": "unattended-worker | headless-detached | in-session-subagent",
  "startedAt": "2026-04-23T00:10:28Z",
  "endedAt": null,
  "milestone": "M44",
  "wave": "wave-2",
  "domains": ["m44-d4-depgraph-validation", "..."],
  "tasks": [
    {"id": "M44-D4-T1", "title": "depgraph contract skeleton", "status": "done", "commit": "5c3844a", "tokens": {"in": 12483, "out": 1742, "cr": 308, "cc": 134046, "cost_usd": 0.42}},
    {"id": "M44-D4-T2", "title": "validateDepGraph filter + veto", "status": "in_progress", "tokens": null},
    {"id": "M44-D5-T1", "title": "file-disjointness skeleton", "status": "pending", "tokens": null}
  ],
  "endedReason": null
}
```

Status states: `pending` | `in_progress` | `done`. Transitions:
- `pending → in_progress`: heuristic — set when previous task in spawn flips to `done` AND this task is the next pending in the plan
- `in_progress → done`: post-commit hook detects `[M44-DX-TY]` in commit message and patches the matching task

**Token attribution (tokens field on each task):**
- `null` while task is pending or in-progress
- Populated when status flips to `done` by post-commit hook attribution lookup
- Source: `.gsd-t/token-log.md` rows whose `Task` column matches the task id, summed across all rows for that task within the spawn's time window
- Shape: `{in, out, cr, cc, cost_usd}` — same fields as `captureSpawn` writes to token-log
- If no matching token-log row exists (rare — task committed without a captured spawn), tokens stays `null` and renders as `—` (per CLAUDE.md "zero is a measurement, dash is acknowledged gap" rule)

## Renderer (two layers)

**Layer 1 — Project (always visible at top of right panel):**
- Milestone header with done/total count + cumulative tokens
- Wave list (collapsible) with per-wave done/total + per-wave token total
- Each task: `☐` pending / `◐` in-progress / `✓` done — done tasks display token cell (e.g., `in=12.5k out=1.7k $0.42`) right-aligned next to the title

**Layer 2 — Active Spawn (below, dimmed when no active spawn):**
- Spawn header: kind + iter/sessionId + elapsed + spawn-cumulative tokens
- Wave + domains involved
- Tasks with status icons + commit SHA on hover + token cell on done tasks
- Token cell format: compact `in=Nk out=Nk $X.XX` (k-suffix for thousands, 2-decimal USD); `—` when null

State icons:
- `☐` pending
- `◐` in_progress (only ever ONE in_progress per spawn)
- `✓` done

## Acceptance criteria

1. New unattended worker iteration writes a plan file before its first Bash call
2. New `captureSpawn` invocation writes a plan file before `spawnFn()` fires
3. New `autoSpawnHeadless` invocation writes a plan file before child launches
4. Commit message containing `[M44-D4-T1]` flips that task to `done` in any active spawn-plan file via post-commit hook
5. Post-commit hook ALSO looks up the task's token cost from `.gsd-t/token-log.md` (rows where `Task` column matches the id within the spawn's time window) and writes it to the task's `tokens` field
6. Dashboard `/api/spawn-plans` returns array of all active spawn plans (where `endedAt === null`)
7. Dashboard SSE channel `spawn-plan-update` pushes `{spawnId, taskId, status, commit?, tokens?}` on each transition
8. Right-side panel in `scripts/gsd-t-transcript.html` renders both layers and updates live without page reload
9. Done tasks in BOTH layers show token cell (e.g., `in=12.5k out=1.7k $0.42`) right-aligned next to the title; `—` when token attribution returned null
10. Plan file deletion (or `endedAt` set) on spawn exit dims the Layer 2 card

## Tests

- `test/m44-d8-spawn-plan-writer.test.js` — writer derives correct plan from synthetic partition.md + tasks.md fixture
- `test/m44-d8-spawn-plan-status-updater.test.js` — markTaskDone patches correct task; no-op on unknown id
- `test/m44-d8-post-commit-hook.test.js` — hook script extracts task ids from commit message and calls updater for each active spawn
- `test/m44-d8-dashboard-spawn-plans-endpoint.test.js` — `/api/spawn-plans` returns shape; SSE channel emits on patch
- `test/m44-d8-transcript-renderer-panel.test.js` — HTML contains panel CSS + render functions for both layers (static check, mirrors the m44-transcript-timestamp.test.js pattern)

## Doc ripple

- `docs/architecture.md` — add "Spawn Plan Visibility" subsection under Observability
- `.gsd-t/contracts/spawn-plan-contract.md` — new contract documenting schema + writer/reader/updater protocol
- `commands/gsd-t-help.md` — note dashboard panel in observability section
- `.gsd-t/progress.md` — Decision Log entry on D8 landing
