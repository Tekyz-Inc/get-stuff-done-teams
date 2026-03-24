# Constraints: patch-lifecycle

## Must Follow
- Zero external npm dependencies — Node.js built-ins only (project convention)
- Functions under 30 lines — split if longer
- Files under 200 lines — create new modules if needed
- Type hints via JSDoc on all exported functions
- Patch files in `.gsd-t/metrics/patches/` use structured JSON format
- Promotion gate threshold: >55% improvement measured over 2+ milestones (from AlphaZero)
- Graduation requires: promoted status sustained for 3+ milestones
- Graduation writes to constraints.md / verify checks / plan pre-conditions — NOT directly to CLAUDE.md (Destructive Action Guard)
- Deprecation threshold: rule hasn't fired in N milestones (configurable, default 5)
- Consolidation: every 5 milestones, related rules distilled into single cleaner rule

## Must Not
- Modify files outside owned scope (except graduation targets via explicit protocol)
- Apply patches without going through the full lifecycle (no shortcutting candidate->graduated)
- Graduate patches that haven't been measured for 2+ milestones
- Skip the promotion gate check
- Modify CLAUDE.md directly — graduation proposals require user confirmation (Destructive Action Guard)

## Must Read Before Using
- `bin/rule-engine.js` — understand rule schema and evaluation API
- `bin/metrics-collector.js` — understand task-metrics schema for measurement
- `bin/metrics-rollup.js` — understand rollup data for milestone-level measurement
- `.gsd-t/contracts/rule-engine-contract.md` — canonical schemas for rules, patches, promotion gates
- `.gsd-t/contracts/metrics-schema-contract.md` — task-metrics and rollup schemas

## Dependencies
- Depends on: rule-engine for trigger detection and rule evaluation results
- Depends on: M25 metrics-collection for task-metrics.jsonl (measurement data)
- Depends on: M25 metrics-rollup for rollup.jsonl (milestone-level measurement)
- Depended on by: command-integration for patch status queries and graduation results
