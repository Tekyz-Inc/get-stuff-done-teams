# Constraints: m47-d1-viewer-redesign

## Must Follow

- Keep `data-spawn-id="__SPAWN_ID__"` server-side substitution working — bookmarks to `/transcript/:spawnId` must still load with the spawn pre-selected in the bottom pane (success criterion: zero regressions on existing 7 viewer-route/HTML-page tests).
- Top pane uses the same SSE / file-tail polling pattern as the bottom pane — no new transport, no new server contract beyond what D2 publishes.
- Default landing on `/transcripts` (no spawnId) must show the main in-session conversation streaming in the top pane within 3s of page load, **zero clicks** (success criterion 1).
- sessionStorage keys are namespaced under `gsd-t.viewer.*` (e.g., `gsd-t.viewer.selectedSpawnId`, `gsd-t.viewer.splitterPct`, `gsd-t.viewer.completedExpanded`).
- Splitter persists position; splitter handle is keyboard-accessible (focusable, arrow keys nudge ±5%).
- Live → Completed transition is reactive (no full reload) and preserves selection if the user is currently viewing the transitioning spawn (success criterion 3).
- Completed section is capped at 100 entries newest-first; older entries drop silently from the rail (success criterion 4).
- Status badges: `success` (green), `failed` (red), `killed` (gray) on completed entries; derived from D2's `status` field — D1 does NOT compute status from raw mtime/exit-code.

## Must Not

- Modify `scripts/gsd-t-dashboard-server.js` — server changes belong to D2.
- Add new SSE endpoints, new HTTP routes, or any server-side substitution placeholder beyond `__SPAWN_ID__`.
- Introduce a JS framework (React/Vue/Svelte). The viewer is intentionally vanilla JS in a single HTML file; that constraint is load-bearing for `/transcript/:spawnId` to work via simple string replace.
- Drop the right-rail panels — they are preserved under a collapsible toggle, not removed.
- Auto-revert focus when a spawn finishes mid-view (success criterion 3 explicitly forbids this).
- Re-implement filename validation client-side — trust D2's server-side `isValidSpawnId` guard.

## Must Read Before Using (Black Box Items)

These exist before M47 starts; the execute agent **must read them** before treating their behavior as known:

- `scripts/gsd-t-transcript.html` — current viewer markup, the right-rail panels (Spawn Plan / Parallelism / Tool Cost), the SSE wiring, and the `__SPAWN_ID__` substitution pattern
- `templates/gsd-t-transcript.html` — confirm it's currently a copy of `scripts/gsd-t-transcript.html` (lockstep maintenance is a project convention, not a hidden detail)
- `scripts/gsd-t-dashboard-server.js::handleTranscriptsList` and `listInSessionTranscripts` — to know exactly what fields the rail JSON carries today (M45 D2 + v3.20.13 fix)
- `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0 — frame schema for `in-session-*.ndjson`; the top-pane renderer treats `💬 conversation` frames as the primary content type

## Dependencies

- **Depends on D2 for**: the `/api/main-session` helper endpoint (returns the most-recently-modified `in-session-*.ndjson` filename so the top pane can default-load without a list+sort dance), and the `status` field added to entries returned by `listInSessionTranscripts` / `handleTranscriptsList`.
- **Depended on by**: nothing internal to M47 — D2 has no consumers other than the viewer.

## Integration Checkpoint

D2 must complete its `/api/main-session` endpoint and `status` field before D1 can wire the top-pane default load and the rail badges. Tasks in D1 that touch those features wait on the integration checkpoint; tasks that only restructure existing markup (split-pane scaffolding, splitter, sessionStorage plumbing) can run in parallel with D2 from task 1.
