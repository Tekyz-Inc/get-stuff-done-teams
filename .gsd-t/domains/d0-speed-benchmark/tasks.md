# Tasks: d0-speed-benchmark

## Summary
The kill-switch gate. Builds a deterministic benchmark workload, runs it through the minimal D1+D2 orchestrator slice and through in-session execution, records wall-clock for both, and produces a PASS/FAIL verdict. FAIL halts M40 before D4/D5 ever start.

## Tasks

### Task 1: Benchmark workload fixture
- **Files**: `test/fixtures/m40-benchmark-workload/` (NEW) — minimal `.gsd-t/` structure with 4–6 tiny tasks designed to exercise parallelism
- **Contract refs**: N/A (fixture)
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - Fixture contains 1 domain with 4 tasks: 2 in wave 0 (parallel-safe, independent file writes), 2 in wave 1 (each depends on one wave-0 task's output)
  - Each task is ~30 seconds of real work: generate a small file, run a trivial test, commit. NOT a no-op.
  - Fixture is self-contained: running the workload produces measurable effects in a tmp dir, leaves no trace in the main repo
  - Fixture's own `tasks.md` parses cleanly with D1's queue parser
  - README in the fixture dir explains what's being benchmarked and why

### Task 2: Benchmark driver
- **Files**: `bin/gsd-t-benchmark-orchestrator.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: Requires Task 1, BLOCKED BY d1-orchestrator-core Task 5 (needs CLI), BLOCKED BY d2-task-brief-builder Task 3 (needs briefs)
- **Wave**: 0
- **Acceptance criteria**:
  - CLI: `gsd-t benchmark-orchestrator --runs 3 [--report-path docs/m40-benchmark-report.md]`
  - For each of N runs: copies fixture to a fresh tmp dir, resets git, runs orchestrator side, captures wall-clock, cleans up
  - For each of N runs: copies fixture to a second fresh tmp dir, runs in-session equivalent (spawns `gsd-t-execute` against the same fixture), captures wall-clock
  - Records `Date.now()` deltas to ms; reports node version, OS, CPU count, free RAM
  - Writes machine-readable summary to `.gsd-t/benchmark-results.json` AND human-readable verdict to `docs/m40-benchmark-report.md`
  - PASS threshold: `median(orchestrator_ms) <= median(insession_ms) * 1.05` (5% tolerance)
  - FAIL prints `BENCHMARK: FAIL — orchestrator {N}ms vs in-session {M}ms — M40 HALT RECOMMENDED`
  - PASS prints `BENCHMARK: PASS — orchestrator {N}ms vs in-session {M}ms — Waves 2+3+4 unlocked`

### Task 3: Automated test wrapper + verdict recording
- **Files**: `test/m40-speed-benchmark.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 2
- **Wave**: 0
- **Acceptance criteria**:
  - Test runs a single-run (`--runs 1`) benchmark against the fixture as a smoke test (not the full 3-run verdict — that's an operator action)
  - Asserts: driver exits 0, produces `.gsd-t/benchmark-results.json`, produces report file
  - The FULL 3-run benchmark verdict is executed by an operator invoking `gsd-t benchmark-orchestrator --runs 3` and committing the produced `docs/m40-benchmark-report.md`
  - After verdict is recorded: progress.md Decision Log entry `[benchmark-gate] PASS|FAIL — details...`
  - If FAIL is recorded, a follow-up task is auto-created in progress.md: "M40 halted at Wave 0 gate; D4/D5 deferred"

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 1 (Task 2 on D1 Task 5 + D2 Task 3)
- Blocked tasks (within domain): 2
- Estimated checkpoints: 1 (the gate itself — THE decisive checkpoint of M40)
