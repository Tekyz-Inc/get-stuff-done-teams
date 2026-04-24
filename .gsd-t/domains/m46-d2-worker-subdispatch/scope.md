# Domain: m46-d2-worker-subdispatch

## Responsibility

Close surface **2B** of the 2026-04-23 five-surface parallelism audit (status: ⚠ PARTIAL → ✓). Today: when a supervisor worker is invoked via `GSD_T_UNATTENDED_WORKER=1`, `commands/gsd-t-resume.md` Step 0 bypasses the reattach path but the worker **never invokes `runDispatch` on its own**. Sub-worker fan-out happens only incidentally — when the worker drops into `execute`/`quick`, which themselves call `runDispatch`. That means a worker processing a large task set runs its own tasks serially.

D2 adds a deterministic worker-side hand-off to `runDispatch`. When a worker under `GSD_T_UNATTENDED_WORKER=1` has >1 task and the tasks are file-disjoint, it calls into a new `bin/gsd-t-worker-dispatch.cjs` helper that partitions and dispatches them as concurrent headless children — identical machinery to the in-session `runDispatch` path (VERIFIED in M44 proof).

This gives the unattended leg **three layers of parallelism**:
1. Iter-parallel (D1) — multiple iters run concurrently at the supervisor level.
2. Supervisor → workers fan-out (pre-M46, already ✓) — `_spawnWorkerFanOut` at line 1562.
3. Worker → sub-workers fan-out (D2, new) — a worker's own tasks dispatched in parallel via `runDispatch`.

## Owned Files/Directories

- `commands/gsd-t-resume.md` — **additive edit** to the `GSD_T_UNATTENDED_WORKER=1` branch in Step 0. D2 adds a sub-section: "If `GSD_T_UNATTENDED_WORKER=1` AND `tasks.length > 1` AND tasks are file-disjoint per the contract rule, invoke `node bin/gsd-t-worker-dispatch.cjs --parent-session $GSD_T_PARENT_AGENT_ID --tasks <json>` and return its aggregated result." No other step modified. No other command file touched by D2.
- `bin/gsd-t-worker-dispatch.cjs` (NEW) — exports `dispatchWorkerTasks({projectDir, parentSessionId, tasks, maxParallel}) → Promise<DispatchResult>`:
  - Reads `.gsd-t/contracts/file-disjointness-rules.md` (reused from existing M44 runDispatch path) to determine if tasks can be safely parallelized.
  - If disjoint → delegates to `bin/gsd-t-parallel.cjs::runDispatch` (the **verified** M44 instrument) with `mode: 'worker-subdispatch'`.
  - If not disjoint → runs serially, records why.
  - Writes spawn-plan frames with `kind: 'unattended-worker-sub'` (a new enum value, additive to existing `unattended-worker | headless-detached | in-session-subagent`).
  - Returns `{parallel: bool, taskResults: [...], wallClockMs, reason}`.
- `test/m46-d2-worker-subdispatch.test.js` (NEW) — unit tests:
  1. File-disjoint 3-task workload → `parallel: true`, 3 concurrent spawns observed.
  2. Overlapping-file 2-task workload → `parallel: false`, serial fallback, `reason` populated.
  3. Single-task workload → dispatcher returns early with `parallel: false, reason: 'single-task'`, no runDispatch call.
  4. Spawn-plan kind correctly recorded as `unattended-worker-sub`.
  5. Aggregated result preserves per-task `taskId`, `exitCode`, `durationMs`.
  6. Error in one sub-worker isolated; sibling sub-workers complete; aggregate reports mixed status.
- `bin/m46-worker-proof.cjs` (NEW) — M44-style proof harness: spawns a supervisor worker with 6 file-disjoint tasks, measures `T_par` and `T_serial`, writes `.gsd-t/metrics/m46-worker-proof.json`. Expected: `speedup ≥ 2.5` (tighter than D1's 3.0 because sub-worker spawn has constant overhead).

## Contract Ripple (D2 responsibility)

- `.gsd-t/contracts/headless-default-contract.md` — bump v2.0.0 → v2.1.0. Additive change:
  - New section "§Worker Sub-Dispatch (M46)" documenting the `GSD_T_UNATTENDED_WORKER=1` + multi-task → sub-dispatch rule.
  - New `kind: 'unattended-worker-sub'` value in the spawn-plan kind enum.
  - Invariant: the in-session dispatch path (surface 1, ✓) is unchanged; D2 is a new **consumer** of `runDispatch`, not a modifier.

## NOT Owned (do not modify)

- `bin/gsd-t-unattended.cjs` — D1's territory (supervisor main loop + fan-out helpers).
- `bin/gsd-t-parallel.cjs` — the dispatch instrument is consumed as-is. Any modification here would break the in-session contract and is explicitly out of scope per progress.md M46 DEFINED block.
- `bin/headless-auto-spawn.cjs` — headless primitive; untouched.
- Any command file other than `commands/gsd-t-resume.md`.
- `.gsd-t/contracts/iter-parallel-contract.md` — owned by D1.

## Public API

```js
// bin/gsd-t-worker-dispatch.cjs
module.exports.dispatchWorkerTasks = async ({
  projectDir,
  parentSessionId,   // $GSD_T_PARENT_AGENT_ID from worker env
  tasks,             // [{taskId, files, command, ...}]
  maxParallel = 4,   // cap, default matches M44
}) => {
  // returns: { parallel, taskResults, wallClockMs, reason }
};
```

CLI form:

```bash
node bin/gsd-t-worker-dispatch.cjs \
  --parent-session <id> \
  --tasks <path-to-tasks.json> \
  [--max-parallel 4]
```

Exit codes: 0 all green, 1 at least one sub-worker failed, 2 precondition failure (missing env, malformed tasks).

## Doc Ripple (D2 responsibility)

- `docs/architecture.md` — new `## M46 Worker Sub-Dispatch` section (disjoint heading from D1's).
- `docs/requirements.md` — new `## M46 D2 Worker Sub-Dispatch` requirement block.
- `.gsd-t/progress.md` — Decision Log entry on D2 completion (handled in complete-milestone).
