# Domain: m43-d6-transcript-viewer-primary-surface

> **Revised 2026-04-21**: Original scope framed the viewer as a "default surface for non-trivial commands" with URL hints alongside an in-session option. Under D4's channel-separation model, the viewer is **the** surface — there is no in-session alternative for command work. D6 now owns "make the visualizer feel primary, not optional," including auto-launch on first spawn.

## Responsibility

Promote the M42 transcript viewer (`http://127.0.0.1:7433/transcript/{spawn-id}`) from "useful for unattended runs" to **the** primary watching surface for all command work. Every spawn prints the URL because that's where the work lives now. The dashboard auto-launches on first spawn if not already running.

Also: add a **per-spawn tool-cost panel** backed by D2's `gsd-t tool-cost` library so that operators see attributed cost in the same pane as the live transcript.

## Owned Files/Directories

- `scripts/gsd-t-dashboard-server.js` — EDIT. Add routes:
  - `GET /transcript/:id/tool-cost` → JSON, proxied to `bin/gsd-t-tool-attribution.cjs`.
  - `GET /transcript/:id/usage` → JSON, per-turn usage for this spawn from `.gsd-t/metrics/token-usage.jsonl`.
- `scripts/gsd-t-transcript.html` — EDIT. Add:
  - Tool-cost panel in the sidebar (collapsible, top-N tools by attributed tokens for this spawn).
  - "Live" badge when SSE is still receiving frames.
  - Mobile viewport meta tag + responsive panel layout (the current single-column layout already mostly works; tune panel width at breakpoints).
- `bin/headless-auto-spawn.cjs` — EDIT (coordinate with D4). Add the URL banner print:
  - Text: `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}` (port resolved via the project-hashed default from `df34eb2`).
  - Print at every spawn, no flags, no opt-out.
  - If dashboard server not running, auto-launch it via `gsd-t-dashboard-autostart.cjs` (below) before printing.
- `scripts/gsd-t-dashboard-autostart.cjs` — NEW. On spawn, if the project's port is not bound, start the dashboard server in the background and return once it's listening (or after a short timeout). Idempotent — safe to call on every spawn. Uses the same `projectScopedDefaultPort(projectDir)` helper from `df34eb2` so each project lands on its own port without collision.
- `test/m43-dashboard-tool-cost-route.test.js` — NEW. HTTP tests against the new routes.
- `test/m43-transcript-panel.test.js` — NEW. DOM-level assertion on the tool-cost panel rendering (use existing M42 test pattern).
- `test/m43-dashboard-autostart.test.js` — NEW. Tests:
  - Port already bound → no-op, returns immediately.
  - Port free → spawns server, polls `/ping` until ok.
  - Idempotent — second call while first is starting doesn't double-spawn.

## NOT Owned

- Per-tool attribution algorithm — D2 (D6 calls `bin/gsd-t-tool-attribution.cjs` as a library, does not reimplement).
- Per-turn usage writer — D1.
- Schema — D3.
- Dialog growth meter — D5.
- Command-file spawn-mode decision text — D4 (D6 adds the URL banner in `headless-auto-spawn.cjs`, which is the single spawn entry-point).
- Project-hashed port helper — already shipped in `df34eb2`; D6 reuses it.

## Contract Surface

- `dashboard-server-contract.md` — BUMP to reflect new routes (`/transcript/:id/tool-cost`, `/transcript/:id/usage`) and the auto-launch invariant.
- Banner text format owned by D6 and referenced by D4's command-file ripple.
- Reference: `headless-default-contract.md` v2.0.0 — D6's URL print is part of the always-spawn contract.

## Consumers

- End users watching command runs (the visualizer is now *the* surface).
- `gsd-t status` surfaces the transcript URL of the current active spawn.

## Dependencies

- **D6 → D2**: tool-cost panel calls D2's attribution library. Wave 2 co-deploy.
- **D6 → D1/D3**: per-turn usage route reads the JSONL D1 writes in D3's v2 shape.
- **D6 ⊥ D4/D5**: parallel; the URL banner is added in D6 but lands at the same spawn-site D4 simplifies. Coordinate via small merge if both touch `headless-auto-spawn.cjs` in the same wave.

## Why this changed shape

Under the revised model, the visualizer isn't "an option you can use if you want scroll-back" — it's the primary observability surface. That promotion implies (a) auto-launch (don't make the user start it), (b) URL printed every time (no conditional banner), and (c) the panel inside the visualizer carries enough context (tool cost, usage) to be a real working surface, not just a transcript reader.
