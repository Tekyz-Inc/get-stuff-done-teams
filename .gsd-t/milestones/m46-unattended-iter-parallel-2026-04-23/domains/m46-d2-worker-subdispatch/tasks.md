# M46-D2 — Worker Sub-Dispatch — Tasks

## Wave 1 (parallel-safe with M46-D1 — file-disjoint per scope.md)

- [x] **M46-D2-T1** — Bump `.gsd-t/contracts/headless-default-contract.md` from v2.0.0 → v2.1.0. Add §Worker Sub-Dispatch section + new `unattended-worker-sub` kind enum value.
  - Contract-first
  - touches: `.gsd-t/contracts/headless-default-contract.md`

- [x] **M46-D2-T2** — Write `bin/gsd-t-worker-dispatch.cjs` exporting `dispatchWorkerTasks(...)`. Disjointness check, delegation to `runDispatch`, spawn-plan writer with `kind: 'unattended-worker-sub'`.
  - Zero new deps; reuses `bin/gsd-t-parallel.cjs::runDispatch`
  - touches: `bin/gsd-t-worker-dispatch.cjs`

- [x] **M46-D2-T3** — Add CLI entry: `node bin/gsd-t-worker-dispatch.cjs --parent-session ID --tasks PATH` parses argv, reads tasks.json, calls `dispatchWorkerTasks`, emits JSON result to stdout
  - Needed for the resume.md hand-off
  - touches: `bin/gsd-t-worker-dispatch.cjs`

- [x] **M46-D2-T4** — Edit `commands/gsd-t-resume.md` Step 0 `GSD_T_UNATTENDED_WORKER=1` branch. Add sub-section: "If tasks.length > 1 AND tasks file-disjoint, invoke worker-dispatch CJS; else fall through to current behavior."
  - Additive only — no deletion from existing Step 0
  - touches: `commands/gsd-t-resume.md`

- [x] **M46-D2-T5** — Update `bin/spawn-plan-writer.cjs` to accept `unattended-worker-sub` as a valid kind value. (Enum list lives at line ~44 per audit.)
  - Additive; D2 extends enum
  - touches: `bin/spawn-plan-writer.cjs`

- [x] **M46-D2-T6** — Write `test/m46-d2-worker-subdispatch.test.js` covering the 6 cases enumerated in scope.md §Owned Files
  - Mock `runDispatch` at module boundary
  - touches: `test/m46-d2-worker-subdispatch.test.js`

- [x] **M46-D2-T7** — Write `bin/m46-worker-proof.cjs` — supervisor-worker proof harness, 6 file-disjoint synthetic tasks, serial vs parallel. Emits `.gsd-t/metrics/m46-worker-proof.json`.
  - M44-style proof
  - touches: `bin/m46-worker-proof.cjs`

- [x] **M46-D2-T8** — Run `bin/m46-worker-proof.cjs`, verify `speedup ≥ 2.5`; record numbers in Decision Log
  - Measurement, not claim
  - touches: `.gsd-t/metrics/m46-worker-proof.json`, `.gsd-t/progress.md`

- [x] **M46-D2-T9** — Doc ripple: `docs/architecture.md` (new `## M46 Worker Sub-Dispatch` section), `docs/requirements.md` (new requirement block)
  - Disjoint from D1's sections
  - touches: `docs/architecture.md`, `docs/requirements.md`

- [x] **M46-D2-T10** — Run full suite (`npm test`); confirm 2016/2016 green + new M46 D2 tests pass
  - Zero regression

- [x] **M46-D2-T11** — Integration sanity: spin up one unattended iter locally with 3 worker tasks, observe 3 concurrent sub-worker processes via `ps` + spawn-plan frames
  - Smoke test
