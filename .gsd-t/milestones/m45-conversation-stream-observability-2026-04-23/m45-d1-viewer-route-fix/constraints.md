# Constraints: m45-d1-viewer-route-fix

## Must Preserve

- Back-compat on `/transcripts` JSON response: `Accept: application/json` and `Accept: */*` both return `{ spawns: [...] }` in the same shape as v3.18.13.
- All existing `/transcript/:id` behavior is untouched (D1 does not modify `handleTranscriptPage` or the SSE tail stream).

## Must Read Before Using

- `scripts/gsd-t-dashboard-server.js` — specifically `handleTranscriptsList` (lines ~179–196), `handleTranscriptPage` (lines ~275–285), and the exports block at the bottom.
- `scripts/gsd-t-transcript.html` (no edits — but read to confirm the empty-spawn-id path does not crash):
  - The `data-spawn-id="__SPAWN_ID__"` placeholder on `<body>` (line 141).
  - The `const spawnId = document.body.getAttribute('data-spawn-id');` line (180) and `initialId = (location.hash || '').slice(1) || spawnId;` branch (730).
  - The `pollSpawns()` function — it calls `/api/spawns-index` which returns the full list regardless of the current spawn-id.
- `test/transcripts-html-page.test.js` — to understand what's being asserted before refactoring.

## Substitution Strategy

The existing `handleTranscriptPage` replaces `__SPAWN_ID__` with the URL-path spawn-id via `.replace(/__SPAWN_ID__/g, spawnId)`. For `/transcripts` (no spawn selected), substitute with an empty string `""`. The viewer's `initialId` logic falls through to `location.hash` (also empty), so `connect('')` is the call path. Verify `connect('')` does not throw — it will attempt to open an SSE to `/transcript//stream` which will 404, but the viewer's left rail continues to populate independently.

**Alternative**: substitute with a sentinel like `"__none__"` and let the viewer detect it and skip `connect()` on empty/sentinel. Pick whichever is simpler to test. Prefer empty string unless testing reveals a race.

## Must NOT Do

- Do NOT delete `renderTranscriptsHtml` until the tests that reference it are refactored in the same commit. (If D1 chooses not to delete it, that's fine — dead code is cleaner to remove after manual smoke confirms the new route works.)
- Do NOT change the `/transcripts` JSON shape.
- Do NOT introduce a redirect (301/302) — serve the HTML directly. Redirects confuse the browser's URL bar and break bookmarks.

## Pre-Commit Doc Ripple

- Update `docs/architecture.md` if it documents the `/transcripts` route (grep first; only add if the existing docs mention the standalone page).
- No new contract to bump — just a row in progress.md Decision Log.
