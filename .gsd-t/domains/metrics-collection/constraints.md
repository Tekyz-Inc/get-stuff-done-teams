# Constraints: metrics-collection

## Must Follow
- Zero external dependencies — Node.js built-ins only (consistent with all GSD-T tooling)
- All functions <= 30 lines (project convention)
- File under 200 lines
- Module must export functions for testability (unlike TD-066 pattern)
- JSONL output: one JSON object per line, append-only
- task-metrics.jsonl schema must be defined in metrics-schema-contract.md before implementation

## Must Not
- Modify files outside owned scope
- Import or depend on metrics-rollup.js
- Change the existing event-schema-contract fields — only ADD the new `task_complete` event type
- Break existing event-writer.js behavior

## Must Read Before Using
- `scripts/gsd-t-event-writer.js` — understand event writing patterns and validation
- `scripts/gsd-t-heartbeat.js` — understand how events are currently captured (buildEventStreamEntry)
- `.gsd-t/contracts/event-schema-contract.md` — current event schema to extend
- `bin/gsd-t.js` — understand CLI patterns for new bin/ files (UTILITY_SCRIPTS array)

## Dependencies
- Depends on: event-schema-contract.md (reads schema)
- Depended on by: metrics-rollup domain (reads task-metrics.jsonl)
- Depended on by: metrics-dashboard domain (serves task-metrics.jsonl data)
- Depended on by: metrics-commands domain (gsd-t-metrics reads task-metrics.jsonl)

## External Reference Dispositions
- `scripts/gsd-t-event-writer.js` — INSPECT (read for patterns, do not import)
- `.gsd-t/events/*.jsonl` — USE (read as input data source)
- `.gsd-t/token-log.md` — USE (read as input data source for token/duration metrics)
