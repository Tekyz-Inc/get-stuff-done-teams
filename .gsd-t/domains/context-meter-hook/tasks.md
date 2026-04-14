# Tasks: context-meter-hook

## Summary

Implement the `gsd-t-context-meter` PostToolUse hook: parse Claude Code transcript JSONL → reconstruct messages array → call count_tokens API → compare against threshold → emit additionalContext when exceeded. Writes state file for token-budget to consume. Must fail open on every error path.

## Tasks

### Task 1: Transcript parser (scripts/context-meter/transcript-parser.js)
- **Files**: `scripts/context-meter/transcript-parser.js` (new), `scripts/context-meter/transcript-parser.test.js` (new)
- **Contract refs**: `context-meter-contract.md` — hook I/O section (`transcript_path` input)
- **Dependencies**: BLOCKED by context-meter-config Task 1 (contract finalized — CP1)
- **Acceptance criteria**:
  - Exports `parseTranscript(transcriptPath)` returning `{ system, messages }` shaped for the count_tokens request body
  - Reads the JSONL file line by line (no loading the whole file at once — transcripts can be large)
  - Reconstructs messages array: pairs `tool_use` with corresponding `tool_result` entries by id
  - Tolerates unknown event types gracefully (skips with a no-op)
  - Top-of-file doc comment documents the observed JSONL line shape (at least one real transcript read and annotated) — Claude Code's format is undocumented upstream per the constraint
  - On unreadable file / malformed JSON: returns `null` (caller treats as "bail out, fail open")
  - Unit tests with fixture JSONL files covering: normal conversation, tool_use/result pairing, malformed line in the middle (skipped), empty file, nonexistent file
  - Zero external deps (built-in `fs`, `readline`)

### Task 2: count_tokens client (scripts/context-meter/count-tokens-client.js)
- **Files**: `scripts/context-meter/count-tokens-client.js` (new), `scripts/context-meter/count-tokens-client.test.js` (new)
- **Contract refs**: `context-meter-contract.md` — count_tokens API usage section
- **Dependencies**: BLOCKED by context-meter-config Task 1 (contract finalized — CP1)
- **Acceptance criteria**:
  - Exports `countTokens({ apiKey, model, system, messages, timeoutMs })` returning `{ inputTokens }` or `null` on failure
  - Uses Node's built-in `https` module (zero deps)
  - Sends headers: `x-api-key: {apiKey}`, `anthropic-version: 2023-06-01`, `content-type: application/json`
  - POSTs to `https://api.anthropic.com/v1/messages/count_tokens`
  - Hard timeout honored via `req.setTimeout(timeoutMs)` → returns `null` on timeout
  - 401 / 403 / 429 / 5xx → returns `null` (caller treats as fail-open, logs error)
  - NEVER logs the request body contents — only status code and error category
  - Unit tests with a local stub HTTP server (built-in `http` module): happy path (200 → tokens), 401, 429, timeout, malformed response JSON

### Task 3: Threshold + additionalContext builder (scripts/context-meter/threshold.js)
- **Files**: `scripts/context-meter/threshold.js` (new), `scripts/context-meter/threshold.test.js` (new)
- **Contract refs**: `context-meter-contract.md` — threshold mapping
- **Dependencies**: BLOCKED by context-meter-config Task 1 (CP1)
- **Acceptance criteria**:
  - Exports `computePct({ inputTokens, modelWindowSize })` returning the percentage (0–100, float)
  - Exports `bandFor(pct)` returning one of `"normal" | "warn" | "downgrade" | "conserve" | "stop"` per the token-budget-contract bands
  - Exports `buildAdditionalContext({ pct, modelWindowSize, thresholdPct })` returning the exact additionalContext string from the contract when `pct >= thresholdPct`, or `null` otherwise
  - Unit tests covering every band boundary, the `thresholdPct` gate, and the string format

### Task 4: Hook entry point (scripts/gsd-t-context-meter.js)
- **Files**: `scripts/gsd-t-context-meter.js` (new), `scripts/gsd-t-context-meter.test.js` (new)
- **Contract refs**: `context-meter-contract.md` — hook I/O section; `token-budget-contract.md` — state file shape
- **Dependencies**: Requires Task 1 (parser), Task 2 (client), Task 3 (threshold), BLOCKED by context-meter-config Task 3 (loader)
- **Acceptance criteria**:
  - Reads PostToolUse JSON payload from stdin; extracts `transcript_path`
  - Loads config via `bin/context-meter-config.cjs` (relative to `process.cwd()`)
  - Reads/increments `checkCount` in the state file (atomic write)
  - If `checkCount % checkFrequency !== 0` → writes updated counter, emits `{}`, exits 0
  - If API key env var unset → logs diagnostic to `logPath`, writes state with `lastError`, emits `{}`, exits 0
  - On check frequency hit: parses transcript → calls count_tokens → computes pct → updates state file
  - Writes `.gsd-t/.context-meter-state.json` atomically (temp+rename) with all required fields per contract
  - Emits `{ additionalContext: "..." }` to stdout if `pct >= thresholdPct`, else `{}`
  - Total execution time under normal circumstances: < 200ms (excluding the count_tokens network call itself, which is bounded by `timeoutMs`)
  - Every error path returns `{}` — never throws, never exits non-zero
  - Unit tests mock fs, https (via stub server), and stdin; cover: check-frequency skip, missing API key, happy path under threshold, happy path over threshold, transcript parse failure, API timeout, state file corruption (overwrites with defaults)
  - **CP2 is satisfied** when this task's unit tests pass → unblocks installer-integration and token-budget-replacement's real-count tests

### Task 5: End-to-end integration harness for the hook
- **Files**: `scripts/gsd-t-context-meter.e2e.test.js` (new)
- **Contract refs**: `context-meter-contract.md` — full hook I/O round trip
- **Dependencies**: Requires Tasks 1–4
- **Acceptance criteria**:
  - Spins up a local stub HTTP server mimicking `/v1/messages/count_tokens` with configurable `input_tokens`
  - Creates a fake transcript JSONL in `os.tmpdir()`
  - Runs `node scripts/gsd-t-context-meter.js` as a child process with stdin payload
  - Asserts stdout JSON shape (empty vs. additionalContext)
  - Asserts state file on disk matches expected shape
  - Cleanup in afterEach — no leaked tempdirs or state files
  - Tests both below-threshold and above-threshold scenarios
