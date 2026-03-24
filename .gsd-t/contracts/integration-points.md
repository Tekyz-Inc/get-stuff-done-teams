# Integration Points

## Current State: Milestone 26 — Declarative Rule Engine & Patch Lifecycle (PARTITIONED)

## Dependency Graph

```
rule-engine Task 1 (rules.jsonl schema + evaluator module) — INDEPENDENT
  └──▶ rule-engine Task 2 (patch-templates.jsonl schema)
  └──▶ rule-engine Task 3 (activation tracking + deprecation)
  └──▶ rule-engine Task 4 (periodic consolidation)
  └──▶ rule-engine Task 5 (unit tests)
  └──▶ patch-lifecycle Task 1 (lifecycle manager — needs rule evaluation)
  └──▶ command-integration Task 1 (execute rule injection — needs getActiveRules)
  └──▶ command-integration Task 2 (plan pre-mortem — needs getPreMortemRules)

rule-engine Task 5 (unit tests)
  └──▶ patch-lifecycle Task 1 (lifecycle manager — depends on tested rule-engine API)

patch-lifecycle Task 1 (lifecycle manager module)
  └──▶ patch-lifecycle Task 2 (promotion gate evaluation)
  └──▶ patch-lifecycle Task 3 (graduation into methodology artifacts)
  └──▶ patch-lifecycle Task 4 (unit tests)
  └──▶ command-integration Task 3 (complete-milestone distillation — needs patch operations)

patch-lifecycle Task 4 (unit tests)
  └──▶ command-integration Task 3 (complete-milestone — depends on tested patch-lifecycle API)

command-integration Task 1 (execute rule injection)
  └──▶ command-integration Task 4 (quality budget governance in commands)

command-integration Task 2 (plan pre-mortem extension)
  └──▶ command-integration Task 4 (quality budget governance in commands)

command-integration Task 3 (complete-milestone distillation extension)
  └──▶ command-integration Task 4 (quality budget governance in commands)
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

## Wave Execution Groups

### Wave 1 — rule-engine (foundation)
- rule-engine: Tasks 1-5
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/rule-engine.js exists with all exports, tests pass, rules.jsonl + patch-templates.jsonl schemas implemented

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
- VERIFY: Graduation writes to target file and removes from rules.jsonl
- UNLOCKS: command-integration Task 3-4

### Wave 3 — command-integration (wiring)
- command-integration: Tasks 1-4
- **Shared files**: NONE — each command file is modified by only this domain
- **Completes when**: execute injects rules, plan reads pre-mortem rules, complete-milestone runs full distillation cycle, quality budget governance active

### CHECKPOINT 3 (Final)
- VERIFY: execute subagent prompt includes active rules for dispatched domain
- VERIFY: plan pre-mortem reads rules.jsonl and surfaces warnings
- VERIFY: complete-milestone distillation evaluates rules, generates patch candidates, checks promotion gates, graduates eligible patches
- VERIFY: Quality budget governance triggers constraint tightening when rework ceiling exceeded
- VERIFY: All existing tests pass (373+) + new rule-engine and patch-lifecycle tests pass

## Execution Order (for solo mode)

1. rule-engine Task 1 (rules.jsonl schema + evaluator module)
2. rule-engine Task 2 (patch-templates.jsonl schema)
3. rule-engine Task 3 (activation tracking + deprecation)
4. rule-engine Task 4 (periodic consolidation)
5. rule-engine Task 5 (unit tests)
6. CHECKPOINT 1: verify rule-engine API
7. patch-lifecycle Task 1 (lifecycle manager module)
8. patch-lifecycle Task 2 (promotion gate evaluation)
9. patch-lifecycle Task 3 (graduation into methodology artifacts)
10. patch-lifecycle Task 4 (unit tests)
11. CHECKPOINT 2: verify patch-lifecycle API
12. command-integration Task 1 (execute rule injection)
13. command-integration Task 2 (plan pre-mortem extension)
14. command-integration Task 3 (complete-milestone distillation extension)
15. command-integration Task 4 (quality budget governance)
16. CHECKPOINT 3: final verification
17. INTEGRATION: verify end-to-end (rule fires -> patch candidate -> promotion -> graduation)
