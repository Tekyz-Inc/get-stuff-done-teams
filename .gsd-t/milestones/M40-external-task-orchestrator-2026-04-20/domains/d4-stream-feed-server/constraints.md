# Constraints: d4-stream-feed-server

## Must Follow
- Zero external npm runtime deps. Use node built-ins (`http`, `net`, `fs`, `events`). No `ws` library — hand-roll the RFC 6455 frame if needed (existing 424-LOC dashboard already does this; inspect it).
- Localhost-only bind. `127.0.0.1`, never `0.0.0.0`. Reject non-localhost connections at the TCP layer.
- Persist-before-broadcast. A frame that is broadcast but not written is a crash hazard (D6 recovery depends on JSONL).
- Rotate JSONL by date. Never append to yesterday's file.
- Backpressure: if a ws client lags, buffer up to 1000 frames per client, then drop that client. Do NOT drop the producer — orchestrator writes always succeed.

## Must Not
- Spawn a Claude process. Ever. This server exists to save Claude tokens.
- Call external network. Localhost-only, no analytics, no telemetry beaconing.
- Read the orchestrator's `.gsd-t/orchestrator/state.json` — D6's job. D4 only knows about frames it receives.
- Reinterpret stream-json semantically. Pass frames through opaque. (UI interprets; server transports.)
- Start automatically when GSD-T installs. Operator must invoke `gsd-t stream-feed start` explicitly.

## Gate Semantics
- D4 does NOT execute until D0 speed-benchmark returns PASS. D0 FAIL → D4 deferred.

## Must Read Before Using
- `scripts/gsd-t-agent-dashboard-server.js` (existing 424-LOC untracked) — potential reuse candidate.
- `.gsd-t/contracts/stream-json-sink-contract.md` — protocol to consume.
- `.gsd-t/contracts/event-schema-contract.md` — existing event patterns to avoid colliding with.

## Dependencies
- Depends on: D1 (producer), D3 (task-boundary event shape references completion-signal).
- Depended on by: D5 (UI).
