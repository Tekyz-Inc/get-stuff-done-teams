# M40 Benchmark Workload

Deterministic workload for the D0 speed-benchmark kill-switch gate. Compares
wall-clock time between:

- **Orchestrator path**: one `claude -p` spawn per task, external wave-join loop
- **In-session path**: a single Claude Code session running `/gsd-t-execute`

## Workload shape

One domain (`bench-d1`) with 4 tasks:

| Wave | Task | Work |
|------|------|------|
| 0 | T1 | Generate `out/a.txt` with a fixed payload; run a trivial unit test; commit |
| 0 | T2 | Generate `out/b.txt` (independent of T1); run its unit test; commit |
| 1 | T3 | Read `out/a.txt`, derive `out/c.txt`; run its unit test; commit |
| 1 | T4 | Read `out/b.txt`, derive `out/d.txt`; run its unit test; commit |

Wave 0 tasks are parallel-safe (independent file writes).
Wave 1 tasks each depend on exactly one wave-0 task's output — this proves
the wave barrier is exercised and that per-task briefs are self-contained
enough that a fresh worker picks up the previous wave's artifacts through
file reads, not shared process memory.

Each task is ~30 seconds of real work: file I/O + trivial test + git commit.
Not a no-op — but not code-gen either, because the benchmark measures the
*orchestration overhead*, not model throughput.

## Why 4 tasks / 2 waves

- 2+ parallel tasks in a wave → exercises the concurrency pool
- 2 waves → exercises the strict wave barrier
- Trivial work → keeps the benchmark's dominant cost orchestration overhead
  (spawn time, brief build time, state.json writes, etc.), not computation

## Invariants

- Runs must be reproducible: same fixture → same file contents
- Fixture is self-contained: copy to a tmp dir, run, throw away
- `tasks.md` parses cleanly with `bin/gsd-t-orchestrator-queue.cjs`
- Fixture carries its own `completion-signal-contract.md` so
  `bin/gsd-t-task-brief.js` can build briefs without reaching out to the
  parent repo's contracts

## Reserved: benchmark driver

`bin/gsd-t-benchmark-orchestrator.js` (D0-T2, not yet built) copies this
fixture to a fresh tmp dir for each run, resets git, drives both paths,
and records wall-clock deltas. The full 3-run verdict is an operator action.
