# Tasks: m99-d3-metrics-rollup

## Files Owned
- bin/gsd-t.js
- bin/gsd-t-graph-metrics-rollup.cjs
- .gsd-t/contracts/graph-metrics-contract.md
- test/m99-graph-metrics-rollup.test.js

### M99-D3-T1
**What:** Create `bin/gsd-t-graph-metrics-rollup.cjs` — read-only. Read all `graphDB/logs/graph-events-*.jsonl` via D1's imported `resolveLogsDir`; tolerate empty/rotated/missing. Report hit-vs-grep-passthrough ratio, fallback-rate, p50/p95 latency, tier mix, stale-query + reindex frequency, per-consumer + per-verb. Mirror `doMetrics` shape/flags.
**Touches:** bin/gsd-t-graph-metrics-rollup.cjs

### M99-D3-T2
**What:** Add `case "metrics"` to the `doGraph` switch in `bin/gsd-t.js` (after the `tasks` case) dispatching to the rollup; add the usage string. Append-only — no other dispatch arm touched.
**Touches:** bin/gsd-t.js

### M99-D3-T3
**What:** Finalize `.gsd-t/contracts/graph-metrics-contract.md` (v1.0.0 DEFINED → STABLE) — reconcile documented event + rollup schema with the keys D1/D2 emit (consumer/via/outcome/tier/graphWiringMode + Layer-2 decision-line fields).
**Touches:** .gsd-t/contracts/graph-metrics-contract.md

### M99-D3-T4
**What:** Write `test/m99-graph-metrics-rollup.test.js` — rollup over a fixture ledger; empty/rotated-ledger tolerance; per-consumer + per-verb breakdown correctness; never-writes assertion.
**Touches:** test/m99-graph-metrics-rollup.test.js
