# Tasks: d3-indexer-core

## Summary
When all tasks complete: a fresh `build_index` that parses every source file via the tree-sitter floor (optionally SCIP-upgraded), extracts import + call + entity edges per the D2 taxonomy, writes them to the D1 store with an honest accuracy tier, and exposes a per-file parse surface D4/D5 call.

## Tasks

### Task 1: Edge extraction (taxonomy → entities + edges)
- **Files**: `bin/gsd-t-graph-edge-extract.cjs`, `test/m94-d3-indexer-core.test.js`
- **Contract refs**: graph-parser-floor-contract (D2), graph-store-schema-contract (D1)
- **Dependencies**: BLOCKED by d2-treesitter-throughput-spike Task 1 (parser-floor contract); BLOCKED by d1-store-bakeoff-spike Task 3 (store-schema contract)
- **Acceptance criteria**:
  - Extracts entities + import-graph (file→file) + call-graph (function→function) edges per the D2 taxonomy
  - Built FRESH on tree-sitter (not lifted from `bin/graph-parsers.js`)
  - Output shape matches the store-schema columns
  - Test: hand-checked fixture yields the expected who-imports / who-calls edges (AC-2 seed)

### Task 2: build_index + store write
- **Files**: `bin/gsd-t-graph-index.cjs`
- **Contract refs**: graph-store-schema-contract (D1), graph-indexer-build-contract (authored here)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - `build_index(repo)`: per-file tree-sitter floor parse → edge-extract → `store.put(file, content_hash, entities, edges, tier)`
  - Exposes a callable per-file parse/put surface (the build/put contract) D4 + D5 invoke
  - Authors `graph-indexer-build-contract.md` declaring that function surface

### Task 3: SCIP upgrade + accuracy tiers
- **Files**: `bin/gsd-t-graph-scip-upgrade.cjs`, `test/m94-d3-accuracy-tiers.test.js`
- **Contract refs**: graph-indexer-build-contract (Task 2)
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - Detects scip-typescript / scip-python / rust-analyzer scip if present; re-derives that language's edges compiler-accurate; labels tier=compiler-accurate
  - SCIP absent → tier=tree-sitter-floor (degrades, never breaks)
  - [RULE] accuracy-tier-labeled: never an unlabeled mix (test asserts both tiers labeled)
  - [RULE] rust-cross-crate-flagged-partial: Rust cross-crate edges flagged partial (test asserts the flag)

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0 (all gated on Wave-1 contracts)
- Blocked tasks (waiting on other domains): 1 (Task 1, on d1 + d2 contracts via the hard gate)
- Estimated checkpoints: 1 (Wave-2 integration with d4 + d5)
