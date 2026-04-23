# Tasks: m45-d1-viewer-route-fix

Wave: **1** (parallel with m45-d2-in-session-conversation-capture; file-disjoint).

## T-1: Refactor `handleTranscriptsList` to serve the viewer HTML for `text/html` clients

- [x] In `scripts/gsd-t-dashboard-server.js`, change the `text/html` branch of `handleTranscriptsList` to read `scripts/gsd-t-transcript.html` (the `transcriptHtmlPath` already threaded into `startServer`), substitute `__SPAWN_ID__` → `""` (or a sentinel), and return it as `text/html; charset=utf-8`.
- [x] Keep the `application/json` and `*/*` branches unchanged.
- [x] Keep `renderTranscriptsHtml` exported for now (tests still reference it); delete it in T-3 after refactoring tests.

**Touches**: `scripts/gsd-t-dashboard-server.js` (`handleTranscriptsList` only).
**Depends on**: —
**Estimate**: small (~15 lines changed).

## T-2: Add a positive test for the viewer route

- [x] Create `test/m45-d1-transcripts-route-viewer.test.js`.
- [x] Test: `GET /transcripts` with `Accept: text/html` returns HTML that contains `data-spawn-id=""` (or sentinel) AND the viewer's stable DOM markers (e.g., the `<div id="stream">` node, the `__SPAWN_ID__` replacement succeeded — i.e., the literal string is absent).
- [x] Test: the response is the SAME HTML content as `GET /transcript/some-id` **minus the spawn-id substitution** — i.e., both routes serve `gsd-t-transcript.html`.
- [x] Test: the JSON branch is unchanged (regression guard).

**Touches**: `test/m45-d1-transcripts-route-viewer.test.js` (new).
**Depends on**: T-1.
**Estimate**: small.

## T-3: Refactor `test/transcripts-html-page.test.js`

- [x] Delete or rewrite the 3 tests that assert on standalone-index content (`No spawn transcripts yet`, `2 spawns`, `href="/transcript/s-abc"` in table rows, etc.) — those assertions target the retired standalone page.
- [x] Keep the 2 back-compat JSON tests (`Accept: */*` and `Accept: application/json` both still return `{ spawns: [...] }`) — these are the invariants D1 must preserve.
- [x] Update the HTML-branch test to assert on the NEW contract: response is `text/html`, 200, body contains the viewer's stable DOM markers, body does NOT contain the literal `__SPAWN_ID__` placeholder.
- [x] If `renderTranscriptsHtml` is being deleted in the same commit, remove the 3 unit tests that test it directly. Otherwise, leave them alone and schedule deletion as a follow-up.

**Touches**: `test/transcripts-html-page.test.js`.
**Depends on**: T-1 (and optionally T-2 landed first).
**Estimate**: small.

## T-4: Delete `renderTranscriptsHtml` (optional cleanup)

- [x] If T-3 removed all tests referencing `renderTranscriptsHtml`, delete the function from `scripts/gsd-t-dashboard-server.js` and remove it from the exports list.
- [x] Skip this task if unsure — dead code can be removed in a follow-up patch. Pre-commit gate passes either way.

**Touches**: `scripts/gsd-t-dashboard-server.js`.
**Depends on**: T-3.
**Estimate**: trivial.

## T-5: Manual smoke test — DEFERRED

- [ ] Start the dashboard locally (`npm run dashboard` or via the autostart hook).
- [ ] Visit `http://127.0.0.1:7433/transcripts` in a browser — confirm the viewer loads (left rail visible, right panel visible, main pane shows "no spawn selected" or similar).
- [ ] Hit `curl -sH 'Accept: application/json' http://127.0.0.1:7433/transcripts` — confirm `{"spawns":[...]}` JSON is returned.
- [ ] Close browser; kill dashboard.

**Touches**: runtime only (no file edits).
**Depends on**: T-1.
**Estimate**: trivial.
**Status**: Deferred to user — executed from unattended worker with no browser available. Automated tests (7/7 pass) cover both branches; manual smoke is optional verification.

## Done when

- All D1 tests (new + refactored) pass.
- Full suite stays green (1914 baseline + any new tests).
- Manual smoke confirms the viewer loads at `/transcripts`.
- Progress.md Decision Log entry added.
