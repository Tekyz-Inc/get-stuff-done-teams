# Constraints: metrics-dashboard

## Must Follow
- Zero external dependencies for server (Node.js built-ins only — consistent with existing server)
- Chart.js loaded via CDN in HTML (consistent with React Flow CDN pattern in existing dashboard)
- All server functions <= 30 lines
- Dashboard server must remain under 200 lines total (currently 141 — budget ~59 lines for /metrics)
- GET /metrics must return JSON (not SSE) — it's a snapshot, not a stream
- Chart panel must coexist with existing agent hierarchy + event feed panels
- Dark theme consistency (`#0d1117` background, existing color palette)

## Must Not
- Modify files outside owned scope
- Write to task-metrics.jsonl or rollup.jsonl (read-only consumer)
- Remove or break existing SSE /events endpoint behavior
- Remove or break existing dashboard panels (agent hierarchy, event feed)
- Add npm dependencies to the server
- Exceed 200-line limit for dashboard server (split if needed)

## Must Read Before Using
- `scripts/gsd-t-dashboard-server.js` — understand current server structure, exports, endpoints
- `scripts/gsd-t-dashboard.html` — understand current React Flow + Dagre layout, CDN pattern
- `.gsd-t/contracts/dashboard-server-contract.md` — current server contract to extend
- `.gsd-t/contracts/metrics-schema-contract.md` — schemas for task-metrics.jsonl and rollup.jsonl

## Dependencies
- Depends on: metrics-collection domain (reads task-metrics.jsonl via /metrics endpoint)
- Depends on: metrics-rollup domain (reads rollup.jsonl via /metrics endpoint)
- Depended on by: none (terminal consumer — users view the dashboard)

## External Reference Dispositions
- Chart.js — USE (CDN import, render charts)
- Existing React Flow dashboard — USE (extend, not replace)
