# Task 4 Summary — Hook Entry Point (CP2 Satisfaction)

**Status**: PASS
**Commit**: `1f19072`
**Date**: 2026-04-14

## What was delivered

`scripts/gsd-t-context-meter.js` — the PostToolUse hook entry point that wires
together all M34 context-meter-hook dependencies:

- `bin/context-meter-config.cjs` → `loadConfig(projectRoot)`
- `scripts/context-meter/transcript-parser.js` → `parseTranscript(path)` (async, streaming)
- `scripts/context-meter/count-tokens-client.js` → `countTokens({...})` (zero-dep HTTPS)
- `scripts/context-meter/threshold.js` → `computePct / bandFor / buildAdditionalContext`

Plus `scripts/gsd-t-context-meter.test.js` — 15 unit tests covering every
acceptance criterion from the task spec.

## Architectural shape

The module exposes two layers:

1. **Testable core** — `runMeter({ payload, projectRoot, env, clock?, baseUrl?,
   _loadConfig?, _parseTranscript?, _countTokens? })`. Pure async function that
   takes a fabricated payload + env + stub dependencies and returns the JSON
   object destined for stdout (`{}` or `{ additionalContext }`). Tests call
   this directly — no child processes, no real network, no real config files.

2. **CLI shim** — runs only when `require.main === module`. Reads stdin, parses
   JSON, calls `runMeter` with `process.cwd()` and `process.env`, writes
   `JSON.stringify(out)` to stdout, exits 0. Always.

This split is the cleanest way to keep Task 4 testable at the unit level and
leaves Task 5 (E2E) as the only place where the hook is exercised as a real
child process.

## Control flow (in order)

1. `loadConfig(projectRoot)` — any throw → return `{}` immediately (fail open).
2. Read state file (or default on missing/corrupt JSON).
3. Increment `checkCount`.
4. If `checkCount % checkFrequency !== 0` → write state, return `{}`. (The API
   is NEVER called on skipped ticks.)
5. Extract `transcript_path` from the payload → if missing, record
   `lastError.code = "no_transcript"`, log, return `{}`.
6. Check `env[cfg.apiKeyEnvVar]` → if empty, record `lastError.code =
   "missing_key"`, log, return `{}`. (API still not called.)
7. `parseTranscript(path)` → if null or throws, record `lastError.code =
   "parse_failure"`, log, return `{}`.
8. `countTokens({apiKey, model: "claude-opus-4-6", system, messages, timeoutMs,
   _baseUrl?})` → if null or throws, record `lastError.code = "api_error"`,
   reset `inputTokens` to 0, log, return `{}`.
9. Compute `pct`, `band` from `computePct` / `bandFor`.
10. Write success state (timestamp, inputTokens, pct, threshold, lastError: null).
11. Log `INFO measure tokens=N pct=X band=Y`.
12. `buildAdditionalContext` → returns a string iff `pct >= thresholdPct`. If
    yes, return `{ additionalContext }`; else `{}`.

## State file schema (exact fields written)

```json
{
  "version": 1,
  "timestamp": "2026-04-14T18:05:23.000Z" | null,
  "inputTokens": 124350,
  "modelWindowSize": 200000,
  "pct": 62.175,
  "threshold": "warn",
  "checkCount": 47,
  "lastError": null | { "code": "...", "message": "...", "timestamp": "..." }
}
```

Written atomically: `fs.writeFileSync({statePath}.tmp, ...)` → `fs.renameSync`.
Parent directory auto-created with `fs.mkdirSync(..., { recursive: true })`.

## Diagnostic log format

Append-only, line-based, `.gsd-t/context-meter.log`:

```
{ISO-timestamp} {LEVEL} {category} {short-detail}
```

Examples:

```
2026-04-14T21:20:00.000Z INFO  measure tokens=124350 pct=62.2 band=warn
2026-04-14T21:21:00.000Z ERROR missing_key env var ANTHROPIC_API_KEY unset
2026-04-14T21:22:00.000Z ERROR api_error count_tokens null
```

Contract compliance:
- NEVER logs message content, text blocks, or API request bodies.
- NEVER logs the API key.
- NEVER logs token values from message content — only the `input_tokens`
  integer returned by the API.
- Log-write failure is swallowed silently (a failing disk must not escalate
  into an exit-non-zero cascade).

## Key design decisions

### Decision: On API failure, reset `inputTokens` to 0

**Context**: When `countTokens` returns null (timeout, 5xx, network, etc.),
what should the state file say?

**Alternative A — preserve prior reading**: Keep the last known good
`inputTokens` value. Consumers see the last real measurement.

**Alternative B — reset to 0**: Overwrite with zero. Consumers see "no signal."

**Chosen: B**. A stale prior reading in the 80%+ band combined with the
check-frequency gate could cause the hook to emit `additionalContext` on a
failed check (the writer's update path always recomputes pct+band from
`inputTokens`). Since the contract is *fail open* — never block Claude —
zeroing is the safer direction: it biases false-negatives over false-positives
on error paths. `lastError` still records the failure, so consumers that care
can detect staleness explicitly via `lastError !== null`. Documented inline in
the hook's step 7 comment. Test case #6 pins this behavior.

### Decision: `runMeter` is the core, CLI shim is trivial

Unit tests exercising a real child process would need shell quoting,
stdin piping, stdout capture, and process timeout handling — all of which
would make the tests slow and flaky. By exposing `runMeter` with test seams
(`_loadConfig`, `_parseTranscript`, `_countTokens`, `clock`, `baseUrl`), tests
run in-process in <100ms each. Task 5 (E2E) will spawn the hook as a child
process to cover the stdin→shim→runMeter→stdout→exit-code path that unit tests
deliberately don't touch.

### Decision: Error-handling contract between `runMeter` and the CLI shim

`runMeter` is guaranteed to **resolve** (never reject) with an object — `{}`
on failure, `{ additionalContext }` on success. The CLI shim still wraps
`runMeter`'s await in a `try/catch` that catches a hypothetical unhandled
rejection and writes `{}` anyway. Defense-in-depth: two nested safety nets
behind the fail-open invariant. Test cases #10 / #10b / #10c all force throws
at different layers and verify the `{}` resolution.

### Decision: Model hardcoded to `claude-opus-4-6`

Per the task spec — future work can auto-detect the session's actual model
from the transcript. The count_tokens endpoint accepts any valid model id and
returns the count for that model's tokenizer; Opus/Sonnet 4.6 share a
tokenizer so the number is accurate for both.

### Decision: Check-frequency gate runs BEFORE transcript parse

The spec is ambiguous about ordering — "read/increment checkCount" and "if
skip, emit {}" are both listed. Parsing the transcript before the skip check
would waste I/O on 4 out of every 5 PostToolUse invocations (default cfg). So
the hook:

1. Read state, increment counter.
2. Skip check — if skip, write state, return `{}`. No parse, no API call.
3. Only on hit days do we extract `transcript_path`, check API key, parse, and
   call the API.

This keeps the latency budget for skipped ticks under a handful of ms (one
state read + one state write + zero network).

## Test coverage

15 test cases in `scripts/gsd-t-context-meter.test.js`:

| # | Scenario | Key assertion |
|---|----------|---------------|
| 1 | Check-frequency skip | API NOT called, counter 3→4, `{}` |
| 2 | Under-threshold hit | inputTokens=10000, pct=5, band=normal, `{}` |
| 3 | Over-threshold hit | inputTokens=160000, pct=80, band=downgrade, `additionalContext` emitted with "80.0%" + "200000" + "/user:gsd-t-pause" |
| 4 | Missing API key | lastError.code=missing_key, API NOT called, key NOT in log |
| 5 | parseTranscript returns null | lastError.code=parse_failure, API NOT called |
| 6 | countTokens returns null | lastError.code=api_error, inputTokens reset to 0 |
| 7 | Corrupt state file (skip path) | Overwritten with valid JSON, checkCount=1 |
| 7b | Corrupt state file (hit path) | API called once, state valid, lastError null |
| 8 | Missing transcript_path in payload | lastError.code=no_transcript |
| 9 | Atomic write | `.tmp` file absent after success, state file present |
| 10 | loadConfig throws | `{}` returned, no crash |
| 10b | parseTranscript throws sync | `{}` returned, lastError.code=parse_failure |
| 10c | countTokens throws sync | `{}` returned, lastError.code=api_error |
| 11 | Log content sanitization | Message content secret NOT in log; measure line present |
| 12 | Clock injection | state.timestamp equals injected clock's output |

### Test runner

`node --test scripts/gsd-t-context-meter.test.js` — 15/15 pass in ~50ms.

### Full context-meter suite after Task 4

```
node --test scripts/context-meter/transcript-parser.test.js \
            scripts/context-meter/count-tokens-client.test.js \
            scripts/context-meter/threshold.test.js \
            scripts/gsd-t-context-meter.test.js \
            bin/context-meter-config.test.cjs

tests 86
pass  86
fail  0
```

### Full project suite

```
npm test
tests 919
pass  919
fail  0
```

Baseline before CP1 was 833; after CP1 was 845; after all four hook tasks is
919 (74 new tests across Tasks 1–4 in this domain).

## Files created

- `scripts/gsd-t-context-meter.js` — 273 lines, zero external deps
- `scripts/gsd-t-context-meter.test.js` — 15 tests, uses `node:test` +
  `node:assert/strict` only

## Files modified

- `.gsd-t/progress.md` — CP2 marked satisfied, Decision Log entry added

## Follow-ups (not in scope for Task 4)

- Task 5: E2E test that spawns the hook as a child process with real stdin
  input and asserts the stdout JSON shape.
- installer-integration domain: register the hook in `.claude/settings.json`
  under `hooks.PostToolUse`, ensure it's installed by `gsd-t install`.
- token-budget-replacement Task 3: rewrite `bin/token-budget.js` to read
  `.gsd-t/.context-meter-state.json` (freshness window 5 min), falling back to
  the historical heuristic when the state is stale or missing.
- A future enhancement: auto-detect the session's model from the transcript
  rather than hardcoding `claude-opus-4-6`.

## Constraint discoveries

1. **`runMeter` as a fully-async core, not a synchronous one**: `parseTranscript`
   is streaming-async (readline over a file stream) and `countTokens` uses
   Node's callback-style `https.request`. A synchronous core would have needed
   `child_process.execSync` wrappers or a bespoke event loop — neither is
   clean. The async core let me share tests across all dependencies without
   any plumbing.

2. **State-file side effect BEFORE the API call**: The checkCount increment
   must be durable across every possible exit. If we only wrote state after
   the API call, a failing API would leak counter values and make the next
   tick's frequency calculation wrong. The implementation writes state on
   EVERY exit path (skip, missing key, no transcript, parse fail, api fail,
   success). Test case #1 verifies the counter is still incremented on skips;
   test cases #4–#8 verify the counter increments even on error paths.

3. **The `.tmp` file check is load-bearing** (test #9). Earlier in development
   I was tempted to write the state file directly (no atomic rename). But a
   crash mid-write would corrupt the state and force the next invocation into
   the corruption-recovery path (which defaults to `checkCount: 0`) — losing
   all prior counter state. Atomic write is cheap (one extra rename call)
   and eliminates the failure mode.

4. **Logging must be best-effort, not required**: `fs.appendFileSync` can fail
   on permissions, read-only filesystems, or missing parent directories. The
   implementation wraps `appendLog` in a try/catch that swallows everything.
   If the log file can't be written, the hook still emits `{}` (or
   `additionalContext`) correctly. Contract rule #1 (fail open) beats the
   "observable" desire.

## CP2 Status

**SATISFIED** as of commit `1f19072` (2026-04-14 21:20 UTC).

Unblocks:
- installer-integration domain (all tasks)
- token-budget-replacement Task 3 (real-count tests)
