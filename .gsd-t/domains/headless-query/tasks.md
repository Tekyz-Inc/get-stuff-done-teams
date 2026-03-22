# Tasks: headless-query

## Task 1: Query dispatch + status/domains/contracts
- Add doHeadlessQuery(type, opts) function
- Implement queryStatus() — parse progress.md for version, milestone, phase
- Implement queryDomains() — scan .gsd-t/domains/ directory
- Implement queryContracts() — scan .gsd-t/contracts/ directory

## Task 2: debt/context/backlog/graph
- Implement queryDebt() — parse .gsd-t/techdebt.md
- Implement queryContext() — parse .gsd-t/token-log.md (last N entries)
- Implement queryBacklog() — parse .gsd-t/backlog.md
- Implement queryGraph() — read .gsd-t/graph-index/meta.json if present

## Task 3: JSON output + error handling
- All query types return JSON to stdout
- Unknown type: error JSON {error: "unknown type", validTypes: [...]}
- Missing file: graceful empty result vs error
- Integration into headless subcommand dispatch
