# Tasks: m43-d6-transcript-viewer-primary-surface

## Wave 2 — Parallel with D2, D4, D5

### D6-T1 — Dashboard server new routes — DONE (2026-04-21)
- `GET /transcript/:id/tool-cost` — proxy to `aggregateByTool` from D2; 503 graceful fallback when D2 library (`bin/gsd-t-tool-attribution.cjs`) isn't yet on disk.
- `GET /transcript/:id/usage` — per-turn rows for this spawn from token-usage JSONL. Filters by `row.spawn_id === id` OR (no `spawn_id` column AND `row.session_id === id`) — covers D1 Branch B rows tagged by session id only. Cap 500 rows; `truncated: true` when capped. 400 on invalid id.
- Unit test: `test/m43-dashboard-tool-cost-route.test.js` (9 tests, all pass). Exports added for `handleTranscriptToolCost`, `handleTranscriptUsage`, `readSpawnUsageRows`.

### D6-T2 — Transcript HTML tool-cost panel — DONE (2026-04-21)
- Collapsible sidebar panel `<details class="panel" id="tool-cost-panel" open>` inside `scripts/gsd-t-transcript.html`.
- Shows top-N tools by attributed tokens (tool, calls, tokens, USD cost), sorted desc.
- Fetches `/transcript/:id/tool-cost` on `connect(id)`; debounced 2s refresh on SSE `turn_complete` / `result` frames.
- Live badge span with `.live-badge` class; green when SSE connected, muted when disconnected.
- Graceful "tool attribution not yet wired" message on 503; friendly error row on other failures.
- JS functions `formatTokens`, `renderToolCostPanel`, `renderToolCostError`, `fetchToolCost`, `setToolCostLive`, `scheduleToolCostRefresh` — `window.__gsdtRenderToolCostPanel` exposed for testability.
- DOM test: `test/m43-transcript-panel.test.js` (12 tests, all pass).

### D6-T3 — URL banner in every spawn — DONE (2026-04-21)
- Edit `bin/headless-auto-spawn.cjs` to print `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}` on the detached-spawn path (inside `autoSpawnHeadless`, immediately after autostart). Port sourced from `ensureDashboardRunning().port` with `projectScopedDefaultPort(projectDir)` fallback. Best-effort: banner failures never crash the spawn.
- The `watch=true, spawnType=primary` in-context-fallback branch returns before the banner block — no spawn id is generated there, so a banner would be meaningless. This matches the task brief's "every spawn" scope (every spawn that *starts a detached child*).
- Test: `test/m43-url-banner.test.js` (3 tests, all pass).

### D6-T4 — Dashboard autostart — DONE (2026-04-21)
- New `scripts/gsd-t-dashboard-autostart.cjs` — synchronous port probe via short-lived subprocess (`_isPortBusySync` runs `net.createServer().listen(port)` — host-less so it matches the server's IPv6-wildcard bind on macOS dual-stack) → fork-detach `spawn(node, [server.js, '--port', port], {detached:true, stdio:'ignore'})` + `child.unref()` + pid-file write at `.gsd-t/.dashboard.pid` (distinct from M38's `.gsd-t/dashboard.pid` — dot vs. hyphen).
- Hooked into `autoSpawnHeadless` spawn start path. Idempotent: back-to-back calls don't double-spawn (second call sees EADDRINUSE and returns `alreadyRunning: true`). Silent if already running.
- Test: `test/m43-dashboard-autostart.test.js` (6 tests, all pass). Uses `pickFreePort` in the 45000 port range to avoid collisions with other tests' 19000-19999 range.

### D6-T5 — Contract bump — DONE (2026-04-21)
- `.gsd-t/contracts/dashboard-server-contract.md` v1.1 → v1.2.0:
  - New §HTTP Endpoints entries for `/transcript/:id/tool-cost` (incl. 503 fallback semantics) and `/transcript/:id/usage` (incl. session-id fallback + truncation).
  - New §Banner Format section with exact line shape + recommended regex anchor (`▶ Live transcript: `).
  - New §Autostart section documenting `ensureDashboardRunning` contract, behavior, integration point, and deliberate non-goals.
  - Module-exports table extended with the new handlers, `readSpawnUsageRows`, and the port helpers.

### D6-T6 — Doc ripple — DONE (2026-04-21)
- `README.md` — added "Live Transcript as Primary Surface (M43 D6, v3.16.13)" bullet under the Headless-by-Default bullet.
- `GSD-T-README.md` — does not exist in this repo; only `README.md`. No action required.
- `.gsd-t/progress.md` Decision Log — full D6 entry appended with implementation details, test counts, suite results, files touched.
- `.gsd-t/domains/m43-d6-transcript-viewer-primary-surface/tasks.md` — this file, DONE markers.
