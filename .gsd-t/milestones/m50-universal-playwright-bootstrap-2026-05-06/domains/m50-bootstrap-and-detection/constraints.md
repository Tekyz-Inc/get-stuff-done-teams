# Constraints: m50-bootstrap-and-detection

## Must Follow

- Zero external runtime dependencies — every helper uses Node.js built-ins (`fs`, `path`, `child_process`) plus spawned package-manager subprocesses (`npm`, `pnpm`, `yarn`, `bun`). The `bin/gsd-t.js` zero-dep invariant applies.
- Synchronous file APIs only (matches existing CLI conventions in `bin/gsd-t.js`).
- `installPlaywright(projectDir)` MUST be **idempotent**: re-running on a project that already has `@playwright/test` + `playwright.config.ts` returns success without re-installing.
- `installPlaywright(projectDir)` MUST install both the npm package AND the chromium browser (`npx playwright install chromium`). Test fixtures rely on chromium being present.
- The default `playwright.config.ts` template MUST include: `testDir: 'e2e'`, `use.baseURL: 'http://localhost:3000'` (overridable via env), `webServer: undefined` (callers wire their own), `projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }]`. Keep the config minimal — every line is a maintenance cost across 14+ registered projects.
- `hasUI(projectDir)` file-walk MUST be depth-bounded (max 3 levels) and short-circuit on first match. Avoid full-tree walks; M50 success criterion #6 wants negligible latency on `gsd-t init`.
- `verifyPlaywrightHealth(projectDir)` runs `npx playwright --version` and returns `{ok, version, error}`. Used by doctor to surface "playwright installed but broken" cases.

## Must Read Before Using (Black Boxes)

- `bin/gsd-t.js:201-204` (existing `hasPlaywright`) — must be migrated faithfully; preserve the three config extensions checked (`.ts`/`.js`/`.mjs`).
- `bin/gsd-t.js:1971-1996` (`checkProjectHealth`) — D1 wires auto-install into this loop; must not change the existing return shape `{playwrightMissing, swaggerMissing}` since `showUpdateAllSummary` consumes it.
- `bin/gsd-t.js:2607-2629` (`checkDoctorProject`) — D1 adds the `--install-playwright` flag handler near here.
- `bin/gsd-t.js:1494-1700ish` (`initClaudeMd` / `initDocs` / `initGsdtDir`) — D1 adds the post-init Playwright bootstrap call after `initGsdtDir` returns; must not interfere with idempotent re-init.
- `package.json#files` (zero-dep invariant) — `bin/playwright-bootstrap.cjs` and `bin/ui-detection.cjs` ship in the npm package; verify the `files` glob covers `bin/`.

## Must Not

- Add external npm runtime dependencies. Zero-dep invariant.
- Modify `bin/headless-auto-spawn.cjs` (D2 owns).
- Create `scripts/hooks/pre-commit-playwright-gate` (D2 owns).
- Create any `e2e/*.spec.ts` (D2 owns).
- Modify viewer source (`scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`).
- Touch `~/.claude/CLAUDE.md` or `templates/CLAUDE-global.md` (D2 owns doc-ripple at the end).

## Dependencies

- **Depends on**: nothing inside M50 — D1 is the foundation.
- **Depended on by**: D2 (m50-gates-and-specs) — D2 imports `hasPlaywright`, `hasUI`, `installPlaywright` from D1's new modules. D2 cannot start until D1 publishes the cross-domain integration checkpoint after D1's CLI wiring lands.
