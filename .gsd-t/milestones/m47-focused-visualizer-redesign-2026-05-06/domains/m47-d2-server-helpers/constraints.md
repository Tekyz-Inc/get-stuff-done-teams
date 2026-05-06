# Constraints: m47-d2-server-helpers

## Must Follow

- All changes additive. The existing return shape of `listInSessionTranscripts` and `handleTranscriptsList` keeps every current field; M47 only **adds** `status`.
- `status` derivation: `active` if `Date.now() - mtimeMs < 30_000`, else `completed`. The 30s window is documented in the contract bump.
- `/api/main-session` returns `{ filename: string | null, sessionId: string | null, mtimeMs: number | null }` — `null` when no `in-session-*.ndjson` exists yet (graceful empty state).
- Apply the same `isValidSpawnId` / sessionId sanitizer used in M45 D2 path-traversal guard before returning any filename. Never return a filename containing `/`, `..`, or anything outside `[A-Za-z0-9_.-]`.
- Tests run via Node's built-in test runner (`npm test`) — no new test framework, no new dev dependency.
- Bump `dashboard-server-contract.md` to **1.3.0** (additive — minor bump per semver), documenting the new field + endpoint with their full schemas.

## Must Not

- Touch `scripts/gsd-t-transcript.html` or `templates/gsd-t-transcript.html` — D1's territory.
- Add a websocket, change SSE wire format, or alter the existing `/events` / `/transcript/:spawnId/stream` endpoints.
- Add a runtime npm dependency — installer is zero-dep; the dashboard server inherits that constraint.
- Compute richer status (`success` / `failed` / `killed`) — that requires a status-source the in-session hook doesn't currently produce; explicitly out of scope for M47.
- Cache `/api/main-session` results — viewer hits this on page load + reload; a stale cache would defeat the "zero clicks within 3s" success criterion.

## Must Read Before Using (Black Box Items)

- `scripts/gsd-t-dashboard-server.js::listInSessionTranscripts` (added in v3.20.13) — to extend without breaking shape
- `scripts/gsd-t-dashboard-server.js::handleTranscriptsList` — to confirm where merged entries are emitted
- `scripts/gsd-t-dashboard-server.js::isValidSpawnId` — the path-traversal guard added in M45 D2 Red Team fix
- `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0 — `in-session-{sessionId}.ndjson` filename rule
- `test/dashboard-server.test.js` (existing 7 cases) — pattern + helpers used by current viewer-route tests

## Dependencies

- **Depended on by D1 for**: the `status` field (rail badges) and `/api/main-session` (top-pane default load).
- **Depends on**: nothing in M47.

## Integration Checkpoint

D2 must publish `status` + `/api/main-session` before D1 wires top-pane default load and rail badges. D1 task that scaffolds split-pane HTML can start in parallel with D2; D1 tasks that consume the new endpoint/field gate on D2's publish.
