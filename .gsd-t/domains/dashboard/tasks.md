# Tasks: dashboard

## Summary
Build `scripts/gsd-t-dashboard.html` — a single self-contained HTML file (≤200 lines) that connects to the SSE server, renders agent hierarchy using React Flow v11 + Dagre via CDN, displays live event feed with outcome color coding, and auto-reconnects on disconnect.

## Tasks

### Task 1: Create gsd-t-dashboard.html
- **Files**:
  - `scripts/gsd-t-dashboard.html` (create — single self-contained HTML/JS/CSS file)
- **Contract refs**:
  - `.gsd-t/contracts/dashboard-server-contract.md` — SSE endpoint format, event field names, port default 7433
  - `.gsd-t/contracts/event-schema-contract.md` — event schema (ts, event_type, parent_agent_id, agent_id, outcome, command, phase, reasoning)
- **Must read before implementing**:
  - `.gsd-t/contracts/dashboard-server-contract.md` — SSE event format, port query param
  - `.gsd-t/contracts/event-schema-contract.md` — all event field names and types
  - `scripts/gsd-t-dashboard-mockup.html` — INSPECT ONLY: read for color scheme (--bg:#0d1117, --surface:#161b22), layout structure, and CSS variables — do NOT copy code
- **Dependencies**: NONE (parallel-safe with server Task 1 — different files)
- **Acceptance criteria**:
  - File ≤ 200 lines total (HTML + embedded JS + embedded CSS)
  - No `require()`, no `import`, no npm packages — React Flow v11 and Dagre loaded via CDN `<script>` tags only
  - Dark theme CSS variables matching mockup: `--bg:#0d1117`, `--surface:#161b22`
  - Outcome color coding: green `#3fb950` = success, red `#f85149` = failure, yellow `#d29922` = learning or deferred
  - SSE connection: connects to `http://localhost:{port}/events` where port comes from URL query param `?port=7433` or defaults to 7433
  - Auto-reconnect: on SSE `error` or `close` event, retry connection after 3 seconds
  - Agent hierarchy: builds React Flow node graph from `parent_agent_id` field — root nodes are those with no `parent_agent_id` (empty string or null); child nodes connect to parent by `agent_id` → `parent_agent_id`
  - Live event feed: displays most recent events at top; max 200 entries kept in memory; each entry shows `ts`, `event_type`, `command`, `outcome` color-coded
  - No external state: all data from SSE stream only; no localStorage, no sessionStorage, no cookies
  - Dashboard is stateless: reconnecting replays from server's existing events (server sends history on connect per contract)
  - Page title and heading: "GSD-T Agent Dashboard"
  - CDN URLs to use: React from `https://unpkg.com/react@17/umd/react.production.min.js`, ReactDOM from `https://unpkg.com/react-dom@17/umd/react-dom.production.min.js`, ReactFlow from `https://unpkg.com/reactflow@11/dist/reactflow.cjs.js` (or equivalent CDN), Dagre from `https://unpkg.com/dagre@0.8.5/dist/dagre.min.js`
  - Note: React Flow v11 works with React 17. Use the actual stable CDN URLs — verify the file exists at the CDN before hardcoding.
  - Agent nodes render: agent_id (short), event count badge, outcome color
  - Dashboard handles SSE events of all types (renders type + reasoning in event feed)

## Execution Estimate
- Total tasks: 1
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 1 (Checkpoint 1 — shared with server domain)
