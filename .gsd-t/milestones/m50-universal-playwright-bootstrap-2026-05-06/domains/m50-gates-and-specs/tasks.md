# Tasks: m50-gates-and-specs

## Summary

Convert D1's bootstrap library into deterministic enforcement at spawn-time and commit-time, land the GSD-T-repo `playwright.config.ts`, ship the 5 viewer regression specs we owe from M47/M48/M49, and complete the doc-ripple that retires the prose Playwright Readiness Guard. Closes M50 when all tasks land.

## Tasks

### Task 1: Add GSD-T-repo `playwright.config.ts` + e2e scaffolding + npm scripts + devDependency
- **Files**:
  - `playwright.config.ts` (new — at GSD-T project root)
  - `e2e/__placeholder.spec.ts` (new — empty `test.skip` so test discovery does not error before viewer specs land)
  - `package.json` (modify — add `e2e`/`e2e:install` scripts; add `@playwright/test` to `devDependencies` only)
  - `test/m50-d2-viewer-specs-smoke.test.js` (new)
- **Contract refs**: REQ-M50-D2-03; `m50-integration-points.md` §"E2E Specs Server Lifecycle"
- **Dependencies**: BLOCKED BY m50-bootstrap-and-detection Task 5 (cross-domain checkpoint — Task 1 needs `installPlaywright`'s template to align so the in-tree config matches what we ship to other repos)
- **Acceptance criteria**:
  - `playwright.config.ts` matches D1's template verbatim (`testDir: 'e2e'`, chromium project, `webServer: undefined`, `baseURL` env-overridable). Single source of truth: copied from `playwright-bootstrap-contract.md` §6.
  - `package.json` adds `"e2e": "playwright test"`, `"e2e:install": "playwright install chromium"`. `@playwright/test` added under `devDependencies` ONLY (zero-runtime-dep invariant — verified by `node -e "console.log(Object.keys(require('./package.json').dependencies||{}))"` showing no Playwright entry).
  - `package.json#files` glob unchanged — Playwright is a dev tool, not part of the published package.
  - `npx playwright test --list` resolves all specs in `e2e/` without error (placeholder spec discoverable; smoke test passes).
  - 3 smoke tests in `test/m50-d2-viewer-specs-smoke.test.js`: `playwright.config.ts` parseable + `testDir` value is `'e2e'`; `npx playwright test --list` exits 0 from a clean checkout; placeholder spec present and skipped.

### Task 2: Insert spawn-gate in `bin/headless-auto-spawn.cjs`
- **Files**:
  - `bin/headless-auto-spawn.cjs` (modify — insert gate inside `autoSpawnHeadless()` after `acquireHandoffLock()` and before `spawn()`)
  - `test/m50-d2-spawn-gate.test.js` (new)
- **Contract refs**: REQ-M50-D2-01; `playwright-bootstrap-contract.md` §3 (`installPlaywright` error-path); `headless-default-contract.md` v2.1.0 (additive — version stays per `m50-integration-points.md`)
- **Dependencies**: BLOCKED BY m50-bootstrap-and-detection Task 5
- **Acceptance criteria**:
  - Gate code: `if (isTestingOrUICommand(command) && hasUI(projectDir) && !hasPlaywright(projectDir)) { const r = await installPlaywright(projectDir); if (!r.ok) { writeSessionFile({ mode: 'blocked-needs-human', reason: 'playwright-install-failed', err: r.err, hint: r.hint }); process.exit(4); } }`. Imports `hasUI`, `hasPlaywright`, `installPlaywright` from D1 modules.
  - `isTestingOrUICommand` whitelist (centralized constant in this file): `gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-quick`, `gsd-t-wave`, `gsd-t-milestone`, `gsd-t-complete-milestone`, `gsd-t-debug`, `gsd-t-integrate`.
  - Hot-path overhead ≤10ms when no install is needed (one `hasUI()` walk + one `hasPlaywright()` config-existence check). Verified by a microbenchmark test: 1000 gate invocations on a non-UI fixture complete in <1s.
  - `installPlaywright` invocation wrapped via `bin/handoff-lock.cjs` (or a dedicated `playwright-install.lock` if reuse interferes — preferred reuse confirmed at the integration checkpoint per constraint) so concurrent spawns on the same project serialize.
  - `mode: 'blocked-needs-human'` payload interleaves with the existing session-state file `mode` enum and is read on next `gsd-t-resume` Step 0.
  - 6 unit tests: no UI → no install attempt; UI + Playwright present → no install; UI + no Playwright + install ok → continues with normal spawn; UI + no Playwright + install fail → `process.exit(4)` + `writeSessionFile` payload `mode: 'blocked-needs-human'`; non-testing command on UI project skips gate; concurrent gate calls serialized via lock (1 install, 2 short-circuits).

### Task 3: Create `scripts/hooks/pre-commit-playwright-gate` + doctor `--install-hooks` flag
- **Files**:
  - `scripts/hooks/pre-commit-playwright-gate` (new — bash; executable mode 0755)
  - `bin/gsd-t.js` (modify — additive: new `--install-hooks` flag handler in `checkDoctorProject`; coordinates with D1 Task 4 edits per `m50-integration-points.md` §"D1 + D2 Both Touch")
  - `test/m50-d2-pre-commit-hook.test.js` (new)
- **Contract refs**: REQ-M50-D2-02; `m50-integration-points.md` §"Pre-Commit Hook Installer"
- **Dependencies**: BLOCKED BY m50-bootstrap-and-detection Task 5; coordinates with D1 Task 4 on `bin/gsd-t.js` edit window
- **Acceptance criteria**:
  - Hook script reads `.gsd-t/.last-playwright-pass` (Unix epoch ms in a single text line). Detects whether `git diff --cached --name-only` includes any of: `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`, `e2e/viewer/**`. If yes AND any touched file's mtime > the timestamp, `echo "M50 pre-commit gate: viewer-source modified after last playwright pass — run 'npx playwright test' and retry" >&2; exit 1`.
  - No viewer-source files staged → `exit 0` silently.
  - Missing `.last-playwright-pass` → fail-open: print warning to stderr, `exit 0` (per constraint: a broken hook is worse than a permissive one).
  - Corrupt timestamp (non-numeric content) → fail-open with warning, `exit 0`.
  - `gsd-t doctor --install-hooks` symlinks `scripts/hooks/pre-commit-playwright-gate` from the GSD-T install root into `.git/hooks/pre-commit`. If `.git/hooks/pre-commit` already exists and is NOT a GSD-T symlink, prints warning + exits without overwriting. Records install in `.gsd-t/.hooks-installed.json`.
  - 5 hook unit tests: clean commit on non-viewer files → exit 0; blocked commit on stale viewer-source → exit 1 + stderr message; allowed commit on fresh viewer-source (mtime ≤ timestamp) → exit 0; missing `.last-playwright-pass` → exit 0 + warning; corrupt timestamp → exit 0 + warning.

### Task 4: Write `e2e/viewer/title.spec.ts` (M48 Bug 1 regression)
- **Files**:
  - `e2e/viewer/title.spec.ts` (new)
- **Contract refs**: REQ-M50-D2-04; `dashboard-server-contract.md` v1.3.0 (`__PROJECT_NAME__` substitution)
- **Dependencies**: BLOCKED BY Task 1 (within domain — needs `playwright.config.ts`)
- **Acceptance criteria**:
  - Spec spawns `scripts/gsd-t-dashboard-server.js` in-process with `GSD_T_PROJECT_DIR` set to a known fixture-path (basename `gsd-t-fixture`), waits for `_ready` (or HTTP 200 on the index path).
  - Asserts `page.title()` on `/transcripts` contains `'gsd-t-fixture'`.
  - Asserts `locator('.title').textContent()` on `/transcripts` contains `'gsd-t-fixture'`.
  - Asserts `page.title()` on `/transcripts/{spawnId}` (using a synthetic spawn-id present in the fixture transcripts dir) also contains `'gsd-t-fixture'`.
  - Failure messages name the bug: `expect(...).toContain('gsd-t-fixture' /* M48 Bug 1: project basename in viewer title */)`.
  - `test.afterAll`: `SIGTERM` server, await close event, port released. Functional (not layout) — verifies the substitution actually flowed from `GSD_T_PROJECT_DIR` to the rendered HTML.

### Task 5: Write `e2e/viewer/timestamps.spec.ts` (M48 Bug 2 regression)
- **Files**:
  - `e2e/viewer/timestamps.spec.ts` (new)
- **Contract refs**: REQ-M50-D2-05
- **Dependencies**: BLOCKED BY Task 1 (within domain)
- **Acceptance criteria**:
  - Spec writes a synthetic NDJSON to a fixture transcripts dir with three frames: `ts: 2026-05-06T12:00:00Z`, `ts: 2026-05-06T12:00:30Z`, `ts: 2026-05-06T12:01:00Z` (30s apart).
  - Spawns the dashboard server; navigates to `/transcripts/{fixtureSpawnId}`; waits for the three frames to render.
  - Asserts the rendered DOM shows three DISTINCT `HH:MM:SS` strings — `12:00:00`, `12:00:30`, `12:01:00` (or local-tz equivalents per the renderer's `frameTs` formatter).
  - Asserts the rendered timestamps are NOT identical (the M48 Bug 2 symptom was per-batch `new Date()` collapsing all three to the same wall-clock instant).
  - Failure messages name the bug: `expect(times).toEqual([..., ..., ...] /* M48 Bug 2: per-frame ts, not per-batch new Date() */)`.
  - `test.afterAll` cleanup. Functional — proves the renderer reads `frame.ts` and not the current wall clock.

### Task 6: Write `e2e/viewer/chat-bubbles.spec.ts` (M48 Bug 3 regression)
- **Files**:
  - `e2e/viewer/chat-bubbles.spec.ts` (new)
- **Contract refs**: REQ-M50-D2-06
- **Dependencies**: BLOCKED BY Task 1 (within domain)
- **Acceptance criteria**:
  - Spec writes synthetic NDJSON containing one of each: `{type: 'user_turn', content: 'hello'}`, `{type: 'assistant_turn', content: 'hi'}`, `{type: 'session_start', ...}`, `{type: 'tool_use_line', tool: 'Read', ...}`.
  - Asserts each rendered frame produces its expected CSS class: `.bubble-user`, `.bubble-assistant`, `.bubble-session-start`, `.tool-use-line` (or whichever class names the M48 fix established — confirm by reading `scripts/gsd-t-transcript.html` before writing the spec).
  - Asserts each rendered frame's text content matches the input (e.g., `locator('.bubble-user').textContent()` contains `'hello'`).
  - Asserts NO rendered element matches a `JSON.stringify` fingerprint (no `{"type":"user_turn"`-substring visible in the DOM for known frame types).
  - Failure messages name the bug: `expect(...).not.toContain('{"type":"user_turn"' /* M48 Bug 3: known types must use bubble dispatch, not JSON fallback */)`.
  - `test.afterAll` cleanup. Functional — proves the dispatch table fires before the JSON fallback for all 4 known types.

### Task 7: Write `e2e/viewer/dual-pane.spec.ts` (M48 Bug 4 regression)
- **Files**:
  - `e2e/viewer/dual-pane.spec.ts` (new)
- **Contract refs**: REQ-M50-D2-07
- **Dependencies**: BLOCKED BY Task 1 (within domain)
- **Acceptance criteria**:
  - Spec sets up a fixture with one in-session NDJSON (`in-session-fixture-XYZ.ndjson`) and one regular spawn NDJSON (`spawn-id-ABC.ndjson`).
  - Loads the viewer, clicks the rail entry corresponding to the in-session entry.
  - Asserts the TOP pane (`#main-stream` or equivalent — confirm element id by reading current HTML before writing) connects an SSE stream to the in-session NDJSON.
  - Asserts the BOTTOM pane (`#spawn-stream` or equivalent) is NOT connected to the in-session NDJSON — its SSE source remains its own (or is the empty default).
  - Repeats the assertion for the four guard sites: rail click, initial bottom-pane resolution (page load with `#in-session-XYZ` hash), `hashchange` event with an `in-session-*` id, and `maybeAutoFollow` invocation. The bottom pane MUST stay off the in-session stream in all four scenarios.
  - Failure messages name the bug: `expect(bottomEventSourceUrl).not.toContain('in-session-fixture-XYZ' /* M48 Bug 4: bottom pane must not pin in-session */)`.
  - `test.afterAll` cleanup. Functional — proves the four guards hold.

### Task 8: Write `e2e/viewer/lazy-dashboard.spec.ts` (M49 banner regression)
- **Files**:
  - `e2e/viewer/lazy-dashboard.spec.ts` (new)
- **Contract refs**: REQ-M50-D2-08
- **Dependencies**: BLOCKED BY Task 1 (within domain)
- **Acceptance criteria**:
  - Spec exercises `bin/headless-auto-spawn.cjs::autoSpawnHeadless` directly via a unit-style harness (this spec is a Playwright spec only because it lives alongside the viewer suite — actual assertion is on banner stdout, not on a rendered page).
  - Scenario A: no dashboard pidfile present → invoke `autoSpawnHeadless` (or its banner-rendering helper); assert the captured banner contains `▶ Transcript file:` and `(to view live: gsd-t-visualize)` and does NOT contain a `http://localhost:` URL.
  - Scenario B: dashboard pidfile present + process alive (mock by manually writing `.gsd-t/.dashboard.pid` with `process.pid` of a benign sleep) → invoke the banner-rendering helper; assert the captured banner contains `http://localhost:7433` (or the project-scoped port range).
  - Failure messages name the milestone: `expect(banner).toContain('Transcript file:' /* M49 lazy banner: dashboard not running */)` etc.
  - `test.afterAll` cleanup: kill any spawned sleep, remove fixture pidfile.

### Task 9: Doc-ripple — replace prose Playwright Readiness Guard with referrals
- **Files**:
  - `~/.claude/CLAUDE.md` (modify — collapse Playwright Readiness Guard section to one-line referral)
  - `templates/CLAUDE-global.md` (modify — same collapse so registered projects pull on next `gsd-t update-all`)
  - `commands/gsd-t-execute.md` (modify — replace prose Playwright reminder)
  - `commands/gsd-t-test-sync.md` (modify)
  - `commands/gsd-t-verify.md` (modify)
  - `commands/gsd-t-quick.md` (modify)
  - `commands/gsd-t-wave.md` (modify)
  - `commands/gsd-t-milestone.md` (modify)
  - `commands/gsd-t-complete-milestone.md` (modify)
  - `commands/gsd-t-debug.md` (modify)
  - `docs/architecture.md` (modify — add Enforcement Layers subsection covering bootstrap library + spawn-gate + pre-commit hook)
  - `CHANGELOG.md` (modify — single M50 entry covering both domains)
- **Contract refs**: REQ-M50-D2-10; `m50-integration-points.md` §"Doc-Ripple Sequencing"
- **Dependencies**: BLOCKED BY Task 2 + Task 3 (need spawn-gate and pre-commit hook landed before pointing docs at them) + Task 8 (last spec landed so the suite is complete)
- **Acceptance criteria**:
  - Each command file's prose Playwright reminder REPLACED with a single line: `Playwright readiness is enforced by the spawn-gate (bin/headless-auto-spawn.cjs); see .gsd-t/contracts/playwright-bootstrap-contract.md`.
  - `~/.claude/CLAUDE.md` Playwright Readiness Guard section collapses to: spawn-gate behavior summary (auto-install when `hasUI && !hasPlaywright`; install fail → blocked-needs-human) + referral to the contract. The Playwright Cleanup subsection stays — it's runtime hygiene, not bootstrap.
  - `templates/CLAUDE-global.md` mirrors the live edit byte-for-byte (the Stack Rules Engine relies on this).
  - `docs/architecture.md` gains an "Enforcement Layers" subsection naming all three layers (bootstrap / spawn-gate / pre-commit) with file paths.
  - `CHANGELOG.md` entry under v3.22.00 (or whichever the complete-milestone bump assigns) summarizes M50 in one paragraph + bullet list of the 5 viewer specs.
  - All edits made in a single pass — no partial doc-ripple per Document Ripple Completion Gate.

### Task 10: Update `playwright-bootstrap-contract.md` Status + flip REQ traceability rows to in-progress
- **Files**:
  - `.gsd-t/contracts/playwright-bootstrap-contract.md` (modify — flip Status from PROPOSED → STABLE on landing)
  - `docs/requirements.md` (modify — flip 16 REQ-M50 rows from `partitioned` to `done` as each REQ's tasks complete; final pass during this task)
- **Contract refs**: All M50 REQs (REQ-M50-D1-01..06, REQ-M50-D2-01..10, REQ-M50-VERIFY)
- **Dependencies**: BLOCKED BY all D2 tasks 1-9 + D1 Task 5
- **Acceptance criteria**:
  - `playwright-bootstrap-contract.md` Status field: `STABLE — landed in M50, v1.0.0`.
  - `docs/requirements.md` Traceability table: every REQ-M50-* row's Status column reads `done` (or `verified` per the project convention) once its mapped tasks are all complete.
  - REQ-M50-VERIFY row updated only after the M50 verify gate runs (Task 10 confirms verify gate has been invoked separately by `/gsd-t-verify`).

## Execution Estimate
- Total tasks: 10
- Independent tasks (no internal blockers, only the cross-domain D1 gate): 3 (Task 1, Task 2, Task 3 — all BLOCKED BY D1 Task 5)
- Blocked tasks (intra-D2): 7 (Tasks 4-8 → Task 1; Task 9 → Tasks 2+3+8; Task 10 → all)
- Cross-domain integration checkpoints consumed: 1 (D1 Task 5 — gates D2 entirely)
