# Domain: m47-d2-server-helpers

## Responsibility

Extend `scripts/gsd-t-dashboard-server.js` with the helpers M47's viewer needs:

1. Add a `status` field to entries returned by `listInSessionTranscripts` (and propagated through `handleTranscriptsList`). Status is one of `active` | `completed`, derived from mtime: `active` if mtime within the last 30 seconds, otherwise `completed`. (Failure / kill detection is intentionally out of scope for M47 — `success` vs `failed` vs `killed` granularity is reserved for a future milestone; D1 renders all completed as `completed` until a future status-source upgrade.)
2. Add a new endpoint `GET /api/main-session` that returns the most-recently-modified `in-session-*.ndjson` filename (path-traversal-validated) so the viewer's top pane can default-load without a list+sort dance.

Adds regression tests covering the new field and endpoint to `test/dashboard-server.test.js`.

## Owned Files/Directories

- `scripts/gsd-t-dashboard-server.js` — additive changes only (new helper, new endpoint, extra field on existing helper return shape; no field removed, no endpoint renamed)
- `test/dashboard-server.test.js` — new test cases appended; existing 7 viewer-route/HTML tests preserved
- `.gsd-t/contracts/dashboard-server-contract.md` — version bump to 1.3.0 documenting `status` field + `/api/main-session`

## NOT Owned (do not modify)

- `scripts/gsd-t-transcript.html` — owned by D1
- `templates/gsd-t-transcript.html` — owned by D1
- `scripts/hooks/gsd-t-conversation-capture.js` — M45 D2; the NDJSON producer side of the contract
- `bin/gsd-t.js` — installer; M47 doesn't change install
- Any contract other than `dashboard-server-contract.md`

## Files It Reads (informational, not modified)

- `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0 — to confirm the `in-session-*.ndjson` filename pattern + sessionId sanitizer
- Existing `listInSessionTranscripts` / `handleTranscriptsList` — additive changes preserve all current return-shape fields
