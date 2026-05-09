# Verify-Gate Contract

> Status: **PROPOSED** — partition stub. D5 (`m55-d5-verify-gate-and-wirein`) promotes to STABLE during execute.
> Version: 0.1.0 (stub) → 1.0.0 (STABLE target)
> Owner: D5
> Consumer: `commands/gsd-t-verify.md` Step 2 (LLM judges the ≤500-token summary)

## Purpose

Two-track gate that executes BOTH:
- **Track 1** — D1's state-preflight envelope (hard-fail on any `severity: error` check)
- **Track 2** — D2's parallel-CLI substrate fans out typecheck / lint / tests / dead-code / secrets / complexity using off-the-shelf CLIs

Returns a ≤500-token JSON summary an LLM judges. Raw worker output stays on disk.

## Library API (target)

```js
const { runVerifyGate } = require('./bin/gsd-t-verify-gate.cjs');
const result = await runVerifyGate({
  projectDir: '.',
  preflightChecks: undefined,            // default = all D1 built-ins
  parallelTrack: undefined,              // default = all 6 CLIs (with skip-if-not-installed)
  maxConcurrency: undefined,             // default = read .gsd-t/ratelimit-map.json::recommended.peakConcurrency, fallback 2
  summaryTokenCap: 500
});
// result: { ok, schemaVersion, track1: {...preflight envelope...}, track2: {...summary...}, summary: {...≤500 tokens...}, llmJudgePromptHint, meta: { runId, generatedAt } }
```

## CLI Form (target)

```
gsd-t verify-gate --json
gsd-t verify-gate --skip-track1
gsd-t verify-gate --max-concurrency 4 --json
```

## Two-Track Hard-Fail

`top-level ok = track1.ok && track2.ok`. Both tracks always run (unless `--skip-track1` or `--skip-track2`); both report. The LLM judge sees the summary and renders a verdict; the gate's `ok` is purely deterministic.

## ≤500-Token Summary

Each Track 2 worker contributes a head-and-tail snippet of stdout + stderr (configurable per CLI). Total summary ≤500 tokens. Raw output stored at `.gsd-t/verify-gate/{runId}/{workerId}.{stdout,stderr}.log` — human-only inspection.

## Off-the-Shelf CLIs

| Job | CLI (default) | If not installed |
|-----|--------------|-----------------|
| typecheck | `tsc --noEmit` (or detected) | `skipped: true, reason: "not installed"` |
| lint | `biome check` / `ruff check` (detected) | `skipped: true` |
| tests | detected runner | `skipped: true` |
| dead-code | `knip` | `skipped: true` |
| secrets | `gitleaks detect --no-git -v` | `skipped: true` |
| complexity | `scc` or `lizard` | `skipped: true` |

D5 NEVER auto-installs.

## Idempotent Re-Runs

Same source state → byte-identical `track1` + `track2.summary` (modulo timestamps in `meta`).

## D3 Map Defensive Default

If `.gsd-t/ratelimit-map.json` doesn't exist, log warning + use `maxConcurrency=2`.

## Schema (target — D5 finalizes)

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "track1": { /* D1 preflight envelope verbatim */ },
  "track2": {
    "workers": [
      { "id": "tsc", "ok": true, "exitCode": 0, "durationMs": 1234, "skipped": false, "summarySnippet": "..." }
    ],
    "wallClockMs": 5678,
    "ok": true
  },
  "summary": { /* ≤500-token JSON for LLM */ },
  "llmJudgePromptHint": "Render a verdict on the summary above. PASS / FAIL.",
  "meta": { "runId": "verify-gate-...Z", "generatedAt": "ISO8601" }
}
```

## SC3 Failure Classes (D5 must produce 3 e2e/journeys specs)

| Failure class | Spec | Expected behavior |
|---------------|------|-------------------|
| Wrong branch | `e2e/journeys/verify-gate-blocks-wrong-branch.spec.ts` | `track1.checks[branch-guard].ok=false`; gate exits non-zero |
| Port conflict | `e2e/journeys/verify-gate-blocks-port-conflict.spec.ts` | `track1.checks[ports-free].ok=false`; gate exits non-zero |
| Contract DRAFT | `e2e/journeys/verify-gate-blocks-contract-draft.spec.ts` | `track1.checks[contracts-stable].ok=false`; gate exits non-zero |

## Promotion to STABLE

D5 promotes to v1.0.0 STABLE when:
- Library + judge companion shipped
- 3 wire-in assertion tests pass
- 3 e2e/journeys SC3 specs pass + manifest entries land
- Doc ripple complete (every surface in D5 scope's wire-in table)
