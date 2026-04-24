# Contract: iter-parallel-contract

**Version**: 1.0.0
**Status**: ACTIVE — M46 D1 (iteration-level parallelism in the unattended supervisor main loop, 2026-04-23)
**Owner**: m46-d1-iter-parallel
**Consumers**: `bin/gsd-t-unattended.cjs` (main loop driver + helpers `_runIterParallel`, `_computeIterBatchSize`, `_reconcile`, `_runOneIter`); observability readers of `.gsd-t/.unattended/run.log` and `.gsd-t/.unattended/state.json`; `bin/m46-iter-proof.cjs` proof instrument.
**Related contracts**: `unattended-supervisor-contract.md` v1.5.0 (§15a single-iter worker fan-out — D1 operates one level above, dispatching N concurrent iter slices each of which may in turn invoke §15a); `headless-default-contract.md` v2.0.0 (spawn primitive semantics are unchanged by this contract); `wave-join-contract.md` v1.2.0 (`runDispatch` single instrument — independent; iter-parallel is a different layer from task-fan-out).

---

## 1. Purpose

Today the unattended supervisor main loop at `bin/gsd-t-unattended.cjs:969` steps through iterations strictly serially:

```js
while (!isDone(state) && !stopCheck(projectDir)) {
  state = await _runOneIter(state, opts);
  writeState(state);
}
```

The only parallelism in the unattended leg is per-iter worker fan-out (`_spawnWorkerFanOut`, contract v1.5.0 §15a), which operates inside a single iter. Net iteration-level throughput is capped at 1 regardless of how much disjoint work the milestone has queued.

D1 adds a **top-level `Promise.all` over a mode-safe batch of iterations** without disturbing the per-iter fan-out layer. When the batch size computes to 1, behavior is identical to today — the driver degrades cleanly, which is the v1.x bit-identical fallback path.

This contract defines the semantics of iteration batching, the shape of a single iter's return value, how sibling iter state deltas are reconciled, the stop-check invariant across batch boundaries, the mode-safety table gating batch size, and the observable artifacts (`run.log` header + `state.json.lastBatch` field).

## 2. Scope

**In scope (this contract governs)**:
- The decision procedure for `iterBatchSize` at the top of each main-loop pass.
- The shape of `IterResult` returned by `_runOneIter`.
- The reconciliation rule for merging `IterResult[]` back into the supervisor's canonical `state`.
- The stop-check invariant between batches.
- The observable additions to `run.log` and `state.json`.

**Out of scope (deferred or owned elsewhere)**:
- Worker-side sub-dispatch semantics (`_spawnWorkerFanOut`, `_partitionTasks`) — owned by M46 D2 / `unattended-supervisor-contract.md` v1.5.0 §15a.
- The `runDispatch` in-session instrument — owned by `wave-join-contract.md` v1.2.0.
- Cross-iteration context sharing — explicitly forbidden (each iter spawns a fresh `claude -p` and must remain clean per M43 channel-separation).
- Any change to the five unattended hard constraints (heartbeat watchdog, wall-clock cap, iteration cap, destructive-action gate, state.json atomicity) — preserved verbatim.

## 3. iterBatchSize Semantics

### 3.1 Computation

`_computeIterBatchSize(state, opts) → integer ≥ 1` is called once at the top of every main-loop pass. It returns the number of iterations the driver will dispatch concurrently in the next batch.

Decision rules, evaluated **top-down**; the first rule that matches wins:

| # | Condition on `state` / `opts` | Returned `batchSize` | Rationale |
|---|--------------------------------|----------------------|-----------|
| 1 | `state.status === "verify-needed"` | `1` | A prior iter requested a verify gate; next iter must be verify, and verify is a single-shot by construction. |
| 2 | `state.status === "complete-milestone-pending"` | `1` | `complete-milestone` mutates milestone archives + tags + progress.md atomically; concurrent siblings would race the tag. |
| 3 | `state.status === "milestone-boundary"` (next iter crosses into Mx+1) | `1` | Crossing the M-boundary changes `state.currentMilestone`; siblings would read stale. |
| 4 | `state.status === "failed"` or `"blocked"` | `1` | Diagnostic mode — serial is predictable for incident response. |
| 5 | `opts.maxIterParallel === 1` (explicit operator override) | `1` | Operator opt-out; behaves exactly like v1.x. |
| 6 | `remainingIters(state) ≤ 1` | `1` | Degenerate case — nothing to parallelize. |
| 7 | otherwise | `min(opts.maxIterParallel ?? 4, remainingIters(state), 8)` | Default parallel band. Default cap is 4; hard ceiling is 8 regardless of operator input. |

Where:
- `remainingIters(state)` is `state.iterCap - state.iter` when `iterCap` is finite, otherwise `Infinity` (treated as `8` for purposes of rule 7's `min`).
- `opts.maxIterParallel` is the operator-facing tunable, default `4`, clamped to `[1, 8]` at option-parse time.
- The hard ceiling `8` is non-negotiable and enforced in the driver regardless of `opts.maxIterParallel` — prevents pathological fan-out on misconfigured runs.

### 3.2 Safe to parallelize vs forces serial

The decision table above collapses to the following plain-English invariants:

**Safe to parallelize (batchSize ≥ 2)**:
- Mid-milestone iterations where `state.status === "running"` (the common case).
- Iterations whose per-iter fan-out (§15a) targets disjoint task ids — D1 does not check disjointness at the iter layer; it assumes the §15a planner's file-disjointness proof covers it. If §15a declines to fan out, the iter runs serially as a single-task worker, which is still a valid batch member.

**Forces serial (batchSize = 1)**:
- Any verify gate (`status === "verify-needed"`).
- Any `complete-milestone` single-shot (`status === "complete-milestone-pending"`).
- Any milestone boundary crossing (`status === "milestone-boundary"`).
- Any diagnostic/failed state (`status === "failed"` or `"blocked"`).
- Operator override (`opts.maxIterParallel === 1`).
- Fewer than 2 iterations of headroom remaining.

### 3.3 Non-goals

- D1 does NOT attempt to estimate per-iter context-window usage or cost for the iter-parallel gate; the per-iter worker-fan-out gate (§15a, contract v1.5.0) already applies economics checks at the layer below. Iter-parallel trusts that each iter is independently bounded by the existing unattended 60% per-worker CW cap.
- D1 does NOT schedule iterations across milestones; rule 3 forces serial at every milestone boundary.
- D1 does NOT reorder iterations; a batch of N is always `[state.iter+1, state.iter+2, ..., state.iter+N]` in order. Siblings only differ in their iter counter.

## 4. IterResult Shape

Every `_runOneIter(state, opts) → Promise<IterResult>` invocation resolves (or rejects) with the following typed object:

```ts
type IterStatus =
  | "running"                      // iter did work, more work remains, no gate required
  | "verify-needed"                // iter completed a phase that requires a verify gate next
  | "complete-milestone-pending"   // milestone work done, complete-milestone must run next
  | "milestone-boundary"           // iter finished the last task of a milestone
  | "done"                         // isDone(state) will now return true
  | "failed"                       // iter encountered an unrecoverable error
  | "blocked";                     // iter encountered a destructive-action gate or ambiguity

interface IterResult {
  iter: number;                    // absolute iter counter this result corresponds to
  status: IterStatus;              // terminal status of this iter; drives next batchSize
  tasksDone: string[];             // task ids completed during this iter (append-only; may be empty)
  verifyNeeded: boolean;           // true iff status === "verify-needed"; duplicative-but-explicit for quick filter
  artifacts: {                     // pointers to per-iter observability artifacts (not payloads)
    runLogPath?: string;           // absolute path to the iter's slice of .gsd-t/.unattended/run.log
    stateDeltaPath?: string;       // absolute path to a scratch NDJSON of state mutations for this iter
    workerPids?: number[];         // child pids if §15a fan-out was used
    spawnPlanPath?: string;        // absolute path if a spawn-plan ndjson was written
    errorMessage?: string;         // present iff status ∈ {failed, blocked}
  };
}
```

### 4.1 Field semantics

| Field | Type | Required | Invariant |
|-------|------|----------|-----------|
| `iter` | `number` | yes | Strictly greater than the parent batch's starting iter counter. Each iter in a batch has a distinct, monotonically increasing value. |
| `status` | `IterStatus` enum | yes | Drives the next pass's `_computeIterBatchSize` input. Exactly one of the 7 enum values. |
| `tasksDone` | `string[]` | yes | May be `[]`. Task ids (as defined by `bin/gsd-t-task-graph.cjs`). Never contains duplicates within a single `IterResult`. |
| `verifyNeeded` | `boolean` | yes | MUST equal `status === "verify-needed"`. Redundant field for fast-path filtering in `_reconcile`. |
| `artifacts` | `object` | yes | Object always present; all nested keys optional. Paths are absolute. |

### 4.2 Error isolation

A rejected promise from `_runOneIter` is caught inside `_runIterParallel` via `Promise.allSettled` and translated into an `IterResult` with `status: "failed"` and `artifacts.errorMessage` populated. Sibling iters in the same batch are NOT cancelled. This is the error-isolation invariant — see §6.

## 5. Reconciliation Rule

`_reconcile(state, results: IterResult[]) → state'` merges a batch's per-iter deltas back into the canonical supervisor state.

### 5.1 Merge semantics

| State field | Merge rule | Rationale |
|-------------|-----------|-----------|
| `state.completedTasks` | **Append-only union** — `state.completedTasks ∪ ⋃ᵢ results[i].tasksDone`. Duplicates removed via Set. | Task completion is monotonic; no iter unmarks another iter's work. |
| `state.iter` | **Last-writer-wins** — set to `max(state.iter, ...results.map(r => r.iter))`. | Iter counter is monotonic and the batch is ordered, so the max is always the latest slot dispatched. |
| `state.status` | **Priority-ordered last-writer-wins** — see §5.2. | Status is a single scalar; the most-severe status in the batch determines what the next pass must do. |
| `state.lastBatch` | **Overwrite** — replaced with the new batch's `{size, startedAt, endedAt, results[]}` record. | Observability snapshot of the just-completed batch. |
| `state.failedIters` | **Append-only** — iters with `status ∈ {failed, blocked}` are pushed onto this array with their `artifacts.errorMessage`. | Preserves every failure for post-mortem; never silently dropped. |
| `state.heartbeat` | **Overwrite** — latest timestamp wins. | Heartbeat is a liveness signal, not cumulative state. |

### 5.2 Status priority

When multiple iters in a batch report different `status` values, the batch status (the value that becomes `state.status` for the next pass) is resolved by this priority ordering, **highest wins**:

1. `failed` (one iter errored unrecoverably — the whole batch is failed for next-pass routing)
2. `blocked` (destructive-action gate or ambiguity — operator decision required)
3. `complete-milestone-pending` (milestone completion is an atomic single-shot)
4. `milestone-boundary` (cross-milestone serialization)
5. `verify-needed` (verify gate)
6. `done` (terminal)
7. `running` (default — continue looping)

The priority is strict: any iter reporting `failed` forces the next pass's `batchSize` to 1 (per §3.1 rule 4) regardless of how many siblings reported `running`.

### 5.3 Atomicity

`_reconcile` is synchronous and runs under the same state.json write lock used by the v1.x serial path. The write to `.gsd-t/.unattended/state.json` is a single atomic `writeFileSync(tmp); renameSync(tmp, final)` per the pre-existing supervisor atomicity contract. D1 does NOT change this — it only expands the payload written.

### 5.4 Append-only invariant

`completedTasks` and `failedIters` are append-only. `_reconcile` MUST NOT remove entries from either. The append-only invariant is what makes iter-parallel safe against the race where two sibling iters both complete a shared phase-downstream task: the union preserves both attributions, and the task-graph reader (downstream) de-dupes on task id.

## 6. Stop-Check Invariant

`stopCheck(projectDir) → boolean` returns `true` when the operator has requested a graceful halt (via `gsd-t unattended-stop`, which writes `.gsd-t/.unattended/stop`). The invariant:

**Stop-check is evaluated at batch boundaries only, never mid-batch.**

Specifically:
- The main loop condition `while (!isDone(state) && !stopCheck(projectDir))` evaluates `stopCheck` once per pass, BEFORE `_computeIterBatchSize`.
- Once a batch is dispatched via `_runIterParallel`, no iter in the batch is cancelled if the operator writes the stop sentinel. All in-flight iters run to their natural `IterResult`.
- On the NEXT pass, `stopCheck` returns `true`, the loop exits, and the supervisor writes a graceful shutdown record.

### 6.1 Rationale

Cancelling an in-flight iter mid-batch would orphan its partially-completed work: a child `claude -p` process may have finished its task list but not yet written the commit, and killing it loses the work without rollback. Waiting for the natural batch boundary is bounded (each iter has its own wall-clock cap via heartbeat watchdog) and preserves the "each iter is atomic" invariant.

### 6.2 Operator expectations

An operator running `gsd-t unattended-stop` during a batch of 4 parallel iters should expect:
- Up to 4 more completed iters before the loop exits.
- The stop sentinel is honored "at the next opportunity," not "instantly."
- Partial-batch behavior is explicitly NOT a feature; requesting it would require a cancellation protocol the supervisor does not implement.

### 6.3 Hard kill is unchanged

This contract does NOT modify the hard-kill path (`SIGKILL` to the supervisor PID). A hard kill bypasses the stop-check invariant by definition; the supervisor's state.json atomicity guarantees no corrupted state, but in-flight iters lose their unwritten work. This is the same behavior as v1.x and is not a regression.

## 7. Mode-Safety Table

Combines §3.1 rules and §5.2 priority into a single operator-facing reference. `state.status` values run down the rows; the safe `batchSize` for the NEXT pass runs across the columns. The "produces" column describes what iter statuses can feed this state (i.e., how the row gets entered via §5.2 reconciliation).

| `state.status` (input to next pass) | Safe `batchSize` for next pass | Typical producer `IterResult.status` | Notes |
|--------------------------------------|--------------------------------|--------------------------------------|-------|
| `running` | `min(opts.maxIterParallel ?? 4, remainingIters, 8)` | All iters `running` | Default / happy path. Full parallel band. |
| `verify-needed` | `1` | At least one iter `verify-needed`, no higher-priority | Single-shot verify; next iter runs verify alone. |
| `complete-milestone-pending` | `1` | At least one `complete-milestone-pending`, no `failed`/`blocked` | Atomic milestone closeout. |
| `milestone-boundary` | `1` | At least one `milestone-boundary`, no higher-priority | Cross-milestone serialization. Next pass starts fresh in the new milestone. |
| `done` | n/a — loop exits | Every iter `done` or `running`, at least one `done` | Terminal; `isDone(state)` returns true. |
| `failed` | `1` | At least one `failed` | Diagnostic mode; operator intervention likely. |
| `blocked` | `1` | At least one `blocked`, no `failed` | Destructive-action gate or ambiguity; supervisor halts on next pass. |

### 7.1 Interaction with `opts.maxIterParallel`

The operator tunable is a ceiling, not a floor. Rules 1–6 in §3.1 can force `batchSize = 1` even when `opts.maxIterParallel = 8`. Conversely, setting `opts.maxIterParallel = 1` forces every pass to `batchSize = 1` regardless of state — equivalent to the v1.x serial main loop.

### 7.2 Default

`opts.maxIterParallel = 4`. Rationale: the §15a worker-fan-out layer beneath also defaults to 4-way fan-out; 4 × 4 = 16 concurrent children is the same order of magnitude as the v3.18.18 rate-limit incident response (8 concurrent workers triggered the throttle). Operators running heavier workloads should pair `opts.maxIterParallel = 8` with `spawnStaggerMs ≥ 3000` at the §15a layer to preserve the throttle-avoidance properties.

## 8. Observable Changes

### 8.1 `.gsd-t/.unattended/run.log` headers

Each batch emits two log lines, bracketing the concurrent dispatch window:

```
[YYYY-MM-DDTHH:MM:SS.sssZ] iter-batch-start iter-batch-size=N iter-range=[A..B] status-in=running
...
[YYYY-MM-DDTHH:MM:SS.sssZ] iter-batch-complete n=N ok=K fail=F duration=Ts status-out=running
```

Where:
- `iter-batch-size=N` — the integer returned by `_computeIterBatchSize` for this batch. Always present. When `N=1`, the header is still emitted so the log is uniform.
- `iter-range=[A..B]` — inclusive iter counters dispatched in this batch. `A = state.iter + 1`, `B = state.iter + N`.
- `status-in` — `state.status` as read at the top of the pass.
- `n=N ok=K fail=F` — `N` = batch size, `K` = count of iters whose `status ∉ {failed, blocked}`, `F` = count of iters whose `status ∈ {failed, blocked}`. `K + F = N`.
- `duration=Ts` — wall-clock seconds from `iter-batch-start` to `iter-batch-complete`, one decimal place.
- `status-out` — `state.status` after `_reconcile`.

These headers are the primary observability signal D1 adds. Downstream readers (dashboard, reflect, proof instrument) parse them to reconstruct batching history.

### 8.2 `.gsd-t/.unattended/state.json.lastBatch` field

Additive field under the root object. Schema:

```json
{
  "lastBatch": {
    "size": 4,
    "startedAt": "2026-04-23T23:47:00.000Z",
    "endedAt":   "2026-04-23T23:49:32.500Z",
    "iterRange": [42, 45],
    "statusIn":  "running",
    "statusOut": "running",
    "results": [
      {
        "iter": 42,
        "status": "running",
        "tasksDone": ["M46-D1-T7"],
        "verifyNeeded": false,
        "artifacts": {
          "runLogPath": "/abs/path/.gsd-t/.unattended/run.log",
          "workerPids": [46522]
        }
      }
      /* ...one entry per iter in the batch... */
    ]
  }
}
```

### 8.3 Backward compatibility

The `lastBatch` field is additive and optional. v1.x readers of `state.json` that do not know this field continue to work unchanged — they only care about `state.iter`, `state.status`, `state.currentMilestone`, `state.completedTasks`, `state.heartbeat`, which are all preserved. On the first pass after upgrade, `lastBatch` is absent (the field appears only after the first batch reconciles). Consumers that read `lastBatch` MUST treat absence as "no batch has reconciled yet" and MUST NOT fail.

### 8.4 No other observable surface changes

- No CLI flags added or removed on `gsd-t unattended` or `gsd-t unattended-watch`.
- No new event-stream frame types in `.gsd-t/events/*.jsonl` — the existing `iter_start` / `iter_end` frames are emitted per-iter unchanged, one pair per `_runOneIter` call regardless of batch membership.
- No new spawn artifacts under `.gsd-t/spawns/` — spawn-plan ndjson is owned by the §15a worker-fan-out layer; D1 does not write spawn plans of its own.
- No change to `package.json`, no new CLI subcommands.

## 9. Invariants (Preserved from v1.x Unattended)

D1 preserves all five unattended hard constraints verbatim:

1. **Heartbeat watchdog** — each in-flight iter maintains its own heartbeat; a stuck iter is killed by its own watchdog without affecting siblings.
2. **Wall-clock cap** — `opts.maxWallClockMs` is evaluated at batch boundaries (same as stop-check); an in-flight batch runs to completion, the loop exits on the next pass.
3. **Iteration cap** — `opts.iterCap` is the absolute iter counter; `_computeIterBatchSize` rule 6 (via `remainingIters`) ensures no batch dispatches past the cap.
4. **Destructive-action gate** — any iter producing `status: "blocked"` with `artifacts.errorMessage` referencing a destructive action halts the loop on the next pass (§7 table row "blocked"). Sibling iters in the same batch complete naturally.
5. **State.json atomicity** — single writer, atomic rename, per §5.3.

D1 does NOT introduce a sixth hard constraint. The iter-parallel band is a throughput lever gated by existing constraints, not a new safety surface.

## 10. Test Coverage

Defined by `test/m46-d1-iter-parallel.test.js` (M46-D1-T7):

1. **Serial fallback** — `opts.maxIterParallel = 1` forces `batchSize = 1` on every pass; `Promise.all` is never invoked with more than one iter; behavior is bit-identical to v1.x.
2. **Parallel batch** — `opts.maxIterParallel = 3` with 3 mid-milestone iters queued dispatches all three concurrently; `Promise.all` resolves with `length === 3`.
3. **Mode-safety** — one iter returns `status: "verify-needed"`; next pass's `_computeIterBatchSize` returns `1`.
4. **Error isolation** — one iter's promise rejects; `_runIterParallel` returns `IterResult[]` of length N with the failed slot as `status: "failed"` and sibling iters unaffected.
5. **Stop-check** — writing `.gsd-t/.unattended/stop` mid-batch does NOT cancel in-flight iters; loop exits only after the current batch's `_reconcile` returns.
6. **State reconciliation** — a batch of 3 iters each reporting distinct `tasksDone` arrays produces a `state.completedTasks` that is the union, in order of iter counter.

## 11. Proof Instrument

`bin/m46-iter-proof.cjs` (M46-D1-T10) runs a synthetic 10-iter workload twice:
- Once with `opts.maxIterParallel = 1` (serial baseline → `T_serial`).
- Once with `opts.maxIterParallel = 4` (parallel band → `T_par`).

Emits `.gsd-t/metrics/m46-iter-proof.json`:

```json
{
  "T_serial": 123.4,
  "T_par":     35.7,
  "speedup":    3.45,
  "parallelism_factor": 4,
  "iters": 10,
  "startedAt": "2026-04-23T23:47:00.000Z",
  "endedAt":   "2026-04-23T23:52:17.000Z"
}
```

Success criterion (per domain scope.md §Owned Files and milestone success criterion #1): `T_par / T_serial ≤ 0.35` AND `speedup ≥ 3.0` at `batchSize = 4`. These numbers land in the Decision Log at M46-D1-T11.

## 12. Migration

- **From v1.x (serial) → v1.0.0 (iter-parallel)**: no migration required. v1.x operators get the v1.x behavior by setting `opts.maxIterParallel = 1`, which is also the safe default in any doubt. The default of `4` activates iter-parallel transparently — existing supervisor consumers that never inspected batching behavior will observe only higher throughput and the new `iter-batch-*` lines in `run.log`.
- **State.json forward compat**: v1.x-era `state.json` files with no `lastBatch` field are fully readable; the field is populated on first reconciliation.
- **State.json backward compat**: a v1.x reader seeing a v1.0.0-written `state.json` with `lastBatch` present ignores it and continues to read the fields it knows. Confirmed by §8.3.

## Version History

- **1.0.0** (M46 D1, target v3.19.x, 2026-04-23) — NEW. Defines iteration-level parallelism in `bin/gsd-t-unattended.cjs` main loop: `iterBatchSize` decision table (§3), `IterResult` typed shape (§4), append-only + priority-last-writer-wins reconciliation (§5), stop-check at batch boundaries only (§6), mode-safety table (§7), observable additions `run.log` `iter-batch-*` headers + `state.json.lastBatch` additive field (§8). Preserves all five unattended hard constraints (§9). Degenerates to bit-identical v1.x behavior at `batchSize = 1` (operator opt-out or mode-forced serial). Closes surface 2A of the 2026-04-23 five-surface parallelism audit.
