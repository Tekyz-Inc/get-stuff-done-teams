# Constraints: m54-d2-rail-and-spec

## Must Follow

- **Additive-only edits to `scripts/gsd-t-transcript.html`.** Insert the new `<section id="rail-live-activity">` block between MAIN SESSION and LIVE SPAWNS in the existing rail-stack order. Append new CSS rules at the end of the existing `<style>` block. Append new JS module/functions at the end of the existing inline `<script>` (or bottom of the existing module-script section if one exists). NEVER rename an existing rail section, NEVER refactor an existing render function, NEVER reorder existing CSS rules.
- **CSS pulse class `.la-pulsing` is scoped.** The `@keyframes accent-pulse` rule applies only to entries that explicitly carry `.la-pulsing`. NEVER introduce a global animation that affects other rail entries. Verified by Red Team patch "pulse-never-clears": removing the clear-pulse handler must be caught.
- **5-second poll cadence matches `/api/parallelism`.** D2 reuses the same 5s tick the rail already uses for parallelism — no second timer, no jittered cadence. Match the existing pattern.
- **Click never auto-switches the bottom pane on entry arrival.** The pulse signals attention; only the user click loads `tailUrl` into the bottom pane. Auto-switch is forbidden — Red Team patch "pulse-never-clears" tests the absence of auto-switch behaviour.
- **Live-journey specs probe a RUNNING dashboard.** Per M52 doctrine + the 2026-05-07 directive in `feedback_real_setup_playwright.md`: NO in-process `startServer(0, ...)` fixture. The spec opens `GSD_T_LIVE_DASHBOARD_URL` (default `http://localhost:7488`), hits real endpoints, walks the actual user flow. `test.skip()` cleanly when unreachable.
- **Real spawned processes, not stubs.** `live-activity.spec.ts` uses `child_process.spawn('bash', ['-c', 'sleep 30'])` — not a fake event written to JSONL. The success criteria say "rail shows entry within 5s of a backgrounded bash starting" — the test must actually background a bash. Same for the multikind spec's bash and Monitor.
- **Synthetic event in multikind spec is a tool_use_started entry only — no production code path is faked.** The multikind spec writes a single `tool_use_started` line to `.gsd-t/events/<today>.jsonl` to exercise the events-only-source path. NEVER fake `tool_result` to make a test pass.
- **Test cleanup on teardown.** Both specs kill every spawned process before exiting (Playwright `test.afterEach` or `describe.afterAll`). Per project CLAUDE.md § Playwright Cleanup, no orphan processes survive. Verify with `lsof` / `ps` not being polluted post-suite.
- **Manifest entries use `covers: []`.** Live-journey specs do not cover viewer-source `addEventListener` listeners (they probe live URLs). Per M52 doctrine, `covers: []` is the documented null shape. `gsd-t check-coverage` continues to report `OK`.
- **Rail rendering tolerates partial/error responses.** When `/api/live-activity` returns 500 or empty `activities[]`, the rail renders gracefully (empty section header visible, no crash, no console error). D1 guarantees envelope shape; D2 must not assume `activities[]` is always populated.
- **Universal token capture.** No `Task(...)` / `claude -p` / `spawn('claude', …)` from D2 either — pure render + spec authoring, no subagents.

## Must Not

- **Modify any file under D1's ownership.** No edits to `bin/live-activity-report.cjs`, `scripts/gsd-t-dashboard-server.js`, `bin/gsd-t.js`, `.gsd-t/contracts/live-activity-contract.md`, or `test/m54-d1-*.test.js`. If D2 finds a contract gap, escalate — never patch the contract or the detector directly.
- **Touch existing left-rail sections beyond positioning.** D2 inserts a new section. D2 does NOT rename MAIN SESSION, LIVE SPAWNS, or COMPLETED, NOR change their CSS, NOR change their JS render functions. The visual nesting of LIVE SPAWNS within LIVE ACTIVITY is achieved via the new section's layout, NOT by editing the LIVE SPAWNS section.
- **Add unit tests under `test/m54-d1-*.test.js`.** Those are D1's. D2's tests are live-journey specs only.
- **Stub the dashboard.** Live-journey specs MUST hit the real :7488 (or env-overridden) URL. A `nock` interceptor or `msw` mock would be wrong by contract — see `feedback_real_setup_playwright.md`.
- **Auto-switch the bottom pane on rail update.** Pulse only. Click loads tail. The user MUST be in control of pane focus. (Red Team patch will test this — D2 must NOT pre-empt it.)
- **Add new external runtime deps.** Same zero-dep invariant as D1. `package.json` `dependencies` stays empty.

## Must Read Before Using

- `scripts/gsd-t-transcript.html` — full file, focusing on:
  - The existing `<section id="rail-...">` structure (the M47/M52 redesign — confirms insertion point between MAIN SESSION and LIVE SPAWNS).
  - The existing `connectMain(sessionId)` SSE wiring + the 5s `/api/parallelism` polling pattern (the cadence D2 mirrors).
  - The existing `appendFrame` / `renderFrame` helpers (D2 mirrors render-helper style for `appendActivity` / `updateActivity` / `removeActivity`).
  - The existing `@keyframes` rules at the bottom of `<style>` (D2 appends `accent-pulse` next to them; pattern matches).
- `bin/parallelism-report.cjs` — the envelope shape D1 mirrors (D2 reads to know what it'll receive).
- `e2e/live-journeys/parallelism-endpoint.spec.ts` — the live-setup spec template added 2026-05-07 (the canonical `test.skip()` pattern, the `GSD_T_LIVE_DASHBOARD_URL` env override, the schema-versioned envelope assertion style — D2 mirrors the structure).
- `e2e/live-journeys/dashboard-endpoint-coverage.spec.ts` — the 12-route coverage spec from 2026-05-07 (the route-by-route assertion vocabulary D2 picks from).
- `.gsd-t/journey-manifest.json` — the existing manifest format (D2 appends 2 new entries; never edits existing entries).
- `.gsd-t/contracts/live-activity-contract.md` — the contract D1 publishes STABLE on D1 T5. D2 cannot author specs until C1 PUBLISHED.

## Dependencies

- **Depends on**: D1 Checkpoint 1 (contract STABLE + 3 endpoints live + module installed at `~/.claude/bin/live-activity-report.cjs`). D2 cannot start before C1 PUBLISHED. Also depends on existing M47 rail infrastructure (`connectMain`, splitter, right-rail collapse) for the insertion point.
- **Depended on by**: M54 verify (Red Team adversarial pass + final rail rendering verification). Both live-journey specs must pass before complete-milestone.

## Branch & Commit

- **Expected branch**: `main` (in-session single-day build, per milestone definition § "in-session-build").
- **Commit cadence**: one commit per task (3 tasks in D2, skeleton). Each commit's Pre-Commit Gate verifies test + doc updates + manifest entry + journey-coverage `OK`.
- **Doc-ripple set** (D2's share): `docs/architecture.md` § "Live Activity Observability (M54)" subsection (D1 finalised endpoint signatures on its T5; D2 appends rail-section behavior + 2-spec verification narrative on D2's last task), `CHANGELOG.md` Unreleased entry, `.gsd-t/journey-manifest.json` (additive 2 entries), `m54-integration-points.md` Checkpoint 2 PROPOSED → PUBLISHED on D2 last task.
