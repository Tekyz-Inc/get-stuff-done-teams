# Contract: Graph Store Schema (K1)

**Status:** DRAFT — resolved by the D1 Wave-1 K1 store-bakeoff spike. Marked STABLE only once a store is picked on evidence (or re-scoped if K1 kills).
**Owner:** d1-store-bakeoff-spike
**Consumers:** d3-indexer-core (writes records), d4-freshness (reads stored hash, mutates on re-index), d5-query-cli (reads to answer)
**Version:** 0.1.0 (DRAFT)

## Purpose
The on-disk record shape every Wave-2 domain builds against, plus the picked embedded store engine. The specific store is DEFERRED to the K1 spike — an OPEN decision, NOT asserted here.

## The decision K1 resolves
Pick a store iff it is embedded / on-disk / no-server / no-paid-license AND clears the query-latency target AND does a single-file incremental update + one-hop edge re-validation sub-~1s — across KuzuDB-embedded / SQLite-recursive-CTE / JSONL / graphology. Else KILL_OR_RESCOPE (e.g. import-graph-only, cap repo size). `[RULE] K1: store-picked-on-evidence-or-rescope`

## Record shape (columns — finalized by the spike)
| Field | Meaning |
|-------|---------|
| `file` | source file path (repo-relative) |
| `content_hash` | content hash of the file (freshness key — D4 reads this) |
| `entities` | functions / classes / exports extracted from the file |
| `edges` | import-graph (file→file) + call-graph (function→function) edges |
| `tier` | `compiler-accurate` (SCIP present) or `tree-sitter-floor` (approximate) |

## Query surface the store must support (measured in the bake-off)
- `who_imports(X)` — file→file reverse import edges
- `who_calls(f)` — function→function reverse call edges
- single-file incremental put + one-hop direct-importer edge re-validation

## Open until K1 resolves
- The picked store engine (recorded in `.gsd-t/spikes/k1-store-bakeoff-results.md` + progress.md)
- Exact column types / on-disk encoding (store-specific)
