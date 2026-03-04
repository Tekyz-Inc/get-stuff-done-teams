# Tasks: server

## Summary
Build `scripts/gsd-t-dashboard-server.js` — a zero-dependency Node.js SSE server that tails `.gsd-t/events/*.jsonl` files and streams events to browser clients, serves `gsd-t-dashboard.html`, and writes its PID when started with `--detach`. All functions exported for testability; unit tests in `test/dashboard-server.test.js`.

## Tasks

### Task 1: Create gsd-t-dashboard-server.js and unit tests
- **Files**:
  - `scripts/gsd-t-dashboard-server.js` (create — zero-dep Node.js SSE server)
  - `test/dashboard-server.test.js` (create — unit tests for all module exports)
- **Contract refs**: `.gsd-t/contracts/dashboard-server-contract.md` (all endpoints, PID file, module exports, event stream format)
- **Must read before implementing**:
  - `.gsd-t/contracts/dashboard-server-contract.md` — HTTP endpoints spec, module exports signature, event format
  - `.gsd-t/contracts/event-schema-contract.md` — event field names (ts, event_type, parent_agent_id, etc.)
  - `scripts/gsd-t-heartbeat.js` lines ~60-70 and ~214-221 — lstatSync symlink guard pattern to reuse
  - `scripts/gsd-t-event-writer.js` — resolveEventsFile() pattern for finding events dir
  - `scripts/gsd-t-dashboard-mockup.html` — INSPECT color scheme and UI patterns (do not copy code)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File ≤ 200 lines total; all functions ≤ 30 lines (split if needed)
  - Zero external npm dependencies — only: `http`, `fs`, `path`, `url`, `os`, `child_process`
  - Module exports: `startServer(port, eventsDir, htmlPath)`, `tailEventsFile(filePath, callback)`, `readExistingEvents(eventsDir, maxEvents)`, `parseEventLine(line)`, `findEventsDir(projectDir)`
  - `GET /` → serves `gsd-t-dashboard.html` from same directory as server script (200 on success, 404 if file not found)
  - `GET /events` → SSE stream: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`; on connect: send up to 500 existing events from `.gsd-t/events/*.jsonl` newest-file-first; then tail for new JSONL lines; keepalive comment every 15s (`: keepalive\n\n`)
  - `GET /ping` → `{"status":"ok","port":{port}}`
  - `GET /stop` → `{"status":"stopping"}`, graceful server shutdown
  - `--detach` flag: forks itself as background process, writes PID to `.gsd-t/dashboard.pid`, parent exits
  - `--port PORT` flag: configurable port (default 7433)
  - `--events DIR` flag: configurable events directory (default `.gsd-t/events` from cwd)
  - Symlink protection on all JSONL file reads: `try { if (fs.lstatSync(fp).isSymbolicLink()) return/skip; } catch { /* safe */ }`
  - Silent failure: if `.gsd-t/events/` does not exist, server stays running and serves no historical events (no crash)
  - SSE event format per contract: `data: {JSON-stringified event}\n\n` (each event on its own line)
  - Unit tests cover: `parseEventLine` (valid JSON, invalid JSON, empty string, whitespace-only), `readExistingEvents` (multiple JSONL files, empty dir, dir missing), `findEventsDir` (cwd-based resolution), `startServer` (returns server object and url string, server responds to /ping), `tailEventsFile` (invokes callback for each new line appended to file)
  - All existing 153 tests still pass after adding new tests

## Execution Estimate
- Total tasks: 1
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 1 (Checkpoint 1 — shared with dashboard domain)
