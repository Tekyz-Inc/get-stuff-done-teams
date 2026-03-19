# Test Baseline — Scan #10

**Date**: 2026-03-19
**Version**: v2.38.10
**Runner**: `node --test` (Node.js built-in, zero dependencies)
**Command**: `npm test`

## Results

| Metric    | Value |
|-----------|-------|
| Tests     | 294   |
| Suites    | 75    |
| Pass      | 294   |
| Fail      | 0     |
| Cancelled | 0     |
| Skipped   | 0     |
| Duration  | ~117s |

## Test Files

| File                          | Tests | Status  |
|-------------------------------|-------|---------|
| test/helpers.test.js          | 27    | PASSING |
| test/filesystem.test.js       | 37    | PASSING |
| test/security.test.js         | 36    | PASSING |
| test/cli-quality.test.js      | 25    | PASSING |
| test/event-stream.test.js     | 36    | PASSING |
| test/dashboard-server.test.js | 27    | PASSING |
| test/graph-store.test.js      | 27    | PASSING |
| test/graph-indexer.test.js    | 28    | PASSING |
| test/graph-query.test.js      | 15    | PASSING |
| test/scan.test.js             | 26    | PASSING |
| test/verify-gates.js          | 10    | PASSING |

## Changes Since Scan #9

| Metric    | Scan #9 | Scan #10 | Delta |
|-----------|---------|----------|-------|
| Tests     | 205     | 294      | +89   |
| Test files| 8       | 11       | +3    |
| Duration  | ~88s    | ~117s    | +29s  |

New test files added in M20:
- `test/graph-store.test.js` (27 tests) — graph storage layer
- `test/graph-indexer.test.js` (28 tests) — native indexer + overlay
- `test/graph-query.test.js` (15 tests) — abstraction layer + provider chain

## Untested Modules

| Module                        | Reason                              | Risk   |
|-------------------------------|-------------------------------------|--------|
| scripts/gsd-t-tools.js        | No module.exports (TD-066)          | HIGH   |
| scripts/gsd-t-statusline.js   | No module.exports (TD-066)          | MEDIUM |
| scripts/gsd-t-update-check.js | No module.exports (TD-081)          | MEDIUM |
| scripts/gsd-t-auto-route.js   | No module.exports                   | LOW    |
| bin/graph-overlay.js           | No dedicated test file (TD-100)     | LOW    |
| bin/graph-cgc.js               | No CGC integration test             | LOW    |
| scripts/gsd-t-dashboard.html  | No E2E/UI tests                     | LOW    |
| bin/scan-renderer.js tryKroki()| Dead code, untested                 | LOW    |
