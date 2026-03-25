# Integration Points

## Current State: Milestone 30 — Stack Rules Engine (PARTITIONED — 2 domains)

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
