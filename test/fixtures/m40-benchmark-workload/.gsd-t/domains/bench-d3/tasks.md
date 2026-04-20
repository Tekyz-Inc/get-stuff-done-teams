# Tasks: bench-d3

## Summary
Five-task benchmark workload (one of four domains). Wave 0: two parallel
generators. Wave 1: two derivers. Wave 2: one aggregator.

## Tasks

### Task 1: Generate out/d3-a.txt
- **Files**: `out/d3-a.txt` (NEW), `test/bench/d3-a.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d3-a.txt` exists and contains the exact string `d3-alpha`
  - `test/bench/d3-a.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d3-t1`

### Task 2: Generate out/d3-b.txt
- **Files**: `out/d3-b.txt` (NEW), `test/bench/d3-b.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - `out/d3-b.txt` exists and contains the exact string `d3-beta`
  - `test/bench/d3-b.test.js` asserts the file contents; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d3-t2`

### Task 3: Derive out/d3-c.txt from out/d3-a.txt
- **Files**: `out/d3-c.txt` (NEW), `test/bench/d3-c.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d3-a.txt`; writes `out/d3-c.txt` containing the uppercased payload `D3-ALPHA`
  - `test/bench/d3-c.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d3-t3`

### Task 4: Derive out/d3-d.txt from out/d3-b.txt
- **Files**: `out/d3-d.txt` (NEW), `test/bench/d3-d.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 2
- **Wave**: 1
- **Acceptance criteria**:
  - Reads `out/d3-b.txt`; writes `out/d3-d.txt` containing the uppercased payload `D3-BETA`
  - `test/bench/d3-d.test.js` asserts the derivation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d3-t4`

### Task 5: Aggregate out/d3-sum.txt
- **Files**: `out/d3-sum.txt` (NEW), `test/bench/d3-sum.test.js` (NEW)
- **Contract refs**: NONE
- **Dependencies**: Requires Task 3, Requires Task 4
- **Wave**: 2
- **Acceptance criteria**:
  - Reads `out/d3-c.txt` and `out/d3-d.txt`; writes `out/d3-sum.txt` containing the two payloads joined by `|` (i.e. `D3-ALPHA|D3-BETA`)
  - `test/bench/d3-sum.test.js` asserts the concatenation; `npm test` passes
  - Progress.md has a Decision Log entry for `bench-d3-t5`

## Execution Estimate
- Total tasks: 5
- Wave 0: 2 parallel generators
- Wave 1: 2 parallel derivers
- Wave 2: 1 aggregator
- Estimated checkpoints: 0
