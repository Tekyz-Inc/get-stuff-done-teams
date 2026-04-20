# Tasks: bench-d1

## Summary
Four-task benchmark workload: 2 parallel-safe tasks in wave 0, 2 sequential
tasks in wave 1 (each reading one wave-0 task's output). Measures
orchestration overhead, not model throughput.

## Tasks

### Task 1: Generate out/a.txt
- **Files**: `out/a.txt` (NEW), `test/bench/a.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/a.txt` exists and contains the exact string `alpha-payload`
  - `test/bench/a.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t1`

### Task 2: Generate out/b.txt
- **Files**: `out/b.txt` (NEW), `test/bench/b.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/b.txt` exists and contains the exact string `beta-payload`
  - `test/bench/b.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t2`

### Task 3: Derive out/c.txt from out/a.txt
- **Files**: `out/c.txt` (NEW), `test/bench/c.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/a.txt`; writes `out/c.txt` containing the uppercased payload `ALPHA-PAYLOAD`
  - `test/bench/c.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t3`

### Task 4: Derive out/d.txt from out/b.txt
- **Files**: `out/d.txt` (NEW), `test/bench/d.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/b.txt`; writes `out/d.txt` containing the uppercased payload `BETA-PAYLOAD`
  - `test/bench/d.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t4`

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 2 (T1, T2 — wave 0 parallel)
- Blocked tasks (within domain): 2 (T3 ← T1, T4 ← T2 — wave 1)
- Estimated checkpoints: 0 (this is itself the benchmark)
