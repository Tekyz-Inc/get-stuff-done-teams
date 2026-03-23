# Tasks: metrics-dashboard

## Summary
Extend the existing dashboard server with a GET /metrics endpoint serving metrics JSON, and add a Chart.js metrics visualization panel to the dashboard HTML with trend lines and domain health heatmap.

## Tasks

### Task 1: Add GET /metrics endpoint to dashboard server
- **Files**: `scripts/gsd-t-dashboard-server.js`
- **Contract refs**: dashboard-server-contract.md (HTTP endpoints), metrics-schema-contract.md (JSONL schemas)
- **Dependencies**: BLOCKED by metrics-collection Task 2 (task-metrics.jsonl must exist), BLOCKED by metrics-rollup Task 1 (rollup.jsonl must exist)
- **Acceptance criteria**:
  - GET /metrics returns JSON with `{ taskMetrics: [...], rollups: [...] }` from .gsd-t/metrics/ JSONL files
  - Content-Type: application/json
  - Returns empty arrays if JSONL files don't exist (graceful fallback)
  - Server stays under 200 lines total (currently 154 — budget ~46 lines)
  - Existing endpoints (/events, /ping, /stop, /) not modified
  - Module exports updated: add `readMetricsData(metricsDir)` to exports
  - Zero external dependencies maintained

### Task 2: Add Chart.js metrics panel to dashboard HTML
- **Files**: `scripts/gsd-t-dashboard.html`
- **Contract refs**: dashboard-server-contract.md, metrics-schema-contract.md
- **Dependencies**: Requires Task 1 (GET /metrics endpoint must exist)
- **Acceptance criteria**:
  - Chart.js loaded via CDN (consistent with existing React Flow CDN pattern)
  - Metrics panel added alongside existing agent hierarchy and event feed panels
  - Trend line chart: first_pass_rate over milestones (from rollups)
  - Domain health heatmap: per-domain first_pass_rate, avg_duration_s, fix_cycles
  - ELO score display: current ELO with delta from previous milestone
  - Dark theme consistency (#0d1117 background, existing color palette)
  - Existing dashboard panels (agent hierarchy, event feed) not removed or broken
  - Data fetched from GET /metrics endpoint on page load + periodic refresh

## Execution Estimate
- Total tasks: 2
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 — blocked by metrics-collection + metrics-rollup)
- Estimated checkpoints: 1 (after Task 1 — verify /metrics endpoint returns correct JSON before building charts)
