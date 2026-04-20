# Tasks: d4-stream-feed-server

## Summary
Localhost ws server that ingests stream-json from D1 workers via HTTP POST, persists to durable JSONL, broadcasts to D5 UI clients. Zero Claude calls. Built only if D0 benchmark PASSES.

## Tasks

### Task 1: Inspect existing agent-dashboard server, decide promote vs rewrite
- **Files**: `scripts/gsd-t-agent-dashboard-server.js` (EXISTING, untracked — inspect only), `.gsd-t/progress.md` (Decision Log entry)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: BLOCKED BY d0-speed-benchmark Task 3 (gate)
- **Wave**: 3
- **Acceptance criteria**:
  - Read the existing 424-LOC file end-to-end
  - Compare its ingest transport, persistence, broadcast, and port handling against `stream-json-sink-contract.md`
  - Write a Decision Log entry: `[d4-existing-code-disposition] PROMOTE | SALVAGE | REWRITE — rationale: ...`
  - If PROMOTE: rename to `scripts/gsd-t-stream-feed-server.js`, `git add`, no functional changes in this task
  - If SALVAGE: note which modules (WS framer, HTTP handler, file writer) to reuse; Task 2 does the rewrite
  - If REWRITE: note what to avoid from the old file; Task 2 writes fresh

### Task 2: Implement stream-feed server
- **Files**: `scripts/gsd-t-stream-feed-server.js` (NEW or PROMOTED from Task 1)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 3
- **Acceptance criteria**:
  - HTTP POST `/ingest?workerPid={pid}&taskId={id}` accepts chunked line-delimited JSON; each line parsed as one frame
  - WS endpoint `/feed` broadcasts frames to all connected clients; supports `?from=N` replay
  - Persist-before-broadcast: every accepted frame append-written to `.gsd-t/stream-feed/YYYY-MM-DD.jsonl` BEFORE ws push
  - Rotates JSONL at UTC midnight
  - Bind `127.0.0.1` only; reject non-loopback connections at `socket.on('connection')`
  - Port default 7842; `--port N` override; `GSD_T_STREAM_FEED_PORT` env override
  - Backpressure: per-client 1000-frame buffer; slow clients get `{type:"kicked",reason:"backpressure"}` frame and disconnect
  - Zero external deps — uses node `http`, `net`, `fs`, `events` only (WS frame hand-rolled)

### Task 3: Stream-feed client (orchestrator-side push helper)
- **Files**: `bin/gsd-t-stream-feed-client.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 2
- **Wave**: 3
- **Acceptance criteria**:
  - Exports `createStreamFeedClient({ port, workerPid, taskId })` → `{ pushFrame(frame), close() }`
  - Opens a single keep-alive HTTP POST to `/ingest` with chunked transfer encoding; each `pushFrame` writes one line
  - On server unreachable: switches to spool mode, writes to `.gsd-t/stream-feed/spool-{pid}.jsonl`
  - On `close()`: flushes any buffered lines, closes the HTTP stream
  - Unit-tested against a minimal test server: normal path, unreachable path (spool), restart path (spool resumes streaming)

### Task 4: Add `stream-feed` subcommand to main CLI
- **Files**: `bin/gsd-t.js` (MODIFY — additive subcommand)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 2
- **Wave**: 3
- **Acceptance criteria**:
  - `gsd-t stream-feed start [--port N]` launches the server
  - `gsd-t stream-feed status` prints pid + port + frame count if running
  - `gsd-t stream-feed stop` gracefully shuts down
  - `gsd-t --help` lists `stream-feed` subcommand
  - Does not break any existing subcommand

### Task 5: Server + client unit tests
- **Files**: `test/m40-stream-feed-server.test.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Tasks 2 & 3
- **Wave**: 3
- **Acceptance criteria**:
  - Ingest: 100 frames via HTTP POST → all appear in JSONL
  - Broadcast: connect 2 ws clients, ingest 10 frames → both receive all 10 in order
  - Replay: connect client with `?from=5` → client receives frames 5..end, then live
  - Persist-before-broadcast: crash the broadcast path mid-flight; JSONL still has the frame
  - Localhost enforcement: attempt connect from non-loopback (mock) → rejected
  - All tests pass under `node --test`

### Task 6: Token aggregator — per-task + per-worker usage rollup
- **Files**: `scripts/gsd-t-token-aggregator.js` (NEW), `.gsd-t/metrics/token-usage.jsonl` (WRITTEN at runtime), `.gsd-t/contracts/stream-json-sink-contract.md` (MODIFY — add §"Usage field propagation" documenting `{type:"assistant"}.usage` semantics and `{type:"result"}.usage` aggregate)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 2 (reads the JSONL the stream-feed-server persists)
- **Wave**: 3
- **Acceptance criteria**:
  - Reads `.gsd-t/stream-feed/YYYY-MM-DD.jsonl` (or any JSONL path, --feed-log flag)
  - Parses every frame; on `{type:"assistant"}` extracts `usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}`; on `{type:"result"}` extracts aggregate + `costUSD` + `num_turns`
  - Groups by: `workerPid` (per-spawn), `taskId` (per-task), `wave` (per-wave), `domain` (per-domain), `milestone` (per-milestone, inferred from orchestrator state.json)
  - Appends per-task rows to `.gsd-t/metrics/token-usage.jsonl` (schema v1: ts, workerPid, taskId, domain, wave, milestone, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD, numTurns, durationMs)
  - Updates the corresponding row in `.gsd-t/token-log.md` — finds the row by `(command, start datetime, task)` match and overwrites the `Tokens` column with real counts (formatted `in=N out=N cr=N cc=N $X.XX`)
  - Runs in two modes: `--tail` (follow the JSONL live, update as frames arrive) and `--once` (one-shot scan, exit)
  - Unit tests: fixture JSONL with 2 assistant frames + 1 result frame → correct rollup; missing `usage` field → logged as `partial`, not fatal; malformed JSON → logged, skipped
  - Zero external deps — node `fs`, `readline` only

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 0 (all gated on D0 PASS)
- Blocked tasks (waiting on other domains): 1 (Task 1 on D0)
- Blocked tasks (within domain): 5
- Estimated checkpoints: 1 (inspect-decide in Task 1 is a small internal checkpoint)
