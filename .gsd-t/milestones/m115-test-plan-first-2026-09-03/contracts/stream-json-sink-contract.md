# Stream JSON Sink Contract — v1.1.0

**Milestone**: M40 — External Task Orchestrator
**Producer**: d1-orchestrator-core (worker stdout)
**Relay**: d4-stream-feed-server
**Consumer**: d5-stream-feed-ui

## Purpose
Defines the framing, transport, and persistence of stream-json flowing from D1 workers → D4 server → D5 UI.

## Frame Format

Line-delimited JSON (one JSON object per line). Frames are Claude Code's native stream-json output from `claude -p --output-format stream-json`, PLUS synthetic task-boundary frames emitted by the orchestrator.

### Native Claude frames (passed through opaque)
- `{type: "assistant", ...}`
- `{type: "user", ...}`
- `{type: "tool_use", id, name, input}`
- `{type: "tool_result", tool_use_id, content}`
- `{type: "result", ...}` (worker final result)

### Synthetic orchestrator frames (added by D1)
```json
{
  "type": "task-boundary",
  "taskId": "d1-t3",
  "domain": "d1-orchestrator-core",
  "wave": 2,
  "state": "start" | "done" | "failed",
  "ts": "2026-04-19T17:30:00.000Z",
  "workerPid": 12345
}
```

Every worker spawn emits a `start` boundary before first Claude frame; every exit emits `done` or `failed` after last frame.

## Transport (D1 → D4)

Option locked in by partition: **line-delimited JSON over a local HTTP POST stream** (chunked transfer) to `http://127.0.0.1:{D4_PORT}/ingest?workerPid={pid}&taskId={id}`.
- Rationale: http is already node-builtin; named pipes differ across platforms (Windows).
- Orchestrator pipes each worker's stdout through a small node script that http-POSTs line-buffered chunks.
- On D4 unreachable: orchestrator logs a warning and spools frames to `.gsd-t/stream-feed/spool-{pid}.jsonl`; D4 ingests the spool on next start.

## Persistence (D4)

- `.gsd-t/stream-feed/YYYY-MM-DD.jsonl` — append-only, one file per UTC date.
- Every frame is persisted BEFORE ws broadcast. Persist-fail = drop frame + log (don't crash server).
- File rotation at UTC midnight.

## Broadcast (D4 → D5)

- WebSocket at `ws://127.0.0.1:{D4_PORT}/feed`.
- On connect, server replays today's JSONL from line 0, then switches to live tail.
- Client can request replay-from-line via `?from=N` query param.
- Backpressure: server buffers up to 1000 frames per ws client; slow clients get dropped with a `{type: "kicked", reason: "backpressure"}` final frame.

## Port
- Default `7842`. Collision → exit non-zero. Env `GSD_T_STREAM_FEED_PORT` overrides.

## Security
- 127.0.0.1 only. Reject non-loopback at TCP accept.
- No auth (localhost-only, single-user).
- No CORS (localhost-only).

## Usage field propagation (D4-T6)

Claude Code's stream-json emits `usage` in two places with different semantics:

### `{type: "assistant"}.message.usage`
Per-assistant-turn usage. Fields:
- `input_tokens` — prompt input for this turn (NOT a running total)
- `output_tokens` — assistant output for this turn
- `cache_read_input_tokens` — cache-hit portion of input
- `cache_creation_input_tokens` — cache-miss portion creating new cache entries

Multiple `assistant` frames arrive per task. Aggregators SHOULD sum these as a progress signal, but the sum is NOT authoritative — Claude's own accounting lives in the result frame.

### `{type: "result"}.usage`
Final aggregate for the entire worker turn. Same field names as above, but represents the authoritative total. Also present at top level of the result frame:
- `total_cost_usd` (preferred) or `cost_usd` — dollar cost
- `num_turns` — agent turn count
- `duration_ms` — wall-clock run time

### Aggregator behavior (gsd-t-token-aggregator)
1. Assistant frames accumulate running totals keyed by `(workerPid, taskId)` from the most recent `task-boundary state=start`.
2. When the `result` frame arrives, its `usage` OVERWRITES the accumulated totals (result is authoritative).
3. A task with no `result` frame is marked `partial: true` in the aggregate output.
4. Output schema v1: `.gsd-t/metrics/token-usage.jsonl` — one line per task with `schemaVersion`, `workerPid`, `taskId`, `domain`, `wave`, `milestone`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`, `numTurns`, `durationMs`, `startTs`, `endTs`, `state`, `assistantFrames`, `partial`.
5. `.gsd-t/token-log.md` Tokens column is rewritten as `in=N out=N cr=N cc=N $X.XX` (or `—` when cost unknown), matched by taskId.

## Versioning
- Frame schema changes: bump minor if additive, major if breaking.
- Transport changes: bump major.
- **v1.1.0** — added Usage field propagation section (D4-T6, 2026-04-20).
