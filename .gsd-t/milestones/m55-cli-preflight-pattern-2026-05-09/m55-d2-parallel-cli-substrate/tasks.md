# Tasks: m55-d2-parallel-cli-substrate

**Domain wave**: Wave 2 (after D3 ships ratelimit-map.json — calibration only; D2 ships agnostic)
**Depends on**: D3's `.gsd-t/ratelimit-map.json` (consume-only at recommend-defaults time, NOT imported)
**Depended on by**: D5 (Track 2 of verify-gate fans out via D2's `runParallel`)

## T1 — Author `parallel-cli-contract.md` v1.0.0 STABLE

**Output**: `.gsd-t/contracts/parallel-cli-contract.md`
**Acceptance**: API surface (`runParallel({workers, maxConcurrency, failFast?, teeDir?})`), envelope shape, fail-fast + timeout policy, captureSpawn invariant (CLI workers without LLM usage emit `—` not `0`), tee-NDJSON path rule, results sorted by workerId, wallClockMs is orchestrator real-time.

## T2 — Implement `bin/parallel-cli.cjs` library + thin CLI

**Output**: `bin/parallel-cli.cjs`
**Acceptance**: exports `runParallel(...)`; CLI form `node bin/parallel-cli.cjs --plan plan.json --json` reads plan from file or stdin; honors `maxConcurrency` (no implicit default leak); fail-fast cancels in-flight via SIGTERM → 5s grace → SIGKILL; per-worker timeout same shape as fail-fast cancellation but only for that worker; every spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn` (CLI workers pass usage envelope `undefined` → renders `—`).

## T3 — Implement `bin/parallel-cli-tee.cjs` helper

**Output**: `bin/parallel-cli-tee.cjs`
**Acceptance**: exports tee helper that streams stdout/stderr to `{teeDir}/{workerId}.ndjson`; in-memory cap at 1MB per stream then rotates to temp file; returns final path in result.

## T4 — Author `test/m55-d2-parallel-cli.test.js`

**Output**: ≥6 unit tests
**Acceptance**: happy parallel (3 workers, all succeed), exceeds-cap (5 workers maxConcurrency=2 → throttled), single-fail-fast (cancels siblings), per-worker-timeout (kills only that worker), tee-paths-valid (NDJSON files exist + parse), captureSpawn-invariant (proxy mock confirms wrapper invoked).

## T5 — Implement `bin/m55-substrate-proof.cjs` proof harness

**Output**: `bin/m55-substrate-proof.cjs`
**Acceptance**: runs N (≥3) deterministic CLI workers (e.g., parallel `tsc --noEmit` against fixture subdirs) sequentially, then via `runParallel`, reports wall-clock ratio. Mirrors `bin/m46-iter-proof.cjs` shape. Reports ≥3× speedup or fails the success-criterion-2 measurement (D5 wave acts on the result).

## T6 — Run substrate proof; record numbers

**Output**: stdout dump appended to `.gsd-t/metrics/m55-substrate-proof.txt` with sequential vs parallel wall-clock + ratio
**Acceptance**: ratio ≥ 3.0× (success-criterion-2). If <3×, recalibrate (charter rule — do not tag).

## T7 — Run full test suite; confirm zero regressions

**Output**: green `npm test`
**Acceptance**: baseline 2262/2262 preserved + D2 tests added.

## T8 — Commit D2

**Output**: single commit `feat(m55-d2): parallel-cli substrate + contract STABLE + 3.x speedup proof`
**Acceptance**: Pre-Commit Gate passes; commit message includes the measured speedup ratio.

## D2 Checkpoint

After T1–T8: D2 ready for D5 to import. Substrate proven. Wave 2 → Wave 3 gate met (D5 needs D2 STABLE).
