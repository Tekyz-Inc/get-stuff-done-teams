# Constraints: d3-historical-backfill

## Must Follow

- Zero external npm runtime deps (GSD-T installer invariant)
- `.cjs` extension
- **Idempotent**: running `backfill-tokens` twice = running it once. Second-run detection via `source: "backfill"` field + `(startedAt, command, step, model)` tuple match.
- **Read-only on logs**: never modify, delete, or rotate `.gsd-t/headless-*.log` or `.gsd-t/events/*.jsonl`. Treat as an archive.
- Use `recordSpawnRow` from D1's wrapper with an explicit `notes: "backfill: ..."` marker so backfilled rows are visually distinguishable in dashboards.
- Add a `source: "backfill" | "live"` field to the JSONL schema **only as an optional extension** — the existing schema v1 (M40 D4) does not have it, so adding it must not break the aggregator. Confirm by reading `metrics-schema-contract.md` and only append — never reorder or rename.

## Must Not

- Modify `scripts/gsd-t-token-aggregator.js` (M40 D4 ownership)
- Introduce a new JSONL file — reuse `.gsd-t/metrics/token-usage.jsonl` with a marker field
- Delete unmatched envelopes — if you can't find a row, append a backfill-only record so it still counts toward totals
- Touch `token-log.md` without `--patch-log` — default mode is JSONL-only
- Bloat the output: skip envelopes where `usage` is already absent in the source log (those are pre-M40 spawns that never streamed usage — irrecoverable)

## Must Read Before Using

- `scripts/gsd-t-token-aggregator.js` — envelope-extraction helpers (assistant-frame vs result-frame reconciliation). Reuse, don't reimplement.
- `.gsd-t/contracts/metrics-schema-contract.md` — schema v1 shape
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 — which frames carry authoritative usage
- `bin/gsd-t-token-capture.cjs` (D1 output) — the row-writer is the one backfill uses to keep formatting consistent

## Dependencies

- Depends on: D1 (uses its `recordSpawnRow`)
- Depends on: M40 D4 (envelope-parse helpers in `scripts/gsd-t-token-aggregator.js`)
- Depended on by: D4 (dashboard shows backfilled + live spend together, so backfill must land before the dashboard ships accurate totals)
