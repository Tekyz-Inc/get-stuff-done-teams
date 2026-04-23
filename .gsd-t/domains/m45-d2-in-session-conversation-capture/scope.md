# Domain: m45-d2-in-session-conversation-capture

## Purpose

Capture the orchestrator session's conversational turns (user prompts, assistant replies, tool uses) into a transcript NDJSON that the viewer's left rail lists alongside spawn entries, labeled distinctly. Extend the compact-detector so mid-conversation compactions land in the active in-session NDJSON (not a random spawn file). This makes mid-session compactions visible in the same UI surface as spawned work, satisfying the user's contract "conversation stream visible in visualizer" (memory: `feedback_conversation_stream_visible.md`).

## Files This Domain Owns

- `scripts/hooks/gsd-t-conversation-capture.js` *(new — hook script; SessionStart / UserPromptSubmit / Stop / PostToolUse)*
- `scripts/gsd-t-compact-detector.js` *(additive — fallback target-selection when no spawn NDJSON is most-recently-modified)*
- `scripts/gsd-t-transcript.html` *(additive — left-rail labeling: `💬 conversation` vs `▶ spawn`)*
- `templates/CLAUDE-global.md` *(additive — settings.json hook block documentation that points at the new hook script)*
- `.gsd-t/contracts/conversation-capture-contract.md` *(new v1.0.0 — frame schema, file naming, hook entry points, session-id source)*
- `test/m45-d2-conversation-capture.test.js` *(new)*
- `test/m45-d2-compact-detector-in-session-fallback.test.js` *(new)*
- `test/m45-d2-transcript-left-rail-in-session.test.js` *(new)*

## Files This Domain Does NOT Touch

- `scripts/gsd-t-dashboard-server.js` — D1 owns. If the server needs a route-level change to surface the new NDJSON files to the left rail, prefer to make the left rail derive it from `/api/spawns-index` (which already reads the `.gsd-t/transcripts/` directory) — no server change needed. If a change IS required, schedule it as a separate follow-up or fold into D1.
- `test/transcripts-html-page.test.js` — D1 owns.

## Boundary Notes

- The orchestrator session's `session_id` source: Claude Code's SessionStart hook delivers a session id; reuse it. Fallback: hash of `pid + startedAt` if the hook payload is unavailable.
- File naming: `.gsd-t/transcripts/in-session-{sessionId}.ndjson`. The `in-session-` prefix is the discriminator the viewer left-rail uses to label entries as `💬 conversation`.
- Spawn IDs for in-session entries: reuse `sessionId` as the "spawn-id" for viewer-routing purposes. The viewer's `/transcript/:id/stream` SSE endpoint already tails any ndjson in `.gsd-t/transcripts/` matching `{id}.ndjson` (verify) — so `in-session-{sessionId}` becomes a valid `:id` that streams correctly.

## Contracts Consumed

- `.gsd-t/contracts/stream-json-sink-contract.md` v1.2.0 — read-only (dialog-channel hook entry point already formalized).
- `.gsd-t/contracts/compaction-events-contract.md` v1.1.0 — read-only (compact_marker frame shape).

## Contracts Produced / Updated

- **New**: `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0 — defines the in-session NDJSON frame schema, the file-naming convention, the hook entry points, and the session-id source.
