# Constraints: m99-d3-metrics-rollup

## Hard rules
- **[RULE] read-only-rollup** — `bin/gsd-t-graph-metrics-rollup.cjs` NEVER writes the ledger, never mutates any path, never touches the graph store. It only reads `graphDB/logs/graph-events-*.jsonl`.
- **[RULE] tolerate-empty-rotated** — The rollup tolerates a missing / empty / rotated (`-001`+`-002`) ledger and an absent `graphDB/logs/` dir — it returns a zeroed report, never crashes.
- **[RULE] import-resolveLogsDir** — The log dir is obtained via D1's `resolveLogsDir`, imported from `bin/gsd-t-graph-store-resolver.cjs`. No raw `.gsd-t/graphDB/` or `.gsd-t/metrics/` literal (subject to D1's no-raw-literals grep proof).
- **[RULE] mirror-doMetrics-shape** — The rollup output mirrors the existing `gsd-t metrics` (`doMetrics`) shape/flags so the two read the same.
- **[RULE] contract-matches-emitted-keys** — `graph-metrics-contract.md` documents EXACTLY the event keys D1/D2 emit and the rollup output shape. A documented key the writers don't emit (or vice-versa) is a contract drift = fail.
- **[RULE] append-only-switch-arm** — The only edit to `bin/gsd-t.js` is the new `case "metrics"` arm in the `doGraph` switch. Do not touch other dispatch arms (D1/D2 touch this file in zero places — keep it that way so D3 stays the sole editor).

## Do NOT
- Do NOT touch any `bin/gsd-t-graph-*.cjs` resolver/producer — D1.
- Do NOT touch the intercept scripts or workflows — D2.
- Do NOT own `test/m99-graph-telemetry.test.js` — D1 owns it.

## Sequencing
Runs in Wave 2, parallel with D2, fully file-disjoint. Imports D1's resolver (so D1 must land first). Reads the ledger D1/D2 produce — never writes their files.
