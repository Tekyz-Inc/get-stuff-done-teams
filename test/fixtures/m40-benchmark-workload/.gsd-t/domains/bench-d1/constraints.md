# Constraints: bench-d1

## Must Follow
- Each task is ~30 s of real work: file I/O + trivial test + commit.
- Wave 0 tasks write disjoint files — do not read each other's output.
- Wave 1 tasks read exactly one wave-0 task's output (T3 ← T1, T4 ← T2).
- Every task commits on `main` with message starting with its task id.

## Must Not
- Call out to the network.
- Run long-running builds or bundlers.
- Modify files outside the owned scope.
