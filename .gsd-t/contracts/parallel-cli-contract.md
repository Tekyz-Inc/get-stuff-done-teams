# Parallel-CLI Contract

> Status: **PROPOSED** — partition stub. D2 (`m55-d2-parallel-cli-substrate`) promotes to STABLE during execute.
> Version: 0.1.0 (stub) → 1.0.0 (STABLE target)
> Owner: D2
> Consumer: D5 (verify-gate Track 2)

## Purpose

N-worker pool runner. Every spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn`. Tee log streams per worker. Lifecycle/timeout/fail-fast policy. Engine-only — does NOT touch command files in M55.

## Library API (target)

```js
const { runParallel } = require('./bin/parallel-cli.cjs');
const result = await runParallel({
  workers: [{ id: 'tsc', cmd: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 60000 }, ...],
  maxConcurrency: 4,        // required; no implicit default
  failFast: false,
  teeDir: '.gsd-t/verify-gate/{runId}/'
});
// result: { ok, schemaVersion, results: [{id, ok, exitCode, durationMs, stdoutPath, stderrPath, signal?}], wallClockMs }
```

## CLI Form (target)

```
node bin/parallel-cli.cjs --plan plan.json --max-concurrency 4 --json
echo '{"workers":[...]}' | node bin/parallel-cli.cjs --max-concurrency 2 --json
```

## Calibration via D3 Map

Default `maxConcurrency` is **not** baked into D2. D5 reads `.gsd-t/ratelimit-map.json::recommended.peakConcurrency` (or D3's `summary.declaredSafe` cells) at wire-in time and passes the value. Without the map, D5 falls back to `maxConcurrency=2`.

## captureSpawn Invariant

Every worker spawn flows through `captureSpawn`. For deterministic CLIs (no LLM call), `usage` envelope is absent and the token-log row renders `—` per the canonical pattern. D2 NEVER fabricates `0` tokens.

## Fail-Fast Policy (target)

`failFast: true` → first non-zero exit cancels in-flight workers via `SIGTERM`, escalates to `SIGKILL` after 5s grace.

## Promotion to STABLE

D2 promotes to v1.0.0 STABLE when:
- Library + tee helper + proof CLI shipped
- ≥6 unit tests pass
- `bin/m55-substrate-proof.cjs` demonstrates ≥3× wall-clock speedup (charter SC2)
