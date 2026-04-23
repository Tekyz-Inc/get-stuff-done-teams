# Domain: m45-d1-viewer-route-fix

## Purpose

Revert the v3.18.13 standalone `/transcripts` index page (`renderTranscriptsHtml`) and instead serve the real transcript viewer (`scripts/gsd-t-transcript.html`) at `GET /transcripts`. The viewer's existing left-rail handles listing + empty-state; users reach the same visual surface from `/transcripts` and `/transcript/:id`.

## Files This Domain Owns

- `scripts/gsd-t-dashboard-server.js` — `handleTranscriptsList` text/html branch.
- `test/transcripts-html-page.test.js` — refactor assertions for new contract.
- `test/m45-d1-transcripts-route-viewer.test.js` *(new, optional)* — positive test that `/transcripts` returns the viewer HTML.

## Files This Domain Does NOT Touch

- `scripts/gsd-t-transcript.html` — D2 owns it.
- `scripts/gsd-t-compact-detector.js` — D2 owns it.
- Any `scripts/hooks/**` — D2 owns the new hook.
- `templates/CLAUDE-global.md` — D2 owns the settings.json block.
- `.gsd-t/contracts/conversation-capture-contract.md` — D2 owns the new contract.

## Boundary Notes

- D1 must NOT remove the JSON branch of the content-negotiation — the dashboard JS still depends on `{spawns:[...]}` at `/transcripts` with `Accept: application/json` or `*/*`.
- D1 must NOT remove `renderTranscriptsHtml` from the exports *unless* all tests referencing it are also updated in the same commit. Simplest path: delete the function **and** refactor the tests in one go (they're all owned by D1).
- D1 does NOT need to modify `scripts/gsd-t-transcript.html`'s sentinel-substitution logic — the viewer already accepts an empty spawn-id string gracefully (left rail populates from `/api/spawns-index`; main panel defers to `location.hash`).

## Contracts Consumed

- `.gsd-t/contracts/headless-default-contract.md` v2.0.0 — read-only; D1 does not bump.

## Contracts Produced / Updated

- None. D1 is a pure UX bug fix; no contract bump required.
