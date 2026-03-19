# Domain: cli-graph

## Purpose
CLI subcommands for manual graph operations: `gsd-t graph index`, `gsd-t graph status`, `gsd-t graph query`. Integrates into the existing `bin/gsd-t.js` CLI.

## Owned Files
- `bin/gsd-t.js` (MODIFY — add graph subcommands)

## Dependencies
- Consumes: graph-abstraction (query), native-indexer (index), graph-storage (status)
- Consumed by: end users via CLI

## Constraints
- Zero external dependencies (existing constraint)
- Must follow existing CLI patterns (ANSI colors, subcommand dispatch)
- Functions under 30 lines
- Must update help text and command count
