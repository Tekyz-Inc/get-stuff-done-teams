# Domain: graph-abstraction

## Purpose
Unified query interface that all GSD-T commands call. Routes queries to the best available provider (CGC → native → grep). Commands never interact with providers directly.

## Owned Files
- `bin/graph-query.js` (NEW) — Query interface + provider selection + routing

## Dependencies
- Consumes: native-indexer (provider), cgc-provider (provider), graph-storage (data)
- Consumed by: All 21 graph-aware commands (M21)

## Constraints
- Zero external dependencies
- Must export a single `query(type, params)` function
- Must auto-detect provider availability
- Must fall back gracefully (CGC → native → grep)
- Provider selection is invisible to callers
