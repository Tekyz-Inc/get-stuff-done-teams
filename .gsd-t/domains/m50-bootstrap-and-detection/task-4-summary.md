## Task 4 Summary — m50-bootstrap-and-detection

- **Status**: PASS
- **Files modified**: bin/gsd-t.js (init wired, update-all auto-install summary, doctor --install-playwright flag, setup-playwright subcommand, hasPlaywright migrated to require), test/m50-d1-cli-integration.test.js (new — 5 tests)
- **Constraints discovered**:
  - `checkProjectHealth` had to become async to await `installPlaywright()` per project. Single call site at line ~2229 was updated to `await`. Returned object now also includes `playwrightAutoInstalled` and `playwrightInstallFailed` arrays.
  - `checkDoctorProject` is now async and accepts `opts` for the `--install-playwright` flag. Two callers:
    - `doDoctor` — passes `opts` from CLI parse layer.
  - The `setup-playwright` CLI subcommand defaults to a no-op on non-UI projects (warns + exits 0). Operator must pass `--force` to install Playwright in a non-UI project.
  - The CLI integration tests do NOT shell out to npm — they exercise the helpers directly with the `runner` stub, asserting the wire-up not the install behavior (which is covered in Task 3 unit tests).
- **Tests**: 5/5 pass in m50-d1-cli-integration.test.js. Cumulative: 43 D1 tests pass (18 ui-detection + 20 playwright-bootstrap + 5 cli-integration).
- **Notes**:
  - Inline `hasPlaywright` (was bin/gsd-t.js:201-204) replaced with `require('./playwright-bootstrap.cjs')`. Confirmed by Task 4 test-1: regex over the source ensures no second `function hasPlaywright` definition remains.
  - `update-all` summary now prints `Auto-installed Playwright in: N project(s)` when N>0.
  - `doctor --install-playwright` invokes installPlaywright when `hasUI && !hasPlaywright`. When `!hasUI`, it skips with an info message ("no UI signal in this project").
  - Smoke-tested locally against the GSD-T repo itself: `gsd-t doctor` runs cleanly; `setup-playwright` correctly skips this CLI-only repo.
