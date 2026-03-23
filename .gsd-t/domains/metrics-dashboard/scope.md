# Domain: metrics-dashboard

## Responsibility
Extend the existing dashboard (M15) with a metrics visualization panel. Add a `/metrics` endpoint to the dashboard server. Render Chart.js trend lines and domain health heatmap in the dashboard HTML.

## Owned Files/Directories
- `scripts/gsd-t-dashboard-server.js` — MODIFY: add GET /metrics endpoint serving metrics JSON
- `scripts/gsd-t-dashboard.html` — MODIFY: add Chart.js metrics panel (trend line + domain heatmap)

## NOT Owned (do not modify)
- `bin/metrics-collector.js` — owned by metrics-collection domain
- `bin/metrics-rollup.js` — owned by metrics-rollup domain
- `.gsd-t/metrics/task-metrics.jsonl` — written by metrics-collection domain (read-only here)
- `.gsd-t/metrics/rollup.jsonl` — written by metrics-rollup domain (read-only here)
- `commands/gsd-t-visualize.md` — no changes needed (already launches dashboard)
- `commands/gsd-t-metrics.md` — owned by metrics-commands domain
