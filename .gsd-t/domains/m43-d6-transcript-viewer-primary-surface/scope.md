# Domain: m43-d6-transcript-viewer-primary-surface

## Responsibility

Promote the M42 transcript viewer (`http://127.0.0.1:7433/transcript/{spawn-id}`) from "useful for unattended runs" to the **default surface for any non-trivial command**. Every spawn — in-session OR headless — prints a dashboard URL hint that the user can click to watch live.

Also: add a **per-spawn tool-cost panel** backed by D2's `gsd-t tool-cost` library. (The panel surface is owned here; the query comes from D2.)

## Owned Files/Directories

- `scripts/gsd-t-dashboard-server.js` — EDIT. Add routes:
  - `GET /transcript/:id/tool-cost` → JSON, proxied to `bin/gsd-t-tool-attribution.cjs`.
  - `GET /transcript/:id/usage` → JSON, per-turn usage for this spawn from `.gsd-t/metrics/token-usage.jsonl`.
- `scripts/gsd-t-transcript.html` — EDIT. Add:
  - Tool-cost panel in the sidebar (collapsible, shows top-N tools by attributed tokens for this spawn).
  - "Live" badge when SSE is still receiving frames.
  - Mobile viewport meta tag + responsive panel layout (the current single-column layout already mostly works; tune panel width at breakpoints).
- `bin/headless-auto-spawn.cjs` — EDIT (coordinate with D4). Add the URL banner print:
  - Text: `▶ Live transcript: http://127.0.0.1:7433/transcript/{spawn-id}`
  - Print for both in-session and headless starts.
  - If dashboard server not running, print a one-liner hint to start it.
- `scripts/gsd-t-dashboard-autostart.cjs` — NEW (optional). On spawn, if port 7433 is not bound, start the dashboard server in the background and return. Idempotent; safe to call on every spawn.
- `test/m43-dashboard-tool-cost-route.test.js` — NEW. HTTP tests against the new routes.
- `test/m43-transcript-panel.test.js` — NEW. DOM-level assertion on the tool-cost panel rendering (use existing M42 test pattern).

## NOT Owned

- Per-tool attribution algorithm — D2 (D6 calls `bin/gsd-t-tool-attribution.cjs` as a library, does not reimplement).
- Per-turn usage writer — D1.
- Schema — D3.
- Compaction-pressure signal — D5.
- Command-file spawn-mode decision text — D4 (D6 adds the URL banner in `headless-auto-spawn.cjs`, which is the single spawn entry-point).

## Contract Surface

- `dashboard-server-contract.md` — BUMP to reflect new routes.
- Banner text format owned by D6 and referenced by D4's command-file ripple.

## Consumers

- End users watching long-running commands.
- `gsd-t status` surfaces the transcript URL of the current active spawn.

## Dependencies

- **D6 → D2**: tool-cost panel calls D2's attribution library. Wave 2 co-deploy.
- **D6 → D1/D3**: per-turn usage route reads the JSONL D1 writes in D3's v2 shape.
