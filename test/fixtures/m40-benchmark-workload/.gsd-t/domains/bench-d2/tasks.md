# Tasks: bench-d2

## Summary
Five-task benchmark workload (one of four domains). Wave 0: two parallel
generators. Wave 1: two derivers. Wave 2: one aggregator.

## Tasks

### Task 1: Generate out/d2-a.txt
- **Files**: `out/d2-a.txt` (NEW), `test/bench/d2-a.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d2-a.txt` exists and contains the exact string `d2-alpha`
  - `test/bench/d2-a.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d2-t1`

### Task 2: Generate out/d2-b.txt
- **Files**: `out/d2-b.txt` (NEW), `test/bench/d2-b.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d2-b.txt` exists and contains the exact string `d2-beta`
  - `test/bench/d2-b.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d2-t2`

### Task 3: Derive out/d2-c.txt from out/d2-a.txt
- **Files**: `out/d2-c.txt` (NEW), `test/bench/d2-c.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d2-a.txt`; writes `out/d2-c.txt` containing the uppercased payload `D2-ALPHA`
  - `test/bench/d2-c.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d2-t3`

### Task 4: Derive out/d2-d.txt from out/d2-b.txt
- **Files**: `out/d2-d.txt` (NEW), `test/bench/d2-d.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d2-b.txt`; writes `out/d2-d.txt` containing the uppercased payload `D2-BETA`
  - `test/bench/d2-d.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d2-t4`

### Task 5: Aggregate out/d2-sum.txt
- **Files**: `out/d2-sum.txt` (NEW), `test/bench/d2-sum.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 3, Requires Task 4
- **Wave**: 2
- **Acceptance criteria**:
  - Reads `out/d2-c.txt` and `out/d2-d.txt`; writes `out/d2-sum.txt` containing the two payloads joined by `|` (i.e. `D2-ALPHA|D2-BETA`)
  - `test/bench/d2-sum.test.js` asserts the concatenation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d2-t5`

## Execution Estimate
- Total tasks: 5
- Wave 0: 2 parallel generators
- Wave 1: 2 parallel derivers
- Wave 2: 1 aggregator
- Estimated checkpoints: 0
