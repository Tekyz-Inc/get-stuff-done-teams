# Tasks: m43-d6-transcript-viewer-primary-surface

## Wave 2 — Parallel with D2, D4, D5

### D6-T1 — Dashboard server new routes
- `GET /transcript/:id/tool-cost` — proxy to `aggregateByTool` from D2.
- `GET /transcript/:id/usage` — per-turn rows for this spawn from token-usage JSONL.
- Unit test: `test/m43-dashboard-tool-cost-route.test.js`.

### D6-T2 — Transcript HTML tool-cost panel
- Collapsible sidebar panel showing top-N tools by attributed tokens.
- Live badge while SSE connected.
- DOM test: `test/m43-transcript-panel.test.js`.

### D6-T3 — URL banner in every spawn
- Edit `bin/headless-auto-spawn.cjs` to print `▶ Live transcript: http://127.0.0.1:7433/transcript/{spawn-id}` on both branches.
- Coordinate text with D4 (command-file ripple).

### D6-T4 — Dashboard autostart
- New `scripts/gsd-t-dashboard-autostart.cjs` — port-check → fork-detach.
- Hook into spawn start path. Idempotent, silent if already running.

### D6-T5 — Contract bump
- `.gsd-t/contracts/dashboard-server-contract.md` — document new routes + banner format.

### D6-T6 — Doc ripple
- README.md + GSD-T-README.md — add "Live transcript viewer" subsection under M43.
- Progress Decision Log.
