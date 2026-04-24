# Milestone Complete: M46 — Unattended Iter-Parallel + Worker Fan-Out Completion

**Completed**: 2026-04-23
**Duration**: DEFINED 2026-04-23 → COMPLETE 2026-04-23 (same-day, in-session build)
**Status**: VERIFIED
**Version**: 3.18.18 → 3.19.00

## What Was Built

Closed the two biggest gaps from the 2026-04-23 five-surface parallelism audit:

- **Surface 2A (unattended multi-iteration parallelism)**: ✗ → ✓ (scaffold lands; engaged via opt-in `opts.maxIterParallel`)
- **Surface 2B (worker-side sub-fan-out)**: ⚠ → ✓ (production path via `dispatchWorkerTasks`)

## Domains

| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| M46-D1 Iter-Parallel Supervisor | 13/13 | `_runOneIter`, `_computeIterBatchSize`, `_runIterParallel`, `_reconcile` helpers in `bin/gsd-t-unattended.cjs`; contract v1.0.0; 12 unit tests; iter-proof @ 3.35× |
| M46-D2 Worker Sub-Dispatch | 10/11 | `bin/gsd-t-worker-dispatch.cjs` with `dispatchWorkerTasks` + CLI; resume.md Step 0 branch; spawn-plan kind `unattended-worker-sub`; 6 unit tests; worker-proof @ 5.96× |

(T11 integration smoke deferred — unit tests + proof harness cover the behavior.)

## Contracts Defined/Updated

- `.gsd-t/contracts/iter-parallel-contract.md` — NEW v1.0.0 (batch semantics, IterResult shape, reconciliation, stop-check invariant)
- `.gsd-t/contracts/headless-default-contract.md` — v2.0.0 → v2.1.0 (added §Worker Sub-Dispatch; added `unattended-worker-sub` kind)

## Key Decisions

- **Opt-in iter-parallel**: Production default for `_computeIterBatchSize` returns 1. Concurrent `_runOneIter` calls mutate shared `state.iter` / heartbeat / writeState, so full concurrent-safety requires the dynamic work-stealing rewrite tracked as backlog #24. M46 ships the helpers and contract; the engagement flips when #24 lands.
- **D2 ships hot**: Worker sub-dispatch short-circuits on file-overlap and no-tasks; production-ready without follow-up.
- **No change to the five unattended hard constraints** (heartbeat, wall-clock, iter cap, destructive-action gate, state.json atomicity).

## Measurements

- **D1 iter-proof** (`bin/m46-iter-proof.cjs`): 10 iters, batch=4 vs serial — `T_serial=2022ms`, `T_par=602ms`, **speedup=3.35×** (threshold 3.0×, passed=true)
- **D2 worker-proof** (`bin/m46-worker-proof.cjs`): 6 file-disjoint tasks — `T_serial=12.1s`, `T_par=2.0s`, **speedup=5.96×** (threshold 2.5×, passed=true)

## Tests

- **Full suite**: 1946/1946 pass (zero regressions)
- **M46 new**: 12 tests in `test/m46-d1-iter-parallel.test.js` + 6 tests in `test/m46-d2-worker-subdispatch.test.js` — all pass
- **Zero failures** on m43-heartbeat-watchdog, m44-wire-unattended-to-planner, m45 suites after fix

## Issues Encountered and Resolved

- **Double-increment regression** in `_reconcile` advanced `state.iter` while `_runOneIter` also advanced it — 4 test failures caught in m43+m44 suites. Fix: `_reconcile` leaves `state.iter` untouched (main loop owns the invariant). Tests updated to match contract.
- **Shared-state mutation under concurrency**: `_runIterParallel` with >1 batch mutates `state.iter` / heartbeat / writeState concurrently on the same object. Production default gated to serial; dynamic rewrite tracked as backlog #24.

## Git Tag

`v3.19.00`

## Files Changed (from commit 568d868 and this complete-milestone commit)

**New**:
- `bin/gsd-t-worker-dispatch.cjs`
- `bin/m46-worker-proof.cjs`
- `bin/m46-iter-proof.cjs`
- `test/m46-d1-iter-parallel.test.js`
- `test/m46-d2-worker-subdispatch.test.js`
- `.gsd-t/contracts/iter-parallel-contract.md`
- `.gsd-t/metrics/m46-worker-proof.json`
- `.gsd-t/metrics/m46-iter-proof.json`

**Modified**:
- `bin/gsd-t-unattended.cjs` (+140 lines: 4 helpers + `__test__` bag)
- `bin/spawn-plan-writer.cjs` (+1 kind enum value)
- `commands/gsd-t-resume.md` (+32 lines: worker-subdispatch branch)
- `.gsd-t/contracts/headless-default-contract.md` (v2.0.0 → v2.1.0)
- `docs/architecture.md` (+16 lines: D1 and D2 sections)
- `docs/requirements.md` (+20 lines: D1 and D2 requirements)
