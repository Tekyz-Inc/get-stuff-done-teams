# Constraints: server

## Must Follow
- Zero external npm dependencies — Node.js built-ins only: `http`, `fs`, `path`, `url`, `os`
- All functions ≤ 30 lines (split if longer — CLAUDE.md convention)
- File ≤ 200 lines total
- module.exports required for all testable functions (enables unit tests without spawning server)
- Symlink protection: check `lstatSync` before reading event files (same pattern as gsd-t-heartbeat.js)
- Silent failure on missing events files — server stays running if .gsd-t/events/ doesn't exist
- SSE encoding: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- CORS header: `Access-Control-Allow-Origin: *` (localhost only, not a security concern)
- Detachable: support `--detach` flag, write PID to `.gsd-t/dashboard.pid` when detached
- Port: default 7433, configurable via `--port` flag

## Must Not
- Import or require any files outside Node.js built-ins
- Modify `.gsd-t/events/*.jsonl` files (read-only access)
- Import `gsd-t-event-writer.js` (server reads events files directly; event-writer is for writing)
- Exceed 200 lines

## SSE Server API (per dashboard-server-contract.md)
- `GET /` → serve `gsd-t-dashboard.html` from same directory as server script
- `GET /events` → SSE stream of events from `.gsd-t/events/*.jsonl`
- `GET /ping` → `{"status":"ok"}` health check
- Event format: `data: {JSON-stringified event}\n\n`
- Tail behavior: send existing events on connect, then stream new ones as files are written

## Must Read Before Using
- `.gsd-t/contracts/event-schema-contract.md` — event format and field definitions
- `scripts/gsd-t-heartbeat.js` — lstatSync symlink guard pattern (lines ~140-160)
- `scripts/gsd-t-event-writer.js` — resolveEventsFile() pattern for finding events dir

## Dependencies
- Depends on: nothing (independent — creates the foundation)
- Depended on by: dashboard domain (connects to /events SSE endpoint), command domain (spawns server process)

## External References (locked dispositions)
- `scripts/gsd-t-dashboard-mockup.html` → INSPECT — read for color scheme and UI patterns only
- Node.js built-ins → USE
