# Domain: native-indexer

## Purpose
Zero-dependency JS parser that extracts function/class/import entities and their relationships from JS/TS/Python source files. Builds the GSD-T overlay (domain ownership, contract mapping, requirement traceability, test mapping, debt mapping).

## Owned Files
- `bin/graph-indexer.js` (NEW) — Parser + entity extraction + relationship mapping
- `bin/graph-parsers.js` (NEW) — Language-specific parsers (JS/TS/Python)
- `bin/graph-overlay.js` (NEW) — GSD-T context mapper (domains, contracts, requirements, tests, debt)

## Dependencies
- Consumes: graph-storage (writes index data)
- Consumed by: graph-abstraction (as a provider)

## Constraints
- Zero external dependencies — regex-based parsing only (no Tree-sitter)
- Must handle JS, TS, and Python files
- Functions under 30 lines, files under 200 lines
- Incremental indexing (only re-parse changed files)
- Never throws — returns partial results on parse errors
