# Domain: graph-storage

## Purpose
File-based storage for graph data in `.gsd-t/graph/`. Handles reading, writing, and staleness detection for all graph JSON files. Provides incremental indexing support via file hash tracking.

## Owned Files
- `bin/graph-store.js` (NEW) — Read/write graph JSON files + staleness detection + file hash tracking

## Dependencies
- Consumes: nothing (lowest-level domain)
- Consumed by: native-indexer (writes), cgc-provider (reads overlay), graph-abstraction (reads)

## Constraints
- Zero external dependencies
- All files in `.gsd-t/graph/` directory (git-ignored)
- JSON format for all storage files
- File hashes (MD5 or content hash) for incremental indexing
- Must handle missing/corrupt graph files gracefully (trigger re-index)
