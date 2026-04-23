# Conversation Capture Contract

**Status**: v1.0.0 — M45 D2 (initial release 2026-04-23)
**Sink**: `.gsd-t/transcripts/in-session-{sessionId}.ndjson`
**Producer**: `scripts/hooks/gsd-t-conversation-capture.js` — Claude Code hook script registered for `SessionStart`, `UserPromptSubmit`, `Stop`, and (opt-in) `PostToolUse`.

## Versions

- **v1.0.0** (2026-04-23, M45 D2) — initial schema. Frames: `session_start`, `user_turn`, `assistant_turn`, `tool_use`. File-name prefix `in-session-` is the viewer-left-rail discriminator.

## Why this exists

The orchestrator session's user↔assistant dialog has been invisible in the
visualizer. Only spawned agents show up in the transcript left rail (because
only spawns produce NDJSON via `bin/gsd-t-transcript-tee.cjs`). That means
mid-session compactions, user prompts, and assistant turns never appear in
the same surface as spawned work — satisfying this user-level contract:
"conversation stream visible in visualizer" (see `memory:
feedback_conversation_stream_visible.md`).

M43 D1 already captures per-turn *token usage* for the dialog channel via
`gsd-t-in-session-usage-hook.js`. That hook writes numeric rows into
`.gsd-t/metrics/token-usage.jsonl`. The conversation-capture hook is a
**parallel, independent** writer — it captures *content frames* for the
transcript viewer. Both hooks can (and should) be wired at the same time.

## File naming

```
.gsd-t/transcripts/in-session-{sessionId}.ndjson
```

- `{sessionId}` comes from the Claude Code hook payload's `session_id`. When
  the payload omits a session id, the hook falls back to a deterministic
  per-process id of the form `pid-{sha1(pid:startedAt)[:12]}` so the filename
  is always non-empty.
- The `in-session-` prefix is a **contract with the viewer**. The viewer's
  left rail decides label rendering by checking whether the NDJSON stem starts
  with `in-session-` — no server-side `type` field is required.
- The same prefix is a **contract with the compact-detector**. When the
  detector falls back to in-session target selection (no fresh spawn NDJSON
  exists), it writes the locked `compact_marker` frame into the active
  in-session NDJSON.

## Frame schema (v1.0.0)

Each frame is a JSON object on a single line, UTF-8, newline-terminated.

All frames share these fields:

| Field        | Type         | Required | Notes |
|--------------|--------------|----------|-------|
| `type`       | string enum  | yes      | `session_start` \| `user_turn` \| `assistant_turn` \| `tool_use` \| `compact_marker` (last emitted by the compact-detector, not this hook) |
| `ts`         | ISO-8601 str | yes      | When the hook wrote the frame (hook wall-clock). |
| `session_id` | string       | yes      | Claude Code session id, or the `pid-…` fallback. |

Per-type additive fields:

### `session_start`
Optional marker emitted on `SessionStart`. Exists so the left-rail
discovers the in-session NDJSON immediately, before the first user turn.

No additional fields.

### `user_turn`

| Field        | Type    | Required | Notes |
|--------------|---------|----------|-------|
| `content`    | string  | no       | The user's prompt text. Capped at 16 KB per frame. Absent if the hook payload did not carry the prompt. |
| `truncated`  | boolean | no       | `true` when `content` was truncated to fit the 16 KB cap. Absent means not truncated. |
| `message_id` | string  | no       | Claude Code's message id, when the hook payload carries it. |

### `assistant_turn`

| Field        | Type    | Required | Notes |
|--------------|---------|----------|-------|
| `content`    | string  | no       | The assistant's final message text. Capped at 16 KB. Absent if the hook payload did not carry it (Stop hooks sometimes don't). |
| `truncated`  | boolean | no       | As above. |
| `message_id` | string  | no       | As above. |

A `Stop` event with no assistant content still writes a stub frame with
only `type` + `ts` + `session_id`. The stub matters — it tells the viewer
the turn completed.

### `tool_use` (opt-in)

Written only when the env var `GSD_T_CAPTURE_TOOL_USES=1` is set at hook
invocation time. Default is OFF — full tool payloads would bloat the
NDJSON and the `events/*.jsonl` sink already records them in structured
form.

| Field          | Type   | Required | Notes |
|----------------|--------|----------|-------|
| `name`         | string | no       | Tool name from the hook payload. |
| `tool_use_id`  | string | no       | Correlates with `events/*.jsonl` rows. |
| `duration_ms`  | number | no       | Tool execution duration in milliseconds. |

### `compact_marker`

This hook does NOT emit `compact_marker`. It is emitted by
`scripts/gsd-t-compact-detector.js` (contract:
`compaction-events-contract.md` v1.1.0). The detector's fallback
target-selection may target an `in-session-*.ndjson` when no spawn NDJSON
is fresher — but the frame shape is locked by `compaction-events-contract.md`
and is NOT a v1.0.0 addition here.

## Hook entry points

Registered in `~/.claude/settings.json`:

| Hook event         | Produces frame      | Required |
|--------------------|---------------------|----------|
| `SessionStart`     | `session_start`     | yes      |
| `UserPromptSubmit` | `user_turn`         | yes      |
| `Stop`             | `assistant_turn`    | yes      |
| `PostToolUse`      | `tool_use`          | opt-in (`GSD_T_CAPTURE_TOOL_USES=1`) |

See `templates/CLAUDE-global.md` § "In-Session Conversation Capture" for
the literal settings.json block.

## Session-id resolution

1. **Primary**: `payload.session_id` from the Claude Code hook stdin.
2. **Fallback**: `pid-{sha1(pid + ':' + startedAt)[:12]}` — stable within one
   hook-script invocation, sufficient to keep the filename non-empty. This
   fallback should never fire in practice; it exists so a malformed payload
   does not crash the hook or produce `in-session-.ndjson`.

## Project-dir resolution

The hook writes to `<projectDir>/.gsd-t/transcripts/…`. `projectDir` is
resolved in order:

1. `GSD_T_PROJECT_DIR` env var, if set and `<dir>/.gsd-t` exists.
2. `payload.cwd`, if absolute and `<cwd>/.gsd-t` exists.
3. Walk up from `process.cwd()` (up to 10 levels) looking for
   `.gsd-t/progress.md`.
4. If none: **silent no-op**. The hook must never interrupt a non-GSD-T
   Claude Code session.

## Contract with the viewer

The viewer at `scripts/gsd-t-transcript.html` consumes this producer by:

1. Polling `/transcripts` (or `/api/spawns-index`) for spawn-index rows.
2. For each row, checking whether `spawnId.startsWith('in-session-')`.
3. When true, labeling the left-rail node with `💬 conversation` instead of
   the default `▶ spawn`. CSS class `label-in-session` is applied for
   optional per-theme styling.

No server-side `type` field is required. The filename prefix is the sole
discriminator.

## Contract with the compact-detector

`scripts/gsd-t-compact-detector.js` owns target-selection for the
`compact_marker` frame. M45 D2 adds a **fallback** branch:

1. Existing behavior (unchanged): pick the most-recently-modified NDJSON.
2. New fallback: when no non-`in-session-*` NDJSON has been modified in
   the last 30 seconds AND a fresh `in-session-*.ndjson` exists, target
   that file instead.
3. Log the fallback decision to stderr
   (`compact-detector: targeting in-session-{sessionId}.ndjson (fallback)`)
   so regressions are visible during debugging.

The `compact_marker` frame shape itself is **locked** by
`compaction-events-contract.md` v1.1.0 — M45 D2 does not change it.

## Guardrails

- **Fail-open**: every error is caught, logged to stderr, exit 0. A broken
  capture never kills a Claude Code session.
- **Append-only**: the hook never truncates or rewrites an existing
  in-session NDJSON.
- **Content cap**: 16 KB per frame; over-cap writes carry
  `"truncated": true`.
- **Stdin cap**: 1 MiB defense-in-depth; over-cap drops the write.
- **Path-traversal guard**: resolved output path must stay under
  `<projectDir>/.gsd-t/transcripts/`.
- **Off-switch**: deleting `.gsd-t/` in a project disables the hook for
  that project. Removing the entries from `~/.claude/settings.json`
  disables it globally.

## Consumers (future, not required by this contract)

- The dashboard server may one day emit a `type: "in-session"` field on
  `/api/spawns-index` rows. When it does, the viewer MAY consume that in
  preference to the filename prefix — but the filename prefix remains the
  canonical discriminator.
- Replay / export tooling can treat `in-session-*.ndjson` frames as
  first-class transcript rows alongside spawn-NDJSON frames.
