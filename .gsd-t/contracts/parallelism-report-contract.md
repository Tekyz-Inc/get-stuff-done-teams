# Contract: Parallelism Report

**Version**: 1.0.0
**Owner**: M44 D9 — parallelism-observability
**Status**: Active
**Date**: 2026-04-23

## Purpose

Provide a deterministic, read-only summary of how wide the orchestrator is actually fanning out, drawn from existing persisted state:

> "Is the orchestrator actually fanning out across workers, or serializing despite parallelism being available?"

> "When this wave finishes, did it hit the parallelism factor D6 estimated?"

Pure observability. **Zero added LLM token cost.** The reader derives every metric from files already written by D4/D5/D6 gates, D7 token-log rows, and D8 spawn-plan files.

## Public API

```js
const { computeParallelismMetrics, buildFullReport } = require('./bin/parallelism-report.cjs');

const metrics = computeParallelismMetrics({ projectDir: '.', wave: 'wave-3' });
// returns the Metrics shape defined below

const md = buildFullReport({ projectDir: '.', wave: 'wave-3' });
// returns a markdown post-mortem string
```

Both calls are pure I/O — no LLM, no subprocess, no network.

## Metrics shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-04-23T22:45:00.000Z",
  "wave": "wave-3",
  "activeWorkers": 4,
  "readyTasks": 6,
  "parallelism_factor": 3.4,
  "parallelism_factor_mode": "live",
  "gate_decisions": {
    "dep_gate_veto": { "count": 0, "last_reasons": [] },
    "disjointness_fallback": { "count": 0, "last_reasons": [] },
    "economics_decision": { "count": 4, "confidence_distribution": { "HIGH": 0, "MEDIUM": 0, "LOW": 0, "FALLBACK": 4 } }
  },
  "color_state": "green",
  "lastSpawnAt": "2026-04-23T22:40:12.000Z",
  "activeSpawnAges_s": [312, 308, 305, 60]
}
```

### Metric definitions

**activeWorkers** — count of `.gsd-t/spawns/*.json` files where `endedAt === null`.

**readyTasks** — count of tasks across all incomplete domains whose `status === 'pending'` and whose declared dependencies are all satisfied (deps resolved via the D4 depgraph module; falls back to "0 unsatisfied deps" when depgraph unavailable).

**parallelism_factor**:
- **live** (any active spawn present): `sum(active_age_s) / max(active_age_s)`. 4 workers each 5 min in ≈ 4.0. 1 worker = 1.0.
- **post-wave** (no active spawn, wave param supplied): `sum(task_duration_s) / (max(task_endedAt) - min(task_startedAt))` across all tasks in the wave.

**parallelism_factor_mode** — `"live" | "post-wave" | "idle"`. `"idle"` when no active spawn AND no wave param.

**gate_decisions** — tally of the last 10 events of each gate type pulled from `.gsd-t/events/YYYY-MM-DD.jsonl`:
- `dep_gate_veto` — count + last reasons
- `disjointness_fallback` — count + last reasons (`unprovable` | `write-target-overlap`)
- `economics_decision` — count + confidence distribution

**color_state** — WORST of the per-signal colors:

| Signal | Green | Yellow | Red |
|--------|-------|--------|-----|
| activeWorkers vs. readyTasks | ≥80% of ready | 50–80% | <50% (when ready>0 AND time_since_last_spawn>10min) |
| Last gate veto rate (D4) | <10% | 10–30% | >30% |
| parallelism_factor vs. D6 estimate | ≥80% of estimate | 50–80% | <50% |
| Spawn age (any active) | <30 min | 30–45 min | >45 min |
| Time since last `spawn_started` (when ready>0) | <5 min | 5–10 min | >10 min |

Special: when no spawn-plan files exist at all, `color_state` is `"dimmed"` (not red).

**lastSpawnAt** — ISO timestamp of the most recent `startedAt` across all spawn-plan files (active or ended), or `null` if none.

**activeSpawnAges_s** — per-active-worker age in seconds at `generatedAt` (sorted descending). Helps the renderer show "oldest worker is 312 s in."

## Full Report shape (markdown)

`buildFullReport({ projectDir, wave })` returns markdown with these sections in order:

1. `# Parallelism Report — {wave}`
2. `## Summary` — table with wave, generatedAt, activeWorkers, readyTasks, parallelism_factor, color_state
3. `## Per-spawn timeline` — table: `| spawnId | kind | startedAt | endedAt | duration_s | tasks | status |`
4. `## Per-gate decisions` — one table per gate (dep / disjointness / economics) with count + last reasons/confidence
5. `## Per-worker Gantt (ASCII)` — simple text chart with one row per worker, time on x-axis
6. `## Token cost vs. D6 estimate` — per-worker actual vs. estimated CW%, rendered from `.gsd-t/token-log.md` `cw_id` rows
7. `## Notes` — any silent-fail markers captured during computation (e.g., "1 malformed spawn-plan skipped")

## Silent-fail rules

The reader must NEVER throw when observing a live system. On any malformed input:
- Log a warning to stderr with the offending file path
- Continue computing other metrics with the remaining valid data
- Include a note in the Metrics' `notes` field (optional string[]) AND in the Full Report's `## Notes` section

Cases to handle silently:
- `.gsd-t/spawns/*.json` missing or empty → `activeWorkers: 0`, continue
- Individual spawn-plan file malformed JSON → skip that file, continue
- `.gsd-t/events/YYYY-MM-DD.jsonl` missing or corrupt line → parse valid lines only
- `.gsd-t/partition.md` missing → `wave: null` if not supplied explicitly
- `.gsd-t/domains/` missing → `readyTasks: 0`, continue
- `.gsd-t/token-log.md` missing → skip token-cost section in full report

## Data sources (read-only)

| Metric | Source |
|--------|--------|
| activeWorkers, lastSpawnAt, activeSpawnAges_s | `.gsd-t/spawns/*.json` |
| readyTasks | `.gsd-t/domains/*/tasks.md` (task status + deps) |
| gate_decisions | `.gsd-t/events/YYYY-MM-DD.jsonl` (last 14 days) |
| parallelism_factor (post-wave) | `.gsd-t/spawns/*.json` (startedAt/endedAt) filtered by `wave` |
| Full Report token cost | `.gsd-t/token-log.md` + matching spawn-plan `tokens` field |

Never writes. Never calls an LLM. Never shells out.

## Versioning

- v1.0.0 (2026-04-23): initial contract — shape + thresholds + silent-fail rules

Future changes MUST bump version and document the delta here.
