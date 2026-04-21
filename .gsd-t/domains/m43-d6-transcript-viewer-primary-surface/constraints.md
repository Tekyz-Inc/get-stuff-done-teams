# Constraints: m43-d6-transcript-viewer-primary-surface

## Must Follow

- Zero external runtime deps in the server; zero-build-step HTML/JS in the client (M42 invariant — no webpack, no bundler).
- URL banner prints on **every** spawn path: in-session, headless, unattended worker, subagent.
- Dashboard autostart is **idempotent** — if port 7433 is bound, do nothing; if not, fork-detach and return.
- SSE stream remains the primary data channel — no polling fallback unless the browser lacks EventSource (edge case; ignore for now).
- Performance: tool-cost panel query completes in < 1s for a 2h-old spawn (pre-compute once on first request, cache in server memory).

## Must Not

- Break existing M42 routes (`/transcript/:id`, `/transcript/:id/stream`, `/transcript/:id/kill`).
- Add a build step. No React, no Vue, no bundler.
- Auto-open a browser. The URL is a hint; the user clicks.
- Mutate the events JSONL or token-usage JSONL — read-only consumer.
- Print the URL banner when the spawn is the dashboard server itself (infinite-recursion guard).

## Must Read Before Using

- M42 completed code: `scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-transcript.html`, `scripts/transcript-tee.cjs`.
- `.gsd-t/contracts/dashboard-server-contract.md` — current route list.
- `bin/headless-auto-spawn.cjs` — where the banner slot lives and what vars (`spawn-id`) are in scope.
- D2's export surface (`bin/gsd-t-tool-attribution.cjs::aggregateByTool`) for the panel query.

## Dependencies

- **D6 → D2**: consumes attribution library.
- **D6 ↔ D4**: banner text coordinated; D4 doc-ripples the command files referencing D6's format.

## Acceptance

- Running `/gsd-t-execute` (or any of the 14 flipped commands) prints the live transcript URL before the spawn begins.
- Navigating to `:7433/transcript/{id}` shows the M42 live view + a **Tool Cost** panel populated with D2's attribution for this spawn.
- Dashboard autostart: kill the server, run a command, confirm the server comes back and the URL is reachable.
- `npm test` green (M42 tests still pass, new M43 tests pass).
