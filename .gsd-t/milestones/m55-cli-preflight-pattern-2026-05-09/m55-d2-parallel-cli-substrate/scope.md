# Domain: m55-d2-parallel-cli-substrate

## Responsibility

N-worker pool runner for parallel CLI execution. Every spawn flows through `captureSpawn` (the M41 token-capture invariant). Engine-only — does NOT touch any command file under `commands/` (separate ratchet milestone owns that). Provides the foundation that D5's verify-gate Track 2 fans out across.

This is the SECOND half of M55's two-track guarantee — replacing deterministic LLM work with deterministic CLI work to lift the practical parallelism ceiling.

## Owned Files/Directories

- `bin/parallel-cli.cjs` — main library + CLI entry. Public API: `runParallel({ workers: [{id, cmd, args, env?, cwd?, timeoutMs?}], maxConcurrency, failFast?, teeDir? }) → { ok, results: [{id, ok, exitCode, durationMs, stdoutPath, stderrPath, signal?}], wallClockMs }`. CLI form: `node bin/parallel-cli.cjs --plan plan.json --json` (or read plan from stdin).
- `bin/parallel-cli-tee.cjs` — log-stream tee helper (per-worker NDJSON path under `teeDir`). Separate file to keep `parallel-cli.cjs` lean and testable in isolation.
- `bin/m55-substrate-proof.cjs` — in-tree proof CLI demonstrating ≥3× wall-clock speedup vs sequential baseline (success-criterion-2 evidence). Mirrors `bin/m46-iter-proof.cjs` and `bin/m46-worker-proof.cjs`.
- `test/m55-d2-parallel-cli.test.js` — unit tests (concurrency limit honored, fail-fast policy, timeout policy, tee path validity, captureSpawn invariant, exit-code propagation).

## NOT Owned (do not modify)

- `bin/cli-preflight.cjs` — D1
- `bin/gsd-t-ratelimit-probe.cjs` — D3
- `bin/gsd-t-context-brief.cjs` — D4
- `bin/gsd-t-verify-gate.cjs` — D5 (D5 imports D2's `runParallel`)
- Any file under `commands/` — out-of-scope per charter
- `bin/gsd-t-token-capture.cjs` — D2 USES `captureSpawn`, never modifies it
- `bin/gsd-t-worker-dispatch.cjs` / `bin/gsd-t-unattended.cjs` — explicitly out-of-scope per charter (separate supervisor surface)

## Deliverables

- `bin/parallel-cli.cjs` library + `bin/parallel-cli-tee.cjs` helper
- `bin/m55-substrate-proof.cjs` proof harness with measurable speedup output
- Initial concurrency defaults: `maxConcurrency=2`, `contextBudget=20k` (conservative). Re-tuned in D5 wave once D3's `.gsd-t/ratelimit-map.json` lands.
- Unit tests: ≥6 cases (happy parallel, exceeds-cap, single-fail-fast, timeout-cancels-others, tee-paths-valid, captureSpawn-invariant)

## Integration

- D5's verify-gate Track 2 calls `runParallel()` with the typecheck/lint/tests/dead-code/secrets/complexity worker plan
- D3's `.gsd-t/ratelimit-map.json` (governed by `.gsd-t/contracts/ratelimit-map-contract.md`) is read by the **operator** at D5 wire-in time to pick `maxConcurrency`. D2 ships agnostic to the map; D2 just exposes the knob.

## Sequencing

- Wave 2 — depends on D3's empirical map for **calibration**, not for **file-disjointness**. D2 starts when D3 ships its `ratelimit-map.json` artifact (a one-shot file write D2 reads).
- D2 development can begin in parallel with D3 if D2 commits to the conservative default-concurrency contract upfront.
