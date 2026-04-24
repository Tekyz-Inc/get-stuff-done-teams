# Domain: m46-d2-worker-subdispatch — Constraints

## Hard Constraints

1. **Zero runtime deps** — zero-dep invariant holds. All new code built on Node built-ins + existing GSD-T modules.

2. **`runDispatch` is consumed as-is** — D2 does NOT modify `bin/gsd-t-parallel.cjs`. If a behavior change to `runDispatch` is needed, D2 escalates to a follow-up milestone instead. This is enforced by scope (D2 does not own `bin/gsd-t-parallel.cjs`).

3. **File-disjoint from D1** — D2 does not edit `bin/gsd-t-unattended.cjs`, does not touch the supervisor main loop, does not create `iter-parallel-contract.md`. Section headings in shared docs are disjoint — D2 writes `## M46 Worker Sub-Dispatch`, D1 writes `## M46 Iteration-Parallel Supervisor`.

4. **Additive-only edits to `commands/gsd-t-resume.md`** — the `GSD_T_UNATTENDED_WORKER=1` branch gains a new sub-section. No deletion, no reordering of Step 0 sub-steps, no change to the interactive (non-worker) path. Tests that assert the current Step 0 behavior must still pass.

5. **Disjointness check is required before dispatch** — if tasks share files, fall back to serial execution with `reason: 'file-overlap'`. This mirrors the in-session rule and is the single source of truth for whether parallelism is safe at this layer.

6. **Spawn-plan kind enum is strictly additive** — adding `unattended-worker-sub` does not remove or rename existing values (`unattended-worker | headless-detached | in-session-subagent`). Existing consumers (viewer, `parallelism-report`) continue to work.

7. **Contract-first** — `headless-default-contract.md` v2.1.0 is written and committed before any production code change (T1 before T2).

8. **Proof before claim** — `m46-worker-proof.cjs` must run successfully and record `speedup ≥ 2.5` before D2 is marked done. Per `feedback_measure_dont_claim`.

## Soft Constraints

- **`maxParallel` default of 4** — matches the in-session default. Tighter caps may be applied later if observed spawn overhead exceeds target.

- **Exit-code propagation** — worker-dispatch CJS exits 0 only if all sub-workers exit 0. Mixed results → exit 1 with aggregated JSON on stdout. Precondition failures (missing env, bad tasks file) → exit 2.

- **Logging parity** — worker-dispatch emits the same event-stream lines as in-session `runDispatch` does (same schema, same keys). Downstream viewers treat them identically modulo the `kind` field.

## Out of Scope (D2 does NOT do)

- Iteration-level parallelism (surface 2A; D1 owns).
- Modifying `bin/gsd-t-parallel.cjs` internals (explicit non-goal in M46 DEFINED block).
- Visualizer kind-breakdown panel work (surface 4; backlog #17).
- Multi-parent segmentation (surface 5; backlog #18).
- Conversation-capture hook wiring (backlog #16).
- Zero-compaction measurement (v3.19.00 gate; separate track).
