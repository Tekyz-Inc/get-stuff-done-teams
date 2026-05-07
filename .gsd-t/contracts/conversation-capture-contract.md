# Conversation Capture Contract

**Status**: v1.2.0 — project-dir resolution decodes `transcript_path` slug for parallel-session routing (M53b fix 2026-05-07)
**Sink**: `.gsd-t/transcripts/in-session-{sessionId}.ndjson`
**Producer**: `scripts/hooks/gsd-t-conversation-capture.js` — Claude Code hook script registered for `SessionStart`, `UserPromptSubmit`, `Stop`, and (opt-in) `PostToolUse`.

## Versions

- **v1.2.0** (2026-05-07) — project-dir resolution adds session-specific slug-decode. Two parallel Claude Code sessions sharing one node-runtime hook process previously misrouted frames: `process.cwd()` / `payload.cwd` resolve to whichever project the hook process inherited, not the per-session project root. The hook now decodes `payload.transcript_path` (`~/.claude/projects/{slug}/{sid}.jsonl`) by extracting the slug and DFS-walking the filesystem to the matching project root that contains `.gsd-t/`. Slug encoding is `path.replace(/\//g, '-')` with a leading `-` for the leading `/`; literal hyphens in directory names (e.g. `Move-Zoom-Recordings-to-GDrive`) are disambiguated by consulting the disk. Path-traversal slugs (`..`, `/`, `\0`) are rejected. Walk-up from `process.cwd()` remains as last-resort fallback but now logs a one-line stderr warning so misroutes are diagnosable. Schema unchanged.
- **v1.1.0** (2026-05-07) — assistant-body extraction protocol. Stop hook payload from Claude Code does NOT carry the assistant body — it carries `transcript_path`. The hook now reads the latest non-sidechain `type:"assistant"` row from the tail of the transcript JSONL and concatenates all `text`-type content blocks. Path is locked to `~/.claude/projects/` (path-traversal guard). Tail-read cap 64 KB. Falls through to legacy payload shapes (`assistant_message`, `message.content`, `content`) for non-Claude-Code payloads / tests. Schema is unchanged from v1.0.0 — same `assistant_turn` frame, just populated where v1.0.0 was bodyless. Frames written by v1.0.0 hooks remain readable; new frames carry real content.
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
| `content`    | string  | no       | The assistant's final message text. Capped at 16 KB. v1.1.0+: extracted from `payload.transcript_path` (Claude Code Stop hook). Absent only when transcript-read fails AND no fallback shape is present. |
| `truncated`  | boolean | no       | As above. |
| `message_id` | string  | no       | As above. |

#### Assistant-body extraction protocol (v1.1.0+)

`_extractAssistantContent(payload)` resolves in this order:

1. **Primary** — `payload.transcript_path`:
   - Path must be absolute and resolve under `${HOME}/.claude/projects/`. Any
     other root → reject (path-traversal guard).
   - Read the last 64 KB of the file (sufficient for one assistant turn even
     at the 16 KB content cap with headroom). Do NOT load the whole file —
     transcripts can be multi-MB.
   - Drop a leading mid-line partial (split on `\n`, discard the head if the
     read started past offset 0).
   - Scan lines from the bottom up; for each line: try `JSON.parse`, skip
     parse failures (corrupt line).
   - Match the latest row with `type === 'assistant'` AND `isSidechain !== true`.
     Sidechain rows are subagent transcripts that share the orchestrator
     JSONL — they belong to a different session.
   - Body extraction: if `message.content` is a string, use it directly;
     otherwise iterate `message.content` (array of blocks) and concatenate
     ALL blocks where `b.type === 'text'`. Ignore `tool_use`, `tool_result`,
     `thinking`, etc. — those are separate `tool_use` frames.
   - If a candidate row has zero `text` blocks (tool_use-only turn), keep
     scanning earlier rows.
2. **Fallback** — `payload.assistant_message` (string).
3. **Fallback** — `payload.message.content` (string).
4. **Fallback** — `payload.content` (string).
5. **None matched** → return `null`. Hook still writes a stub frame.

A `Stop` event whose payload has no `transcript_path` AND no fallback shape
still writes a stub frame with only `type` + `ts` + `session_id`. The stub
matters — it tells the viewer the turn completed.

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

## Project-dir resolution (v1.2.0+)

The hook writes to `<projectDir>/.gsd-t/transcripts/…`. `projectDir` is
resolved in order:

1. **`GSD_T_PROJECT_DIR` env var**, if set and `<dir>/.gsd-t` exists. Operator
   override; preserved for tests and explicit redirection.
2. **`payload.transcript_path` slug-decode** — REQUIRED for correct routing
   under parallel Claude Code sessions sharing one node-runtime hook process.
   Algorithm:
   - Validate `transcript_path` is absolute and lives under
     `${HOME}/.claude/projects/`. (Reuses the v1.1.0 path-traversal guard.)
   - Extract the first path segment after `projects/` as the slug (e.g.
     `-Users-david-projects-GSD-T`).
   - Reject slugs containing `..`, `/`, `\\`, or `\0`.
   - Reject slugs not starting with `-` (must encode the leading `/`).
   - DFS-walk the filesystem from `/`: at each level, greedily consume 1+
     `-`-separated tokens as a directory name; prefer fewer tokens (more `/`
     separators) so deeper, more-specific paths win; first leaf whose
     `.gsd-t/` directory exists is returned.
   - This handles project names containing literal `-` (e.g.
     `Move-Zoom-Recordings-to-GDrive`) — the disk is the oracle for
     disambiguation.
3. **`payload.cwd`**, if absolute and `<cwd>/.gsd-t` exists. Used when the
   payload doesn't carry a `transcript_path` (e.g. SessionStart on older
   Claude Code builds).
4. **Walk up from `process.cwd()`** (up to 10 levels) looking for
   `.gsd-t/progress.md`. Last resort. **Known unreliable** for parallel
   sessions sharing a hook process — emits a one-line stderr warning when
   it fires so misroutes are diagnosable.
5. If none: **silent no-op**. The hook must never interrupt a non-GSD-T
   Claude Code session.

### Why slug-decode is priority 2 (and not 1)

`GSD_T_PROJECT_DIR` is an explicit operator/test signal — it must win. After
that, `transcript_path` is the only **session-specific** signal: it identifies
which Claude Code session generated the payload, not which project the hook
process happens to be running under. Cwd-based fallbacks are session-agnostic
and therefore unsafe under parallel sessions.

### Defenses against slug-decode pitfalls

| Failure mode | Defense |
|--------------|---------|
| Slug used literally as a directory name (no `-`→`/` decode) | Decoder always walks the filesystem; never returns the literal slug path |
| Slug points at a non-GSD-T directory (decoded path lacks `.gsd-t/`) | DFS only returns leaves where `.gsd-t/` exists; missing target → fall through to next priority |
| Naive `-`→`/` replacement on literal-hyphen project names | DFS tries multiple token-count splittings per level; consults the disk to disambiguate |
| Path-traversal injection (`-..-etc-passwd`) | Slug pre-checked for `..`, `/`, `\\`, `\0` before DFS |
| Pathological slug with many dashes (combinatoric explosion) | DFS prunes via `fs.existsSync` at each level; in practice 1–3 fs calls per segment |

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
