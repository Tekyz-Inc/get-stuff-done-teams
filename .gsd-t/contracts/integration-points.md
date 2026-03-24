# Integration Points

## Current State: Milestone 26 — Declarative Rule Engine & Patch Lifecycle (PLANNED)

## Dependency Graph

### Independent (can start immediately)
- rule-engine: Task 1 (JSONL loaders + rule evaluator)

### First Checkpoint (rule-engine complete)
- GATE: rule-engine Task 5 (all tests pass)
- UNLOCKS: patch-lifecycle Task 1, command-integration Tasks 1-2
- VERIFY: Lead confirms rules.jsonl schema matches rule-engine-contract.md

### Second Checkpoint (patch-lifecycle complete)
- GATE: patch-lifecycle Task 4 (all tests pass)
- UNLOCKS: command-integration Tasks 3-4
- VERIFY: Lead confirms patch status files match contract, promotion gate works

### Final Checkpoint (command-integration complete)
- GATE: command-integration Task 4 (all reference docs updated)
- VERIFY: End-to-end: rule fires -> patch candidate -> promotion -> graduation
- VERIFY: All existing tests pass (373+) + new tests pass

## Detailed Dependency Graph

```
rule-engine Task 1 (JSONL loaders + rule evaluator) — INDEPENDENT
  └──▶ rule-engine Task 2 (patch-templates loader + pre-mortem query)
       └──▶ rule-engine Task 3 (activation tracking, deprecation, consolidation)
  └──▶ rule-engine Task 4 (seed rules + patch templates)
       [requires Task 1 for schema validation]
  └──▶ rule-engine Task 5 (tests)
       [requires Task 3]

rule-engine Task 5 (tests pass) — CHECKPOINT 1
  └──▶ patch-lifecycle Task 1 (candidate creation + application)
       └──▶ patch-lifecycle Task 2 (measurement, promotion, deprecation)
            └──▶ patch-lifecycle Task 3 (graduation)
  └──▶ command-integration Task 1 (execute rule injection)
  └──▶ command-integration Task 2 (plan pre-mortem enhancement)

rule-engine Task 4 + patch-lifecycle Task 3 — required before:
  └──▶ patch-lifecycle Task 4 (tests — needs seed data + all lifecycle functions)

patch-lifecycle Task 4 (tests pass) — CHECKPOINT 2
  └──▶ command-integration Task 3 (complete-milestone distillation)

command-integration Tasks 1-3 — required before:
  └──▶ command-integration Task 4 (reference documentation update)
```

## Shared File Analysis

No files are modified by multiple domains. Each domain has exclusive ownership:

| File                                      | Owner                | Notes                                  |
|-------------------------------------------|----------------------|----------------------------------------|
| `bin/rule-engine.js`                      | rule-engine          | NEW                                    |
| `.gsd-t/metrics/rules.jsonl`              | rule-engine          | NEW (read by patch-lifecycle, cmd-int) |
| `.gsd-t/metrics/patch-templates.jsonl`    | rule-engine          | NEW (read by patch-lifecycle)          |
| `bin/patch-lifecycle.js`                  | patch-lifecycle      | NEW                                    |
| `.gsd-t/metrics/patches/`                 | patch-lifecycle      | NEW (read by cmd-int)                  |
| `commands/gsd-t-execute.md`               | command-integration  | MODIFY (add rule injection step)       |
| `commands/gsd-t-plan.md`                  | command-integration  | MODIFY (extend pre-mortem)             |
| `commands/gsd-t-complete-milestone.md`    | command-integration  | MODIFY (extend distillation)           |
| `GSD-T-README.md`                         | command-integration  | MODIFY (add M26 docs)                  |
| `README.md`                               | command-integration  | MODIFY (add M26 features)              |
| `templates/CLAUDE-global.md`              | command-integration  | MODIFY (reflect new steps)             |
| `commands/gsd-t-help.md`                  | command-integration  | MODIFY (update descriptions)           |

## Wave Execution Groups

### Wave 1 — rule-engine (foundation)
- rule-engine: Tasks 1-5
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/rule-engine.js exists with all exports, tests pass, seed rules.jsonl + patch-templates.jsonl created

### CHECKPOINT 1
- GATE: rule-engine Task 5 (tests pass)
- VERIFY: Lead confirms rules.jsonl schema matches rule-engine-contract.md
- VERIFY: getActiveRules, evaluateRules, getPreMortemRules return correct results
- VERIFY: Activation tracking increments correctly
- UNLOCKS: patch-lifecycle Task 1, command-integration Tasks 1-2

### Wave 2 — patch-lifecycle (lifecycle layer)
- patch-lifecycle: Tasks 1-4
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/patch-lifecycle.js exists with all exports, tests pass, promotion gate works

### CHECKPOINT 2
- GATE: patch-lifecycle Task 4 (tests pass)
- VERIFY: Lead confirms patch status files match rule-engine-contract.md schema
- VERIFY: Promotion gate correctly blocks at <55% improvement
- VERIFY: Graduation writes to target file and signals rule removal
- UNLOCKS: command-integration Tasks 3-4

### Wave 3 — command-integration (wiring)
- command-integration: Tasks 1-4
- **Shared files**: NONE — each command file is modified by only this domain
- **Completes when**: execute injects rules, plan reads pre-mortem rules, complete-milestone runs full distillation cycle, reference docs updated

### CHECKPOINT 3 (Final)
- VERIFY: execute subagent prompt includes active rules for dispatched domain
- VERIFY: plan pre-mortem reads rules.jsonl and surfaces warnings
- VERIFY: complete-milestone distillation evaluates rules, generates patch candidates, checks promotion gates, graduates eligible patches
- VERIFY: Quality budget governance triggers constraint tightening when rework ceiling exceeded
- VERIFY: All existing tests pass (373+) + new rule-engine and patch-lifecycle tests pass

## Execution Order (for solo mode)

1. rule-engine Task 1 (JSONL loaders + rule evaluator)
2. rule-engine Task 2 (patch-templates loader + pre-mortem query)
3. rule-engine Task 3 (activation tracking, deprecation, consolidation)
4. rule-engine Task 4 (seed rules + patch templates)
5. rule-engine Task 5 (tests)
6. CHECKPOINT 1: verify rule-engine API
7. patch-lifecycle Task 1 (candidate creation + application)
8. patch-lifecycle Task 2 (measurement, promotion gate, deprecation)
9. patch-lifecycle Task 3 (graduation)
10. patch-lifecycle Task 4 (tests)
11. CHECKPOINT 2: verify patch-lifecycle API
12. command-integration Task 1 (execute rule injection)
13. command-integration Task 2 (plan pre-mortem enhancement)
14. command-integration Task 3 (complete-milestone distillation)
15. command-integration Task 4 (reference documentation update)
16. CHECKPOINT 3: final verification
17. INTEGRATION: verify end-to-end (rule fires -> patch candidate -> promotion -> graduation)
