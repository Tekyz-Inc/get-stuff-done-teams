# Domain: rule-engine

## Responsibility
Owns the declarative rule engine and patch template system. Defines the JSONL schemas for rules and patch templates, implements the rule evaluator that matches task-metrics patterns against rules, manages activation count tracking, and handles periodic rule consolidation.

## Owned Files/Directories
- `bin/rule-engine.js` — rule evaluator module: load rules, match against task-metrics, fire triggers, track activations (NEW)
- `.gsd-t/metrics/rules.jsonl` — declarative detection rules as JSON objects (NEW, runtime data)
- `.gsd-t/metrics/patch-templates.jsonl` — maps triggers to command file / constraints.md edits (NEW, runtime data)

## NOT Owned (do not modify)
- `bin/metrics-collector.js` — owned by M25 metrics-collection (read-only dependency)
- `bin/metrics-rollup.js` — owned by M25 metrics-rollup (read-only dependency)
- `.gsd-t/metrics/task-metrics.jsonl` — read-only (written by metrics-collector)
- `.gsd-t/metrics/rollup.jsonl` — read-only (written by metrics-rollup)
- `commands/*.md` — owned by command-integration domain
- `.gsd-t/metrics/patches/` — owned by patch-lifecycle domain
