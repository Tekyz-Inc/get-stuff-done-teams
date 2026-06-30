# Domain: m99-d3-metrics-rollup

## Wave: 2 (parallel with D2, fully file-disjoint; lowest risk)

## One-line
The read-side rollup. Adds the `gsd-t graph metrics` verb + a read-only rollup helper + finalizes the contract. Pure consumer of the ledger D1/D2 write.

## Why this domain exists
The ledger is only useful if someone reads it. This domain is the single READER + the single CONTRACT owner: it turns the raw `graphDB/logs/graph-events-*.jsonl` into the answer "did the graph answer, or fall back to grep, and what for?". It writes nothing the writers (D1/D2) own — zero data-touching, zero path mutation.

## Owned / Written files
- `bin/gsd-t.js` — add `case "metrics"` to the `doGraph` switch (currently at `bin/gsd-t.js:3866`, cases end at `:3884` with `tasks`) dispatching to the rollup helper. Append-only switch arm; D1/D2 touch this file in ZERO places.
- `bin/gsd-t-graph-metrics-rollup.cjs` — **NEW**. Read-only. Reads all `graphDB/logs/graph-events-*.jsonl` via D1's `resolveLogsDir` (imported), tolerates an empty/rotated/missing ledger (never crashes, never writes). Reports: graph-hit-vs-grep-passthrough ratio, fallback-rate, p50/p95 latency, tier mix, stale-query + reindex frequency, per-consumer + per-verb breakdowns — mirroring the existing `gsd-t metrics` (`doMetrics`, `bin/gsd-t.js:4697`) shape/flags.
- `.gsd-t/contracts/graph-metrics-contract.md` — finalize (it exists at v1.0.0 DEFINED). Reconcile the documented event + rollup schema with the keys D1/D2 actually emit (`consumer` / `via` / `outcome` / `tier` / `graphWiringMode` / the Layer-2 decision-line fields). D3 is the single reader + contract owner; D1/D2 are the writers.
- `test/m99-graph-metrics-rollup.test.js` — **NEW**. Rollup over a fixture ledger; empty/rotated-ledger tolerance; per-consumer + per-verb breakdown correctness.

## NOT owned (other domains)
- The resolver + sink + producers + intercepts + workflows — **D1 / D2**. D3 IMPORTS `resolveLogsDir` from D1's `bin/gsd-t-graph-store-resolver.cjs`; it never writes the ledger.
- `test/m99-graph-telemetry.test.js` — **D1 owns it** (Layer-1 sink coverage). D3's coverage is the rollup test only.

## Depends on (D1 exports)
`resolveLogsDir` from `bin/gsd-t-graph-store-resolver.cjs`.

## Done when
1. `gsd-t graph metrics` dispatches via the `doGraph` switch to the rollup.
2. The rollup reads the rotated ledger, tolerates empty/missing, never writes, reports the full metric set + per-consumer/per-verb.
3. `graph-metrics-contract.md` is finalized — documented event + rollup schema match the emitted keys.
