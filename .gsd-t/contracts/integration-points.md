# Integration Points

## Current State: Milestone 27 — Cross-Project Learning & Global Sync (PLANNED — 11 tasks across 3 domains)

## Dependency Graph

### Independent (can start immediately)
- global-metrics: Task 1 (global-sync-manager.js core API)

### First Checkpoint (global-metrics complete)
- GATE: global-metrics tests pass
- UNLOCKS: cross-project-sync Task 1, command-extensions Tasks 1-2
- VERIFY: Lead confirms global-rules.jsonl/global-rollup.jsonl schemas match cross-project-sync-contract.md

### Second Checkpoint (cross-project-sync complete)
- GATE: cross-project-sync tests pass
- UNLOCKS: command-extensions Task 3
- VERIFY: Lead confirms doUpdateAll syncs global rules to registered projects

### Final Checkpoint (command-extensions complete)
- GATE: command-extensions reference docs updated
- VERIFY: End-to-end: local promotion -> global rule -> update-all propagation -> cross-project metrics display
- VERIFY: All existing tests pass (433+) + new tests pass

## Detailed Dependency Graph

```
global-metrics Task 1 (global-sync-manager.js core: read local, write global) — INDEPENDENT
  └──▶ global-metrics Task 2 (signal distribution comparison, domain-type matching)
       └──▶ global-metrics Task 3 (universal rule promotion logic)
  └──▶ global-metrics Task 4 (tests)
       [requires Tasks 1-3]

global-metrics Task 4 (tests pass) — CHECKPOINT 1
  └──▶ cross-project-sync Task 1 (extend doUpdateAll with global rule sync)
       └──▶ cross-project-sync Task 2 (npm distribution pipeline for universal rules)
  └──▶ cross-project-sync Task 3 (tests)
       [requires Tasks 1-2]
  └──▶ command-extensions Task 1 (gsd-t-metrics --cross-project)
  └──▶ command-extensions Task 2 (gsd-t-status global ELO)

cross-project-sync Task 3 (tests pass) — CHECKPOINT 2
  └──▶ command-extensions Task 3 (gsd-t-complete-milestone global promotion step)

command-extensions Tasks 1-3 — required before:
  └──▶ command-extensions Task 4 (reference documentation update)
```

## Shared File Analysis

No files are modified by multiple domains. Each domain has exclusive ownership:

| File                                           | Owner               | Notes                                       |
|------------------------------------------------|----------------------|---------------------------------------------|
| `bin/global-sync-manager.js`                   | global-metrics       | NEW                                         |
| `~/.claude/metrics/global-rules.jsonl`         | global-metrics       | NEW (read by cross-project-sync, cmd-ext)   |
| `~/.claude/metrics/global-rollup.jsonl`        | global-metrics       | NEW (read by cmd-ext)                       |
| `~/.claude/metrics/global-signal-distributions.jsonl` | global-metrics | NEW (read by cmd-ext)                       |
| `test/global-sync-manager.test.js`             | global-metrics       | NEW                                         |
| `bin/gsd-t.js`                                 | cross-project-sync   | MODIFY (extend doUpdateAll)                 |
| `examples/rules/`                              | cross-project-sync   | NEW (universal rules for npm)               |
| `test/global-rule-sync.test.js`                | cross-project-sync   | NEW                                         |
| `commands/gsd-t-metrics.md`                    | command-extensions   | MODIFY (add cross-project steps)            |
| `commands/gsd-t-status.md`                     | command-extensions   | MODIFY (add global ELO step)                |
| `commands/gsd-t-complete-milestone.md`         | command-extensions   | MODIFY (add global promotion step)          |
| `GSD-T-README.md`                              | command-extensions   | MODIFY (add M27 docs)                       |
| `README.md`                                    | command-extensions   | MODIFY (add M27 features)                   |
| `templates/CLAUDE-global.md`                   | command-extensions   | MODIFY (reflect new capabilities)           |
| `commands/gsd-t-help.md`                       | command-extensions   | MODIFY (update descriptions)                |

## Wave Execution Groups

### Wave 1 — global-metrics (foundation)
- global-metrics: Tasks 1-4
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: bin/global-sync-manager.js exists with all exports, tests pass, global JSONL schemas validated

### CHECKPOINT 1
- GATE: global-metrics tests pass
- VERIFY: Lead confirms global-rules.jsonl schema matches cross-project-sync-contract.md
- VERIFY: readGlobalRules, writeGlobalRule, compareSignalDistributions return correct results
- VERIFY: Universal promotion logic increments correctly
- UNLOCKS: cross-project-sync Task 1, command-extensions Tasks 1-2

### Wave 2 — cross-project-sync (propagation layer)
- cross-project-sync: Tasks 1-3
- **Shared files**: NONE — safe for solo sequential
- **Completes when**: doUpdateAll includes global rule sync step, npm pipeline logic exists, tests pass

### CHECKPOINT 2
- GATE: cross-project-sync tests pass
- VERIFY: Lead confirms doUpdateAll propagates global rules as candidates to registered projects
- VERIFY: Universal rules (3+ projects) flagged correctly
- VERIFY: NPM candidate rules (5+ projects) written to examples/rules/
- UNLOCKS: command-extensions Task 3

### Wave 3 — command-extensions (wiring)
- command-extensions: Tasks 1-4
- **Shared files**: NONE — each command file is modified by only this domain
- **Completes when**: metrics shows cross-project comparison, status shows global ELO, complete-milestone runs global promotion, reference docs updated

### CHECKPOINT 3 (Final)
- VERIFY: `gsd-t-metrics --cross-project` displays signal-type distribution comparison across projects
- VERIFY: `gsd-t-status` displays global ELO and cross-project rank when global metrics exist
- VERIFY: `gsd-t-complete-milestone` copies promoted rules to global-rules.jsonl after local promotion
- VERIFY: All existing tests pass (433+) + new global-sync-manager and global-rule-sync tests pass

## Execution Order (for solo mode)

1. global-metrics Task 1 (global-sync-manager.js core: read local, write global)
2. global-metrics Task 2 (signal distribution comparison, domain-type matching)
3. global-metrics Task 3 (universal rule promotion logic)
4. global-metrics Task 4 (tests)
5. CHECKPOINT 1: verify global-metrics API
6. cross-project-sync Task 1 (extend doUpdateAll with global rule sync)
7. cross-project-sync Task 2 (npm distribution pipeline for universal rules)
8. cross-project-sync Task 3 (tests)
9. CHECKPOINT 2: verify cross-project-sync
10. command-extensions Task 1 (gsd-t-metrics --cross-project mode)
11. command-extensions Task 2 (gsd-t-status global ELO display)
12. command-extensions Task 3 (gsd-t-complete-milestone global promotion step)
13. command-extensions Task 4 (reference documentation update)
14. CHECKPOINT 3: final verification
15. INTEGRATION: verify end-to-end (local promotion -> global -> update-all -> cross-project display)
