# Integration Points

## Current State: Milestone 32 — Quality Culture & Design (PARTITIONED — 3 domains)

## M32 Dependency Graph

### Wave 1: All domains are INDEPENDENT and parallel-safe

All three M32 domains touch distinct files with no shared ownership:
- quality-persona: templates/CLAUDE-project.md, gsd-t-init.md, gsd-t-setup.md
- design-brief: gsd-t-partition.md, gsd-t-plan.md, gsd-t-setup.md (different sections)
- evaluator-interactivity: gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md

> Note: both quality-persona and design-brief touch gsd-t-setup.md but in different sections
> (persona config vs. design brief generation). This is safe as long as edits are to distinct
> steps and do not conflict. Execute these tasks in the same session but with non-overlapping
> section targets, or run them sequentially.

### Shared File Alert: gsd-t-setup.md

| Domain           | Section Target in gsd-t-setup.md        |
|------------------|------------------------------------------|
| quality-persona  | New step: persona configuration option   |
| design-brief     | New step: design brief generation option |

**Resolution**: These are additive new steps in different locations within the file. The execute agent must apply both changes in a single pass to avoid merge conflicts.

### Checkpoint: M32 Complete

- GATE: `templates/CLAUDE-project.md` contains `## Quality North Star` section with preset options
- GATE: `commands/gsd-t-init.md` contains persona detection/selection step
- GATE: `commands/gsd-t-setup.md` contains both persona config AND design brief generation options
- GATE: `commands/gsd-t-partition.md` contains design brief detection/generation step
- GATE: `commands/gsd-t-plan.md` contains note referencing design brief for UI tasks
- GATE: `commands/gsd-t-execute.md` contains exploratory testing block in QA/Red Team section
- GATE: `commands/gsd-t-quick.md` contains exploratory testing block
- GATE: `commands/gsd-t-integrate.md` contains exploratory testing block
- GATE: `commands/gsd-t-debug.md` contains exploratory testing block
- VERIFY: All exploratory blocks skip silently when Playwright MCP not available
- VERIFY: Persona injection skips silently when `## Quality North Star` section absent
- VERIFY: Design brief generation skips for non-UI projects

## M32 Detailed Dependency Graph

```
quality-persona Task 1 — INDEPENDENT, parallel-safe
  - templates/CLAUDE-project.md (new section)
  - commands/gsd-t-init.md (new step)
  - commands/gsd-t-setup.md (new option — section A)

design-brief Task 1 — INDEPENDENT, parallel-safe (caution: gsd-t-setup.md shared)
  - commands/gsd-t-partition.md (new detection step)
  - commands/gsd-t-plan.md (new reference note)
  - commands/gsd-t-setup.md (new option — section B, different from quality-persona's)

evaluator-interactivity Task 1 — INDEPENDENT, parallel-safe
  - commands/gsd-t-execute.md (exploratory block)
  - commands/gsd-t-quick.md (exploratory block)
  - commands/gsd-t-integrate.md (exploratory block)
  - commands/gsd-t-debug.md (exploratory block)

All three tasks complete → CHECKPOINT: M32 Complete
```

## M32 Execution Recommendation

Run all three tasks in the same execute session. Since evaluator-interactivity touches 4 different files from the other two domains, it is fully parallel-safe. The quality-persona + design-brief tasks share gsd-t-setup.md — execute them sequentially (quality-persona first, then design-brief) to apply both changes in one file pass.

---

## Previous State: Milestone 30 — Stack Rules Engine (PARTITIONED — 2 domains)

## M30 Dependency Graph

### Wave 1: stack-templates (must complete first)
- stack-templates: All tasks (react.md, typescript.md, node-api.md)
- INDEPENDENT — no dependencies on other domains

### Checkpoint 1 (stack-templates complete)
- GATE: `templates/stacks/react.md` exists and follows template structure contract
- GATE: `templates/stacks/typescript.md` exists and follows template structure contract
- GATE: `templates/stacks/node-api.md` exists and follows template structure contract
- VERIFY: Each file starts with `# {Name} Standards` and includes mandatory framing

### Wave 2: command-integration (after stack-templates complete)
- command-integration: All tasks (detection + injection in 5 commands + QA + tests + docs)
- BLOCKED BY: stack-templates completion (templates must exist for integration tests)

### Final Checkpoint (command-integration complete)
- GATE: All 5 target commands contain stack detection + injection block
- GATE: QA subagent prompts include stack rule validation
- GATE: Reference docs updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- GATE: Tests validate detection logic and template matching
- VERIFY: All existing tests pass (537+)

## M30 Detailed Dependency Graph

```
stack-templates Task 1 (react.md) — INDEPENDENT, parallel-safe
stack-templates Task 2 (typescript.md) — INDEPENDENT, parallel-safe
stack-templates Task 3 (node-api.md) — INDEPENDENT, parallel-safe

stack-templates complete — CHECKPOINT 1
  └──▶ command-integration Task 1 (detection block + execute + quick wiring)
  └──▶ command-integration Task 2 (integrate + wave + debug wiring)
  └──▶ command-integration Task 3 (QA prompt updates across all 5 commands)
  └──▶ command-integration Task 4 (tests + reference doc updates)
```

---

## Previous State: Milestone 29 — Compaction-Proof Debug Loop (PARTITIONED — 3 domains)

## Dependency Graph

### Wave 1: debug-state-protocol (must complete first)
- debug-state-protocol: All tasks (ledger API + contract + tests)
- INDEPENDENT — no dependencies on other domains

### Checkpoint 1 (debug-state-protocol complete)
- GATE: bin/debug-ledger.js exists and exports all 6 functions (readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats, clearLedger)
- GATE: .gsd-t/contracts/debug-loop-contract.md exists with ledger schema and API definitions
- VERIFY: All ledger functions work correctly (unit tests pass)

### Wave 2: headless-loop (after debug-state-protocol complete)
- headless-loop: All tasks (CLI debug-loop mode + escalation tiers + tests)
- BLOCKED BY: debug-state-protocol completion (imports bin/debug-ledger.js)

### Checkpoint 2 (headless-loop complete)
- GATE: `gsd-t headless --debug-loop --help` produces valid output
- GATE: --max-iterations flag enforced externally
- GATE: Escalation tiers work (sonnet 1-5, opus 6-15, stop 16-20)
- VERIFY: Unit tests for loop functions pass

### Wave 3: command-integration (after headless-loop complete)
- command-integration: All tasks (wire 5 commands + update reference docs)
- BLOCKED BY: headless-loop completion (commands reference the debug-loop invocation)

### Final Checkpoint (command-integration complete)
- GATE: All 5 target commands contain debug-loop delegation pattern
- GATE: Reference docs updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- VERIFY: All existing tests pass (537+)

## Detailed Dependency Graph

```
debug-state-protocol Task 1 (contract finalization + ledger schema) — INDEPENDENT
  └──▶ debug-state-protocol Task 2 (bin/debug-ledger.js — all 6 exports)
       └──▶ debug-state-protocol Task 3 (unit tests for ledger API)

debug-state-protocol Task 3 complete — CHECKPOINT 1
  └──▶ headless-loop Task 1 (--debug-loop flag parsing + doHeadlessDebugLoop skeleton)
       └──▶ headless-loop Task 2 (iteration cycle + escalation tiers + preamble injection)
            └──▶ headless-loop Task 3 (unit tests for debug-loop functions)

headless-loop Task 3 complete — CHECKPOINT 2
  └──▶ command-integration Task 1 (wire execute + debug — parallel-safe)
  └──▶ command-integration Task 2 (wire wave + test-sync + verify — parallel-safe)
  └──▶ command-integration Task 3 (update 4 reference docs — parallel-safe)
```

## Wave Execution Groups

### Wave 1 — Foundation
- debug-state-protocol: Tasks 1-3 (sequential — contract → implementation → tests)

### Wave 2 — Loop Controller
- headless-loop: Tasks 1-3 (sequential — skeleton → full implementation → tests)

### Wave 3 — Wiring (all parallel-safe after checkpoint)
- command-integration: Tasks 1-3 (parallel-safe — each touches different files)

## Shared File Analysis

No shared files between domains. Each domain owns distinct files:
- debug-state-protocol: bin/debug-ledger.js, test/debug-ledger.test.js, .gsd-t/contracts/debug-loop-contract.md
- headless-loop: bin/gsd-t.js (new functions only), test/headless-debug-loop.test.js
- command-integration: 5 command files + 4 reference docs
