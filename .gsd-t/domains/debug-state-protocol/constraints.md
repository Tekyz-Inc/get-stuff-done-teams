# Constraints: debug-state-protocol

## Must Follow
- Zero external dependencies — Node.js built-ins only (fs, path)
- Functions under 30 lines, file under 200 lines
- JSONL format (one JSON object per line) — same pattern as task-metrics.jsonl and rules.jsonl
- All functions must be exported via module.exports for testability
- Type documentation via JSDoc comments on all exported functions

## Must Not
- Modify files outside owned scope
- Import or depend on any other bin/*.js module (this is a standalone utility)
- Write to any file outside .gsd-t/debug-state.jsonl (the ledger file)
- Use async I/O — synchronous API for simplicity (matches bin/gsd-t.js convention)

## Must Read Before Using
- bin/metrics-collector.js — for JSONL read/write patterns used in this project (readTaskMetrics, collectTaskMetrics)
- bin/rule-engine.js — for another JSONL-based module pattern (getActiveRules, evaluateRules)
- .gsd-t/contracts/headless-contract.md — for existing headless mode interface that this integrates with

## Dependencies
- Depends on: nothing (foundation domain)
- Depended on by: headless-loop (imports ledger API), command-integration (references contract)
