# Contract: Graph Indexer Build/Put Surface

**Status:** DRAFT — authored by D3 during Wave-2 build (after the K1+K2 hard gate).
**Owner:** d3-indexer-core
**Consumers:** d4-freshness (calls the per-file parse function to re-index a stale file), d5-query-cli (calls re-index inline before answering)
**Version:** 0.1.0 (DRAFT)

## Purpose
The function-level build/put surface D3 exposes so D4 and D5 re-index a file WITHOUT editing D3's source (keeps them file-disjoint). D4/D5 call this surface; they never edit `bin/gsd-t-graph-index.cjs`.

## Surface
- `build_index(repo)` — full-repo build: per file → tree-sitter floor parse → optional SCIP upgrade → `store.put(file, content_hash, entities, edges, tier)`
- `parse_and_put(file)` — per-file re-index (the function D4 calls on a stale file; D5 calls inline) → re-parses one file, writes its record, returns the new entities/edges
- both honor the D1 store-schema and D2 taxonomy

## Honesty invariants
- `[RULE] accuracy-tier-labeled-never-silently-wrong` — every edge carries `tier` (compiler-accurate where SCIP present, tree-sitter-floor where absent); never an unlabeled mix
- `[RULE] rust-cross-crate-flagged-partial` — Rust cross-crate edges FLAGGED partial (rust-analyzer SCIP is "limited"); within-crate resolves, cross-crate partial
- The graph NEVER depends on SCIP to FUNCTION — only to get BETTER. SCIP absent → tree-sitter floor, degrades not breaks.

## Consumed (frozen)
- `graph-store-schema-contract.md` (D1) — record columns
- `graph-parser-floor-contract.md` (D2) — taxonomy + parse harness
