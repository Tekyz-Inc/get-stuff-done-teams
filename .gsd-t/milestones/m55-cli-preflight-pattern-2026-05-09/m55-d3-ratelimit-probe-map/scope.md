# Domain: m55-d3-ratelimit-probe-map

## Responsibility

Empirically measure this Anthropic account's practical parallelism ceiling under real GSD-T spawn shape, and ship the resulting map as a single JSON artifact that D2's substrate calibration and D5's wire-in time defaults can consult. One-shot ~140k-token spend approved per charter — accuracy matters more than parsimony.

This is M55's **falsifier-grade** measurement domain: success-criterion-5 ("zero 429 errors at parallelism level D3 declared safe + peak parallelism ≥6 concurrent workers") cannot be claimed without a concrete map authored here.

## Owned Files/Directories

- `bin/gsd-t-ratelimit-probe.cjs` — synthetic-worker harness + sweep runner. Public CLI: `node bin/gsd-t-ratelimit-probe.cjs --json [--quick]`. `--quick` runs a 1×1 smoke matrix only (for CI / regression). Default runs the full sweep matrix below.
- `bin/gsd-t-ratelimit-probe-worker.cjs` — single-worker child entry. Reads N-token-sized synthetic context from a fixture file, prompts a small Claude completion, emits per-worker timing + 429-event NDJSON line on stdout. Spawned by the sweep runner.
- `.gsd-t/fixtures/ratelimit-probe/` — synthetic context fixtures sized at 10k / 30k / 60k / 100k tokens (lorem-style padded text + faux-CLAUDE.md + faux-contract.md to mirror realistic GSD-T spawn shape). One file per size bucket.
- `.gsd-t/ratelimit-map.json` — output artifact. Schema: `{ schemaVersion, generatedAt, account: "<sha256(ANTHROPIC_API_KEY) prefix>", matrix: [{ workers, contextTokens, runs: [{ttftMs, totalMs, status429: bool, retryAfterMs?}], summary: {p50TtftMs, p95TtftMs, total429, declaredSafe: bool} }], backoffProbe: {…}, steadyState: {…} }`. Schema-versioned via `cli-preflight-contract.md`-equivalent contract file.
- `.gsd-t/contracts/ratelimit-map-contract.md` v1.0.0 STABLE — schema, sweep matrix, "declared safe" rule (zero 429 + ttft p95 ≤ 8s), refresh policy (re-run on account-tier change or every 30 days).
- `test/m55-d3-ratelimit-probe.test.js` — unit tests (matrix construction, output envelope shape, declared-safe rule, fixture-size validator). NO live API hits in unit tests — those happen during the one-shot probe run only.

## NOT Owned (do not modify)

- `bin/cli-preflight.cjs` — D1
- `bin/parallel-cli.cjs` — D2 (D2 reads the map artifact at integration time; D2 does not import D3 code)
- `bin/gsd-t-context-brief.cjs` — D4
- `bin/gsd-t-verify-gate.cjs` — D5
- `bin/gsd-t-token-capture.cjs` — read-only reference (probe spawns DO go through `captureSpawn` to record the ~140k spend faithfully)
- Any command file under `commands/` — out-of-scope per charter

## Deliverables

- `bin/gsd-t-ratelimit-probe.cjs` + `bin/gsd-t-ratelimit-probe-worker.cjs`
- 4 size-bucket fixtures under `.gsd-t/fixtures/ratelimit-probe/`
- `.gsd-t/ratelimit-map.json` populated from a single full sweep run (the artifact, not just the tooling)
- `.gsd-t/contracts/ratelimit-map-contract.md` v1.0.0 STABLE
- Unit tests for matrix/envelope/declared-safe (no live hits in tests)

## Sweep Matrix (Charter)

```
parallel_workers ∈ {1, 2, 3, 4, 5, 6, 8}
context_tokens   ∈ {10_000, 30_000, 60_000, 100_000}
runs_per_cell    = 3   (median over 3 reduces single-spike noise)
total_cells      = 7 × 4 = 28
total_runs       = 28 × 3 = 84
```

Plus:
- **Backoff probe**: deliberately trigger 429 at workers=8 / context=100k, then sample post-429 retry windows every 5s for 60s.
- **Steady-state probe**: run workers=3 / context=30k continuously for 5 minutes, capture sustained ITPM/OTPM achieved.

## Integration

- D2 reads the map artifact at recommend-defaults time (operator-mediated; D2's `runParallel` API is map-agnostic).
- D5 reads the map at `gsd-t-execute` Step 1 wire-in time to choose `maxConcurrency` for the verify-gate Track 2 fan-out.
- The map is **not** consulted by D1 (preflight is single-shot, no concurrency).

## Sequencing

- Wave 1 — independent of D1, D2, D4. Can start immediately. Long-running (sweep takes ~15-30 min wall clock + ~140k tokens).
- Outputs `.gsd-t/ratelimit-map.json` which D2 (Wave 2) and D5 (Wave 3) consume.
