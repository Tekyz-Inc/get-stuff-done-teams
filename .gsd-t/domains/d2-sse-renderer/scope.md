# Domain: d2-sse-renderer

## Responsibility
Serve a per-spawn live transcript page off the existing `:7433` dashboard. Provide the SSE endpoint that tails the ndjson written by D1, and the HTML renderer that turns stream-json frames into the Claude-Code CLI visual.

## Owned Files/Directories
- `scripts/gsd-t-dashboard-server.js` — MODIFY (this is the GSD-T-repo copy). Add:
  - `GET /transcript/:spawnId/stream` — SSE endpoint; reads ndjson from byte 0 (replay) then tails new lines via `fs.watchFile` (same pattern as existing `/events` handler).
  - `GET /transcript/:spawnId` — serves `scripts/gsd-t-transcript.html` with the spawn-id injected via query param / data attribute.
  - `GET /transcripts` — JSON list of all spawns from `.gsd-t/transcripts/.index.json` (consumed by D3 sidebar).
  - Keep existing `/`, `/events`, `/metrics`, `/ping`, `/stop` handlers unchanged.
- `scripts/gsd-t-transcript.html` — NEW. Zero-dep, single-file, dark-mode, no external CDN. Renders each frame type:
  - `system` → dim small italic line
  - `user` (message) → plain indented block, `> ` prefix
  - `assistant` text blocks → streaming text, monospace
  - `assistant` tool_use → collapsible card `⎿ ToolName(preview)` → click to expand input JSON
  - `user` tool_result (paired by `tool_use_id`) → indented pre, truncated with "show more"
  - thinking blocks → dim grey collapsible
  - `task-boundary` (orchestrator-worker emits these) → banner with task id + state
  - Auto-scroll to bottom with pause-on-scroll-up; floating "↓ Jump to live" button
  - WebSocket fallback not needed — SSE is one-way
- `test/m42-transcript-server.test.js` — NEW. Tests: SSE replay + tail, HTML served with correct spawn-id, transcripts index endpoint, 404 for unknown spawn-id.
- `test/m42-transcript-renderer.test.js` — NEW. Tests renderer JS via `new Function()` syntax check; validates frame-type → DOM mapping; checks pairing of tool_use_id.

## NOT Owned
- Transcript ndjson writer (D1)
- Spawn registry (D1 writes `.index.json`; D2 reads only)
- Sidebar tree UI or kill button (D3)
- Existing dashboard graph UI (untouched)
