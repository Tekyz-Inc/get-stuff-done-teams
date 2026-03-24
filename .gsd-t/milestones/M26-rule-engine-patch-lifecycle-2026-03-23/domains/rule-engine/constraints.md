# Constraints: rule-engine

## Must Follow
- Zero external npm dependencies — Node.js built-ins only (project convention)
- Functions under 30 lines — split if longer
- Files under 200 lines — create new modules if needed
- Type hints via JSDoc on all exported functions
- JSONL format: one JSON object per line, append-only
- Rules are declarative data (JSON), not executable code — the evaluator interprets them
- Module must export a clean API consumable by command-integration domain

## Must Not
- Modify files outside owned scope (especially command files and patch directories)
- Import or depend on external npm packages
- Execute rules directly — rules define patterns, the evaluator matches them
- Modify task-metrics.jsonl or rollup.jsonl (read-only)

## Must Read Before Using
- `bin/metrics-collector.js` — understand getPreFlightWarnings() API and task-metrics schema
- `bin/metrics-rollup.js` — understand rollup aggregation and heuristic detection
- `.gsd-t/contracts/metrics-schema-contract.md` — canonical task-metrics and rollup schemas
- `.gsd-t/contracts/event-schema-contract.md` — event types and writer API

## Dependencies
- Depends on: M25 metrics-collection for task-metrics.jsonl data (read-only)
- Depends on: M25 metrics-rollup for rollup.jsonl data (read-only)
- Depended on by: patch-lifecycle for rule evaluation results
- Depended on by: command-integration for active rule queries and match results

## Assumption Dispositions
- AlphaZero >55% win rate threshold: INSPECT — use as inspiration for promotion gate threshold, not import
- Google SRE error budget: INSPECT — adapt concept for quality budget governance, not import
- Immune system affinity maturation: INSPECT — adapt activation count retirement concept
- Manufacturing SPC: INSPECT — adapt control chart concept for variance detection
