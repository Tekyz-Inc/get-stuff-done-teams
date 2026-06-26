# Contract: Graph Freshness Check

**Status:** DRAFT — authored by D4 during Wave-2 build (after the K1+K2 hard gate).
**Owner:** d4-freshness
**Consumers:** d5-query-cli (calls `freshness_check_on_query` inline before answering)
**Version:** 0.1.0 (DRAFT)

## Purpose
The freshness surface the query CLI calls inline so a stale touched file is re-indexed BEFORE the answer — never serving a stale or wrong edge.

## Surface
- `freshness_check_on_query(touched_files)` — for each file: hash its CONTENT vs the stored hash; if stale → re-index it (via D3's `parse_and_put`) + re-validate edges from its DIRECT importers one-hop only

## Invariants
- `[RULE] freshness-content-hash-not-git-sha` — dirty-detection hashes file CONTENT; an uncommitted working-tree edit (git-SHA unchanged) MUST be caught (the AC-3 killing test)
- `[RULE] one-hop-revalidation-not-transitive` — a stale file re-indexes itself + re-checks DIRECT importers only — never the transitive closure
- sub-~1s per edit (AC-3 budget)

## Consumed (frozen)
- `graph-store-schema-contract.md` (D1) — the stored content-hash column
- `graph-indexer-build-contract.md` (D3) — `parse_and_put(file)` re-index function (called, not edited)
