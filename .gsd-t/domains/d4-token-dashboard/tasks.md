# Tasks: d4-token-dashboard

## Summary
Turn the now-complete `.gsd-t/metrics/token-usage.jsonl` (live + backfilled) into something operators look at. Two surfaces: `gsd-t tokens` CLI with byDay/byCommand/byModel/top-10/rolling-7d/cache-hit% sections, and a two-line token block at the tail of `gsd-t status`. M40 D5 already ships the live per-task UI; D4 is the cumulative historical view.

## Tasks

### Task 1: Aggregator module
- **Files**: `bin/gsd-t-token-dashboard.cjs` (NEW)
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires D1 (writes JSONL) and D3 (backfills JSONL)
- **Wave**: 3
- **Acceptance criteria**:
  - Exports `aggregate({projectDir, since, milestone}) → {byDay, byCommand, byModel, topSpawns, rolling7d, currentMilestone}`
  - Streaming read of `.gsd-t/metrics/token-usage.jsonl` (line-by-line, NOT full-file `JSON.parse`)
  - Filters by `startedAt >= since` and/or `milestone === milestone` when provided
  - Groups and sums: byDay (YYYY-MM-DD), byCommand, byModel
  - Top 10 spawns by cost descending
  - Rolling 7-day window: sum(cost) / 7 = daily avg; × 30 = monthly projection
  - Cache-read hit rate per model: `sum(cache_read_input_tokens) / (sum(input_tokens) + sum(cache_read_input_tokens))`
  - Exports `renderTable(agg)`, `renderJson(agg)`, `renderStatusBlock(agg)`
  - `renderStatusBlock` always produces exactly 2 lines + 1 separator
  - Zero external npm deps

### Task 2: `gsd-t tokens` subcommand
- **Files**: `bin/gsd-t.js`
- **Contract refs**: N/A
- **Dependencies**: Requires Task 1
- **Wave**: 3
- **Acceptance criteria**:
  - Wires `gsd-t tokens [--since YYYY-MM-DD] [--milestone Mxx] [--format table|json]`
  - Parses args
  - Calls `aggregate(...)` then `renderTable` (default) or `renderJson` (when `--format json`)
  - Prints to stdout
  - Exit 0

### Task 3: `gsd-t status` token-block injection
- **Files**: `bin/gsd-t.js` (status command handler)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 1
- **Wave**: 3
- **Acceptance criteria**:
  - At the end of `gsd-t status`: reads current milestone from `.gsd-t/progress.md`
  - Calls `aggregate({projectDir, milestone})` and `renderStatusBlock(agg)`
  - Prints separator `───` followed by the two-line block
  - Never breaks existing status output lines above the separator
  - If `.gsd-t/metrics/token-usage.jsonl` is missing or empty → prints `───\nTokens: no data yet (run a command to populate)` and exits normally
  - Never throws: a broken JSONL line skips, never crashes `status`

### Task 4: Unit tests + perf gate
- **Files**: `test/m41-token-dashboard.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Tasks 1, 2, and 3
- **Wave**: 3
- **Acceptance criteria**: 10+ tests:
  - `aggregate` with a 100-line fixture returns correct byDay / byCommand / byModel totals
  - `aggregate` with `since` filter excludes older rows
  - `aggregate` with `milestone` filter respects it
  - Top-10 is sorted by cost desc, length ≤ 10
  - Rolling 7-day is computed from the last 7 calendar days, not last 7 records
  - Cache-read hit rate formula matches spec
  - `renderTable` output contains all four sections plus top-10
  - `renderJson` produces valid JSON with the documented shape
  - `renderStatusBlock` is always exactly 2 lines + 1 separator
  - Perf gate: synthesize a 10k-line JSONL, assert `aggregate` runs in < 500ms
  - `gsd-t status` when JSONL missing: prints "no data yet" line, exits 0

## Done Signal
- `bin/gsd-t-token-dashboard.cjs` loads, all exports present
- `gsd-t tokens` prints a non-empty table on the real project
- `gsd-t status` prints two-line token block at the tail
- `npm test -- test/m41-token-dashboard.test.js` passes 10+ tests, perf gate green
- Full suite `npm test` at baseline+N green

## Owned Patterns
- `bin/gsd-t-token-dashboard.cjs`
- `test/m41-token-dashboard.test.js`
- `bin/gsd-t.js`: only the new `tokens` subcommand and the status-tail injection
