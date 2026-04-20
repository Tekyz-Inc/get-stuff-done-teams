# Domain: d4-stream-feed-server

## Responsibility
A node + ws server that receives stream-json frames from every active D1 worker, persists them as JSONL, and serves a websocket feed to the D5 UI. Zero Claude token cost (never spawns a Claude process). Localhost-only.

## Owned Files/Directories
- `scripts/gsd-t-agent-dashboard-server.js` — existing 424-LOC untracked file; D4 inspects, adapts if it already fits, otherwise rewrites. Ported to `scripts/gsd-t-stream-feed-server.js` (rename if existing file doesn't meet the contract).
- `bin/gsd-t-stream-feed-client.cjs` — tiny client the orchestrator uses to push frames to the server (stdout pipe → unix socket or local http post — contract decides)
- `.gsd-t/stream-feed/YYYY-MM-DD.jsonl` — durable backlog (one file per day)
- `test/m40-stream-feed-server.test.js` — unit tests: frame ingest, JSONL persistence, ws broadcast, backpressure

## NOT Owned (do not modify)
- `bin/gsd-t-orchestrator*.js` (D1 — producer)
- `scripts/gsd-t-agent-dashboard.html` (D5 — UI)
- `bin/gsd-t-unattended.cjs`

## Protocol
- **Ingest**: D1 workers' stdout stream-json frames arrive via local transport (decided by `stream-json-sink-contract.md`). Server parses line-delimited JSON.
- **Persist**: every frame append-written to `.gsd-t/stream-feed/YYYY-MM-DD.jsonl` before broadcast. Durable before visible.
- **Broadcast**: websocket message per frame to all connected UI clients. Back-fill on connect: replay today's JSONL, then switch to live.
- **Task-boundary events**: D1 emits synthetic `{type: "task-boundary", taskId, state: "start"|"done"|"failed"}` frames; server persists + broadcasts them.

## Port Ownership
- Default `7842`. Configurable via `--port`. Collisions log and exit non-zero (operator decides).

## Existing Code Disposition
- `scripts/gsd-t-agent-dashboard-server.js` (untracked, 424 LOC): **INSPECT** (not USE) at first read; if its transport and schema already match this contract, promote to D4 artifact. If they don't, rewrite. Decision recorded in Decision Log after inspection.
