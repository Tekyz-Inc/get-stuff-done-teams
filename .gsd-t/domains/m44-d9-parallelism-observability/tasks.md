# M44-D9 — Parallelism Observability — Tasks

## Wave 3 (parallel-safe with D2, D3, D8 — sequencing: lands AFTER D8 writer protocol)

- [x] **M44-D9-T1** — `bin/parallelism-report.cjs` module + contract (commit `e0a4410`)
  - Pure module exporting `computeParallelismMetrics({projectDir, wave?})` returning `{activeWorkers, readyTasks, parallelism_factor, gate_decisions, color_state, lastSpawnAt, full_report_md}`
  - Reads `.gsd-t/spawns/*.json` (D8 plan files), `.gsd-t/events/YYYY-MM-DD.jsonl` (D4/D5/D6 events), `.gsd-t/token-log.md` (D7 cw_id rows), `.gsd-t/partition.md` (wave structure), `.gsd-t/domains/*/tasks.md` (ready-task counting)
  - Silent-fail on malformed inputs (log to stderr, continue with partial data)
  - Color-state computation per the table in scope.md (worst-of per-signal)
  - `full_report_md` generates markdown post-mortem on demand
  - Contract `.gsd-t/contracts/parallelism-report-contract.md` v1.0.0 documents metric definitions, color thresholds, report shape
  - touches: `bin/parallelism-report.cjs`, `.gsd-t/contracts/parallelism-report-contract.md`

- [x] **M44-D9-T2** — Dashboard endpoints (this commit)
  - `scripts/gsd-t-dashboard-server.js` adds `GET /api/parallelism` (returns current metrics)
  - Adds `GET /api/parallelism/report?wave=N` (returns markdown post-mortem)
  - Both endpoints additive — no changes to existing endpoints
  - 5-second response cache to avoid repeated file I/O on rapid panel polls
  - touches: `scripts/gsd-t-dashboard-server.js`

- [x] **M44-D9-T3** — Transcript renderer panel (this commit)
  - `scripts/gsd-t-transcript.html` adds parallelism panel below D8's two-layer task panel (right column) OR as left column (decide during build based on layout)
  - CSS: panel scrollable, color border driven by `color_state` (green/yellow/red/dimmed)
  - JS: poll `/api/parallelism` every 5s; render `activeWorkers`, `readyTasks`, `parallelism_factor`, gate decision tally, color border
  - Full Report button: `<button onclick="downloadReport()">📄 Full Report</button>` → fetches `/api/parallelism/report?wave=current` and either downloads as `.md` or opens in modal
  - Stop Supervisor button: invokes existing `/gsd-t-unattended-stop` endpoint (NEW addition: dashboard server proxies to the existing CLI command — additive endpoint)
  - touches: `scripts/gsd-t-transcript.html`

- [x] **M44-D9-T4** — Tests + doc ripple (this commit)
  - `test/m44-d9-parallelism.test.js` — covers all 6 test scenarios from scope.md "Tests" section
  - `docs/architecture.md` — Observability subsection: "Parallelism Panel (M44 D9)" with data-flow diagram and color-state table
  - `commands/gsd-t-help.md` — single-line note in observability section
  - `.gsd-t/progress.md` — Decision Log entry on D9 landing
  - touches: `test/m44-d9-parallelism.test.js`, `docs/architecture.md`, `commands/gsd-t-help.md`, `.gsd-t/progress.md`
