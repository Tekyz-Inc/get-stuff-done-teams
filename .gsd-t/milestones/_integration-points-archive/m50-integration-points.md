# M50 Integration Points

## D1 → D2 Cross-Domain Checkpoint (the single hard sync in M50)

**Status**: PUBLISHED — 2026-05-06 (D1 landed; D2 may import from `bin/playwright-bootstrap.cjs` and `bin/ui-detection.cjs`).

After D1 lands the bootstrap library AND the CLI wiring (`bin/playwright-bootstrap.cjs` + `bin/ui-detection.cjs` + `bin/gsd-t.js` updates + `gsd-t setup-playwright` subcommand), publish a checkpoint:

- ✅ D1's modules are present at the import paths D2 expects (`bin/playwright-bootstrap.cjs`, `bin/ui-detection.cjs`).
- ✅ D1's exports match the contract (`hasPlaywright`, `detectPackageManager`, `installPlaywright`, `verifyPlaywrightHealth`, `hasUI`, `detectUIFlavor`).
- ✅ D1's tests pass — 43/43 in `test/m50-d1-*.test.js` (ui-detection 18, playwright-bootstrap 20, cli-integration 5).
- ✅ `gsd-t doctor` recognizes the new `--install-playwright` flag without crashing on existing flag combinations.

D2 cannot start importing from D1 until this checkpoint is published. Without the checkpoint guarantee, the spawn-gate's first execution fails with `MODULE_NOT_FOUND` and bricks the headless surface for every project that updates mid-landing.

## D1 + D2 Both Touch `bin/gsd-t.js`

Two domains touch the same file. Coordination rules:

| Editor | What they touch in `bin/gsd-t.js` |
|--------|-----------------------------------|
| D1 | Line 201-204 (`hasPlaywright`): replace inline impl with `require('./playwright-bootstrap.cjs').hasPlaywright`. Line ~1494-1700 (`init` codepath): add post-init `installPlaywright` call. Line ~1971-1996 (`checkProjectHealth`): trigger auto-install. Line ~2607-2629 (`checkDoctorProject`): add `--install-playwright` handler. New subcommand block: `case 'setup-playwright':`. |
| D2 | If D2 needs a new doctor flag (`--install-hooks`) for the pre-commit installer, it's added here. **D2 must coordinate at the integration checkpoint** — if D1's checkpoint already added the flag, D2 piggybacks; if not, D2 adds it cleanly. |

D2's edit window is narrow and additive. If a merge conflict appears, treat D1 as upstream and rebase D2 on top.

## E2E Specs Server Lifecycle

The 5 viewer specs (`e2e/viewer/*.spec.ts`) need the dashboard server running. Each spec:

1. Spawns the dashboard server in-process (via `require('./scripts/gsd-t-dashboard-server.js')`) on a port allocated from the project-scoped range 7433-7532.
2. Waits for the server's `_ready` event (or polls until the HTTP endpoint responds).
3. Runs the assertion.
4. Sends `SIGTERM` to the server and waits for the close event.

This pattern eliminates the `webServer` config in `playwright.config.ts` and keeps the specs hermetic. The CLAUDE.md "Playwright Cleanup" rule is honored automatically — the test framework's `afterAll` does the kill.

## Pre-Commit Hook Installer

D2's pre-commit hook is delivered to projects via the `gsd-t doctor --install-hooks` flag. The flag:

1. Reads the existing `.git/hooks/pre-commit` (if any).
2. If absent, symlinks `scripts/hooks/pre-commit-playwright-gate` from the GSD-T install root into `.git/hooks/pre-commit`.
3. If present and not already a GSD-T hook, prints a warning and exits without overwriting (operator must merge manually).
4. Records the install in `.gsd-t/.hooks-installed.json` so future `gsd-t update-all` runs can re-symlink if the operator deletes it.

D1 does not need to add this flag preemptively — D2 adds it in its CLI-wiring pass at the cross-domain checkpoint window.

## Doc-Ripple Sequencing

Doc-ripple is owned by D2 (last to land). Order:
1. Update `~/.claude/CLAUDE.md` § Playwright Readiness Guard (single referral line).
2. Update `templates/CLAUDE-global.md` to mirror.
3. Update the 8 command files (`gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-quick`, `gsd-t-wave`, `gsd-t-milestone`, `gsd-t-complete-milestone`, `gsd-t-debug`) — replace prose with referral.
4. Update `docs/architecture.md` — add the Enforcement Layers subsection.
5. Update `CHANGELOG.md` — single M50 entry covering both domains.

## Wave Execution Groups

Waves allow parallel execution within a wave and sequential execution between waves. Each wave contains tasks that can safely run in parallel (no shared files, no cross-domain dependencies within the wave).

### Wave 1 — D1 Foundation (parallel within wave)
- m50-bootstrap-and-detection: Task 1 (`bin/ui-detection.cjs` + tests)
- m50-bootstrap-and-detection: Task 2 (`bin/playwright-bootstrap.cjs` exports excluding `installPlaywright`)
- **Shared files**: NONE — Task 1 owns `bin/ui-detection.cjs`, Task 2 owns `bin/playwright-bootstrap.cjs`. Both write disjoint test files.
- **Completes when**: both tasks done.

### Wave 2 — D1 Install Path
- m50-bootstrap-and-detection: Task 3 (`installPlaywright` added to bootstrap module)
- **Shared files with Wave 1**: extends `bin/playwright-bootstrap.cjs` (Wave 1 Task 2) and `test/m50-d1-playwright-bootstrap.test.js`.
- **Sequential** with Wave 1 (same files). Cannot parallelize.

### Wave 3 — D1 CLI Wiring
- m50-bootstrap-and-detection: Task 4 (`bin/gsd-t.js` integration + new subcommand + CLI tests)
- **Sequential** with Wave 2 (depends on Tasks 1+3 imports).

### Wave 4 — D1 Checkpoint
- m50-bootstrap-and-detection: Task 5 (publish cross-domain checkpoint)
- **Sequential** with Wave 3 (verifies all of Tasks 1-4 landed).
- **CHECKPOINT**: D1 publishes the integration checkpoint; D2 may now import from D1 modules.

### Wave 5 — D2 Independent Setup (parallel within wave, all gated on Wave 4)
- m50-gates-and-specs: Task 1 (`playwright.config.ts` + `package.json` scripts + smoke test)
- m50-gates-and-specs: Task 2 (spawn-gate insertion in `bin/headless-auto-spawn.cjs`)
- m50-gates-and-specs: Task 3 (pre-commit hook script + `--install-hooks` flag in `bin/gsd-t.js`)
- **Shared files**: D2 Task 1 edits `package.json`, D2 Task 3 edits `bin/gsd-t.js` (additive — coordinated with D1 Task 4 already complete). No cross-task overlap inside Wave 5.
- **Note**: Task 3 writes additive edits to `bin/gsd-t.js`. Treat D1 Task 4's edits as upstream — Task 3 rebases on top per `m50-integration-points.md` §"D1 + D2 Both Touch" coordination rule.

### Wave 6 — D2 Viewer Specs (parallel within wave, all gated on Wave 5 Task 1)
- m50-gates-and-specs: Task 4 (`title.spec.ts`)
- m50-gates-and-specs: Task 5 (`timestamps.spec.ts`)
- m50-gates-and-specs: Task 6 (`chat-bubbles.spec.ts`)
- m50-gates-and-specs: Task 7 (`dual-pane.spec.ts`)
- m50-gates-and-specs: Task 8 (`lazy-dashboard.spec.ts`)
- **Shared files**: NONE — each spec is its own file under `e2e/viewer/`. All 5 may run in parallel.
- **Completes when**: all 5 specs land.

### Wave 7 — D2 Doc-Ripple
- m50-gates-and-specs: Task 9 (doc-ripple across `~/.claude/CLAUDE.md` + `templates/CLAUDE-global.md` + 8 command files + `docs/architecture.md` + `CHANGELOG.md`)
- **Sequential** with Wave 6 (waits for spawn-gate + pre-commit hook + last spec landed).
- **Single-pass** per Document Ripple Completion Gate.

### Wave 8 — D2 Final
- m50-gates-and-specs: Task 10 (contract Status flip + REQ-M50 traceability rows → done)
- **Sequential** with Wave 7.

## Execution Order (for solo mode)
1. D1 Task 1 (ui-detection) — parallel-safe with D1 Task 2
2. D1 Task 2 (playwright-bootstrap excluding install)
3. D1 Task 3 (installPlaywright)
4. D1 Task 4 (CLI wiring in `bin/gsd-t.js`)
5. **CHECKPOINT**: D1 Task 5 — publish to D2
6. D2 Task 1 (`playwright.config.ts` + scripts) — parallel-safe with D2 Task 2 + D2 Task 3
7. D2 Task 2 (spawn-gate) — parallel-safe with D2 Task 1 + D2 Task 3
8. D2 Task 3 (pre-commit hook + `--install-hooks`)
9. D2 Tasks 4-8 (5 viewer specs) — all parallel-safe within Wave 6
10. **DOC-RIPPLE**: D2 Task 9 — single pass across all 11 doc files
11. D2 Task 10 — flip contract Status + REQ rows

## Test Verification Sequence (Step 6 + final verify)

Before partition completes, baseline already captured: 2102/2104 (per progress.md 2026-05-06 13:34 entry). The two failures are the `buildEventStreamEntry` and `writer_shim_safe_empty_agent_id_auto_mints_id` env-sensitive flakes.

Final M50 verify gate (closes the milestone):
- Full unit suite: 2104 baseline + ~25 D1 unit tests + ~14 D2 unit tests = ~2143 expected, ≥2141 passing (preserving the 2 known flakes).
- E2E suite: 5/5 viewer specs pass against a fresh dashboard server.
- Spawn-gate fixture test: a synthetic UI project without Playwright triggers a successful install on first spawn.
- Pre-commit hook fixture test: a synthetic stale-viewer-source commit is blocked; a fresh-viewer-source commit succeeds.
