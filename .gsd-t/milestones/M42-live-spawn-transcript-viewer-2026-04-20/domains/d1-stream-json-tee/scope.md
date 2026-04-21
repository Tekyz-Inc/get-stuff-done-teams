# Domain: d1-stream-json-tee

## Responsibility
Capture the raw stream-json frames from every unattended spawn (supervisor + every child `claude -p`) to `.gsd-t/transcripts/{spawn-id}.ndjson` without disturbing existing token-capture or event-stream flow.

## Owned Files/Directories
- `bin/gsd-t-transcript-tee.cjs` — NEW. Exports `allocateSpawnId({parentId?})`, `openTranscript({spawnId, projectDir, meta})`, `appendFrame({spawnId, projectDir, frame})`, `listTranscripts(projectDir)`, `readTranscriptMeta(projectDir, spawnId)`.
- `bin/gsd-t-token-capture.cjs` — MODIFY. When `spawnFn` is invoked, wrap its stdout pipeline with a line splitter that (a) still parses for usage (existing) and (b) tees each JSON frame to the transcript ndjson via `appendFrame`. For non-stream-json spawns, fall back to a single `{type:"raw",line}` wrapper per chunk.
- `bin/gsd-t-orchestrator-worker.cjs` — MINOR MODIFY. Already stream-json; add `onFrame` branch that calls `appendFrame` when a `transcriptSpawnId` is provided in opts.
- `bin/gsd-t-unattended.cjs` — MINOR MODIFY. When spawning a worker iteration (line ~1204), add `--output-format stream-json --verbose` to args and pipe stdout through a tee hook that writes each line to the transcript ndjson. Allocate a root spawn-id at supervisor startup, persist it to `.gsd-t/supervisor.spawn-id`, and pass via env to children.
- `.gsd-t/transcripts/` — NEW directory (created on demand).
- `.gsd-t/transcripts/.index.json` — registry: `{ spawnId, parentId, command, startedAt, endedAt?, workerPid?, status }` per spawn.
- `test/m42-transcript-tee.test.js` — NEW. Covers: id allocation (root + child), ndjson round-trip, registry writes, tee preserves existing usage parse, non-stream-json fallback, concurrent append safety.

## NOT Owned (do not modify)
- Dashboard server (owned by D2)
- Transcript HTML renderer (owned by D2)
- Sidebar / kill controls (owned by D3)
- Existing event-stream writer (`.gsd-t/events/*.jsonl` — untouched)
- Existing token-log format (append-only, tee does not alter tokens row)
