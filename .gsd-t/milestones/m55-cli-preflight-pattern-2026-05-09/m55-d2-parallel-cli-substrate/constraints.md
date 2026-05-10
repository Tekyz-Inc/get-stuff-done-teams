# Constraints: m55-d2-parallel-cli-substrate

## Must Follow

- **`captureSpawn` invariant** — every child process spawned via `runParallel` MUST flow through `bin/gsd-t-token-capture.cjs::captureSpawn` or its equivalent `recordSpawnRow` if the result envelope is already in hand. No bare `child_process.spawn(...)` / `exec(...)` in production paths. The `captureSpawn` wrapper handles bookkeeping; D2 just supplies `spawnFn`.
- **CLIs are zero-token** — for purely deterministic CLIs (`tsc`, `biome`, `ruff`, `knip`, `gitleaks`, `scc`, `lizard`), `captureSpawn` is invoked with the `usage` envelope absent (renders `—` per the canonical token-log row). D2 never fabricates `0`. Document this case in the contract.
- **Concurrency knob** — `maxConcurrency` is a public required parameter; no implicit default leaks below the API. The CLI form requires `--max-concurrency`.
- **Fail-fast policy** — when `failFast: true`, the first non-zero exit code cancels in-flight workers via `kill('SIGTERM')`, then escalates to `SIGKILL` after a 5s grace. Cancelled workers report `signal: 'SIGTERM'` and `ok: false`.
- **Timeouts** — every worker accepts an optional `timeoutMs`. Default is `null` (no timeout). On expiry, behave identically to fail-fast cancellation for that worker only.
- **Tee paths** — when `teeDir` is supplied, every worker streams stdout/stderr to `{teeDir}/{workerId}.ndjson`. The path is returned in the result. When absent, `stdoutPath`/`stderrPath` are `null` and output is captured to memory (capped at 1 MB per stream, then rotated to a temp file).
- **Determinism in `results[]`** — sorted by `workerId` ASC. `wallClockMs` is the real elapsed time of the orchestrator (not sum-of-worker-times).
- **Engine-only** — no command file edits. No additions to `commands/*.md`. The substrate is consumed via D5; downstream command-file rewrites are a follow-up milestone.
- **JSON-only public envelope** — internal logs are NDJSON (per worker). Public return is a single JSON object.
- **Pre-baseline** — D2's tests are deterministic enough that they don't depend on D3's empirical map. D2 ships before D5; D3's map is consumed at D5 wire-in time.

## Must Not

- Modify any file outside the Owned scope above
- Touch `commands/*.md` — that's a separate ratchet milestone
- Replace `bin/gsd-t-worker-dispatch.cjs` or `bin/gsd-t-unattended.cjs` — explicit charter out-of-scope
- Implement work-stealing or dynamic re-balancing — keep it a fixed-N pool. Backlog item if needed later.
- Default `maxConcurrency` silently — make the caller declare intent

## Must Read Before Using

The execute agent for D2 must read these files BEFORE writing code:

- **`bin/gsd-t-token-capture.cjs`** — the `captureSpawn({command, step, model, description, projectDir, domain, task, spawnFn})` and `recordSpawnRow({...})` signatures. D2 wraps `child_process.spawn` inside `spawnFn` and lets `captureSpawn` own timing/banner/log writes.
- **`bin/m46-iter-proof.cjs`** + **`bin/m46-worker-proof.cjs`** — the in-tree proof-CLI shape M46 used to demonstrate speedup. `bin/m55-substrate-proof.cjs` mirrors that idiom.
- **`bin/parallelism-report.cjs`** — same envelope-discipline reference D1 uses. Inspect, don't import.
- **`bin/gsd-t-worker-dispatch.cjs`** — INSPECT only (out-of-scope per charter), but read to understand how the existing supervisor fan-out shape differs from this engine-level substrate. D2 is the lower-level primitive; the supervisor is a higher-level orchestrator.
- **`.gsd-t/contracts/headless-default-contract.md`** v2.x — to understand the channel-separation invariant (D2 is detached-friendly).
- **`bin/gsd-t-token-capture.cjs` Pattern A** in CLAUDE.md — the canonical wrap idiom.

D2 is prohibited from treating any of these as black boxes — read the listed sections before depending on shape.

## Dependencies

- Depends on: **calibration data from D3** (`.gsd-t/ratelimit-map.json`) for default `maxConcurrency` recommendation. D2 itself ships agnostic. D5 wires the recommended value at integration.
- Depends on: D1 indirectly (D5 invokes preflight before fan-out, but D2 doesn't import D1)
- Depended on by: D5 (Track 2 of verify-gate fans out via D2)
