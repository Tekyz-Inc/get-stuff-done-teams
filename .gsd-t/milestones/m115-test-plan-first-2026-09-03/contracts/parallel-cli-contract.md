# Parallel-CLI Contract

> Status: **STABLE**
> Version: **1.0.0** (promoted by D2 from PROPOSED v0.1.0 on 2026-05-09)
> Owner: D2 (`m55-d2-parallel-cli-substrate`)
> Consumer: D5 (verify-gate Track 2 fans out via `runParallel`)
> Producer: `bin/parallel-cli.cjs` + `bin/parallel-cli-tee.cjs`

## Purpose

N-worker pool runner. Every spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn`. Tee log streams per worker. Lifecycle / per-worker timeout / fail-fast policy. Engine-only — does NOT touch any command file in M55 (downstream command-file rewrites are a follow-up ratchet milestone).

## Library API

```js
const { runParallel } = require('./bin/parallel-cli.cjs');
const result = await runParallel({
  workers: [
    { id: 'tsc',  cmd: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 60000 },
    { id: 'lint', cmd: 'npx', args: ['biome', 'check'], cwd: 'app', env: { CI: '1' } },
    // …
  ],
  maxConcurrency: 4,        // required; no implicit default
  failFast: false,          // default false
  teeDir: '.gsd-t/verify-gate/<runId>/',  // optional; null/undefined → in-memory capture
  command: 'gsd-t-verify-gate',           // captureSpawn `command`; default 'parallel-cli'
  step:    'Track 2',                     // captureSpawn `step`; default 'parallel'
  domain:  'm55-d5',                      // captureSpawn `domain`; default '-'
  task:    'T-3',                         // captureSpawn `task`; default '-'
});
```

### Worker spec (`opts.workers[i]`)

| Field        | Type                | Required | Notes                                                             |
|--------------|---------------------|----------|-------------------------------------------------------------------|
| `id`         | string              | yes      | Sortable, unique per call. Used in `results[i].id` and tee paths. |
| `cmd`        | string              | yes      | Executable. NOT shell-interpolated (no shell metacharacters).     |
| `args`       | string[]            | yes      | Empty array allowed. Never strings interpolated into a shell.     |
| `cwd`        | string              | no       | Default = `opts.projectDir || process.cwd()`.                     |
| `env`        | object              | no       | Merged onto `process.env`. Empty object = inherit only.           |
| `timeoutMs`  | number\|null        | no       | Default `null` = no timeout.                                      |
| `model`      | string              | no       | Pass-through to captureSpawn banner. Default `'cli'`.             |
| `description`| string              | no       | Pass-through to captureSpawn banner. Default = `id`.              |

### Top-level `opts` validation rules

- `workers` MUST be a non-empty array.
- Worker `id` values MUST be unique within a call. Duplicates throw before any spawn.
- `maxConcurrency` MUST be a positive integer ≥ 1. Missing or invalid throws.
- Worker `id` MUST match `/^[A-Za-z0-9._-]+$/` (path-traversal safe for tee paths).

## Result Envelope

```jsonc
{
  "schemaVersion": "1.0.0",
  "ok": true,                  // false if any result.ok === false
  "wallClockMs": 1234,         // orchestrator real-time, NOT sum-of-worker times
  "maxConcurrencyApplied": 4,  // echoed for audit
  "failFast": false,
  "results": [                 // sorted by id ASC, deterministic
    {
      "id": "lint",
      "ok": true,
      "exitCode": 0,
      "signal": null,
      "durationMs": 642,
      "stdoutPath": ".gsd-t/verify-gate/<runId>/lint.stdout.ndjson",
      "stderrPath": ".gsd-t/verify-gate/<runId>/lint.stderr.ndjson",
      "stdoutBytes": 1024,
      "stderrBytes": 0,
      "stdoutTruncatedToTemp": false,
      "stderrTruncatedToTemp": false,
      "timedOut": false,
      "cancelled": false
    }
  ],
  "notes": []                  // soft warnings (e.g. tee write fallbacks)
}
```

`results[]` is **sorted by `id` ASC** for determinism — never by start time, exit time, or completion order.

## CLI Form

```
node bin/parallel-cli.cjs --plan plan.json --max-concurrency 4 --json
echo '{"workers":[…]}' | node bin/parallel-cli.cjs --max-concurrency 2 --json
node bin/parallel-cli.cjs --plan plan.json --max-concurrency 4 --tee-dir .gsd-t/verify-gate/run-001/ --fail-fast --json
```

CLI flag list:

| Flag                    | Maps to opts        | Required               |
|-------------------------|---------------------|------------------------|
| `--plan FILE`           | `workers`           | one of plan/stdin      |
| `--max-concurrency N`   | `maxConcurrency`    | yes                    |
| `--fail-fast`           | `failFast=true`     | no                     |
| `--tee-dir DIR`         | `teeDir`            | no                     |
| `--json`                | render JSON envelope| no (default text mode) |

Exit code: `0` if `ok===true`, `1` if `ok===false`. Malformed input → `2`. Unhandled error → `3`.

## Calibration via D3 Map

`maxConcurrency` is **not** baked into D2 — every call must declare intent. D5 reads `.gsd-t/ratelimit-map.json::recommended.peakConcurrency` (falling back to `summary.declaredSafe` cells) at wire-in time and passes the value. Without the map, D5 falls back to `maxConcurrency=2`. D2 itself ships agnostic.

## captureSpawn Invariant

Every worker spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn`. For deterministic CLIs (no LLM call), the `usage` envelope is absent and the `Tokens` cell of `.gsd-t/token-log.md` renders `—` per the canonical pattern.

D2 NEVER fabricates `0` tokens, NEVER calls `child_process.spawn` directly in production paths. The `spawnFn` passed to `captureSpawn` is the only place `child_process.spawn` is invoked.

## Fail-Fast Policy

`failFast: true` → the first non-zero exit cancels in-flight workers via `SIGTERM`. After a 5s grace, escalates to `SIGKILL`. Cancelled workers report `cancelled: true`, `ok: false`, `signal: 'SIGTERM'` (or `'SIGKILL'` after grace). The triggering worker reports its real `exitCode` and `cancelled: false`.

`failFast: false` (default) → all workers run to completion regardless of sibling failures. Top-level `ok` is the AND of all worker `ok` flags.

## Per-Worker Timeout

`workers[i].timeoutMs` (default `null`) — on expiry, the worker is cancelled identically to fail-fast cancellation but only that worker is killed. Reports `timedOut: true`, `cancelled: true`, `signal: 'SIGTERM'` (or `'SIGKILL'` after 5s grace), `ok: false`. Sibling workers continue regardless.

## Tee Paths

When `teeDir` is supplied, every worker streams stdout/stderr to NDJSON files under that dir:

- `{teeDir}/{workerId}.stdout.ndjson`
- `{teeDir}/{workerId}.stderr.ndjson`

Each NDJSON line is `{"t": <isoTs>, "stream": "stdout"|"stderr", "data": "<line>"}`. The directory is created with `recursive: true` if missing.

When `teeDir` is absent, `stdoutPath`/`stderrPath` are `null` and output is captured to memory. The in-memory cap is **1 MB per stream**; on overflow, the buffer is rotated to `os.tmpdir()/parallel-cli-{workerId}-{streamName}-{ts}.tmp` and `stdoutTruncatedToTemp` (or `stderrTruncatedToTemp`) is set `true`. The temp path is returned in the result.

## Determinism Rules

- `results[]` sorted by `id` ASC, never by start/end time.
- `wallClockMs` = end-orchestrator − start-orchestrator (real time, NOT cumulative worker time).
- `notes[]` sorted ASC.
- Sort runs **after** all workers complete — never partial / streaming.

## Engine-Only

D2 does NOT modify any command file in `commands/*.md` and does NOT replace `bin/gsd-t-worker-dispatch.cjs` or `bin/gsd-t-unattended.cjs`. Those are higher-level orchestrators; this is the lower-level primitive they may eventually consume in a follow-up ratchet milestone.

## JSON-Only Public Envelope

The public return value of `runParallel` is a single plain JSON object (the envelope above). Internal logs (per-worker tee NDJSON) are line-delimited JSON. No binary, no protobuf, no msgpack.

## Concurrency Knob

`maxConcurrency` is a **public required** parameter — there is no implicit default below the API. The CLI form requires `--max-concurrency`. Missing it → exit code 2 with stderr `parallel-cli: --max-concurrency is required`.

## Test Surface (mandated by Task T4)

The test suite under `test/m55-d2-parallel-cli.test.js` covers:

1. Happy parallel — 3 workers, all succeed, `ok===true`.
2. Exceeds-cap throttling — 5 workers, `maxConcurrency=2`, peak in-flight ≤ 2.
3. Single fail-fast — first non-zero exit cancels siblings; siblings report `cancelled: true`.
4. Per-worker timeout — `timeoutMs` expiry kills only that worker; siblings finish normally.
5. Tee paths valid — NDJSON files exist and parse.
6. captureSpawn invariant — wrapper invoked exactly once per worker.

## Promotion to STABLE

D2 promotes to v1.0.0 STABLE when:
- `bin/parallel-cli.cjs` + `bin/parallel-cli-tee.cjs` shipped.
- `bin/m55-substrate-proof.cjs` demonstrates ≥3× wall-clock speedup (charter SC2). Numbers appended to `.gsd-t/metrics/m55-substrate-proof.txt`.
- ≥6 unit tests pass on Node built-in test runner.
- Baseline 2262/2262 unit suite preserved.
