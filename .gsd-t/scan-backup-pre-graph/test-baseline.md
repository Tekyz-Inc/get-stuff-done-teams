# Test Baseline — Scan #9

**Date**: 2026-03-09
**Version**: v2.34.10
**Runner**: `node --test` (Node.js built-in, zero dependencies)
**Command**: `npm test`

## Results

| Metric | Value |
|--------|-------|
| Total tests | 205 |
| Passing | 205 |
| Failing | 0 |
| Skipped | 0 |
| Duration | ~17.3s |

## Test Files

| File | Tests | Status |
|------|-------|--------|
| test/helpers.test.js | 27 | PASS |
| test/filesystem.test.js | 37 | PASS |
| test/security.test.js | 36 | PASS |
| test/cli-quality.test.js | 25 | PASS |
| test/dashboard-server.test.js | (in 205) | PASS |
| test/event-stream.test.js | (in 205) | PASS |
| test/scan.test.js | 47 | PASS |
| test/verify-gates.js | (in 205) | PASS |

## Coverage Gaps (identified by scan #7)

| File | Functions | Coverage |
|------|-----------|---------|
| scripts/gsd-t-tools.js | 12 functions | NONE — no module.exports (TD-066) |
| scripts/gsd-t-statusline.js | 4 functions | NONE — no module.exports (TD-066) |
| scripts/gsd-t-update-check.js | ~5 functions | NONE — no module.exports (TD-081) |
| scripts/gsd-t-auto-route.js | 1 function | NONE — no module.exports (TCG-NEW-05) |
| bin/scan-renderer.js tryKroki() | 1 async function | NONE — dormant dead code (TCG-NEW-03) |

## Notes

- All 205 tests passing at scan start — no regressions from scan analysis
- +80 tests from M14-M17 across 3 new test files: dashboard-server.test.js, event-stream.test.js, scan.test.js
- scan.test.js is the largest new file: 47 tests covering scan-schema, scan-diagrams, scan-report, scan-export subsystem
- verify-gates.js added as HTML quality gates (no external CDN, DOCTYPE, 6 diagram sections)
- 3 untested scripts now (up from 2 in Scan #6): tools.js, statusline.js, update-check.js
- Previous baselines: Scan #5: 125/125, Scan #6: 125/125, Scan #7: 205/205
