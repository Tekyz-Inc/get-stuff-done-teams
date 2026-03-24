# Domain: command-integration

## Responsibility
Owns all command file modifications for M26. Extends `gsd-t-execute.md` with active rule injection into subagent prompts, extends `gsd-t-plan.md` with pre-mortem step reading rules for domain-type failure patterns, extends `gsd-t-complete-milestone.md` with rule evaluation + patch candidate generation + promotion gate check + graduation steps in the distillation section. Implements quality budget governance logic in command files.

## Owned Files/Directories
- `commands/gsd-t-execute.md` — MODIFY: add active rule injection step before task dispatch (NEW step, after existing pre-flight)
- `commands/gsd-t-plan.md` — MODIFY: extend pre-mortem step to read rules.jsonl for domain-type failure patterns
- `commands/gsd-t-complete-milestone.md` — MODIFY: extend distillation step with rule evaluation, patch candidate generation, promotion gate check, graduation, consolidation

## NOT Owned (do not modify)
- `bin/rule-engine.js` — owned by rule-engine domain (called from command steps)
- `bin/patch-lifecycle.js` — owned by patch-lifecycle domain (called from command steps)
- `bin/metrics-collector.js` — owned by M25 (read-only)
- `bin/metrics-rollup.js` — owned by M25 (read-only)
- `.gsd-t/metrics/rules.jsonl` — owned by rule-engine domain
- `.gsd-t/metrics/patches/` — owned by patch-lifecycle domain
- All other command files not listed above
