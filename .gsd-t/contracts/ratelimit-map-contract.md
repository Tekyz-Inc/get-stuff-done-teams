# Rate-Limit Map Contract

> Status: **PROPOSED** — partition stub. D3 (`m55-d3-ratelimit-probe-map`) promotes to STABLE during execute.
> Version: 0.1.0 (stub) → 1.0.0 (STABLE target)
> Owner: D3
> Consumers: D2 (default-concurrency calibration, operator-mediated) + D5 (`maxConcurrency` selection at wire-in)

## Purpose

Empirical map of the live Anthropic account's parallel-worker ceiling under real GSD-T spawn shape. One-shot ~140k token spend (charter-approved). The artifact replaces folklore with measurement.

## Output Artifact

Path: `.gsd-t/ratelimit-map.json` (committed to repo).

## Schema (target — D3 finalizes)

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-05-NNTNN:NN:NNZ",
  "claudeCliVersion": "x.y.z",
  "account": "<sha256-prefix-of-key>",
  "accountTier": "claude-max",
  "matrix": [
    {
      "workers": 1,
      "contextTokens": 10000,
      "runs": [
        { "ttftMs": 1234, "totalMs": 5678, "status429": false }
      ],
      "summary": {
        "p50TtftMs": 1234,
        "p95TtftMs": 1500,
        "total429": 0,
        "declaredSafe": true
      }
    }
  ],
  "backoffProbe": { "post429RecoverySamples": [...] },
  "steadyState": { "workers": 3, "contextTokens": 30000, "durationMin": 5, "sustainedItpm": 0, "sustainedOtpm": 0 },
  "recommended": {
    "safeConcurrencyAt60kContext": 4,
    "peakConcurrency": 6,
    "perWorkerContextBudgetTokens": 30000,
    "backoffMs": 30000,
    "steadyState3Workers5MinPass": true
  }
}
```

## Sweep Matrix (charter-fixed)

```
parallel_workers ∈ {1, 2, 3, 4, 5, 6, 8}
context_tokens   ∈ {10_000, 30_000, 60_000, 100_000}
runs_per_cell    = 3
total_runs       = 84
```

Plus backoff probe (workers=8, context=100k, 60s recovery sampling) and steady-state probe (workers=3, context=30k, 5 min).

## Declared-Safe Rule

A `(workers, contextTokens)` cell is `summary.declaredSafe: true` iff:
- `total429 == 0` across all `runs_per_cell`
- `p95TtftMs <= 8000`

`recommended.peakConcurrency` is the highest `workers` value with `declaredSafe: true` at any context size. `recommended.safeConcurrencyAt60kContext` is the highest `workers` value with `declaredSafe: true` at `contextTokens == 60000`.

## Refresh Policy

Re-run on:
- Account-tier change
- Every 30 days from `generatedAt`
- Operator-requested (`--force-refresh`)

## Account Masking

The `account` field is `sha256(ANTHROPIC_API_KEY).slice(0, 16)`. Raw key MUST NEVER be written.

## Promotion to STABLE

D3 promotes to v1.0.0 STABLE when:
- Probe runner shipped + 4 fixture sizes generated
- `.gsd-t/ratelimit-map.json` populated from a real sweep run
- Schema validated by `test/m55-d3-ratelimit-probe.test.js`
