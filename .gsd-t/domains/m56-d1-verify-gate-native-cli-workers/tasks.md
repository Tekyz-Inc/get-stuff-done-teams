# Tasks: m56-d1-verify-gate-native-cli-workers

## Summary
Replace Task-subagent-wrapped Track 2 entries for `playwright test`/`npm test`/`gsd-t check-coverage` with native `runParallel` CLI workers. Record M55-baseline-tokens + M56-actual-tokens (closes M55 SC4). Measure verify-gate dogfood wall-clock < M55's 34s.

## Tasks

### M56-D1-T1 — Read M55 baselines + scaffold metrics files
- **Touches**: `.gsd-t/metrics/m56-token-baseline.json` (new), `.gsd-t/metrics/m56-verify-gate-wallclock.json` (new)
- **Contract refs**: `.gsd-t/contracts/verify-gate-contract.md` v1.0.0
- **Deps**: NONE
- **Acceptance criteria**:
  - Read M55's recorded data: `.gsd-t/token-log.md` (2 supervisor-iter rows), run.log envelopes ($21.84 total), `.gsd-t/metrics/m55-substrate-proof.json`. Extract M55-baseline-tokens placeholder structure (`{m55: {totalCost: 21.84, source: "run.log iters 1-5", verifyGateWallClockMs: 34000}}`).
  - Write `m56-token-baseline.json` with `{schemaVersion: "1.0.0", m55Baseline: {…}, m56Actual: null}` — `m56Actual` filled in at verify phase.
  - Write `m56-verify-gate-wallclock.json` with `{schemaVersion: "1.0.0", m55BaselineMs: 34000, m56ActualMs: null}` — same pattern.

### M56-D1-T2 — Add native CLI worker definitions to verify-gate Track 2
- **Touches**: `bin/gsd-t-verify-gate.cjs` (additive)
- **Contract refs**: `.gsd-t/contracts/parallel-cli-contract.md` v1.0.0, `.gsd-t/contracts/verify-gate-contract.md` v1.0.0
- **Deps**: NONE (additive — does not require T1)
- **Acceptance criteria**:
  - `bin/gsd-t-verify-gate.cjs` exposes a new `NATIVE_TRACK2_WORKERS` registry mapping CLI ids to worker specs: `{id, command, args, cwd?, timeoutMs?}`. Three entries: `playwright-test`, `npm-test`, `check-coverage`.
  - Each worker spec is a valid `runParallel` worker (matches `parallel-cli-contract.md` shape).
  - `runVerifyGate` Track 2 path delegates to `runParallel({workers: NATIVE_TRACK2_WORKERS, maxConcurrency, failFast, teeDir})` when configured to use native workers (gated by an option flag, default OFF for backwards compat).
  - Existing Task-subagent Track 2 path remains intact (additive only — envelope shape unchanged).
  - All native worker spawns flow through `captureSpawn` (M41 invariant) — verified by reading the M55 D2 substrate, which already wraps every spawn.

### M56-D1-T3 — Wire native-Track2 flag into verify-gate CLI + opt-in default
- **Touches**: `bin/gsd-t-verify-gate.cjs` (additive)
- **Contract refs**: `.gsd-t/contracts/verify-gate-contract.md` v1.0.0
- **Deps**: Requires T2
- **Acceptance criteria**:
  - `gsd-t verify-gate --native-track2` flag opts into native CLI workers. Without it, current behavior preserved.
  - When `--native-track2` is set, the verify-gate envelope `notes[]` includes `"track2: native CLI workers (M56 D1)"`.
  - The `--native-track2` flag is opt-in for now; default flip happens in M56 D6 verify after measurement confirms speedup.

### M56-D1-T4 — D1 unit tests (TDD)
- **Touches**: `test/m56-d1-verify-gate-native-cli.test.js` (new), `test/m56-d1-token-baseline.test.js` (new)
- **Contract refs**: `.gsd-t/contracts/verify-gate-contract.md` v1.0.0
- **Deps**: Requires T1, T2, T3
- **Acceptance criteria**:
  - 8-12 new unit tests covering: NATIVE_TRACK2_WORKERS registry shape (3 entries, all valid `runParallel` worker specs), `--native-track2` flag wiring (envelope notes appended), backwards compat (without flag, existing path intact), envelope shape preserved (v1.0.0 STABLE invariant), captureSpawn invariant (mocked-runParallel test asserts every worker call goes through wrapper).
  - 4-6 new unit tests covering metrics file shape: schemaVersion present, m55Baseline read correctly, m56Actual nullable, file is valid JSON.
  - Suite total ≥ 2487 + new tests, all green.

### M56-D1-T5 — Measurement harness — verify-gate wall-clock + token total
- **Touches**: `bin/gsd-t-verify-gate.cjs` (additive — emit timing+usage to envelope.metrics)
- **Contract refs**: `.gsd-t/contracts/verify-gate-contract.md` v1.0.0
- **Deps**: Requires T2, T3
- **Acceptance criteria**:
  - `runVerifyGate` envelope gains a `metrics` field: `{wallClockMs, track1WallClockMs, track2WallClockMs, totalTokens?, totalCostUsd?}`. `metrics` is additive, NOT a schema-shape change to top-level v1.0.0 envelope (existing fields unchanged).
  - Token totals are aggregated from `captureSpawn` JSONL records during the run. Cost is derived from per-model price tables (or `—` if usage absent — never `0`, never `N/A`).
  - At verify phase (D6), the harness updates `.gsd-t/metrics/m56-verify-gate-wallclock.json::m56ActualMs` and `.gsd-t/metrics/m56-token-baseline.json::m56Actual` with the measured values.
  - Test in T4 covers metrics emission: synthetic verify-gate run with mocked `runParallel` produces a `metrics` field with all required keys.

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 2 (T1, T2 — T2 is additive and does not need T1)
- Blocked tasks (waiting on within-domain): 3 (T3 needs T2; T4 needs T1+T2+T3; T5 needs T2+T3)
- Estimated checkpoints: 1 (after T4 — D1 ready for cross-domain integration in verify)
- Estimated context per task: T1 small (~5%), T2 medium (~25%), T3 small (~10%), T4 medium (~20%), T5 medium (~20%) — all well under 70% threshold

## REQ Coverage
- REQ-M56-D1-01 → T2, T3 (native CLI workers in Track 2)
- REQ-M56-D1-02 → T1, T5 (M55-baseline + M56-actual tokens recording)
- REQ-M56-D1-03 → T5 (verify-gate wall-clock measurement < 34s)
