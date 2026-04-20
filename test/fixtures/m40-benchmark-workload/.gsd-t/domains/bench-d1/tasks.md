# Tasks: bench-d1

## Summary
Five-task benchmark workload (one of four domains). Wave 0: two parallel
generators. Wave 1: two derivers, each reading one wave-0 output.
Wave 2: one aggregator combining both wave-1 outputs.

Shape is identical across bench-d1…bench-d4 so total fixture = 20 tasks.

## Tasks

### Task 1: Generate out/d1-a.txt
- **Files**: `out/d1-a.txt` (NEW), `test/bench/d1-a.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d1-a.txt` exists and contains the exact string `d1-alpha`
  - `test/bench/d1-a.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t1`

### Task 2: Generate out/d1-b.txt
- **Files**: `out/d1-b.txt` (NEW), `test/bench/d1-b.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d1-b.txt` exists and contains the exact string `d1-beta`
  - `test/bench/d1-b.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t2`

### Task 3: Derive out/d1-c.txt from out/d1-a.txt
- **Files**: `out/d1-c.txt` (NEW), `test/bench/d1-c.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d1-a.txt`; writes `out/d1-c.txt` containing the uppercased payload `D1-ALPHA`
  - `test/bench/d1-c.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t3`

### Task 4: Derive out/d1-d.txt from out/d1-b.txt
- **Files**: `out/d1-d.txt` (NEW), `test/bench/d1-d.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d1-b.txt`; writes `out/d1-d.txt` containing the uppercased payload `D1-BETA`
  - `test/bench/d1-d.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t4`

### Task 5: Aggregate out/d1-sum.txt
- **Files**: `out/d1-sum.txt` (NEW), `test/bench/d1-sum.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 3, Requires Task 4
- **Wave**: 2
- **Acceptance criteria**:
  - Reads `out/d1-c.txt` and `out/d1-d.txt`; writes `out/d1-sum.txt` containing the two payloads joined by `|` (i.e. `D1-ALPHA|D1-BETA`)
  - `test/bench/d1-sum.test.js` asserts the concatenation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d1-t5`

## Execution Estimate
- Total tasks: 5
- Wave 0: 2 parallel generators
- Wave 1: 2 parallel derivers (each depends on one wave-0 task)
- Wave 2: 1 aggregator (depends on both wave-1 tasks)
- Estimated checkpoints: 0 (this is itself the benchmark)
