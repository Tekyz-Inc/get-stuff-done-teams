# Contract: Spawn Plan

**Version**: 1.0.0
**Owner**: M44 D8 — spawn-plan-visibility
**Status**: Active
**Date**: 2026-04-23

## Purpose

Every GSD-T spawn (interactive subagent, detached headless child, unattended
worker iteration) writes a plan file that answers exactly one question:

> "Of the tasks that were supposed to happen in this spawn, which are done,
> which are in flight, which are pending?"

The dashboard reader (`/api/spawn-plans` + `spawn-plan-update` SSE channel)
and the transcript right-side panel render this plan live; a post-commit
git hook flips task status as commits land; a companion module closes the
plan on spawn exit.

Pure observability. **Zero added LLM token cost.** Derivation is a
deterministic projection of `.gsd-t/partition.md` + `.gsd-t/domains/*/tasks.md`.

## File Layout

```
.gsd-t/spawns/
├── .gitkeep
└── {spawnId}.json     — one file per spawn; active = `endedAt === null`
```

`spawnId` is filesystem-safe: `^[A-Za-z0-9._-]{1,200}$`.

## Schema

```json
{
  "schemaVersion": 1,
  "spawnId": "gsd-t-execute-2026-04-23-00-10-28",
  "kind": "unattended-worker | headless-detached | in-session-subagent",
  "startedAt": "2026-04-23T00:10:28.000Z",
  "endedAt": null,
  "milestone": "M44",
  "wave": "wave-3",
  "domains": ["m44-d8-spawn-plan-visibility"],
  "tasks": [
    {
      "id": "M44-D8-T1",
      "title": "spawn-plan-writer module",
      "status": "done",
      "commit": "5c3844a",
      "tokens": { "in": 12483, "out": 1742, "cr": 308, "cc": 134046, "cost_usd": 0.42 }
    },
    {
      "id": "M44-D8-T2",
      "title": "post-commit hook",
      "status": "in_progress",
      "tokens": null
    },
    {
      "id": "M44-D8-T3",
      "title": "writer integration at 3 chokepoints",
      "status": "pending",
      "tokens": null
    }
  ],
  "endedReason": null,
  "note": null
}
```

### Status states

`pending | in_progress | done`. Only ONE task per spawn may be `in_progress`
at a time.

### Tokens field

- `null` while pending or in_progress
- `null` when done without a matching token-log row (rare; renders as `—`)
- `{in, out, cr, cc, cost_usd}` when done WITH attribution match

Populated by the post-commit hook by parsing `.gsd-t/token-log.md` rows
where the `Task` column matches the task id AND `Datetime-start >=
spawn.startedAt`; summed across matches.

### `note` field

When the writer cannot derive a plan (no partition, malformed tasks.md),
the file is still written with `tasks: []` and `note: "no-partition"`.
This is the "no active spawn plan" state the panel renders.

## Writers (3)

1. `bin/gsd-t-token-capture.cjs` — `captureSpawn()` calls `writeSpawnPlan`
   before `await spawnFn()`. Wrapped in try/catch: plan-write failure must
   NOT block the spawn.
2. `bin/headless-auto-spawn.cjs` — `autoSpawnHeadless()` calls
   `writeSpawnPlan` before the detached child launches. Same try/catch.
3. `commands/gsd-t-resume.md` Step 0 — under `GSD_T_UNATTENDED_WORKER=1`,
   every worker iteration calls `writeSpawnPlan` at iteration start.

## Status Updater

- `bin/spawn-plan-status-updater.cjs`
  - `markTaskDone({spawnId, taskId, commit, tokens?, projectDir})`
  - `markSpawnEnded({spawnId, endedReason, projectDir})`
- `scripts/gsd-t-post-commit-spawn-plan.sh` — git post-commit hook.
  Scans commit message for all `[M\d+-D\d+-T\d+]` task ids; for each
  active spawn plan, calls `markTaskDone` with token attribution from
  `.gsd-t/token-log.md`. Silent-fail: always exits 0.

## Reader

- `scripts/gsd-t-dashboard-server.js`
  - `GET /api/spawn-plans` — array of plan files where `endedAt === null`
  - SSE channel `spawn-plan-update` — `fs.watch` on `.gsd-t/spawns/*.json`
    emits `{spawnId, plan}` on every change
- `scripts/gsd-t-transcript.html` — right-side `<aside class="spawn-panel">`
  with Layer 1 (project) + Layer 2 (active spawn). Renders status icons
  (`☐` pending, `◐` in_progress, `✓` done) and token cells (`in=12.5k
  out=1.7k $0.42` or `—`).

## Invariants

1. **Writer derives, never decides.** No LLM calls, no prompts.
2. **Spawn must launch even if writer fails.** Try/catch in every caller.
3. **Atomic writes only** (temp file + rename).
4. **Post-commit hook is silent-fail.** Always `exit 0`.
5. **No transcript-derivation fallback.** Missing plan file → "no active
   spawn plan." Never reconstruct from transcript heuristics.
6. **Only ONE task `in_progress` per spawn** at any time.
7. **Reader is additive.** `/api/spawn-plans` is new; existing endpoints
   unchanged.

## Consumers

- Dashboard server + transcript renderer (right-side panel)
- Future: `gsd-t-status`, `gsd-t-health` may consume plan files for
  at-a-glance spawn status summaries.

## Versioning

`schemaVersion` on every plan. Minor-compatible field additions bump the
patch (1.0.0 → 1.0.1). Any field rename or semantics change bumps the
minor (1.0.0 → 1.1.0). Removals bump the major.
