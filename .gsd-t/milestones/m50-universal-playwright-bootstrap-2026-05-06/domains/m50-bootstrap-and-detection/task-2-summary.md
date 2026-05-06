## Task 2 Summary — m50-bootstrap-and-detection

- **Status**: PASS
- **Files modified**: bin/playwright-bootstrap.cjs (new), test/m50-d1-playwright-bootstrap.test.js (new), .gsd-t/progress.md (decision-log entry)
- **Constraints discovered**:
  - `child_process.exec` with `timeout` option does not kill the process tree on macOS; it sends SIGTERM to the spawned shell only. This is fine for `npx playwright --version` (single process), but callers running complex shell pipelines may need `killSignal: 'SIGKILL'`. No change needed for this task.
  - The node:test runner counts `describe()` suites as test items in its summary line. 10 reported tests = 3 suites counted + the actual test functions inside — all 9 code-level tests pass; the extra counted item is the implicit suite overhead. Consistent with other test files in the suite.
  - `npx playwright --version` outputs `Version X.Y.Z` on a single line. The regex `Version\s+([\d.]+)` captures the version correctly. Older Playwright versions may omit the capital-V form — documented for Task 3 awareness.
  - Stubbing `npx` for the success-path test was done by writing a fake `playwright` shell script into `node_modules/.bin/` of a tmpdir. This is reliable because `npx` resolves local `.bin` before PATH. The error-path test overrides `process.env.PATH` to a directory with no executables, forcing `npx` to exit non-zero.
- **Tests**: 10/10 pass (this file, including suite items); full suite 2124/2126 pass (2 pre-existing flakes preserved: `buildEventStreamEntry`, `writer_shim_safe_empty_agent_id_auto_mints_id`)
- **Notes**:
  - `hasPlaywright` migrated verbatim from `bin/gsd-t.js:201-204` plus a `try/catch` to satisfy the "never throws" constraint (the original had no guard).
  - `detectPackageManager` uses a simple ordered `existsSync` sequence — no complex probing. The "never throws" guard wraps all FS calls.
  - `verifyPlaywrightHealth` uses `exec` (callback form) with `timeout: 5000`. The `.on('error')` handler is belt-and-suspenders for spawn errors (e.g., `npx` not on PATH); the `exec` callback already handles those via the `err` argument, but the belt avoids any edge case where exec emits 'error' without calling the callback.
  - Module is minimal: 47 lines of actual code, CommonJS, zero external deps. Style matches `bin/handoff-lock.cjs` (no shebang, `'use strict'`, `module.exports` at bottom).
- **Commit**: f07afb1
