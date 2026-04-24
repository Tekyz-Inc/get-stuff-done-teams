# M46-D1 — Iter-Parallel Supervisor — Tasks

## Wave 1 (parallel-safe with M46-D2 — file-disjoint per scope.md)

- [x] **M46-D1-T1** — Write `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0 defining `iterBatchSize` semantics, `IterResult` shape, reconciliation rule, stop-check invariant
  - Contract-first per GSD-T methodology; blocks all later tasks
  - touches: `.gsd-t/contracts/iter-parallel-contract.md`

- [x] **M46-D1-T2** — Extract the body of the existing `while` loop at `bin/gsd-t-unattended.cjs:969` into a private `async function _runOneIter(state, opts) → IterResult` helper. No behavior change.
  - Refactor only — all existing tests must stay green
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T3** — Add private helper `_computeIterBatchSize(state, opts) → number` with mode-safety rules (verify-needed → 1, milestone-boundary → 1, else min(opts.maxIterParallel ?? 4, remainingIters, 8))
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T4** — Add private helper `_runIterParallel(state, opts, iterFn, batchSize) → Promise<IterResult[]>` using `Promise.all`. Error isolation via `allSettled` internally; failures logged but don't cancel siblings.
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T5** — Replace the serial `while` loop with: `while (!isDone() && !stopCheck()) { const batch = _computeIterBatchSize(...); const results = await _runIterParallel(state, opts, _runOneIter, batch); _reconcile(state, results); }`
  - The only production-code change in the main loop
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T6** — Add `_reconcile(state, results)` that merges per-iter deltas (append-only on `completedTasks`, last-writer-wins on `status`)
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T7** — Write `test/m46-d1-iter-parallel.test.js` covering the 6 cases enumerated in scope.md §Owned Files
  - Uses Node built-in test runner; mocks fs + child_process at module boundary
  - touches: `test/m46-d1-iter-parallel.test.js`

- [x] **M46-D1-T8** — Emit `iter-batch-size=N` header into `.gsd-t/.unattended/run.log` at batch start; emit `iter-batch-complete n=N ok=K fail=F duration=Ts` at batch end
  - Observability — follows M44 event-stream conventions
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T9** — Extend `state.json` schema to include optional `lastBatch` field; default when absent
  - Backward compatible
  - touches: `bin/gsd-t-unattended.cjs`

- [x] **M46-D1-T10** — Write `bin/m46-iter-proof.cjs` — synthetic 10-iter workload, serial vs batch=4, emits `.gsd-t/metrics/m46-iter-proof.json`
  - Proof instrument paralleling `bin/m44-proof-measure.cjs`
  - touches: `bin/m46-iter-proof.cjs`

- [x] **M46-D1-T11** — Run `bin/m46-iter-proof.cjs`, verify `T_par/T_serial ≤ 0.35` and `speedup ≥ 3.0`; record numbers in Decision Log
  - Measurement, not claim (per `feedback_measure_dont_claim`)
  - touches: `.gsd-t/metrics/m46-iter-proof.json`, `.gsd-t/progress.md`

- [x] **M46-D1-T12** — Doc ripple: `docs/architecture.md` (new `## M46 Iteration-Parallel Supervisor` section), `docs/requirements.md` (new requirement block)
  - Disjoint heading from D2's section
  - touches: `docs/architecture.md`, `docs/requirements.md`

- [x] **M46-D1-T13** — Run full suite (`npm test`); confirm 2016/2016 green + new M46 D1 tests pass
  - Zero regression invariant
