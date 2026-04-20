# Tasks: d1-token-capture-wrapper

## Summary
Build the single reusable module every GSD-T spawn call site uses to parse Claude's result envelope, extract real token usage, and append a fully-populated row to `.gsd-t/token-log.md` + `.gsd-t/metrics/token-usage.jsonl`. Zero deps, `.cjs` extension. Wave 1 foundation — everything else in M41 depends on this.

## Tasks

### Task 1: Token capture wrapper module
- **Files**: `bin/gsd-t-token-capture.cjs` (NEW)
- **Contract refs**: `metrics-schema-contract.md`, `stream-json-sink-contract.md`
- **Dependencies**: NONE (M40 D4 already shipped)
- **Wave**: 1
- **Acceptance criteria**:
  - Exports `captureSpawn({command, step, model, description, projectDir, spawnFn, domain?, task?}) → Promise<{result, usage, rowWritten}>`
  - Records `T_START = Date.now()` + `DT_START = "YYYY-MM-DD HH:MM"` before invoking `spawnFn`
  - Prints model banner to stdout: `⚙ [${model}] ${command} → ${description}`
  - Awaits `spawnFn()` — caller supplies the Task/spawn invocation
  - Extracts `usage` via `_parseUsageFromResult(result)` handling both bare `{usage}` and wrapped `{result:{usage}}` shapes; returns `undefined` when neither shape matches
  - Resolves `ctxPct` via `try { require('./token-budget.cjs').getSessionStatus(projectDir).pct } catch { 'N/A' }`
  - Calls `recordSpawnRow({...})` (see Task 2) with computed fields
  - Returns `{result, usage, rowWritten}`
  - Exposes `_parseUsageFromResult(result) → usage | undefined` as a testable export
  - Zero external npm deps (verified in Task 3 via file-parse check)

### Task 2: Row writer
- **Files**: `bin/gsd-t-token-capture.cjs` (same file as Task 1)
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 1
- **Acceptance criteria**:
  - Exports `recordSpawnRow({projectDir, command, step, model, startedAt, endedAt, usage, domain, task, ctxPct, notes})`
  - Computes `durationSec = Math.round((endMs - startMs) / 1000)` from `startedAt`/`endedAt`
  - Ensures `.gsd-t/token-log.md` exists with new header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |` — detects old header (no Tokens column) and upgrades in place, preserving existing rows
  - Formats Tokens cell: `in=${in} out=${out} cr=${cr} cc=${cc} $${cost.toFixed(2)}` when usage present, `—` when absent (never `0`, never `N/A`)
  - Atomic append to token-log.md via `fs.appendFileSync` with correct EOL handling
  - Appends JSONL record to `.gsd-t/metrics/token-usage.jsonl` using M40 D4 schema v1 (imports `scripts/gsd-t-token-aggregator.js` helpers when exported; else inlines same shape)
  - Returns `{tokenLogPath, jsonlPath}`
  - If spawn errored upstream, writes row with `Notes = "spawn_error: {reason}"` so failures are visible in dashboards

### Task 3: Unit tests
- **Files**: `test/m41-token-capture.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Tasks 1 and 2
- **Wave**: 1
- **Acceptance criteria**: 12+ unit tests covering:
  - `_parseUsageFromResult` on bare `{usage: {...}}`, wrapped `{result: {usage: {...}}}`, `{content: [...], usage: {...}}`, missing usage returns `undefined`
  - `captureSpawn` happy path calls `spawnFn` once, records row with real usage, returns the result untouched
  - `captureSpawn` missing-usage path writes `—` row and returns `usage: undefined`
  - `captureSpawn` `spawnFn` throws → row still written with `Notes="spawn_error: ..."`, error re-thrown
  - `recordSpawnRow` creates new `.gsd-t/token-log.md` with correct header when missing
  - `recordSpawnRow` upgrades old header schema in place (detect + preserve existing rows)
  - `recordSpawnRow` appends to `.gsd-t/metrics/token-usage.jsonl` with `schemaVersion=1`
  - Atomic concurrent append: 3 parallel `recordSpawnRow` calls produce 3 distinct rows, none interleaved
  - Zero-deps verification: parse the source file, assert no external `require(...)` beyond node built-ins and local `./token-budget.cjs`/`../scripts/gsd-t-token-aggregator.js`

## Done Signal
- `bin/gsd-t-token-capture.cjs` exists, `node -e "require('./bin/gsd-t-token-capture.cjs')"` loads, `captureSpawn` + `recordSpawnRow` + `_parseUsageFromResult` exported
- `npm test -- test/m41-token-capture.test.js` passes 12+ tests
- Full suite `npm test` stays at baseline+N green
- Commit on main with message starting `d1-t{1,2,3}:`
- `.gsd-t/progress.md` Decision Log entry appended

## Owned Patterns
- `bin/gsd-t-token-capture.cjs`
- `test/m41-token-capture.test.js`
