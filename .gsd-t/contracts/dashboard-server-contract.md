# Dashboard Server Contract

## Owner
`server` domain — `scripts/gsd-t-dashboard-server.js`

## Consumers
- `dashboard` domain — connects to SSE endpoint to receive events
- `command` domain — spawns server as detached child process, reads PID file

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

### GET /stop (optional)
- **Response**: `{"status":"stopping"}`
- **Behavior**: Gracefully shuts down server; used by `gsd-t-visualize stop`

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
}
```

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
