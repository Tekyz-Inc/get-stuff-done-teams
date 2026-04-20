# Tasks: bench-d4

## Summary
Five-task benchmark workload (one of four domains). Wave 0: two parallel
generators. Wave 1: two derivers. Wave 2: one aggregator.

## Tasks

### Task 1: Generate out/d4-a.txt
- **Files**: `out/d4-a.txt` (NEW), `test/bench/d4-a.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d4-a.txt` exists and contains the exact string `d4-alpha`
  - `test/bench/d4-a.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d4-t1`

### Task 2: Generate out/d4-b.txt
- **Files**: `out/d4-b.txt` (NEW), `test/bench/d4-b.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d4-b.txt` exists and contains the exact string `d4-beta`
  - `test/bench/d4-b.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d4-t2`

### Task 3: Derive out/d4-c.txt from out/d4-a.txt
- **Files**: `out/d4-c.txt` (NEW), `test/bench/d4-c.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d4-a.txt`; writes `out/d4-c.txt` containing the uppercased payload `D4-ALPHA`
  - `test/bench/d4-c.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d4-t3`

### Task 4: Derive out/d4-d.txt from out/d4-b.txt
- **Files**: `out/d4-d.txt` (NEW), `test/bench/d4-d.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d4-b.txt`; writes `out/d4-d.txt` containing the uppercased payload `D4-BETA`
  - `test/bench/d4-d.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d4-t4`

### Task 5: Aggregate out/d4-sum.txt
- **Files**: `out/d4-sum.txt` (NEW), `test/bench/d4-sum.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 3, Requires Task 4
- **Wave**: 2
- **Acceptance criteria**:
  - Reads `out/d4-c.txt` and `out/d4-d.txt`; writes `out/d4-sum.txt` containing the two payloads joined by `|` (i.e. `D4-ALPHA|D4-BETA`)
  - `test/bench/d4-sum.test.js` asserts the concatenation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d4-t5`

## Execution Estimate
- Total tasks: 5
- Wave 0: 2 parallel generators
- Wave 1: 2 parallel derivers
- Wave 2: 1 aggregator
- Estimated checkpoints: 0
