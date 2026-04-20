# M40 Speed Benchmark — Gate Verdict

- **Generated**: 2026-04-20T20:25:33.610Z
- **Runs per side**: 1
- **Fixture**: /Users/david/projects/GSD-T/test/fixtures/m40-benchmark-workload
- **Verdict**: **PASS** — orchestrator 226451ms ≤ in-session 315567ms × 1.05 (331345ms) — Waves 2+3+4 unlocked

## Environment

- Node: v24.14.1
- Platform: darwin-25.4.0 (arm64)
- CPUs: 18
- RAM: 2849 MB free / 49152 MB total

## Per-run timings (ms) and commit-discipline audit

| # | Orchestrator (ms / exit / commits) | In-session (ms / exit / commits) |
|---|------------------------------------|----------------------------------|
| 1 | 226451 / 0 / 20/20 | 315567 / 0 / 20/20 |

- **Median orchestrator**: 226451 ms
- **Median in-session**:  315567 ms
- **Threshold** (insession × 1.05): 331345 ms

## Methodology

- Same fixture (`test/fixtures/m40-benchmark-workload/`) copied to a fresh
  tmp dir per run; git initialized; no cross-run state.
- Orchestrator path: `bin/gsd-t-orchestrator.js` drives waves via the
  D1 spawn loop + D2 brief builder.
- In-session path: a single `claude -p` session handed the tasks
  sequentially — no subagents.
- `Date.now()` wall-clock, millisecond precision. Both sides include
  their full lifecycle (startup + work + teardown).
- PASS when `median(orchestrator_ms) ≤ median(in-session_ms) × 1.05`.
