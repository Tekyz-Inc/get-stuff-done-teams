# Tasks: m55-d3-ratelimit-probe-map

**Domain wave**: Wave 1 (parallel with D1 + D4)
**Depends on**: nothing internal — independent
**Depended on by**: D2 (calibration, operator-mediated) and D5 (wire-in time concurrency)

## T1 — Author `ratelimit-map-contract.md` v1.0.0 STABLE

**Output**: `.gsd-t/contracts/ratelimit-map-contract.md`
**Acceptance**: schema (`schemaVersion`, `generatedAt`, `account` (sha256 prefix), `matrix[]`, `backoffProbe`, `steadyState`); sweep matrix (7 workers × 4 contexts × 3 runs = 84 runs); declared-safe rule (zero 429 + p95 ttft ≤ 8000ms); refresh policy (re-run on tier change or every 30 days).

## T2 — Build synthetic context fixtures

**Output**: `.gsd-t/fixtures/ratelimit-probe/context-{10k,30k,60k,100k}.txt` (4 files)
**Acceptance**: each fixture mirrors realistic GSD-T spawn shape (faux-CLAUDE.md prelude + faux-contract.md + lorem-padded text). Token count verified via local tokenizer (Anthropic count_tokens API allowed per `feedback_anthropic_key_measurement_only.md`). ±5% tolerance on target size.

## T3 — Implement `bin/gsd-t-ratelimit-probe-worker.cjs`

**Output**: single-worker child entry point
**Acceptance**: reads fixture file from arg, prompts a small Claude completion (`claude -p` with `--dangerously-skip-permissions`), emits NDJSON line with `{workerId, contextTokens, ttftMs, totalMs, status429, retryAfterMs?}` on stdout. Per `feedback_anthropic_key_measurement_only.md`, this is a measurement tool — API-key path permitted.

## T4 — Implement `bin/gsd-t-ratelimit-probe.cjs` sweep runner

**Output**: orchestrator CLI
**Acceptance**: `--quick` runs 1×1 smoke; default runs full 28-cell × 3-runs sweep; spawns workers in throwaway `git worktree`; collects NDJSON per cell; computes summary per charter declared-safe rule; runs backoff probe LAST (post-sweep); runs steady-state probe (5min @ workers=3, context=30k, 30s sample cadence); writes `.gsd-t/ratelimit-map.json`. Every spawn flows through `captureSpawn`.

## T5 — Author `test/m55-d3-ratelimit-probe.test.js`

**Output**: unit tests (no live API hits)
**Acceptance**: matrix-construction test (84 cells), envelope-shape test, declared-safe-rule test (synthetic input → expected output), fixture-size-validator test (token count within tolerance), backoff/steady-state schema tests.

## T6 — Run full sweep ONCE; commit `.gsd-t/ratelimit-map.json`

**Output**: `.gsd-t/ratelimit-map.json` populated artifact
**Acceptance**: 84 runs completed; all 429 events recorded; declared-safe cells identified; artifact committed (this is the canonical M55 measurement). User-approved one-shot ~140k spend per charter.

## T7 — Run unit-test suite; confirm zero regressions

**Output**: green `npm test`
**Acceptance**: baseline 2262/2262 preserved + D3 unit tests added (no live hits in unit tests).

## T8 — Commit D3

**Output**: single commit `feat(m55-d3): ratelimit probe + map artifact + contract STABLE`
**Acceptance**: Pre-Commit Gate passes; commit includes the populated `.gsd-t/ratelimit-map.json`; commit message reports peak-safe parallelism level (success-criterion-5 input).

## D3 Checkpoint

After T1–T8: `.gsd-t/ratelimit-map.json` on disk for D2 (calibration) + D5 (wire-in defaults). Wave 1 contribution complete.
