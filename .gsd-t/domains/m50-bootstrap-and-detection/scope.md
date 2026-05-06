# Domain: m50-bootstrap-and-detection

## Responsibility

Build the executable Playwright bootstrap library and the UI-detection probe that converts the project's prose-only "Playwright Readiness Guard" into mechanically-callable functions. Wire those functions into the existing `bin/gsd-t.js` CLI surface (`init`, `update-all`, `doctor`) plus a new `gsd-t setup-playwright` subcommand. This domain delivers the shared library that D2 consumes — once D1 lands, D2 can wire it into the spawn-gate, pre-commit hook, and viewer specs without re-implementing detection logic.

## Owned Files/Directories

### New files (D1 creates)

- `bin/playwright-bootstrap.cjs` — exports `hasPlaywright`, `detectPackageManager`, `installPlaywright`, `verifyPlaywrightHealth`. Zero external runtime deps (Node.js built-ins + spawned package-manager subprocess only). The current `hasPlaywright()` defined inline in `bin/gsd-t.js:201-204` migrates here and `bin/gsd-t.js` re-exports/imports from this module to keep the M50 import-graph single-source.
- `bin/ui-detection.cjs` — exports `hasUI`, `detectUIFlavor`. `hasUI` returns true when ANY of: `package.json` has `react`/`vue`/`svelte`/`next`/`@angular/core` in deps OR devDeps; `pubspec.yaml` exists; `.css`/`.scss`/`.tsx`/`.jsx`/`.vue`/`.svelte` files present in the project (sample-bounded — first hit wins). `detectUIFlavor` returns `'react'`, `'vue'`, `'svelte'`, `'next'`, `'angular'`, `'flutter'`, `'css-only'`, or `null`.
- `test/m50-d1-playwright-bootstrap.test.js` — unit tests for `playwright-bootstrap.cjs` (~12 tests: each export, each package-manager path, install-failure paths, idempotent re-run, fixture-based config-write).
- `test/m50-d1-ui-detection.test.js` — unit tests for `ui-detection.cjs` (~8 tests: react fixture, vue fixture, svelte fixture, next fixture, flutter fixture, css-only fixture, no-UI fixture, file-walk depth bound).
- `test/m50-d1-cli-integration.test.js` — integration tests for the CLI wiring (~5 tests: `gsd-t init` on a UI fixture invokes installPlaywright; `gsd-t update-all` reports + auto-installs; `gsd-t doctor --install-playwright` invokes the helper; `gsd-t setup-playwright` invokes the helper; non-UI projects skip).

### Modified files (D1 edits in-place)

- `bin/gsd-t.js` — REMOVE the inline `hasPlaywright` (lines 201-204) and `require()` from `bin/playwright-bootstrap.cjs` instead. Wire `installPlaywright` into the `init` codepath (when `hasUI(projectDir) && !hasPlaywright(projectDir)`); into `update-all`'s `checkProjectHealth` summary (auto-install for UI projects on the same pass); into `checkDoctorProject` (with new `--install-playwright` flag handler at the CLI parse layer). Add the `setup-playwright` subcommand alongside the existing `case 'doctor':` etc. Re-export `hasPlaywright` from the module for backward-compat. **Cross-domain checkpoint**: D2 also touches `bin/gsd-t.js` if any new doctor flag or summary field is needed for the spawn-gate; coordinate via the integration checkpoint at end of D1.

## NOT Owned (do not modify)

- `bin/headless-auto-spawn.cjs` — D2's spawn-gate insertion site.
- `scripts/hooks/pre-commit-playwright-gate` — D2 creates.
- `e2e/viewer/*.spec.ts` — D2 creates.
- `playwright.config.ts` (root) — D2 creates for the GSD-T repo itself.
- `~/.claude/CLAUDE.md`, `templates/CLAUDE-global.md`, `commands/*.md` — Doc-ripple owned by D2 (since D2 is the last to land).
