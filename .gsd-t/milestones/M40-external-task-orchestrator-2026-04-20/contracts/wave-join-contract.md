# Wave Join Contract — v1.0.0

**Milestone**: M40 — External Task Orchestrator
**Owner**: d1-orchestrator-core
**Consumers**: d0-speed-benchmark, d6-recovery-and-resume

## Purpose
Defines the parallelism and ordering semantics of orchestrator waves: how tasks are grouped, how many run at once, when a wave completes, and what happens on failure.

## Wave Definition
- A wave is a set of tasks sharing the same `wave: N` field in `.gsd-t/domains/{domain}/tasks.md`.
- Wave numbers are non-negative integers. Wave 0 runs first, wave 1 second, etc.
- Waves with no tasks are skipped silently.

## Within-Wave Parallelism
- All tasks in wave N start concurrently via `Promise.all`, capped at `maxParallel` (default 3, hard ceiling 15 per Team Mode §15).
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

## Versioning
- Bump major for changes to the strict-barrier semantics (e.g., speculative next-wave).
- Bump minor for new frame types or config keys.
