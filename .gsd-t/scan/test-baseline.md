# Test Baseline — Scan #6

**Date**: 2026-02-18
**Version**: v2.28.10
**Runner**: `node --test` (Node.js built-in, zero dependencies)
**Command**: `npm test`

## Results

| Metric | Value |
|--------|-------|
| Total tests | 125 |
| Passing | 125 |
| Failing | 0 |
| Skipped | 0 |
| Duration | ~547ms |

## Test Files

| File | Tests | Status |
|------|-------|--------|
| test/helpers.test.js | 27 | PASS |
| test/filesystem.test.js | 37 | PASS |
| test/security.test.js | 36 | PASS |
| test/cli-quality.test.js | 25 | PASS |

## Coverage Gaps (identified by scan #6)

| File | Functions | Coverage |
|------|-----------|---------|
| scripts/gsd-t-tools.js | 12 functions | NONE — no module.exports (TD-066) |
| scripts/gsd-t-statusline.js | 4 functions | NONE — no module.exports (TD-066) |

## Notes

- All 125 tests passing at scan start and end — no regressions from scan analysis
- 2 new untested files identified: gsd-t-tools.js and gsd-t-statusline.js (both M13 additions)
- Previous baseline (Scan #5): 125/125 tests, v2.24.4
- No test file was added by M10-M13 milestones (TD-066 tracks this gap)
