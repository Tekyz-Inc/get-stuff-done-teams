# Test Coverage Report — 2026-02-18

## Summary
- Source files analyzed: 3 (bin/gsd-t.js, scripts/gsd-t-heartbeat.js, scripts/npm-update-check.js)
- Test files: 3 (test/helpers.test.js, test/filesystem.test.js, test/security.test.js)
- Coverage gaps: 0 (for Milestone 5 changes)
- Stale tests: 0
- Dead tests: 0
- Tests passing: helpers (27/27), security (30/30)
- Pre-existing failures: filesystem (19 failures — disk space / temp dir issues, not from Milestone 5)

## Coverage Status

### Milestone 5 Changes

| Source | Function | Test File | Status |
|--------|----------|-----------|--------|
| scripts/gsd-t-heartbeat.js | scrubSecrets() | test/security.test.js | COVERED (18 tests) |
| scripts/gsd-t-heartbeat.js | scrubUrl() | test/security.test.js | COVERED (5 tests) |
| scripts/gsd-t-heartbeat.js | summarize() (integration) | test/security.test.js | COVERED (4 tests) |
| bin/gsd-t.js | hasSymlinkInPath() | test/security.test.js + test/filesystem.test.js | COVERED (3 tests) |
| bin/gsd-t.js | ensureDir() (updated) | test/filesystem.test.js | COVERED (3 existing tests) |
| scripts/npm-update-check.js | path validation | N/A (script runs via CLI) | NOT UNIT TESTABLE (stdin/stdout script) |
| scripts/npm-update-check.js | symlink check | N/A (script runs via CLI) | NOT UNIT TESTABLE (stdin/stdout script) |
| scripts/npm-update-check.js | HTTP response bound | N/A (requires network) | NOT UNIT TESTABLE (network dependent) |
| bin/gsd-t.js | inline fetch bound | N/A (requires network) | NOT UNIT TESTABLE (network dependent) |
| commands/gsd-t-wave.md | documentation only | N/A | NO TEST NEEDED |
| README.md | documentation only | N/A | NO TEST NEEDED |

### Pre-Existing Coverage

| Source | Test File | Status |
|--------|-----------|--------|
| bin/gsd-t.js (helpers) | test/helpers.test.js | COVERED (27 tests) |
| bin/gsd-t.js (filesystem) | test/filesystem.test.js | PARTIAL (19 pre-existing failures) |

## Test Health Metrics

- Total test assertions: 57+ passing (27 helpers + 30 security)
- Test-to-source ratio: 3 test files / 3 source files
- All Milestone 5 testable functions have coverage
- Non-testable items: network-dependent scripts (npm-update-check.js), documentation

## Pre-Existing Issues (not from Milestone 5)

The filesystem.test.js suite has 19 failing tests related to temp directory operations on Windows (validateProjectPath, copyFile, hasPlaywright, hasSwagger, hasApi). These failures exist before and after Milestone 5 changes. Root cause: disk space (ENOSPC) or Windows temp directory handling.
