# Constraints: global-metrics

## Must Follow
- Zero external dependencies — Node.js built-ins only (fs, path, os)
- All file operations use synchronous API for simplicity (consistent with metrics-collector.js, rule-engine.js, patch-lifecycle.js)
- JSONL format for all data files (one JSON object per line) — consistent with existing metrics schema
- Functions under 30 lines — split if longer
- Global directory `~/.claude/metrics/` is created on first write if it does not exist
- Source project tag included in every global record (project name from `package.json` name field or directory basename)
- Module exports follow the same pattern as `bin/rule-engine.js` and `bin/patch-lifecycle.js`

## Must Not
- Modify files outside owned scope
- Write to `.gsd-t/metrics/` (local metrics are read-only for this domain)
- Import any external npm packages
- Modify any M25/M26 modules (use their exports as-is)

## Dependencies
- Depends on: M25 modules (metrics-collector.js, metrics-rollup.js) for reading local task-metrics.jsonl and rollup.jsonl
- Depends on: M26 modules (rule-engine.js, patch-lifecycle.js) for reading local rules.jsonl and patches
- Depended on by: cross-project-sync domain for the global-sync-manager API
- Depended on by: command-extensions domain for cross-project comparison data

## Must Read Before Using
- `bin/metrics-collector.js` — `readTaskMetrics()` function signature and return format
- `bin/metrics-rollup.js` — `readRollups()` function signature and return format, `generateRollup()` rollup object shape
- `bin/rule-engine.js` — `getActiveRules()` return format, rule object schema
- `bin/patch-lifecycle.js` — `getPatchesByStatus('promoted')` return format
- `.gsd-t/contracts/metrics-schema-contract.md` — task-metrics.jsonl and rollup.jsonl schemas
- `.gsd-t/contracts/rule-engine-contract.md` — rules.jsonl, patch-templates.jsonl, and patch status schemas
