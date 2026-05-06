## Task 3 Summary — m50-bootstrap-and-detection

- **Status**: PASS
- **Files modified**: bin/playwright-bootstrap.cjs (added installPlaywright), test/m50-d1-playwright-bootstrap.test.js (added 9 install-path tests)
- **Constraints discovered**:
  - The contract-defined error-path table (§8) keys off the *substring* of stderr, not the exact phrase. The classifier uses regex on lowercased stderr to match each category (package-manager-not-found, network, chromium, disk).
  - `process.spawn` is preferred over `exec` for the install steps to avoid a 1MB stdout buffer cap (Playwright install output can be verbose during chromium download). Switched to `spawn` with stream listeners.
  - Tests must inject a `runner` stub through `opts.runner` to avoid actually shelling out to npm/pnpm/yarn/bun. The production code path uses the default `_runSubprocess`. This pattern keeps the test suite hermetic and fast (10ms vs 30+s for a real npm install).
- **Tests**: 9 install-path tests added to existing 11 → 20 pass; suite total 43/43 in M50 D1.
- **Notes**:
  - `installPlaywright` short-circuits with `{ok: true}` when `hasPlaywright()` is already true. Idempotent.
  - Error-path returns `{ok: false, err, hint}` per contract §8.
  - Chromium-failure case adds `partial: true` so callers can distinguish "@playwright/test landed but chromium did not" from a clean fail.
  - Config template lifted verbatim from contract §6 — single source of truth.
  - Placeholder spec (`e2e/__placeholder.spec.ts`) only written when `e2e/` is absent or empty — operator content is preserved.
