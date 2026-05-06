# Domain: m50-gates-and-specs

## Responsibility

Convert D1's executable bootstrap library into deterministic enforcement at the two remaining layers — spawn-time and commit-time — and land the M47/M48/M49 viewer specs that should have shipped with those milestones. The spawn-gate makes "no Playwright on a UI project" a structural impossibility (auto-installs or exits with `mode: 'blocked-needs-human'`); the pre-commit hook makes "ship UI changes without running Playwright" a structural impossibility. The viewer specs are the regression net for the M47 redesign + M48 rendering fixes + M49 lazy dashboard banner.

## Owned Files/Directories

### New files (D2 creates)

- `scripts/hooks/pre-commit-playwright-gate` — bash hook script. Reads `.gsd-t/.last-playwright-pass` (timestamp written by `npx playwright test` post-pass). On every commit: detects whether the staged diff touches viewer-source files (`scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`, `e2e/viewer/**`). If yes AND any touched file's mtime exceeds `.last-playwright-pass`, blocks the commit with a clear message. Skips silently when no viewer-source files are staged. Opt-in via `gsd-t doctor --install-hooks`. Exit codes: `0` clean, `1` blocked, `2` config error (fail-open per project precedent).
- `playwright.config.ts` (project root) — GSD-T's own Playwright config. Test directory `e2e/`, chromium project, `webServer: undefined` (specs handle their own server lifecycle since the dashboard is project-scoped on dynamic ports 7433-7532).
- `e2e/viewer/title.spec.ts` — M48 Bug 1 regression: project basename appears in `<title>` and header `.title` div for both `/transcripts` (list page) and `/transcripts/{spawn-id}` (per-spawn page). Spec spins up the dashboard server with a known `GSD_T_PROJECT_DIR` and asserts via `page.title()` and `locator('.title').textContent()`.
- `e2e/viewer/timestamps.spec.ts` — M48 Bug 2 regression: rendered frames show distinct per-frame timestamps (parsed from `frame.ts`), not a per-batch `new Date()`. Spec injects a synthetic NDJSON with three frames `ts` 30s apart, asserts the rendered DOM shows three distinct `HH:MM:SS` strings.
- `e2e/viewer/chat-bubbles.spec.ts` — M48 Bug 3 regression: `user_turn`, `assistant_turn`, `session_start`, `tool_use_line` frames render as styled bubbles, NOT raw `JSON.stringify` dumps. Asserts each frame type produces its expected CSS class and text content; asserts `JSON.stringify` fallback is NOT engaged for known types.
- `e2e/viewer/dual-pane.spec.ts` — M48 Bug 4 regression: clicking an `in-session-*` rail entry pins it to the TOP pane only; the bottom pane stays on its own SSE stream. Asserts the four guards (rail click, initial bottom-pane resolution, hashchange, maybeAutoFollow filter) hold.
- `e2e/viewer/lazy-dashboard.spec.ts` — M49 banner regression: when no dashboard is running, the URL banner is replaced by `▶ Transcript file: {logPath}\n  (to view live: gsd-t-visualize)`. When a dashboard IS running (lazy-probe finds the pidfile), the URL banner appears. Spec spawns `autoSpawnHeadless` twice (once with no dashboard, once with `ensureDashboardRunning` invoked manually) and asserts the banner text differs.
- `test/m50-d2-spawn-gate.test.js` — unit tests for the `bin/headless-auto-spawn.cjs` gate (~6 tests: no UI → no install attempt; UI + Playwright → no install; UI + no Playwright + install ok → continues with normal spawn; UI + no Playwright + install fail → exits with `mode: 'blocked-needs-human'`; non-testing/non-UI commands skip the gate; concurrent gate calls are serialized via existing handoff-lock).
- `test/m50-d2-pre-commit-hook.test.js` — unit tests for the bash hook (~5 tests: clean commit on non-viewer files; blocked commit on stale viewer-source; allowed commit on fresh viewer-source; missing `.last-playwright-pass` → fail-open with warning; corrupt timestamp → fail-open).
- `test/m50-d2-viewer-specs-smoke.test.js` — meta-test: `npx playwright test --list` finds all 5 viewer specs; the playwright.config.ts at project root is parseable and points to `e2e/`. (Spec-content correctness is asserted by running them.)

### Modified files (D2 edits in-place)

- `bin/headless-auto-spawn.cjs` — INSERT the spawn-gate inside `autoSpawnHeadless()` BEFORE the `spawn()` call. Pseudocode:
  ```
  if (isTestingOrUICommand(command) && hasUI(projectDir) && !hasPlaywright(projectDir)) {
    const result = await installPlaywright(projectDir);
    if (!result.ok) {
      writeSessionFile({mode: 'blocked-needs-human', reason: 'playwright-install-failed', err: result.err});
      process.exit(4);
    }
  }
  ```
  Imports `hasUI`, `hasPlaywright`, `installPlaywright` from D1's new modules. The list of testing/UI commands (`gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-quick`, `gsd-t-wave`, `gsd-t-milestone`, `gsd-t-complete-milestone`, `gsd-t-debug`, `gsd-t-integrate`) is centralized in the gate logic.
- `package.json` — add `"e2e": "playwright test"` and `"e2e:install": "playwright install chromium"` scripts. Add `@playwright/test` to `devDependencies` (this IS the GSD-T repo's own Playwright install; it's NOT a runtime dep of the installer — keeps zero-runtime-dep invariant intact).

## NOT Owned (do not modify)

- `bin/playwright-bootstrap.cjs`, `bin/ui-detection.cjs` — D1's library; D2 imports but does not modify.
- `bin/gsd-t.js` — D1 owns CLI wiring. Exception: D2 may consume D1's exports via `require()`. If D2's spawn-gate requires a CLI flag that D1 didn't add, surface it at the cross-domain integration checkpoint instead of editing inline.
- `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js` — viewer source. M50 specs OBSERVE these but do not modify them.
- `.gsd-t/contracts/headless-default-contract.md` — touched only in §Version History; the v2.1.0 invariants stand. D2's gate is additive (precedes the spawn) and does not change `shouldSpawnHeadless`.

### Doc-ripple owned (D2 finalizes after both domains land)

- `~/.claude/CLAUDE.md` — Playwright Readiness Guard section: replace prose with a one-line pointer to `playwright-bootstrap-contract.md` + the spawn-gate behavior.
- `templates/CLAUDE-global.md` — same edit, propagates to registered projects on next `gsd-t update-all`.
- `commands/gsd-t-execute.md`, `commands/gsd-t-test-sync.md`, `commands/gsd-t-verify.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-milestone.md`, `commands/gsd-t-complete-milestone.md`, `commands/gsd-t-debug.md` — replace prose Playwright reminders with a single referral line: `Playwright readiness is enforced by the spawn-gate (bin/headless-auto-spawn.cjs); see playwright-bootstrap-contract.md`.
- `docs/architecture.md` — add the M50 bootstrap library + spawn-gate + pre-commit hook to the "Enforcement Layers" subsection.
