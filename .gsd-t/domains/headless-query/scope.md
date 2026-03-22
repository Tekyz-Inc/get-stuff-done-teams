# Domain: headless-query

## Purpose
Add `gsd-t headless query {type}` subcommand for pure Node.js file-parsing queries (no LLM calls, <100ms).

## File Ownership
- `bin/gsd-t.js` — adds doHeadlessQuery, parseGsdtState functions
- `test/headless.test.js` — unit tests for query logic

## Scope
7 query types (all pure file reads from .gsd-t/):
- status     — version, active milestone, phase, domain completion counts
- domains    — list domains with status from .gsd-t/domains/
- contracts  — list contracts from .gsd-t/contracts/
- debt       — tech debt items from .gsd-t/techdebt.md
- context    — token log summary from .gsd-t/token-log.md
- backlog    — backlog items from .gsd-t/backlog.md
- graph      — graph index meta from .gsd-t/graph-index/ if present

## Out of Scope
- Modifying any files
- Making LLM calls
- headless exec (headless-exec domain)

## Tasks
1. Add query subcommand dispatch + status/domains/contracts types
2. Add debt/context/backlog/graph types
3. JSON formatting + error handling
