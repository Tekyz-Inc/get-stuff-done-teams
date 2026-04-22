# Dashboard Server Contract

**Version**: 1.2.0 (M43 D6 — transcript viewer as primary surface)

## Owner
`server` domain — `scripts/gsd-t-dashboard-server.js`

## Consumers
- `dashboard` domain — connects to SSE endpoint to receive events
- `command` domain — spawns server as detached child process, reads PID file
- `autostart` module — `scripts/gsd-t-dashboard-autostart.cjs` — ensures the
  server is running before any spawn prints the live-transcript banner
- `headless-auto-spawn` — prints the transcript URL banner on every spawn

---

## HTTP Endpoints

### GET /
- **Response**: Serves `gsd-t-dashboard.html` from the same directory as the server script
- **Content-Type**: `text/html`
- **Status**: 200 on success, 404 if file not found

### GET /events
- **Response**: Server-Sent Events stream
- **Content-Type**: `text/event-stream`
- **Headers**: `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`
- **Behavior**:
  1. On connect: send all existing events from `.gsd-t/events/*.jsonl` (newest file first, up to 500 events max)
  2. Then: stream new events as JSONL lines are appended to watched files
  3. Each event: `data: {JSON-stringified event object}\n\n`
  4. Keepalive comment every 15s: `: keepalive\n\n`

### GET /ping
- **Response**: `{"status":"ok","port":{port}}`
- **Content-Type**: `application/json`
- **Purpose**: Health check — used by gsd-t-visualize to confirm server is running

### GET /metrics
- **Response**: JSON object with `{ taskMetrics: [...], rollups: [...] }`
- **Content-Type**: `application/json`
- **Behavior**:
  1. Reads `.gsd-t/metrics/task-metrics.jsonl` — parses each line to taskMetrics array
  2. Reads `.gsd-t/metrics/rollup.jsonl` — parses each line to rollups array
  3. Returns empty arrays if files don't exist (graceful fallback)
- **Purpose**: Serves metrics data to the dashboard Chart.js panel

### GET /stop (optional)
- **Response**: `{"status":"stopping"}`
- **Behavior**: Gracefully shuts down server; used by `gsd-t-visualize stop`

### GET /transcript/:spawnId  (M42 D1)
- **Response**: Serves `gsd-t-transcript.html` from the same dir as the server script
- **Content-Type**: `text/html`
- **Validation**: `spawnId` must match `[A-Za-z0-9_.-]{1,128}`; invalid → 400

### GET /transcript/:spawnId/stream  (M42 D1)
- **Response**: Server-Sent Events stream tailing the per-spawn ndjson file
- **Content-Type**: `text/event-stream`
- **Headers**: `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`
- **Behavior**: replays existing lines, then streams new appends; `: keepalive` comment every 15s

### GET /transcript/:spawnId/usage  (M43 D6-T1)
- **Response**: `{ spawn_id, session_id?, rows: [...], truncated: boolean }`
- **Content-Type**: `application/json`
- **Validation**: invalid `spawnId` → 400
- **Behavior**:
  1. Reads `.gsd-t/metrics/token-usage.jsonl`
  2. Filters rows where `row.spawn_id === spawnId` OR (no `spawn_id` column and
     `row.session_id === spawnId`) — the latter covers M43 D1 Branch B (in-session
     usage rows tagged by `session_id` only)
  3. Returns an empty `rows` array when the file is missing
- **Truncation**: `rows` is capped at 500 most-recent entries; `truncated: true`
  when the underlying file had more matches

### GET /transcript/:spawnId/tool-cost  (M43 D6-T1)
- **Response**: `{ spawn_id, tools: [ {tool, calls, attributedIn, attributedOut, attributedTotal, costUsd}, … ] }`
- **Content-Type**: `application/json`
- **Validation**: invalid `spawnId` → 400
- **503 fallback**: if `bin/gsd-t-tool-attribution.cjs` (M43 D2) is not yet on
  disk, responds with HTTP 503 and `{ error: "tool-attribution library not yet available" }`.
  This is intentional — D6 ships before D2 in Wave 2; the viewer renders a
  friendly "tool attribution not yet wired" panel until D2 lands.
- **Behavior** (when D2 is present):
  1. Requires `../bin/gsd-t-tool-attribution.cjs`
  2. Calls `aggregateByTool({ projectDir, spawnId })` to compute per-tool rollups
  3. Returns the aggregate as JSON sorted by `attributedTotal` desc

### GET /transcript/:spawnId/kill  (M42)
- **Response**: `{ status, pid? }`
- **Behavior**: sends SIGTERM to the recorded spawn pid (if discoverable)

---

## CLI Interface (when run directly)

```
node gsd-t-dashboard-server.js [options]
  --port   PORT     Listen port (default: 7433)
  --events DIR      Path to events directory (default: .gsd-t/events from cwd)
  --detach          Run as background process, write PID to .gsd-t/dashboard.pid
  --stop            Kill running server (reads .gsd-t/dashboard.pid)
```

## PID File

- **Path**: `.gsd-t/dashboard.pid` (relative to project dir / cwd)
- **Contents**: Process ID as decimal string
- **Written by**: server when started with `--detach`
- **Read by**: command domain to check if server is running; `--stop` to kill process
- **Deleted by**: server on clean shutdown

---

## Module Exports (for testability)

```js
module.exports = {
  startServer(port, eventsDir, htmlPath),     // returns { server, url }
  tailEventsFile(filePath, callback),          // calls callback(eventObj) for each new line
  readExistingEvents(eventsDir, maxEvents),    // returns array of event objects
  parseEventLine(line),                        // returns parsed object or null
  findEventsDir(projectDir),                   // resolves .gsd-t/events/ from cwd or env
  readMetricsData(metricsDir),                 // returns { taskMetrics: [...], rollups: [...] }
  readTranscriptsIndex, writeTranscriptsIndex, // M42 — spawn-id registry
  readIndexEntry, isValidSpawnId,              // M42 — spawn-id validation
  handleTranscriptsList,                       // M42 — GET /transcripts
  handleTranscriptStream, handleTranscriptPage,// M42 — SSE + viewer HTML
  handleTranscriptKill,                        // M42 — GET /transcript/:id/kill
  handleTranscriptToolCost, handleTranscriptUsage,  // M43 D6-T1
  readSpawnUsageRows,                          // M43 D6-T1 helper
  projectScopedDefaultPort, resolvePort,       // multi-project isolation (df34eb2)
  DEFAULT_PORT, transcriptsDir,
}
```

---

## Banner Format (M43 D6-T3)

Every detached spawn from `bin/headless-auto-spawn.cjs` MUST print, on stdout,
one line in exactly this shape:

```
▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}
```

- `{port}` comes from `ensureDashboardRunning().port` when autostart runs, else
  from `projectScopedDefaultPort(projectDir)`.
- `{spawn-id}` is the canonical spawn id returned by `makeSessionId(command, now)`.
- The banner is best-effort: any failure in autostart or port lookup must NOT
  crash the spawn. It is printed BEFORE the child is spawned so it appears
  adjacent to the "gsd-t-headless:" session line.

Consumers (tests, IDE integrations) MAY match on the anchor `▶ Live transcript: `.

---

## Autostart (M43 D6-T4)

Module: `scripts/gsd-t-dashboard-autostart.cjs`

### Contract
```js
ensureDashboardRunning({ projectDir, port?, host? })
  → { port: number, pid: number|null, alreadyRunning: boolean }
```

### Behavior
- Resolves `port` via `projectScopedDefaultPort(projectDir)` if not provided
- Probes whether the port is bound via `_isPortBusySync` — a host-less
  `net.createServer().listen(port)` probe in a short-lived subprocess
  (synchronous contract, O(50ms))
- If busy → returns `{ port, pid: null, alreadyRunning: true }` (no-op)
- If free → fork-detaches the server:
  - `spawn(node, [gsd-t-dashboard-server.js, '--port', port], { cwd: projectDir, detached: true, stdio: 'ignore' })`
  - `child.unref()` so the caller can exit
  - writes `{pid}` to `.gsd-t/.dashboard.pid` (hyphen removed — distinct from
    M38's `.gsd-t/dashboard.pid` which is the user-invoked, foreground-detached
    lifecycle)
- Idempotent: safe to call on every spawn; back-to-back calls don't double-spawn

### Integration points
- `bin/headless-auto-spawn.cjs` calls `ensureDashboardRunning({ projectDir })`
  immediately before printing the banner, so the link is live when a user
  clicks it.

### Deliberate non-goals
- Does NOT replace M38's full `gsd-t dashboard start|stop|status` lifecycle
- Does NOT write structured logs of the child (stdio: 'ignore'); logs are
  viewable via the dashboard server's own HTTP endpoints once it's running

---

## Event Stream Format

Each SSE message body is a JSON-stringified event matching `event-schema-contract.md`:

```json
{"ts":"2026-03-04T12:00:00.000Z","event_type":"command_invoked","command":"gsd-t-execute","phase":"execute","agent_id":"abc123","parent_agent_id":"","trace_id":"xyz","reasoning":"Starting M15 wave","outcome":"success"}
```

Field `parent_agent_id` is empty string (not null) for root-level agents.

---

## Port

- Default: `7433`
- Dashboard connects to `http://localhost:{port}/events`
- Dashboard reads port from URL query param `?port=7433` or uses default
