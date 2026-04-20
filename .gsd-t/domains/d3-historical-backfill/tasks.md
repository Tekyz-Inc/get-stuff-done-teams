# Tasks: d3-historical-backfill

## Summary
Recover real token usage for past spawns. Pre-M41 rows wrote `N/A` or `0` because no caller parsed `usage`. But headless stream-json logs and event-stream JSONL retain the envelopes. Build `bin/gsd-t-token-backfill.cjs` — idempotent CLI that walks log archives, extracts `result.usage`, writes retroactive JSONL records and (optionally) patches `token-log.md` in place.

## Tasks

### Task 1: Log walker + envelope parser
- **Files**: `bin/gsd-t-token-backfill.cjs` (NEW)
- **Contract refs**: `metrics-schema-contract.md`, `stream-json-sink-contract.md`
- **Dependencies**: Requires D1 Tasks 1 and 2 (wrapper module + row writer)
- **Wave**: 2
- **Acceptance criteria**:
  - Exports `scanLogs({projectDir, since}) → AsyncIterable<{envelope, sourceFile, startedAt, endedAt, command, step, model}>`
  - Globs `.gsd-t/events/*.jsonl` and `.gsd-t/headless-*.log` under `projectDir`
  - Filters by `mtime >= since` when `since` provided
  - Line-by-line parse; for each JSON line: if `type === 'result'` and `usage` present → yields envelope
  - If `type === 'system' && subtype === 'init'` → caches context (command/step/model/startedAt) for subsequent frames
  - Handles partial/truncated JSONL lines gracefully (skip, no throw)
  - Imports envelope-parse helpers from `scripts/gsd-t-token-aggregator.js` (M40 D4) when exported; else replicates assistant-vs-result precedence inline

### Task 2: Matcher + writer
- **Files**: `bin/gsd-t-token-backfill.cjs` (same file as Task 1)
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 2
- **Acceptance criteria**:
  - Exports `matchAndWrite({projectDir, envelopes, patchLog, dryRun}) → {scanned, parsed, matched, patched, new, unmatched}`
  - Loads existing `.gsd-t/metrics/token-usage.jsonl` once and indexes by `(startedAt, command, step, model)`
  - For each envelope: if tuple already present with `source: "backfill"` → skip (idempotent)
  - Else writes a JSONL record using schema v1 with added `source: "backfill"` field
  - When `patchLog`: reads `.gsd-t/token-log.md`, finds rows where Tokens is `N/A`/`0`/`—` AND `(Datetime-start, Command, Step, Model)` matches an envelope, rewrites the Tokens cell as `in=… out=… cr=… cc=… $X.XX`
  - Writes patched token-log.md atomically via write-to-tmp + rename
  - When `dryRun`: no writes; returns counts only
  - Prints summary table: `Scanned: N files | Parsed: N envelopes | Matched: N | Patched: N | New JSONL: N | Unmatched: N`
  - Unmatched envelopes append as backfill-only with `Notes = "backfill: no original row"`

### Task 3: CLI wiring
- **Files**: `bin/gsd-t.js`
- **Contract refs**: N/A
- **Dependencies**: Requires Task 2
- **Wave**: 2
- **Acceptance criteria**:
  - Adds `gsd-t backfill-tokens [--since YYYY-MM-DD] [--patch-log] [--dry-run] [--project-dir .]` subcommand
  - Parses args with the existing arg parser
  - Requires `./gsd-t-token-backfill.cjs` and calls `main({projectDir, since, patchLog, dryRun})`
  - Prints the summary table
  - Exit 0 on success, 2 on arg parse error, 3 on IO error

### Task 4: Unit tests
- **Files**: `test/m41-token-backfill.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Tasks 1, 2, and 3
- **Wave**: 2
- **Acceptance criteria**: 10+ unit tests using a temp-dir fixture with seeded log files:
  - Scanner yields envelopes from event-stream JSONL
  - Scanner yields envelopes from raw headless stream-json log
  - Matcher resolves `(startedAt, command, step, model)` against a seeded `token-log.md`
  - `--dry-run` writes nothing
  - `--patch-log` updates N/A rows in place
  - Idempotency: running twice produces same JSONL line count as once
  - Unmatched envelope → appended as backfill-only with `Notes` marker
  - Truncated JSONL line → skipped, not thrown
  - Envelope with missing `usage` → skipped (nothing to backfill)
  - CLI integration: `node bin/gsd-t.js backfill-tokens --dry-run --project-dir $FIXTURE` exits 0 and prints expected summary

## Done Signal
- `bin/gsd-t-token-backfill.cjs` loads, exports `scanLogs` + `matchAndWrite` + `main`
- `gsd-t backfill-tokens --help` prints usage; `gsd-t backfill-tokens --dry-run` runs on the real project
- `npm test -- test/m41-token-backfill.test.js` passes 10+ tests
- Real-project dry-run reports nonzero "parsed" count
- Full suite `npm test` at baseline+N green

## Owned Patterns
- `bin/gsd-t-token-backfill.cjs`
- `test/m41-token-backfill.test.js`
- `bin/gsd-t.js`: only the new `backfill-tokens` subcommand branch
