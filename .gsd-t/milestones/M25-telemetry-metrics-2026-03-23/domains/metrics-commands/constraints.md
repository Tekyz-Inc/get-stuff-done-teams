# Constraints: metrics-commands

## Must Follow
- Zero external dependencies in any new or modified JS files
- All functions <= 30 lines (project convention)
- New command file follows standard step-numbered format with $ARGUMENTS terminator
- Must update all 4 reference files when adding a new command (README.md, GSD-T-README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md)
- Must update bin/gsd-t.js command count
- gsd-t-metrics.md reads JSONL files directly (no dependency on rollup.js module)

## Must Not
- Modify files outside owned scope
- Write to task-metrics.jsonl or rollup.jsonl (read-only consumer)
- Change existing status command structure — only ADD ELO/metrics display section
- Change bin/gsd-t.js beyond command count update

## Must Read Before Using
- `commands/gsd-t-status.md` — understand current status output structure before adding metrics
- `bin/gsd-t.js` — understand command count logic (COMMAND_COUNT constant or pattern)
- `README.md` — understand commands table format
- `GSD-T-README.md` — understand detailed command reference format
- `templates/CLAUDE-global.md` — understand commands table format
- `commands/gsd-t-help.md` — understand help summary format
- `.gsd-t/contracts/metrics-schema-contract.md` — schemas for JSONL files

## Dependencies
- Depends on: metrics-collection domain (reads task-metrics.jsonl)
- Depends on: metrics-rollup domain (reads rollup.jsonl, ELO data)
- Depended on by: none (terminal consumer — user-facing command output)

## External Reference Dispositions
- `.gsd-t/metrics/task-metrics.jsonl` — USE (read as input)
- `.gsd-t/metrics/rollup.jsonl` — USE (read as input)
