# Constraints: dashboard

## Must Follow
- File ≤ 200 lines total (single self-contained HTML file with embedded JS/CSS)
- React Flow and Dagre loaded via CDN script tags — no npm install, no build step
- Use same CDN pattern as reference mockup: reactflow@11 and dagre from unpkg/cdn
- Color scheme: match mockup (dark theme — `--bg:#0d1117`, `--surface:#161b22`)
- Outcome color coding: green (#3fb950) = success, red (#f85149) = failure, yellow (#d29922) = learning/deferred
- SSE connection: connect to `http://localhost:{port}/events` (port from URL query param or default 7433)
- Auto-reconnect: on SSE disconnect, retry after 3s
- Agent hierarchy: build from `parent_agent_id` field in events — root nodes have no parent
- Live event feed: most recent events at top, max 200 entries in memory
- No external state: dashboard is stateless — all data from SSE stream only

## Must Not
- Include any npm imports or require() statements
- Exceed 200 lines
- Modify any server-side files
- Use WebSocket (SSE is sufficient and simpler)
- Persist data to localStorage or other storage

## Must Read Before Using
- `.gsd-t/contracts/dashboard-server-contract.md` — SSE endpoint format, event field names
- `.gsd-t/contracts/event-schema-contract.md` — event schema (ts, event_type, parent_agent_id, etc.)
- `scripts/gsd-t-dashboard-mockup.html` → INSPECT — read color scheme, layout structure, CSS variables

## Dependencies
- Depends on: server domain (SSE endpoint at /events)
- Depended on by: command domain (installs this file)

## External References (locked dispositions)
- React Flow via CDN → USE (script tag only)
- Dagre via CDN → USE (script tag only)
- `scripts/gsd-t-dashboard-mockup.html` → INSPECT (design reference, do not copy code)
