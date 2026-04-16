# Test Baseline — Scan #11

**Date**: 2026-04-16
**Version**: v3.11.11
**Runner**: `node --test` (Node.js built-in, zero dependencies)

## Suite Totals

| Metric | Count |
|--------|------:|
| Total tests | 1,231 |
| Passing | 1,224 |
| Failing | 7 |
| Skipped | 0 |
| Suites | 280 |
| Duration | 17.2s |

## Failing Tests (all in `scripts/gsd-t-context-meter.test.js`)

| # | Test | Root Cause |
|---|------|------------|
| 2 | check-frequency hit — under threshold | uses removed `_countTokens` injection |
| 3 | check-frequency hit — over threshold → additionalContext | uses removed `_countTokens` injection |
| 4 | missing API key — stdout {}, lastError.code='missing_key' | tests removed code path (no API key concept post-v3.11.11) |
| 6 | API timeout / failure — countTokens null | tests removed code path |
| 7b | state file corruption + frequency hit | uses removed `_countTokens` injection |
| 10c | fail-open — countTokens throws → {} | uses removed `_countTokens` injection |
| 11 | log never contains message content | log format changed (`tokens=42` fixture vs actual `tokens=8` from local estimator) |

**Root cause**: v3.11.11 (commit b521019, 2026-04-16) replaced the Anthropic
`count_tokens` API path with `scripts/context-meter/estimate-tokens.js` (local
char-based estimator). The production source was migrated to inject `_estimateTokens`
in tests; this test file was missed.

**Action**: rewrite the 7 tests against the new estimator API. See Quality Q-T01 and
Security SEC-H02 in this scan for severity (privacy invariant test #11 must be
preserved with new log-format expectations).

## Pre-existing Notes (operator advisory)

The operator pre-flagged "2 known failures in `test/token-budget.test.js` (heuristic
fallback tests) — do not try to fix as part of this scan." Verified independently:
`node --test test/token-budget.test.js` → **42/42 passing**. The advisory appears to
be stale; the file is dirty in `git status` (` M test/token-budget.test.js`) so the
working-tree edit may have already corrected the failures. No action needed for this
file in this scan.

## What Was Verified
- Full suite ran via `npm test` to completion.
- No new test files were added in this scan.
- No code changes were made — this is observation only.
- `test/token-budget.test.js` re-run in isolation to verify operator note. Result:
  green.

## Compared to Scan #10 (2026-03-19, v2.39.12)
- Then: ~833 tests (post-M21), all passing.
- Now: 1,231 tests, 7 failing (all in one file, all stranded by v3.11.11).
- Net new tests: ~398 (M34 +108, M35 +44, M36 +241, M37 +2 — approximate from
  progress.md milestone summaries).
- Test growth is healthy. The 7 stranded tests are a regression introduced today and
  should be cleared in a follow-up patch (v3.11.12 or rolled into the M38 work).
