# Task 5 Summary — End-to-End Integration Harness (Wave 1 Complete)

**Status**: PASS
**Date**: 2026-04-14
**Domain**: context-meter-hook
**Milestone**: M34

## What was delivered

Two new test-only files, zero production-code changes:

1. `scripts/gsd-t-context-meter.e2e.test.js` — black-box integration tests
   (4 scenarios, all green in ~170ms) that spawn `node scripts/gsd-t-context-meter.js`
   as a real child process, feed stdin, assert stdout JSON shape and on-disk state.

2. `scripts/context-meter/test-injector.js` — TEST-ONLY NODE_OPTIONS `--require`
   hook that monkey-patches `count-tokens-client.countTokens` to inject
   `_baseUrl` before every call. Gated on env var
   `GSD_T_CONTEXT_METER_TEST_BASE_URL`; silent no-op when unset. Never loaded
   by production — the hook script does not require it, the installer does not
   ship it into `NODE_OPTIONS`, and nothing in the runtime require graph pulls
   it in on its own.

## Architectural shape

Tasks 1–4 unit-tested `runMeter()` via dependency injection (`_loadConfig`,
`_parseTranscript`, `_countTokens`, `clock`, `baseUrl`). This task tests the
real child-process hook the way Claude Code actually invokes it: no DI seams,
only stdin/stdout/env + file I/O.

The one unavoidable injection point is the HTTP destination. The hook's CLI
shim accepts no base-URL override (by design — production must never be
routable to a non-Anthropic host). Redirecting HTTP in a child process
therefore requires a `--require`-level monkey-patch inside that process,
guarded by a test-only env var so the file is a no-op outside tests.

## Sandbox design

Each test uses a `Sandbox` helper class that:

1. `fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-cm-e2e-"))` — fresh tempdir
2. Writes `.gsd-t/context-meter-config.json` with test-chosen values (default
   `checkFrequency: 1` so every call exercises the API path)
3. Writes a minimal Claude-Code-shaped `transcript.jsonl` (one user turn +
   one assistant turn — enough for `parseTranscript` to return a non-empty
   messages array)
4. Optionally pre-seeds `.gsd-t/.context-meter-state.json` (for the
   checkFrequency-skip test)
5. Starts a local stub `http.createServer` on `127.0.0.1:0`, tracks hit count,
   returns `{ "input_tokens": N }` on every request
6. Spawns `node scripts/gsd-t-context-meter.js` with:
   - `cwd` = tempdir
   - `env.ANTHROPIC_API_KEY = "test-key-ignored"`
   - `env.GSD_T_CONTEXT_METER_TEST_BASE_URL = http://127.0.0.1:{port}`
   - `env.NODE_OPTIONS = --require {absolute path to test-injector.js}`
7. Writes PostToolUse JSON payload to child's stdin, ends stdin, collects
   stdout on close, enforces `HARD_TIMEOUT_MS = 6000` via a kill timer
8. `afterEach` → `dispose()` kills any lingering children, `server.close()`
   awaits, `fs.rmSync(tempdir, { recursive: true, force: true })`

## Test scenarios (all PASS)

| # | Scenario | Stub input_tokens | cfg | Assertion |
|---|----------|-------------------|-----|-----------|
| 1 | Below threshold | 50000 | thresholdPct=75 | stdout `{}`, state `inputTokens=50000 pct≈25 threshold=normal checkCount=1 lastError=null`, no `.tmp`, stub hit=1 |
| 2 | Above threshold | 160000 | thresholdPct=75 | stdout `{ additionalContext: "⚠️ Context window at 80.0% of 200000. Run /user:gsd-t-pause to checkpoint and clear before continuing." }`, state `inputTokens=160000 pct≈80 threshold=downgrade`, stub hit=1 |
| 3 | Missing API key | 50000 (never hit) | default | Spawn with `ANTHROPIC_API_KEY=null` (deleted from env). stdout `{}`, state `checkCount=1 lastError.code="missing_key"`, stub hit=0 |
| 4 | checkFrequency skip | 50000 (never hit) | checkFrequency=5, pre-seed state `checkCount=3` | 3→4 is not a multiple of 5 — stdout `{}`, state `checkCount=4 inputTokens=0`, stub hit=0 |

## Timing

- Test 1: ~39ms
- Test 2: ~33ms
- Test 3: ~29ms
- Test 4: ~29ms
- Full E2E suite: ~166ms

Hard timeout per child: 6000ms (never triggered in practice).

## Cleanup rules

- `afterEach` is guaranteed to run `sandbox.dispose()` even on test failure
- `dispose()`: kills any lingering child processes (`SIGKILL`), awaits
  `server.close()`, removes the tempdir via `fs.rmSync(..., { recursive: true, force: true })`
- No leaked tempdirs, no leaked sockets, no leaked child processes across
  10+ consecutive runs verified manually

## Test results

```
node --test scripts/gsd-t-context-meter.e2e.test.js
  tests 4 / pass 4 / fail 0 / duration_ms 165

node --test scripts/context-meter/*.test.js \
            scripts/gsd-t-context-meter.test.js \
            scripts/gsd-t-context-meter.e2e.test.js \
            bin/context-meter-config.test.cjs
  tests 90 / pass 90 / fail 0

npm test
  tests 924 / pass 924 / fail 0
```

Baseline before Task 5: 919 tests. Task 5 adds 4 E2E tests plus the 1 other
test count delta from other incremental work → 924/924 green.

## Files created

- `scripts/gsd-t-context-meter.e2e.test.js` (new — 345 lines)
- `scripts/context-meter/test-injector.js` (new — 52 lines)

## Files modified

- `.gsd-t/progress.md` — Domains (M34) table row updated for
  context-meter-hook (planned 5/0 → complete 5/5); Decision Log entry for
  Wave 1 complete added
- `.gsd-t/domains/context-meter-hook/task-5-summary.md` (this file — new)

## Constraint discoveries

1. **NODE_OPTIONS `--require` path must be absolute.** Relative paths
   (`--require ./scripts/context-meter/test-injector.js`) fail in Node's
   internal loader when the child's cwd is a tempdir. The test uses
   `path.resolve(__dirname, "context-meter", "test-injector.js")` and passes
   the absolute path through `NODE_OPTIONS`.

2. **Monkey-patch target is the `module.exports` object, not the require
   cache entry.** Because the hook does `const { countTokens: realCountTokens }
   = require("./context-meter/count-tokens-client")` at module load time, the
   injector must patch `client.countTokens` *before* that require runs. The
   `--require` flag loads injector modules before any user code, so the
   ordering is correct: injector → hook → destructured `countTokens` sees the
   patched function.

3. **Child-process stdin/stdout is well-behaved** when the hook exits 0. The
   test writes the JSON payload with `child.stdin.write(...)` then
   immediately calls `child.stdin.end()`. The hook's `readStdin()` resolves
   on `end`, `runMeter` completes, `process.stdout.write(JSON.stringify(out))`
   flushes before `process.exit(0)` fires. No flush races observed in ~20
   consecutive runs.

4. **`checkFrequency: 1` is the simplest way to force the API path on every
   call.** The default is 5, which would require 5 PostToolUse invocations
   before the first stub hit — tolerable but slower. Tests that want the skip
   path (Test 4) use `checkFrequency: 5` plus a pre-seeded state file with
   `checkCount: 3` so the increment 3→4 is deliberately NOT a multiple.

5. **Closing the stub server in `dispose()` must be awaited.** `server.close()`
   is async — if the test returns before it completes, Node's test runner can
   report false positives about lingering handles. Wrapping it in `await new
   Promise(resolve => server.close(resolve))` keeps the suite clean.

6. **`fullEnv[k] = v` with `v === null` is a no-op on Linux child processes,
   but `delete fullEnv[k]` actually removes the var.** Test 3 unsets
   `ANTHROPIC_API_KEY` in the child's env to exercise the missing-key path;
   the helper treats `null`/`undefined` as a delete signal (not an assignment).

## Wave 1 status

**COMPLETE.** All five context-meter-hook tasks green. All four CP2
consumers (installer-integration, token-budget-replacement real-count tests,
and both downstream integration points) are unblocked. Next: Wave 2 —
installer-integration + token-budget-replacement in parallel, then
m34-docs-and-tests to close the milestone.

## Follow-ups (not in scope)

- None. The hook is fully unit-tested AND end-to-end tested; no gaps left
  for m34-docs-and-tests to pick up on this domain.
