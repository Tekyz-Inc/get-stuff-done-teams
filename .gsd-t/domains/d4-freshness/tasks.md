# Tasks: d4-freshness

## Summary
When all tasks complete: a content-hash freshness checker that catches uncommitted working-tree edits, re-indexes a stale file via D3's parse function, and re-validates its direct-importer edges one-hop only, sub-~1s — exposed as the `freshness_check_on_query` surface D5 calls inline.

## Tasks

### Task 1: Content-hash freshness checker + contract
- **Files**: `bin/gsd-t-graph-freshness.cjs`, `.gsd-t/contracts/graph-freshness-contract.md`
- **Contract refs**: graph-store-schema-contract (D1), graph-indexer-build-contract (D3), graph-freshness-contract (authored here)
- **Dependencies**: BLOCKED by d3-indexer-core Task 2 (the per-file parse function surface); reads d1's store-schema
- **Acceptance criteria**:
  - Hashes each touched file's CONTENT vs the stored hash ([RULE] freshness-content-hash-not-git-sha)
  - Stale → re-index via D3's parse function + re-validate edges from DIRECT importers one-hop only ([RULE] one-hop-revalidation-not-transitive)
  - Authors `graph-freshness-contract.md` declaring `freshness_check_on_query(touched_files)` — the surface D5 calls
  - Sub-~1s per edit

### Task 2: Killing test — uncommitted edit caught
- **Files**: `test/m94-d4-uncommitted-edit-caught.test.js`, `test/m94-d4-freshness.test.js`
- **Contract refs**: graph-freshness-contract (Task 1)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - AC-3 killing test: an uncommitted working-tree edit (git-SHA unchanged) IS detected and re-indexed — fails if implementation used git-SHA
  - One-hop (not transitive) re-validation asserted: a 2-hop importer is NOT re-checked
  - Sub-~1s budget asserted on the freshness path

## Execution Estimate
- Total tasks: 2
- Independent tasks (no blockers): 0 (gated on Wave-1 hard gate + D3's parse surface)
- Blocked tasks (waiting on other domains): 1 (Task 1, on d3's build contract)
- Estimated checkpoints: 1 (Wave-2 integration with d3 + d5)
