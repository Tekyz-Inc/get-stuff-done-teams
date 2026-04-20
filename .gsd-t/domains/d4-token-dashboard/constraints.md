# Constraints: d4-token-dashboard

## Must Follow

- Zero external npm runtime deps (GSD-T installer invariant)
- `.cjs` extension
- Streaming read of `.gsd-t/metrics/token-usage.jsonl` — never `readFileSync` + `JSON.parse` the whole file (a mature project will have 10k+ lines)
- Use the same `humanizeTokens` + `formatCost` formatting as `scripts/gsd-t-stream-feed.html` (M40 D5) so the live UI and the historical CLI render costs identically
- `gsd-t status` injection is **additive** — must not break the existing status output parsers or change existing lines

## Must Not

- Create a new metrics file — D4 is read-only on the JSONL
- Block on network / IO outside the project directory
- Compute cost from model pricing that D4 hardcodes — reuse the cost field already written to JSONL by D1/D3. If an old record lacks a cost field, display `—` not `0`.
- Add a web server (stream-feed is the web UI; D4 is CLI-only for the historical view)
- Introduce a `--pretty` vs `--compact` flag explosion — one default table + `--format json` is enough

## Must Read Before Using

- `.gsd-t/contracts/metrics-schema-contract.md` — schema v1 fields
- `scripts/gsd-t-stream-feed.html` — for `humanizeTokens` + `formatCost` parity
- `scripts/gsd-t-token-aggregator.js` — M40 D4 already does per-spawn aggregation; D4 builds on top for multi-spawn totals

## Dependencies

- Depends on: D1 (live rows in JSONL), D3 (historical rows in JSONL) — both must be landed before D4's numbers are trustworthy
- Depended on by: nothing downstream — D4 is the terminal surface
