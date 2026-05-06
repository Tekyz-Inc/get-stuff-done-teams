# Domain: m47-d1-viewer-redesign

## Responsibility

Rewrite the visualizer transcript viewer so the default view is a **dual-pane focused layout**: top pane streams the main in-session conversation (zero clicks), bottom pane streams whichever spawn the user selects from the left rail. Add a Live + Completed split in the left rail with status badges, sessionStorage-persisted focus, and a draggable splitter.

Preserves the current right-rail panels (Spawn Plan / Parallelism / Tool Cost) under a collapsible toggle, and preserves the back-compat server-side `data-spawn-id="__SPAWN_ID__"` substitution used by `/transcript/:spawnId` bookmarks.

## Owned Files/Directories

- `scripts/gsd-t-transcript.html` — full rewrite (left rail 3-section, split-pane center, dual SSE contexts, splitter, focus persistence, completed toggle, status badges)
- `templates/gsd-t-transcript.html` — kept in lockstep with `scripts/` copy (template ships to projects via `gsd-t install` / `gsd-t update-all`)
- New / updated viewer-route tests in `test/dashboard-server.test.js` that assert the rewritten HTML's structural elements (splitter handle, 3-section rail markers, top-pane main-session container) — only the assertions that are about HTML structure, not server endpoints

## NOT Owned (do not modify)

- `scripts/gsd-t-dashboard-server.js` — owned by D2
- `scripts/gsd-t-dashboard.html` — different surface (root dashboard, not the transcript viewer)
- `scripts/hooks/gsd-t-conversation-capture.js` — M45 D2; the NDJSON contract already produces files this domain consumes
- `bin/gsd-t-token-capture.cjs` — observability surface
- Any file under `bin/` — runtime tooling, not viewer

## Files It Reads (informational, not modified)

- `.gsd-t/contracts/dashboard-server-contract.md` — to discover the `/api/main-session` endpoint shape D2 will publish
- `.gsd-t/contracts/conversation-capture-contract.md` — `in-session-{sessionId}.ndjson` filename + frame schema
