# Domain: m46-d1-iter-parallel

## Responsibility

Replace the serial `while` loop in `bin/gsd-t-unattended.cjs:969` with a **mode-safe iteration-parallel driver** so the supervisor can run N iterations concurrently when the workload permits. This closes surface **2A** of the 2026-04-23 five-surface parallelism audit (status: ✗ NOT IMPLEMENTED → ✓).

Today: the supervisor main loop steps through iterations back-to-back; the only parallelism in the unattended leg is the per-iter fan-out via `_spawnWorkerFanOut` at line 1562 (surface 2B, owned by D2 — worker-side sub-dispatch). Net: iteration-level throughput is capped at 1.

D1 adds a top-level `Promise.all` over a mode-safe batch of iterations. Mode-safety: the driver inspects state and decides how many iterations can safely run concurrently without stepping on shared resources (milestone boundaries, verify gates, `complete-milestone` single-shots). When the batch size is 1, behavior is identical to today — the driver degrades cleanly.

## Owned Files/Directories

- `bin/gsd-t-unattended.cjs` — **shared with D2** by heading convention. D1 owns:
  - The main loop at line ~969 (the `while (!isDone(state) && !stopCheck(projectDir))` block).
  - A new private helper `_runIterParallel(state, opts, iterFn, batchSize) → Promise<IterResult[]>` that replaces the serial step.
  - A new private helper `_computeIterBatchSize(state, opts) → number` that decides batch size based on `state.status`, remaining milestone work, and `opts.maxIterParallel` (default 4, cap 8).
  - D1 does **not** touch `_spawnWorkerFanOut` (line 1562) or `_partitionTasks` (line 1623) — those are owned by D2's sub-dispatch path (read-only from D1's perspective).
- `test/m46-d1-iter-parallel.test.js` (NEW) — unit tests:
  1. Serial fallback: `batchSize=1` runs iterations strictly sequentially; no Promise.all call.
  2. Parallel batch: `batchSize=3` dispatches 3 iters concurrently; Promise.all resolves with length 3.
  3. Mode-safety: when one iter returns `status=verify-needed`, the next batch is forced to 1 until verify clears.
  4. Error isolation: a single iter rejection does not cancel sibling iters; driver records the failure and continues.
  5. Stop-check: `stopCheck(projectDir)` is honored between batches, not mid-batch (would orphan work).
  6. State reconciliation: after a parallel batch, the driver merges per-iter state deltas without losing any task-done markers.
- `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0 (NEW) — documents:
  - `iterBatchSize` semantics (what's safe to parallelize vs what forces serial).
  - The `IterResult` shape returned by each iter (`{status, tasksDone, verifyNeeded, artifacts}`).
  - The reconciliation rule (append-only state deltas, last-writer-wins on milestone status).
  - The stop-check invariant (checked at batch boundaries only).
- `bin/m46-iter-proof.cjs` (NEW) — M44-style proof: runs a synthetic 10-iter workload once serially, once at batch=4. Writes `.gsd-t/metrics/m46-iter-proof.json` with `T_serial`, `T_par`, `speedup`, `parallelism_factor`. Expected: `T_par/T_serial ≤ 0.35`, `speedup ≥ 3.0` at batch=4 (linear headroom given iters are independent).

## NOT Owned (do not modify)

- `bin/gsd-t-parallel.cjs` — the in-session dispatch instrument; D1 consumes nothing from it directly (iter-parallel is a different layer from task-fan-out).
- `bin/headless-auto-spawn.cjs` — headless primitive; untouched.
- `bin/gsd-t-unattended.cjs::_spawnWorkerFanOut` and `::_partitionTasks` — owned by D2's sibling concerns.
- `commands/gsd-t-resume.md` — owned by D2.
- Any `commands/*.md` — iter-parallel is an internal supervisor concern; no command-file ripple.

## Contract Surface

```js
// bin/gsd-t-unattended.cjs (new exports for test only)
module.exports.__test__ = {
  _runIterParallel,
  _computeIterBatchSize,
};
```

Public behavior: none. The supervisor binary's CLI contract is unchanged (`gsd-t unattended` args identical). Observable differences:

- Throughput when workload permits: up to 4× iteration rate.
- Event-stream `.gsd-t/.unattended/run.log` lines include `iter-batch-size=N` header per batch.
- `.gsd-t/.unattended/state.json` gains a `lastBatch: {size, startedAt, endedAt, results[]}` field (additive; legacy readers unaffected).

## Doc Ripple (D1 responsibility)

- `docs/architecture.md` — add a new `## M46 Iteration-Parallel Supervisor` section (append-only; D2 adds a disjoint `## M46 Worker Sub-Dispatch` section — no merge conflict).
- `docs/requirements.md` — add a new `## M46 D1 Iteration Parallelism` requirement block.
- `.gsd-t/progress.md` — Decision Log entry on D1 completion (handled in complete-milestone).
