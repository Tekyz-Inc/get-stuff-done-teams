# Domain: d3-sidebar-kill

## Responsibility
Navigation and control layer over the per-spawn transcripts: a sidebar tree listing all active and recent spawns (parent-indented), click-to-swap the main pane, and a per-spawn kill button that SIGTERMs the worker.

## Owned Files/Directories
- `scripts/gsd-t-dashboard-server.js` — EXTEND (D2 initial edits preserved). Add:
  - `POST /transcript/:spawnId/kill` — reads `.gsd-t/transcripts/.index.json`, looks up `workerPid`, sends `SIGTERM`, marks registry entry `status: 'stopped'`, returns 200 JSON. Exit cases: pid missing → 409; kill EPERM → 403; kill ESRCH → treat as already-stopped, 200.
- `scripts/gsd-t-transcript.html` — EXTEND. Add sidebar panel:
  - Polls `GET /transcripts` every 3s
  - Builds indented tree from `parentId` links
  - Status dot per node (green=running / yellow=stopping / grey=ended)
  - Click swaps `location.hash` to `#spawnId` and reconnects SSE
  - Kill button per node (confirm prompt) → `fetch POST /transcript/:id/kill`
- `test/m42-transcript-sidebar.test.js` — NEW. Tests: tree-build algorithm (parent→child → nested), kill handler (valid, missing pid, EPERM, ESRCH), registry status transition.

## NOT Owned
- Transcript capture / tee (D1)
- Core SSE + renderer (D2 — D3 extends the HTML file, it doesn't own the core renderer contract)
- Dashboard graph UI
- Intervene/SIGSTOP-inject (explicitly deferred to follow-up milestone — do not implement)
