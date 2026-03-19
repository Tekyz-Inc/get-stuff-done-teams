# Tasks: cli-graph

## Task 1: Add graph subcommands to gsd-t.js
- Add `graph` subcommand dispatch in `bin/gsd-t.js`
- Implement `doGraphIndex()` — call indexProject, display results
- Implement `doGraphStatus()` — call getIndexStatus, display summary
- Implement `doGraphQuery(queryType, ...params)` — call query, display results as JSON
- Follow existing CLI patterns (ANSI colors, function ≤30 lines)
- Status: pending

## Task 2: Update help text and command count
- Add graph subcommands to help output
- Update command counting logic
- Add graph section to `gsd-t status` output (entity count, last indexed, provider)
- Status: pending

## Task 3: Write tests for CLI graph commands
- Add tests to existing `test/cli.test.js` or create `test/graph-cli.test.js`
- Test `gsd-t graph index` (runs indexer, displays results)
- Test `gsd-t graph status` (shows index status)
- Test `gsd-t graph query` (runs query, returns JSON)
- Status: pending
