# M40 Benchmark Workload

Deterministic workload for the D0 speed-benchmark kill-switch gate. Compares
wall-clock time between:

- **Orchestrator path**: one `claude -p` spawn per task, external wave-join loop
- **In-session path**: a single Claude Code session running `/gsd-t-execute`

## Workload shape

Four domains (`bench-d1`, `bench-d2`, `bench-d3`, `bench-d4`), each with 5
tasks following the same shape. Total: **20 tasks in 3 waves**.

| Wave | Tasks | Per-domain pattern |
|------|-------|--------------------|
| 0 | 8 (2 × 4 domains) | T1 + T2: parallel generators (write `out/dN-a.txt` / `out/dN-b.txt`) |
| 1 | 8 (2 × 4 domains) | T3 ← T1, T4 ← T2: derive `out/dN-c.txt` / `out/dN-d.txt` |
| 2 | 4 (1 × 4 domains) | T5: aggregate both wave-1 outputs → `out/dN-sum.txt` |

Within each wave, every task is parallel-safe (cross-domain tasks touch
disjoint files; same-domain tasks within a wave touch disjoint files).
Between waves, the strict barrier is exercised — wave 1 cannot start until
all of wave 0 completes.

Each task is ~15-30 seconds of real work: file I/O + trivial test + git
commit. Not a no-op, but not code-gen either — the benchmark measures
*orchestration overhead at scale*, not model throughput.

## Why 20 tasks / 4 domains / 3 waves

- **20 tasks** is enough that per-spawn cold-start cost is dwarfed by
  actual work. The original 4-task fixture made orchestrator cold-start
  overhead dominant (1 extra wave's worth of spawn time was 12% of total).
- **4 domains** creates enough wave-0 parallelism (8 tasks) that the
  orchestrator's concurrency pool is exercised non-trivially. With
  `--max-parallel 8`, all 8 wave-0 tasks run truly concurrent.
- **3 waves** proves the barrier holds even with wider waves; wave 2
  (aggregators) validates cross-wave data flow across the barrier.
- This matches real M8-sized workloads (M37-M39 each shipped ~10-20 tasks
  across 2-4 waves) that M40 is designed to execute without compaction.

## Invariants

- Runs must be reproducible: same fixture → same file contents
- Fixture is self-contained: copy to a tmp dir, run, throw away
- `tasks.md` in every domain parses cleanly with
  `bin/gsd-t-orchestrator-queue.cjs`
- Fixture carries its own `completion-signal-contract.md` so
  `bin/gsd-t-task-brief.js` can build briefs without reaching out to the
  parent repo's contracts
- Owned-file patterns are domain-scoped (`out/d1-*`, `out/d2-*`, …) so
  cross-domain tasks cannot cause false-positive uncommitted-changes
  failures during completion check

## Benchmark driver

`bin/gsd-t-benchmark-orchestrator.js` copies this fixture to a fresh tmp
dir for each run, resets git, drives both paths, and records wall-clock
deltas. Spawns orchestrator with `--max-parallel 8 --worker-timeout 180000`.
The full 3-run verdict is an operator action — requires live `claude` auth.

Rough expected timings (per run):
- Orchestrator: 3 waves × ~30s per wave = ~90s (dominated by slowest task in wave)
- In-session:   20 tasks × ~15s per task serial = ~300s
- PASS expected at ~0.3× (orchestrator roughly 3× faster than in-session)
