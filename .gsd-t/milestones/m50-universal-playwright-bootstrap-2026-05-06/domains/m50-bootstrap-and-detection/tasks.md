# Tasks: m50-bootstrap-and-detection

## Summary

Land the executable Playwright bootstrap library (`bin/playwright-bootstrap.cjs`) and the UI-detection probe (`bin/ui-detection.cjs`), then wire them into `bin/gsd-t.js` (`init`, `update-all`, `doctor --install-playwright`) plus the new `gsd-t setup-playwright` subcommand. When all tasks complete, D2 has a stable import surface for the spawn-gate, pre-commit hook, and viewer specs.

## Tasks

### Task 1: Create `bin/ui-detection.cjs` with `hasUI` + `detectUIFlavor`
- **Files**:
  - `bin/ui-detection.cjs` (new)
  - `test/m50-d1-ui-detection.test.js` (new)
- **Contract refs**: `playwright-bootstrap-contract.md` §4
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `hasUI(projectDir)` synchronous, never throws (returns `false` on filesystem errors), depth-bounded ≤3 levels, short-circuits on first hit. Excludes `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`, `.gsd-t/`.
  - Detection probes (in order): `package.json` deps include `react`/`vue`/`svelte`/`next`/`@angular/core`/`@vue/runtime-core` → `pubspec.yaml` exists → `tailwind.config.{js,ts}` exists → any `.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`/`.scss` file within depth 3.
  - `detectUIFlavor(projectDir)` returns `'react'` | `'vue'` | `'svelte'` | `'next'` | `'angular'` | `'flutter'` | `'css-only'` | `null` (`null` iff `hasUI` is `false`).
  - 8 unit tests covering: react-fixture (true, 'react'); vue-fixture; svelte-fixture; next-fixture; flutter-fixture (pubspec.yaml); tailwind-only fixture; css-only fixture; no-UI fixture (returns false, null); depth-bound enforcement (UI file at depth 4 → not detected).
  - Zero external runtime deps (Node built-ins only).

### Task 2: Create `bin/playwright-bootstrap.cjs` with `hasPlaywright` + `detectPackageManager` + `verifyPlaywrightHealth`
- **Files**:
  - `bin/playwright-bootstrap.cjs` (new)
  - `test/m50-d1-playwright-bootstrap.test.js` (new — partial: covers exports listed here; install path covered in Task 3)
- **Contract refs**: `playwright-bootstrap-contract.md` §3 (`hasPlaywright`, `detectPackageManager`, `verifyPlaywrightHealth`)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `hasPlaywright(projectDir)` synchronous, never throws, returns `true` iff `playwright.config.ts`/`.js`/`.mjs` exists at project root (migrates verbatim from `bin/gsd-t.js:201-204`).
  - `detectPackageManager(projectDir)` returns `'pnpm'` | `'yarn'` | `'bun'` | `'npm'` per lockfile precedence (`pnpm-lock.yaml` → `yarn.lock` → `bun.lockb` → default `npm`). Synchronous, never throws.
  - `verifyPlaywrightHealth(projectDir)` runs `npx playwright --version` with 5s timeout from `projectDir`; returns `{ok: true, version}` on success or `{ok: false, error}` on timeout / non-zero exit / parse failure.
  - Initial test file scaffolding with: 3 tests for `hasPlaywright` (each of `.ts`/`.js`/`.mjs`; absence returns false); 4 tests for `detectPackageManager` (each lockfile precedence + npm default); 2 tests for `verifyPlaywrightHealth` (success path stubbed via mocked `child_process.exec`; timeout/error path).
  - Zero external runtime deps.

### Task 3: Add `installPlaywright` to `bin/playwright-bootstrap.cjs` (idempotent install + chromium + config + e2e/ scaffolding)
- **Files**:
  - `bin/playwright-bootstrap.cjs` (modify — add `installPlaywright` export)
  - `test/m50-d1-playwright-bootstrap.test.js` (modify — add install-path tests)
- **Contract refs**: `playwright-bootstrap-contract.md` §3 (`installPlaywright`), §6 (config template), §7 (idempotency invariants), §8 (error-path contract)
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - `installPlaywright(projectDir)` async; idempotent: when `hasPlaywright(projectDir)` is `true`, returns `{ok: true}` without subprocess work.
  - Step order: short-circuit → `detectPackageManager` → install `@playwright/test` as devDep using the resolved manager → `npx playwright install chromium` → write `playwright.config.ts` (template per §6) IF absent → create `e2e/__placeholder.spec.ts` (empty `test.skip`) IF `e2e/` is absent or empty.
  - Does NOT overwrite existing `playwright.config.ts` or existing `e2e/` contents (operator customizations preserved).
  - Returns `{ok: false, err: <stderr>, hint: <string>}` on any non-zero subprocess exit; `hint` follows §8 mapping (package-manager-not-found / network / chromium / disk).
  - 7 install-path tests added: idempotent re-run (no subprocess); each of 4 package-manager paths invokes the correct command; `playwright.config.ts` written verbatim from template; existing-config preservation; existing-`e2e/` preservation; install-failure → `{ok:false}` with `hint`; chromium-failure → partial-install state surfaced.
  - Total D1 unit tests against bootstrap module: ~12.

### Task 4: Wire D1 modules into `bin/gsd-t.js` (`init`, `update-all`, doctor `--install-playwright`, re-export, `setup-playwright` subcommand)
- **Files**:
  - `bin/gsd-t.js` (modify — 4 narrow edit windows per `m50-integration-points.md` §"D1 + D2 Both Touch")
  - `test/m50-d1-cli-integration.test.js` (new)
- **Contract refs**: `playwright-bootstrap-contract.md` §5 (CLI Wiring), `m50-integration-points.md`
- **Dependencies**: Requires Task 1 + Task 3 (within domain)
- **Acceptance criteria**:
  - `bin/gsd-t.js:201-204` inline `hasPlaywright` REPLACED by `const { hasPlaywright } = require('./playwright-bootstrap.cjs');` (re-exported for back-compat).
  - `init` codepath (~lines 1494-1700): after `initGsdtDir()` returns, when `hasUI(cwd) && !hasPlaywright(cwd)`, call `await installPlaywright(cwd)`; on `{ok:false}` log inline error + `hint` (does not abort init — Playwright is post-init).
  - `checkProjectHealth` (~lines 1971-1996): existing `{playwrightMissing, swaggerMissing}` shape preserved. For each entry where `hasUI(p)` is true, trigger `await installPlaywright(p)` on the same pass; track auto-installed count for the summary line.
  - `showUpdateAllSummary` (or its callsite) appends `Auto-installed Playwright in: {N} project(s)` when N > 0.
  - `checkDoctorProject` (~lines 2607-2629): new `--install-playwright` flag handler invokes `installPlaywright(cwd)` directly with verbose output; reports success/failure inline.
  - New `case 'setup-playwright':` subcommand wraps `installPlaywright(cwd)` with verbose output.
  - 5 CLI integration tests: `gsd-t init` on UI fixture → invokes `installPlaywright`; `gsd-t init` on non-UI fixture → skips; `gsd-t update-all` summary line includes the auto-install count when ≥1 project was patched; `gsd-t doctor --install-playwright` end-to-end on a UI fixture; `gsd-t setup-playwright` end-to-end on a UI fixture.
  - Zero-dep invariant: `package.json#dependencies` unchanged (D1 adds nothing to runtime deps); `package.json#files` glob covers `bin/playwright-bootstrap.cjs` + `bin/ui-detection.cjs`.

### Task 5: Publish D1 cross-domain integration checkpoint
- **Files**:
  - `.gsd-t/contracts/m50-integration-points.md` (modify — flip the D1→D2 checkpoint to PUBLISHED with a one-line status note + timestamp)
  - `.gsd-t/progress.md` (append decision-log entry: `[checkpoint] M50 D1 published — exports verified, tests passing, doctor flag recognized`)
- **Contract refs**: `m50-integration-points.md` §"D1 → D2 Cross-Domain Checkpoint"
- **Dependencies**: Requires Task 1 + Task 2 + Task 3 + Task 4 (within domain)
- **Acceptance criteria**:
  - `bin/playwright-bootstrap.cjs` and `bin/ui-detection.cjs` exist and `require()` cleanly from a fresh Node.js process.
  - All 6 contracted exports load and have the documented signatures: `hasPlaywright`, `detectPackageManager`, `installPlaywright`, `verifyPlaywrightHealth`, `hasUI`, `detectUIFlavor`.
  - `npm test -- --grep m50-d1` passes (covers all ~25 D1 unit tests written in Tasks 1-4).
  - `gsd-t doctor --install-playwright --help` (or equivalent invocation) recognizes the flag without crashing on existing flag combinations.
  - Decision log entry timestamped from live `[GSD-T NOW]` clock per the Live Clock Rule.
  - **This is the gate**: D2 cannot start any task that imports D1 modules until this task is marked complete.

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 2 (Task 1, Task 2)
- Blocked tasks (waiting within domain): 3 (Task 3 → Task 2; Task 4 → Tasks 1+3; Task 5 → all)
- Cross-domain checkpoints owned by D1: 1 (Task 5 — gates D2 entirely)
