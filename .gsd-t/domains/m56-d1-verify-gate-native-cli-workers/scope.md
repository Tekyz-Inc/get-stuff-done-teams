# Domain: m56-d1-verify-gate-native-cli-workers

## Responsibility
Extend `bin/gsd-t-verify-gate.cjs` Track 2 with native CLI workers for `playwright test`, `npm test`, and `gsd-t check-coverage`. Eliminate Task subagent wrapper for these checks — they run as direct `runParallel` workers via the M55 D2 substrate. Record M55-baseline-tokens and M56-actual-tokens in `.gsd-t/metrics/` and report the delta in CHANGELOG (closes M55 SC4 retroactively).

## Files Owned
- `bin/gsd-t-verify-gate.cjs` — additive Track 2 native worker definitions (DOES NOT touch existing `runVerifyGate` envelope shape)
- `.gsd-t/metrics/m56-token-baseline.json` — new file capturing M55 baseline + M56 actuals
- `.gsd-t/metrics/m56-verify-gate-wallclock.json` — new file capturing dogfood wall-clock measurement
- `test/m56-d1-verify-gate-native-cli.test.js` — new unit tests for native worker registration + invocation shape
- `test/m56-d1-token-baseline.test.js` — new unit tests for baseline+actual recording

## NOT Owned (do not modify)
- `bin/parallel-cli.cjs` — read-only USE (M55 D2 stable dependency)
- `bin/gsd-t-token-capture.cjs` — read-only USE (M41 stable dependency)
- `bin/cli-preflight.cjs` — read-only USE (M55 D1 stable dependency)
- `bin/gsd-t-context-brief.cjs` — D2 owns
- `commands/*.md` — D3 + D4 own
- `bin/gsd-t.js` — D5 owns the `spawnClaudeSession` slice; D1 stays out
- `bin/gsd-t-parallel.cjs` — D5 owns the cache-warm probe slice; D1 stays out
- `bin/gsd-t-ratelimit-probe-worker.cjs` — D5 owns
- `bin/gsd-t-capture-lint.cjs` — D5 owns

## Files Touched (audit trail)
- `bin/gsd-t-verify-gate.cjs` (additive — new Track 2 worker definitions, no envelope-shape changes)
- `.gsd-t/metrics/m56-token-baseline.json` (new)
- `.gsd-t/metrics/m56-verify-gate-wallclock.json` (new)
- `test/m56-d1-verify-gate-native-cli.test.js` (new)
- `test/m56-d1-token-baseline.test.js` (new)
