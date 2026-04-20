# Constraints: d1-token-capture-wrapper

## Must Follow

- Zero external npm runtime deps (GSD-T installer invariant)
- `.cjs` extension — must load in both ESM-default projects and CJS projects without transpilation
- Atomic append to `token-usage.jsonl` (write-to-tmp + rename) to match M40 D4 aggregator semantics
- `token-log.md` row format MUST match the existing header:
  `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |`
  Plus a Tokens column rendered as `in=N out=N cr=N cc=N $X.XX` (or `—` when usage absent)
- Missing `usage` field → write `—` in the Tokens column, **never** `0`. A zero is a measurement; a dash is an acknowledged gap.
- Use the same `humanizeTokens` + `formatCost` formatting as `scripts/gsd-t-stream-feed.html` (M40 D5) — consistency across transports

## Must Not

- Modify `scripts/gsd-t-token-aggregator.js` — D1 consumes it, doesn't own it
- Touch any `commands/*.md` — that's D2's blast radius
- Introduce a second token-usage.jsonl schema — **reuse schema v1** from `metrics-schema-contract.md`
- Silently swallow errors — if the result envelope is unparseable, write the row with `Notes` = `usage_parse_failed: {reason}` so it's visible in dashboards

## Must Read Before Using

- `scripts/gsd-t-token-aggregator.js` — M40 D4: how assistant vs result envelope usage is reconciled (result wins, assistant accumulates)
- `.gsd-t/contracts/metrics-schema-contract.md` — M40: token-usage.jsonl schema v1
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 — M40: §"Usage field propagation" on per-turn vs authoritative final usage

## Dependencies

- Depends on: M40 D4 aggregator schema helpers (import or replicate)
- Depended on by: D2 (every command file), D3 (backfill uses same row writer), D4 (dashboard reads from the jsonl the wrapper writes), D5 (linter validates presence of wrapper calls)
