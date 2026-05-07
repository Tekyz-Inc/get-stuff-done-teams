# Tasks: m52-d2-journey-specs-and-fixtures

## Summary
Build the content layer the D1 enforcer measures coverage against: 12 inaugural Playwright journey specs (one per interactive surface), 3 real-data NDJSON fixtures + replay helper, the populated `.gsd-t/journey-manifest.json`, and a "Test Pass-Through — Journey Edition" Red Team category. Every assertion verifies user-visible state change, not element existence.

## Tasks

### Task 1: Capture 3 real-data NDJSON fixtures + author `replay-helpers.ts`
- **Files**:
  - `e2e/fixtures/journeys/fixture-medium-session.ndjson` (new, ~50 frames)
  - `e2e/fixtures/journeys/fixture-completed-session.ndjson` (new, ~150 frames)
  - `e2e/fixtures/journeys/fixture-multi-spawn.ndjson` (new, ~80 frames across 3 spawns)
  - `e2e/fixtures/journeys/replay-helpers.ts` (new)
- **Contract refs**: D2 constraints "Real-data fixtures, not synthesised"; `journey-coverage-contract.md` §2 (manifest schema — `covers[].file` for fixture-loading specs)
- **Dependencies**: NONE — fixtures are derived from existing `.gsd-t/transcripts/in-session-*.ndjson` files (no D1 dependency)
- **Acceptance criteria**:
  - Each fixture is a verbatim slice (or filtered subset) of a real `.gsd-t/transcripts/in-session-*.ndjson` file. Source-session id captured in a top-of-file `// source: in-session-<id>` comment for traceability.
  - Frame counts: medium ~50, completed ~150, multi-spawn ~80 (assert via `wc -l` in fixture sanity test, or inline in spec setup).
  - `replay-helpers.ts` exports `replayFixture(page, fixturePath, options?)` that loads NDJSON, slices into SSE-event-shaped chunks, feeds them via Playwright `route()`/`fulfill()` interception or stub `EventSource` pattern from `e2e/viewer/dual-pane.spec.ts`.
  - Zero new runtime deps — uses Playwright's built-in `route`/`fulfill` and `page.evaluate` to inject the stub.
  - PII scrub on fixture capture: any user content longer than 200 chars is truncated with `[…truncated]` marker (assert via grep on committed fixtures).
  - Copy ephemeral-port pattern from `e2e/viewer/dual-pane.spec.ts` (`port: 0`, `server.address().port` readback) — no random-number ports.

### Task 2: Author specs 1–4 + manifest entries 1–4
- **Files**:
  - `e2e/journeys/main-session-stream.spec.ts` (new)
  - `e2e/journeys/click-completed-conversation.spec.ts` (new)
  - `e2e/journeys/click-spawn-entry.spec.ts` (new)
  - `e2e/journeys/splitter-drag.spec.ts` (new)
  - `.gsd-t/journey-manifest.json` (new — 4 entries; later tasks append)
- **Contract refs**: `journey-coverage-contract.md` §2 (manifest schema)
- **Dependencies**: BLOCKED BY m52-d1 Task 5 (Checkpoint 1 — `gsd-t check-coverage` CLI must exist + STABLE contract committed); Requires D2 Task 1 (replay-helpers.ts for fixture-driven specs)
- **Acceptance criteria**:
  - `main-session-stream.spec.ts`: load `/transcripts`, replay `fixture-medium-session.ndjson`, assert `#main-stream` renders ≥ N expected frames with correct timestamps + roles (state changed: empty → populated).
  - `click-completed-conversation.spec.ts`: seed Live + Completed entries, click a Completed item, assert `#spawn-stream` populates with that conversation's frames AND assert it does NOT mirror the live main session id (M48 Bug 4 + M52 narrowed-guard regression).
  - `click-spawn-entry.spec.ts`: click a Live spawn entry, assert bottom pane connects to that spawn's SSE and renders frames; assert `selectedSpawnId` sessionStorage key updated.
  - `splitter-drag.spec.ts`: mousedown on splitter → mousemove → mouseup; assert `#main-stream` and `#spawn-stream` height ratio matches drag delta within 5% AND `splitterPct` sessionStorage key persisted.
  - All 4 specs use `port: 0` ephemeral pattern.
  - Each spec completes in < 5s on local Playwright (assert via `test.setTimeout(5000)`).
  - `.gsd-t/journey-manifest.json` v0.1.0 created with 4 entries; each entry's `covers[]` references the listener selector + kind it asserts on (e.g., `selector: 'splitter:mousedown'`, `kind: 'addEventListener'`).
  - Run `gsd-t check-coverage` after this task — must report only the 8 still-uncovered listeners (specs 5–12), not these 4.
  - Every assertion verifies state changed / data flowed / content loaded / widget responded — no `toBeVisible`/`toBeAttached`-only assertions.

### Task 3: Author specs 5–8 + manifest entries 5–8
- **Files**:
  - `e2e/journeys/splitter-keyboard.spec.ts` (new)
  - `e2e/journeys/right-rail-toggle.spec.ts` (new)
  - `e2e/journeys/completed-collapse-toggle.spec.ts` (new)
  - `e2e/journeys/auto-follow-toggle.spec.ts` (new)
  - `.gsd-t/journey-manifest.json` (edit — append 4 entries)
- **Contract refs**: `journey-coverage-contract.md` §2
- **Dependencies**: Requires Task 2 (manifest exists; specs 1–4 land first to prove the pattern)
- **Acceptance criteria**:
  - `splitter-keyboard.spec.ts`: focus splitter, press ArrowUp/ArrowDown 3× each → assert `splitterPct` shifts by ±15%; Home → snap to 100%; End → snap to 0%; assert sessionStorage updated each key.
  - `right-rail-toggle.spec.ts`: click toggle → assert `#right-rail` collapses/expands AND `rightRailCollapsed` sessionStorage key flips.
  - `completed-collapse-toggle.spec.ts`: click collapse header → assert `#completed-section` toggles `.collapsed` class AND `completedExpanded` sessionStorage key flips.
  - `auto-follow-toggle.spec.ts`: replay fixture frames; with auto-follow ON, assert `#main-stream` scrollTop tracks newest frame; toggle OFF; assert scrollTop frozen on subsequent frames.
  - All 4 specs assert state changed (sessionStorage + DOM class/style/scroll), not element existence.
  - Each spec completes in < 5s.
  - Manifest appended to 8 entries total.
  - `gsd-t check-coverage` reports only specs 9–12 still uncovered.

### Task 4: Author specs 9–12 + complete manifest
- **Files**:
  - `e2e/journeys/kill-button.spec.ts` (new)
  - `e2e/journeys/sessionstorage-persistence.spec.ts` (new)
  - `e2e/journeys/keyboard-shortcuts.spec.ts` (new)
  - `e2e/journeys/hashchange.spec.ts` (new)
  - `.gsd-t/journey-manifest.json` (edit — append final 4 entries; total 12)
- **Contract refs**: `journey-coverage-contract.md` §2
- **Dependencies**: Requires Task 3
- **Acceptance criteria**:
  - `kill-button.spec.ts`: click kill button on a spawn entry → intercept POST/DELETE `/api/spawns/<id>` → assert request fired with correct id AND UI updates spawn entry to "killed" state.
  - `sessionstorage-persistence.spec.ts`: set splitter, right-rail, completed, selectedSpawn keys → reload → assert all 4 restored from sessionStorage and DOM reflects them.
  - `keyboard-shortcuts.spec.ts`: simulate documented shortcuts (e.g., `g` for go-to-top, `j`/`k` for navigation if applicable) → assert each produces its documented state change.
  - `hashchange.spec.ts`: navigate to `/transcripts#in-session-<id>` → assert bottom pane loads that spawn AND main pane is unaffected (M48 Bug 4 + M52 narrowed guard); change hash mid-session → assert reload-into-pane logic.
  - Final `.gsd-t/journey-manifest.json` has 12 entries 1:1 with `e2e/journeys/*.spec.ts` filenames.
  - `gsd-t check-coverage` returns exit 0 (zero gaps, zero stale entries) when run against the live viewer source.
  - Full E2E suite includes all 12 journey specs and all 12 pass (`npx playwright test e2e/journeys/`).
  - All 12 specs complete in < 60s total (assert via Playwright runner timing report).
  - `m52-integration-points.md` Checkpoint 2 flipped from PROPOSED → PUBLISHED with timestamp.
  - REQ-M52-D2-MANIFEST and REQ-M52-D2-SPECS rows in `docs/requirements.md` flip planned → done.

### Task 5: "Test Pass-Through — Journey Edition" Red Team category + adversarial run + Checkpoint 3
- **Files**:
  - `templates/prompts/red-team-subagent.md` (edit — additive subsection only)
  - `.gsd-t/red-team-report.md` (edit — append `§ "M52 JOURNEY-EDITION RED TEAM"` using M51 structural template)
- **Contract refs**: D2 constraints "Red Team scoped to journeys"; `m52-integration-points.md` Checkpoint 3
- **Dependencies**: Requires Task 4 (all 12 specs must be green before adversarial run can attempt to break them)
- **Acceptance criteria**:
  - New "Test Pass-Through — Journey Edition" subsection appended to `templates/prompts/red-team-subagent.md` (existing categories untouched — assert by diff that only insertion, no deletions/reorders).
  - Subsection prescribes: write ≥ 5 broken viewer patches that an existing-but-shallow journey spec might miss; run the 12 journey specs against each broken impl; spec MUST fail (red); revert patch; spec MUST pass (green).
  - Adversarial run executed: ≥ 5 broken patches written and reverted, with each patch's outcome recorded.
  - Each patch caught by ≥ 1 journey spec (failures recorded in report).
  - Hook end-to-end exercise: stage a viewer-source diff that introduces an uncovered listener (e.g., a new `addEventListener` on a fresh element id) → confirm `pre-commit-journey-coverage` blocks → update manifest → confirm hook unblocks. Both transitions logged in `.gsd-t/red-team-report.md`.
  - Findings written to `.gsd-t/red-team-report.md § "M52 JOURNEY-EDITION RED TEAM"` using the same structural template as M51 RED TEAM FINDINGS (one entry per patch: name, broken-line, expected-spec, actual-result, verdict).
  - VERDICT: `FAIL` (real bug found — fix and rerun, up to 2 cycles) or `GRUDGING PASS` (≥ 5 patches, all caught, no real bugs).
  - `m52-integration-points.md` Checkpoint 3 flipped from PROPOSED → PUBLISHED with timestamp.
  - REQ-M52-D2-RED-TEAM row in `docs/requirements.md` flips planned → done.

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1 — fixtures + replay-helpers)
- Blocked by D1: 4 (Tasks 2–5 BLOCKED BY m52-d1 Checkpoint 1)
- Blocked tasks (waiting on tasks within domain): 4 (Tasks 2→3→4→5 form a sequential chain)
- Estimated checkpoints: 2 (Checkpoint 2 after Task 4; Checkpoint 3 after Task 5)
