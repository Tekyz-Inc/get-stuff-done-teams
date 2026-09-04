# Rate-Limit Map Contract

> Status: **STABLE**
> Version: **1.0.0** (promoted by D3 from PROPOSED v0.1.0 on 2026-05-09)
> Owner: D3 (`m55-d3-ratelimit-probe-map`)
> Consumers: D2 (default-concurrency calibration, operator-mediated) + D5 (`maxConcurrency` selection at wire-in)
> Producer: `bin/gsd-t-ratelimit-probe.cjs` + `bin/gsd-t-ratelimit-probe-worker.cjs`

## Purpose

Empirical map of the live Claude account's parallel-worker ceiling under realistic GSD-T spawn shape. The artifact replaces folklore ("3 workers max") with deterministic measurement.

The probe runs ONCE per account-tier, output committed at `.gsd-t/ratelimit-map.json`. Every probe spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn` so the cumulative ~140k-token spend is auditable in `.gsd-t/token-log.md`.

## Output Artifact

Path: **`.gsd-t/ratelimit-map.json`** (committed to repo).

## Schema (v1.0.0)

```jsonc
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-05-09T23:30:00.000Z",  // ISO-8601 UTC
  "claudeCliVersion": "2.1.138",               // from `claude --version`
  "account": "<sha256-prefix-16hex-of-key-or-token>",
  "accountTier": "default_claude_max_20x",     // raw rateLimitTier string
  "authPath": "api-key" | "oauth-claude-max",  // which credential masked into `account`
  "matrix": [
    {
      "workers": 1,                 // sweep cell: parallel worker count
      "contextTokens": 10000,       // sweep cell: per-worker fixture context size
      "runs": [
        {
          "runIdx": 0,
          "ttftMs": 1234,           // spawn-start → first stdout-byte
          "totalMs": 5678,          // spawn-start → child exit
          "status429": false,
          "retryAfterMs": null,     // populated only on 429
          "exitCode": 0,
          "failedReason": null      // string when spawn failed (auth, etc.)
        }
      ],
      "summary": {
        "p50TtftMs": 1234,
        "p95TtftMs": 1500,
        "total429": 0,
        "declaredSafe": true        // see Declared-Safe Rule
      }
    }
    // … 28 cells total (7 workers × 4 contexts)
  ],
  "backoffProbe": {
    "triggerCell": { "workers": 8, "contextTokens": 100000, "runs": 3 },
    "trigger429Count": 0,
    "post429RecoverySamples": [
      { "tElapsedMs": 5000, "ok": false, "ttftMs": null, "status429": true },
      { "tElapsedMs": 10000, "ok": true, "ttftMs": 2100, "status429": false }
      // 12 samples over 60s @ 5s cadence
    ]
  },
  "steadyState": {
    "workers": 3,
    "contextTokens": 30000,
    "durationSec": 300,
    "sampleCadenceSec": 30,
    "samples": [
      { "tElapsedSec": 30, "inputTokens": 90000, "outputTokens": 12, "ttftMs": 1500, "status429": false }
      // 10 samples
    ],
    "sustainedItpm": 540000,
    "sustainedOtpm": 72,
    "ok": true                       // false if any sample 429'd
  },
  "recommended": {
    "safeConcurrencyAt60kContext": 4,
    "peakConcurrency": 6,
    "perWorkerContextBudgetTokens": 30000,
    "backoffMs": 30000,
    "steadyState3Workers5MinPass": true
  },
  "notes": [
    // free-form strings; documents partial-run gaps, auth-path choice, etc.
  ]
}
```

### Field Semantics

- **`schemaVersion`**: bump rules in §Versioning below.
- **`generatedAt`**: ISO-8601 UTC at sweep start.
- **`claudeCliVersion`**: parsed from `claude --version` (first whitespace-delimited token after the version prefix). `"unknown"` if the CLI is unavailable.
- **`account`**: 16-hex-prefix of SHA-256. See §Account Masking.
- **`accountTier`**: copied from credential `rateLimitTier` if available, else `"unknown"`.
- **`authPath`**: `"api-key"` when `ANTHROPIC_API_KEY` is set and used for hashing, otherwise `"oauth-claude-max"` when hashed from the OAuth `accessToken`.
- **`matrix[].runs[].ttftMs`**: time-to-first-token, measured spawn-start → first non-empty stdout byte. `null` if child exits without producing any stdout (recorded as a failure).
- **`matrix[].runs[].totalMs`**: total wall-clock from spawn-start to child exit.
- **`matrix[].runs[].status429`**: true iff stderr contains `rate_limit` (case-insensitive) OR exit code indicates rate limit (the `claude` CLI surfaces 429s as text on stderr).
- **`matrix[].runs[].retryAfterMs`**: parsed from `retry-after-ms` or `retry-after` (seconds → ms) hints in stderr; `null` when not present.
- **`matrix[].runs[].exitCode`**: child exit code; non-zero when spawn failed.
- **`matrix[].runs[].failedReason`**: short string when the child failed for a non-rate-limit reason (CLI not found, auth refused, etc.).
- **`backoffProbe`**: deliberately provoke 429 at `(workers=8, contextTokens=100000, runs=3)` LAST in the sweep, then sample post-429 recovery every 5s for 60s with a single follow-up worker.
- **`steadyState`**: 5 minutes at `workers=3, contextTokens=30000`, sampling every 30s. `sustainedItpm`/`sustainedOtpm` averaged across samples that succeeded.
- **`recommended`**: derived from the matrix per the §Recommended-Derivation rules below. These are the values D2 (operator-mediated) and D5 (wire-in) consult.

## Sweep Matrix (charter-fixed)

```
parallel_workers ∈ {1, 2, 3, 4, 5, 6, 8}
context_tokens   ∈ {10_000, 30_000, 60_000, 100_000}
runs_per_cell    = 3
total_cells      = 7 × 4 = 28
total_runs       = 28 × 3 = 84
```

Per cell, all `workers` children are spawned **concurrently** (real parallel) and the cell waits for all to settle before moving to the next cell. Sequential between cells — never two cells in flight at once — so the rate-limit signal isn't muddied by cell overlap.

Plus:
- **Backoff probe**: deliberately trigger 429 at `workers=8, context=100k, runs=3`, then 12 single-worker recovery samples at 5s cadence over 60s.
- **Steady-state probe**: `workers=3, context=30k`, 5min wall-clock, sampled every 30s.

## Declared-Safe Rule

A `(workers, contextTokens)` cell is `summary.declaredSafe: true` iff:

1. `total429 == 0` across all `runs_per_cell` runs in that cell, AND
2. `p95TtftMs <= 8000`.

Rationale: zero rate-limit pressure AND tail latency under 8 seconds. A cell with even one 429 is unsafe; a cell with all-200s but p95 latency > 8s is too unstable for a parallel-fanout default.

## Recommended-Derivation Rules

- **`recommended.peakConcurrency`** = the highest `workers` value with `summary.declaredSafe: true` for **at least one** context-size cell. Floor 1.
- **`recommended.safeConcurrencyAt60kContext`** = the highest `workers` value with `summary.declaredSafe: true` at `contextTokens == 60000`. Floor 1.
- **`recommended.perWorkerContextBudgetTokens`** = the highest `contextTokens` value where `summary.declaredSafe: true` holds at `workers == recommended.peakConcurrency`. Floor 10000.
- **`recommended.backoffMs`** = the median `tElapsedMs` of the first successful sample in `backoffProbe.post429RecoverySamples` after the 429 trigger. If no recovery sample succeeds, fall back to 30000 (30s). If the trigger never produced a 429, set to 0.
- **`recommended.steadyState3Workers5MinPass`** = `steadyState.ok`.

## Refresh Policy

Re-run the full sweep on:

- Account-tier change (`rateLimitTier` differs from previously recorded `accountTier`)
- Every 30 days from `generatedAt`
- Operator-requested via `node bin/gsd-t-ratelimit-probe.cjs --force-refresh`

Between full refreshes, CI / regression uses `--quick` (1×1 smoke matrix at `workers=1, context=10k, runs=1`) which writes a transient `.gsd-t/quick-smoke.json`, NOT the canonical map.

## Account Masking (UPDATED 2026-05-09)

Two valid hashing paths — exactly one is selected at sweep time, recorded in `authPath`:

1. **API-key path** (`authPath: "api-key"`): when `process.env.ANTHROPIC_API_KEY` is set, `account` = `sha256(ANTHROPIC_API_KEY).slice(0, 16)` (16 hex chars).
2. **OAuth-Claude-Max path** (`authPath: "oauth-claude-max"`): when `ANTHROPIC_API_KEY` is unset and a Claude Max OAuth `accessToken` is available (from macOS Keychain entry `Claude Code-credentials` or `~/.claude/.credentials.json`), `account` = `"oauth-" + sha256(accessToken).slice(0, 16)`.

Both paths share an invariant: **the raw key/token is NEVER written to the map.** Only the hashed prefix is persisted. The 16-hex prefix is short enough that it is not a realistic substring of the source secret yet long enough (64 bits of hash space) to collision-detect tier changes for the same operator.

Per the GSD-T standing rule (`feedback_anthropic_key_measurement_only.md`), `ANTHROPIC_API_KEY` is permitted for measurement-only use; the OAuth path is the normal inference path. The probe is a measurement tool that consumes whichever credential is available, then masks it consistently.

## Versioning

`schemaVersion` follows semver:

- **Major** bump: schema field removed/renamed, declared-safe rule semantics changed
- **Minor** bump: new optional fields added (e.g., a new probe phase), recommended-derivation rule extended
- **Patch** bump: clarifying notes, no producer/consumer code changes required

Producers must always emit the latest schema version. Consumers MUST tolerate forward-compatible additive fields (treat unknown keys as no-ops).

## Producer/Consumer Wiring

| Side | Module | Behavior |
|------|--------|----------|
| Producer | `bin/gsd-t-ratelimit-probe.cjs` | Writes `.gsd-t/ratelimit-map.json` at the end of a full sweep. `--quick` writes `.gsd-t/quick-smoke.json` only. |
| Producer-helper | `bin/gsd-t-ratelimit-probe-worker.cjs` | Spawns a single `claude -p --dangerously-skip-permissions`, emits one NDJSON line on stdout, exits. Routed through `captureSpawn`. |
| Consumer (D2) | `bin/parallel-cli.cjs` | Reads `recommended.peakConcurrency` (floor 1, ceiling 8) for the runner's default `maxConcurrency`. Operator-mediated; no auto-recompute. |
| Consumer (D5) | `bin/gsd-t-verify-gate.cjs` | Reads `recommended.peakConcurrency` for Track 2 fan-out concurrency. Falls back to `1` if the map is missing. |

Both consumers MUST tolerate a missing or malformed map (treat as: peakConcurrency=1, safe@60k=1, perWorker=10k, backoff=30000, steadyStatePass=false). The map is an optimization input, not a hard precondition.

## Promotion Trail

- 0.1.0 — PROPOSED stub authored at partition (charter ref M55).
- **1.0.0 — STABLE** — promoted 2026-05-09 by D3. Probe runner shipped + 4 fixtures generated + sweep run completed + this contract finalized. Account-masking section extended to document OAuth fallback.
