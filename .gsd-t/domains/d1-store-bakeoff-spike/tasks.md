# Tasks: d1-store-bakeoff-spike

## Summary
When all tasks complete: a measured store choice (or KILL/re-scope verdict) recorded in progress.md, and a STABLE `graph-store-schema-contract.md` (node/edge/tier/content-hash columns) that unblocks the Wave-2 build trio.

## Tasks

### Task 1: Synthetic graph generator
- **Files**: `bin/gsd-t-graph-synthetic-gen.cjs`
- **Contract refs**: NONE (produces the fixtures the bake-off consumes)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Generates a synthetic graph of configurable node count (default ~1.5M, Atos scale) with realistic file→file import edges + function→function call edges
  - Each node/edge carries the candidate schema fields (id, kind, tier, content-hash placeholder)
  - Deterministic with a seed so the bake-off is reproducible
  - Emits a JSON envelope `{ ok, nodes, edges, seed }`

### Task 2: Store bake-off harness
- **Files**: `bin/gsd-t-graph-store-bakeoff.cjs`, `test/m94-k1-store-bakeoff.test.js`
- **Contract refs**: NONE (this task PRODUCES the store-schema decision)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - Loads the synthetic graph into each candidate that passes the embedded/on-disk/no-server/no-paid-license gate (KuzuDB-embedded / SQLite-recursive-CTE / JSONL / graphology)
  - Measures (a) eligibility, (b) `who-imports X` + `who-calls f` query latency, (c) single-file incremental update + one-hop edge re-validation wall-clock
  - PICKs the store iff ALL three sub-criteria clear; else emits a KILL_OR_RESCOPE verdict ([RULE] K1)
  - Test asserts: kill-criteria honored (a synthetic store failing one sub-criterion is NOT picked), envelope shape, deterministic re-run

### Task 3: Store-schema contract + result doc
- **Files**: `.gsd-t/contracts/graph-store-schema-contract.md`, `.gsd-t/spikes/k1-store-bakeoff-results.md`
- **Contract refs**: graph-store-schema-contract (authored here)
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - Contract declares node/edge/tier/content-hash columns — the exact shape D3 writes, D4 mutates, D5 reads
  - Result doc records the picked store + all three sub-metrics with live-clock timestamp
  - progress.md updated with the picked store + sub-metrics
  - Contract marked STABLE only after a store is picked (or marked re-scoped if K1 kills)

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0 (Wave 1 — no cross-domain blockers; gates the Wave-2 trio)
- Estimated checkpoints: 1 (Wave-1 hard gate, jointly with d2)
