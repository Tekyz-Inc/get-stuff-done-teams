# Test Baseline — Scan #4

**Date**: 2026-02-18
**Version**: v2.24.3
**Runner**: `node --test` (Node.js built-in, zero dependencies)

## Results

- **Total tests**: 116
- **Passing**: 116
- **Failing**: 0
- **Skipped**: 0
- **Duration**: ~789ms

## Test Files

| File | Tests | Status |
|------|-------|--------|
| test/helpers.test.js | 27 | ALL PASS |
| test/filesystem.test.js | 37 | ALL PASS |
| test/security.test.js | 30 | ALL PASS |
| test/cli-quality.test.js | 22 | ALL PASS |

## Test Suites (25 total)

| Suite | Tests | Coverage Area |
|-------|-------|---------------|
| validateProjectName | 7 | Input validation |
| applyTokens | 4 | Template token replacement |
| normalizeEol | 4 | Line ending normalization |
| validateVersion | 4 | Semver validation |
| isNewerVersion | 6 | Version comparison |
| package exports | 2 | Module constants |
| isSymlink | 3 | Symlink detection |
| hasSymlinkInPath | 3 | Parent symlink walking |
| ensureDir | 3 | Directory creation |
| validateProjectPath | 4 | Path validation |
| copyFile | 1 | File operations |
| hasPlaywright | 3 | Playwright detection |
| hasSwagger | 5 | Swagger/OpenAPI detection |
| hasApi | 4 | API framework detection |
| command listing functions | 8 | Command counting |
| CLI subcommands | 6 | CLI integration (--version, help, status, doctor) |
| buildEvent | 10 | Heartbeat event handling |
| readProjectDeps | 3 | Package.json reading |
| readPyContent | 2 | Python file reading |
| insertGuardSection | 3 | Guard injection |
| readUpdateCache | 1 | Cache file parsing |
| addHeartbeatHook | 3 | Hook configuration |
| scrubSecrets | 18 | Secret pattern scrubbing |
| scrubUrl | 5 | URL query param masking |
| summarize security integration | 4 | End-to-end scrubbing |

## Notes

- All tests pass on Windows 10 (development environment)
- No pre-existing failures
- No flaky tests observed
- Previous scan #3 reported 19 filesystem test failures due to disk space — those are now resolved
