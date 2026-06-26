# Tasks: d5-query-cli

## Summary
When all tasks complete: a deterministic query CLI (who-imports / who-calls / blast-radius + `graph status`) that calls D4's freshness check inline before answering, never greps, and fails loud (`graph-unavailable`) on parser death — with the no-grep-fallback and fault-injection keystone tests passing.

## Tasks

### Task 1: Query CLI + envelope contract
- **Files**: `bin/gsd-t-graph-query-cli.cjs`, `.gsd-t/contracts/graph-query-cli-contract.md`, `test/m94-d5-query-cli.test.js`
- **Contract refs**: graph-store-schema-contract (D1), graph-freshness-contract (D4), graph-query-cli-contract (authored here)
- **Dependencies**: BLOCKED by d4-freshness Task 1 (the `freshness_check_on_query` surface); reads d1's store-schema
- **Acceptance criteria**:
  - Answers who-imports / who-calls / blast-radius from the store (AC-2, hand-checked fixtures)
  - Calls D4's freshness check INLINE before answering ([RULE] stale-file-reindexed-before-answer)
  - `gsd-t graph status` returns a live queryable index ([RULE] graph-status-live)
  - Authors `graph-query-cli-contract.md` (the JSON envelope D6 reads)

### Task 2: Keystone tests — no grep fallback + fail-loud
- **Files**: `test/m94-d5-no-grep-fallback-structural.test.js`, `test/m94-d5-fault-injection-fail-loud.test.js`
- **Contract refs**: graph-query-cli-contract (Task 1)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - [RULE] query-cli-never-greps: structural grep-for-absence — parses the CLI's code paths and asserts NO directive-driven grep fallback exists (not a substring scan)
  - [RULE] parser-fail-disables-loud-never-silent: fault-injection forces parser-load failure → asserts `{ok:false, reason:'graph-unavailable'}`, never a partial edge

## Execution Estimate
- Total tasks: 2
- Independent tasks (no blockers): 0 (gated on Wave-1 hard gate + D4's freshness surface)
- Blocked tasks (waiting on other domains): 1 (Task 1, on d4's freshness contract)
- Estimated checkpoints: 1 (Wave-2 integration with d3 + d4)
