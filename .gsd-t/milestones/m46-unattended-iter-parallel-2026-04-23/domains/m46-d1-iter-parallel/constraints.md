# Domain: m46-d1-iter-parallel — Constraints

## Hard Constraints

1. **Zero runtime deps** — the installer invariant holds. No new npm packages. `Promise.all` + `Promise.allSettled` are built-ins.

2. **Serial fallback must be behaviorally identical** — when `batchSize=1`, the driver MUST produce the same `.gsd-t/.unattended/run.log` output, same `state.json` progression, and same exit codes as today's `while` loop. This is tested explicitly (T7 case 1).

3. **Error isolation at batch boundaries, not mid-batch** — a failing iter MUST NOT cancel its siblings. The batch completes, `_reconcile` merges what succeeded, and the stop-check fires next. Consequence: a crashing iter gives its batch-mates their chance to finish.

4. **Mode-safety rules are authoritative** — `_computeIterBatchSize` has veto power. If the batch-size calculator says 1, the main loop MUST honor it. Never override with `maxIterParallel` when state signals unsafety.

5. **Stop-check only at batch boundaries** — checking mid-batch would orphan work (some iters done, some mid-flight, process killed). All iters in a batch run to completion before the outer loop re-evaluates `stopCheck`.

6. **File-disjoint from D2** — D1 does not edit `commands/gsd-t-resume.md`, does not touch `_spawnWorkerFanOut` / `_partitionTasks`, does not create `bin/gsd-t-worker-dispatch.cjs`. Section headings in shared docs (`architecture.md`, `requirements.md`) are disjoint — D1 writes `## M46 Iteration-Parallel Supervisor`, D2 writes `## M46 Worker Sub-Dispatch`.

7. **Contract-first** — `.gsd-t/contracts/iter-parallel-contract.md` v1.0.0 is written and committed before any production code change to the main loop (T1 before T5).

## Soft Constraints

- **Observability** — batch start/end lines in `run.log` are mandatory; D9 panel consumers will parse these later. Use the existing event-stream format (kebab-case key=value).

- **Batch-size default of 4** — matches M44 proof measurements where 4-way parallelism hit the 3.98× speedup target. Cap at 8 to avoid pathological cases. Override via `opts.maxIterParallel` (tested).

- **`bin/m46-iter-proof.cjs` is a proof, not a benchmark** — single run, three-sample median, deterministic synthetic workload. Not a regression-gated CI check (unless success criterion fails — then it's an incident).

## Out of Scope (D1 does NOT do)

- In-session parallelism changes (surface 1 already ✓; out of scope).
- Worker-side sub-dispatch (surface 2B; D2 owns).
- Visualizer kind-breakdown (surface 4; backlog #17).
- Multi-parent segmentation (surface 5; backlog #18).
- Conversation-capture hook wiring (backlog #16).
- Zero-compaction measurement (v3.19.00 gate; separate track).
