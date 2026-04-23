# Constraints: m45-d2-in-session-conversation-capture

## Must Preserve

- The spawn NDJSON writer (`bin/gsd-t-transcript-tee.cjs` and callers) is unchanged. In-session capture is an ADDITIVE writer — new file-name prefix, new hook entry point. Zero edits to the existing spawn-capture path.
- The compact-detector's current behavior (append `compact_marker` to the most-recently-modified spawn NDJSON) stays the default. D2 only adds a *fallback* branch: when the most-recently-modified NDJSON is an `in-session-*` file (or when no spawn NDJSON exists), write to the active in-session NDJSON instead.

## Must Read Before Using

- `scripts/gsd-t-compact-detector.js` — specifically the NDJSON target-selection block (~line 160–200) and the `append compact_marker` function. D2 extends the target selector; it does NOT rewrite the appender.
- `scripts/hooks/gsd-t-in-session-usage-hook.js` — existing hook that captures per-turn token usage. D2's new hook follows the same structural pattern (stdin JSON payload, write to `.gsd-t/metrics/token-usage.jsonl` or similar). Copy the hook-payload-parsing helper, do not reinvent.
- `scripts/gsd-t-transcript.html` — specifically the left-rail tree renderer (`byId.set(s.spawnId, ...)` around line 452) and the `pollSpawns()` / `/api/spawns-index` fetch. D2 adds a badge + label discriminator based on a new field on the returned spawn row (e.g., `type: "in-session"` vs the default `type: "spawn"`).
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.2.0 — confirm the dialog-channel hook entry-point contract before implementing.
- `templates/CLAUDE-global.md` — existing hook block format, insertion point (grep for `SessionStart` in the template).

## Must NOT Do

- Do NOT silently overwrite an existing `in-session-{sessionId}.ndjson` file. Append-only.
- Do NOT capture tool-result payloads verbatim if they exceed a reasonable size (cap `content` at e.g. 16 KB per frame; truncate with a `truncated: true` marker). Full payloads live in events/*.jsonl.
- Do NOT depend on `/api/spawns-index` being pre-aware of in-session files — if necessary, extend the index builder. But grep first: the existing index may already list everything in `.gsd-t/transcripts/` regardless of filename prefix. (If so, D2 just needs a front-end label discriminator.)
- Do NOT modify the `compact_marker` frame shape — it is locked by `compaction-events-contract.md` v1.1.0.
- Do NOT block the SessionStart hook on slow I/O — any file writes must be non-blocking-safe (the hook has a short deadline; failing the hook kills the session).

## Hook-Payload Handling

- SessionStart: capture `session_id`, write a synthetic `session_start` frame (or use the first `user_turn` as the implicit start).
- UserPromptSubmit: write one `user_turn` frame with the prompt text as `content`.
- Stop: write one `assistant_turn` frame with the assistant's final message as `content` (if available in the payload; otherwise write an `assistant_turn` stub with a `ts` only).
- PostToolUse: OPTIONAL — write one `tool_use` frame. If the payload is too large to inline, write a summary frame and point at the events/*.jsonl row by `tool_use_id`.

Treat all four hook types as independent entry points in the same script; dispatch on `hook_event_name` from the stdin JSON.

## Doc Ripple

- `templates/CLAUDE-global.md` — add a new hook-block row wiring `scripts/hooks/gsd-t-conversation-capture.js` to SessionStart / UserPromptSubmit / Stop / PostToolUse. The template is replicated into `~/.claude/settings.json` at install/update time by the CLI; the live settings.json is **not** edited by D2 directly (that's the user's per-install state).
- `docs/architecture.md` — append a subsection "In-Session Conversation Capture (M45 D2)" under the Observability section, with a short data-flow diagram: Claude Code hook → capture script → NDJSON → viewer left rail.
- `.gsd-t/contracts/conversation-capture-contract.md` — new contract, v1.0.0, owned by D2.
- `.gsd-t/progress.md` Decision Log — one timestamped entry per task.
