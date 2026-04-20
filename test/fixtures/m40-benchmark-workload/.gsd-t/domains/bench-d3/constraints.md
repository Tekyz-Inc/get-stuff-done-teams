# Constraints: bench-d3

## Must Follow
- Each task is ~15-30 s of real work: file I/O + trivial test + commit.
- Wave 0 tasks write disjoint files — do not read each other's output.
- Wave 1 tasks read exactly one wave-0 task's output (T3 ← T1, T4 ← T2).
- Wave 2 task reads both wave-1 outputs and emits one aggregate file.
- Every task commits on `main` with message starting with its task id
  (e.g. `bench-d3-t1: …`).

## Must Not
- Call out to the network.
- Run long-running builds or bundlers.
- Modify files outside the owned scope (other domains' `out/` files, etc.).
