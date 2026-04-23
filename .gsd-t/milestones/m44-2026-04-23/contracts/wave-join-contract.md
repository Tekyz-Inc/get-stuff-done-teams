# Wave Join Contract — v1.1.0

**Milestone**: M40 — External Task Orchestrator (v1.0.0) · M44 — Cross-Domain & Cross-Task Parallelism (v1.1.0)
**Owner**: d1-orchestrator-core (v1.0.0) · m44-d2-parallel-cli (v1.1.0 addendum)
**Consumers**: d0-speed-benchmark, d6-recovery-and-resume, m44-d2-parallel-cli, m44-d3-command-file-integration

## Purpose
Defines the parallelism and ordering semantics of orchestrator waves: how tasks are grouped, how many run at once, when a wave completes, and what happens on failure.

## Wave Definition
- A wave is a set of tasks sharing the same `wave: N` field in `.gsd-t/domains/{domain}/tasks.md`.
- Wave numbers are non-negative integers. Wave 0 runs first, wave 1 second, etc.
- Waves with no tasks are skipped silently.

## Within-Wave Parallelism
- All tasks in wave N start concurrently via `Promise.all`, capped at `maxParallel` (default: adaptive — `floor(freemem / 2GB)` clamped to floor 3 / ceiling 15 per Team Mode §15).
- If a wave has more tasks than `maxParallel`, the orchestrator uses a simple worker pool: first `maxParallel` start, next starts when any exits.
- No task-level priority within a wave. Tasks are independent by contract (partition asserts this).

## Between-Wave Ordering
- Strict barrier: wave N+1 never starts until every task in wave N is DONE.
- If any task in wave N is FAILED after retry policy is exhausted, the orchestrator halts. Wave N+1 never starts.
- `state.json` records the current wave index; wave completion atomically advances it.

## Failure Semantics
| Event | Behavior |
|-------|----------|
| Task in wave N fails, retry eligible | Fresh worker respawns; other workers in wave N keep running |
| Task in wave N fails second time | Send SIGTERM to all siblings in wave N, wait 5 s, SIGKILL. Log `[wave_halt] wave={N} failed_task={id}`. Exit non-zero. |
| Orchestrator itself receives SIGINT | Send SIGTERM to all workers, wait 5 s, SIGKILL. Mark wave "interrupted" in state.json. Exit 130. |
| Worker timeout (270 s default) | Task fails with `worker_exited_via_timeout`; retry per D3 policy |

## Recovery After Halt
- On next `gsd-t orchestrate --resume`, D6's recovery algorithm reads state.json + D4 JSONL and decides whether to retry the failed wave or give up (operator-decided via flag).

## Observability
- Wave start: emit `{type: "wave-boundary", wave: N, state: "start", taskIds: [...]}` synthetic frame.
- Wave end: emit `{type: "wave-boundary", wave: N, state: "done"|"failed", ts, durationMs}`.
- These are task-boundary-adjacent frames (see stream-json-sink-contract.md).

## Configuration
```json
// .gsd-t/orchestrator.config.json (optional)
{
  "maxParallel": 3,
  "workerTimeoutMs": 270000,
  "retryOnFail": true,
  "haltOnSecondFail": true
}
```

CLI flags override config file; env overrides CLI. Precedence: default < config file < CLI < env.

## Mode-Aware Gating Math (M44 D2 — v1.1.0)

M44 layers task-level parallelism on top of the M40 wave model. The new
`gsd-t parallel` subcommand (owner: m44-d2-parallel-cli) applies a
three-gate sequence (D4 depgraph → D5 disjointness → D6 economics)
followed by a mode-aware headroom / split gate BEFORE any fan-out.

Both thresholds are fixed constants, exported from
`bin/gsd-t-orchestrator-config.cjs`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `IN_SESSION_CW_CEILING_PCT` | 85 | in-session orchestrator-CW ceiling |
| `UNATTENDED_PER_WORKER_CW_PCT` | 60 | unattended per-worker CW ceiling |
| `DEFAULT_SUMMARY_SIZE_PCT` | 4 | heuristic per-worker summary envelope |

### [in-session] `computeInSessionHeadroom({ctxPct, workerCount, summarySize})`

Returns `{ok, reducedCount}`.

- `ok=true, reducedCount=N` iff `ctxPct + N × summarySize ≤ 85` for the
  requested worker count N.
- If the inequality fails, reduce N and recompute. Final floor is N=1.
- **Never returns `ok=false`.** Constraint (m44-d2 constraints.md §Mode
  Awareness): in-session mode MUST NEVER throw a pause/resume prompt.
  Sequential (N=1) is always feasible because the summary envelope is
  spent post-worker, not pre-worker.
- When `reducedCount < workerCount`, the caller MUST emit a
  `parallelism_reduced` event (schema below).

### [unattended] `computeUnattendedGate({estimatedCwPct, threshold=60})`

Returns `{ok, split}`.

- `ok=true, split=false` iff `estimatedCwPct ≤ threshold`.
- `ok=false, split=true` otherwise — caller MUST slice the task into
  multiple `claude -p` iters (per-worker CW headroom is the binding
  gate for unattended; breaching it would cause mid-run compaction,
  which violates the non-negotiable "zero compaction" contract).
- Actual task slicing is the orchestrator's responsibility. The gating
  function only signals; it emits a `task_split` event and the caller
  schedules the split.

### Event Schemas

All three event types are appended JSONL to
`.gsd-t/events/YYYY-MM-DD.jsonl` (day-rotated). Event-log failures are
best-effort and must never break the caller's control flow.

**`parallelism_reduced`** — in-session only:
```json
{ "type": "parallelism_reduced",
  "original_count": 5,
  "reduced_count": 3,
  "reason": "in_session_headroom",
  "ts": "2026-04-23T14:00:00.000Z" }
```

**`task_split`** — unattended only:
```json
{ "type": "task_split",
  "task_id": "M44-D6-T3",
  "estimatedCwPct": 78,
  "ts": "2026-04-23T14:00:00.000Z" }
```

**`gate_veto`** — either mode, emitted when D4 or D5 rejects a task:
```json
{ "type": "gate_veto",
  "task_id": "M44-D2-T4",
  "gate": "depgraph" | "disjointness",
  "reason": "unmet_deps:M44-D2-T3" | "write-target-overlap-or-unprovable",
  "ts": "2026-04-23T14:00:00.000Z" }
```

A vetoed task falls back to sequential (removed from the parallel
batch) but remains in the dry-run plan with decision `veto-deps` or
`sequential` so operators can see why.

### Invariant Preservation

The three pre-existing M40/M44 invariants apply to BOTH modes
identically:
1. File-disjointness proof BEFORE any parallel spawn (D5 gate)
2. 100% automatic merges (M40 orchestrator existing machinery)
3. Pre-spawn economics check (D6 estimator)

No mode flag bypasses any of these gates.

## Versioning
- Bump major for changes to the strict-barrier semantics (e.g., speculative next-wave).
- Bump minor for new frame types, config keys, or new gating math functions.

## Version History

- **v1.1.0** (2026-04-23, M44 D2) — Adds §Mode-Aware Gating Math.
  Introduces `computeInSessionHeadroom`, `computeUnattendedGate`, the
  85% in-session ceiling, the 60% per-worker unattended ceiling, the
  4% default summary envelope, and the `parallelism_reduced`,
  `task_split`, and `gate_veto` event schemas. Owner: m44-d2-parallel-cli.
- **v1.0.0** (M40) — Initial wave-parallelism + ordering semantics.
