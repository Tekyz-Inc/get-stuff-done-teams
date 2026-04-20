# Domain: d3-historical-backfill

## Responsibility

Recover real token usage for past spawns. The pre-M41 era wrote `| N/A |` or `| 0 |` rows because no command file parsed `usage.*`. But headless spawns still wrote their raw stream-json to `.gsd-t/headless-*.log` and event-stream JSONL to `.gsd-t/events/YYYY-MM-DD.jsonl`. The envelope is in those files — we just never harvested it.

D3 builds `bin/gsd-t-token-backfill.cjs` — a one-shot (and idempotent re-runnable) CLI that walks the log archives, extracts `result.usage` envelopes, and writes retroactive rows into `.gsd-t/metrics/token-usage.jsonl` (schema v1) plus optionally patches `token-log.md` in-place.

## Owned Files/Directories

- `bin/gsd-t-token-backfill.cjs` (NEW) — zero-dep CLI
- `test/m41-token-backfill.test.js` (NEW)
- One new subcommand wiring in `bin/gsd-t.js`: `gsd-t backfill-tokens [--since YYYY-MM-DD] [--patch-log] [--dry-run]`

## NOT Owned (do not modify)

- `bin/gsd-t-token-capture.cjs` — D1's wrapper; D3 **reuses** its `recordSpawnRow` for consistency
- `scripts/gsd-t-token-aggregator.js` — M40 D4 aggregator; D3 imports its envelope parser, doesn't modify
- The historical log files themselves are read-only inputs — never delete or rewrite `.gsd-t/headless-*.log` or `.gsd-t/events/*.jsonl`

## Public API

```
gsd-t backfill-tokens [--since YYYY-MM-DD] [--patch-log] [--dry-run] [--project-dir .]
```

Flags:
- `--since YYYY-MM-DD`: only process logs with `mtime >= since` (default: process all)
- `--patch-log`: also update the existing `| N/A |` rows in `token-log.md` in place. Default: append a `backfilled=true` JSONL record only.
- `--dry-run`: parse + report counts, write nothing
- `--project-dir PATH`: default `.`

Output (table to stdout):

```
Scanned: 47 log files
Parsed: 128 result envelopes with usage
Matched to existing rows: 94 (of which 87 had N/A, 7 had 0)
New JSONL records: 128
Patched token-log.md rows: 94 (dry-run: would have patched)
Unmatched envelopes (no row): 34 → appended as backfill-only entries with Notes="backfill: no original row"
```

## Matching Strategy

For each envelope found in a log file:
1. Extract `command`, `step`, `model`, `startedAt`, `endedAt` from surrounding context (event-stream JSONL includes these; raw headless log includes them in the `system.init` frame)
2. Look for a row in `token-log.md` with the same `(Datetime-start, Command, Step, Model)` tuple — if found and Tokens is `N/A` or `0`, it's a match
3. If no match, append as backfill-only with `Notes="backfill: no original row"`
4. Write all envelopes to the JSONL unconditionally (schema v1, with `source: "backfill"` field)

## Idempotency

Running `backfill-tokens` twice produces the same result as once. Detection: JSONL already contains a record for this `(startedAt, command, step, model)` tuple with `source: "backfill"` → skip.
