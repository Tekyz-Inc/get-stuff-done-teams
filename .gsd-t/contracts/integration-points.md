# Integration Points

## Current State: Milestone 28 — Doc-Ripple Subagent (PARTITIONED — 2 domains)

## Dependency Graph

### Wave 1: doc-ripple-agent (must complete first)
- doc-ripple-agent: All tasks (core command file + contract + threshold logic)
- INDEPENDENT — no dependencies on other domains

### Checkpoint (doc-ripple-agent complete)
- GATE: commands/gsd-t-doc-ripple.md exists and follows GSD-T command conventions
- GATE: .gsd-t/contracts/doc-ripple-contract.md exists with trigger conditions and manifest format
- VERIFY: Threshold logic correctly classifies sample diffs as FIRE or SKIP

### Wave 2: command-integration (after doc-ripple-agent complete)
- command-integration: All tasks (wire into 5 commands + update reference docs)
- BLOCKED BY: doc-ripple-agent completion (needs the command file and contract to reference)

### Final Checkpoint (command-integration complete)
- GATE: All 5 target commands contain doc-ripple spawn block
- GATE: All 4 reference files updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- VERIFY: All existing tests pass (480+)

## Detailed Dependency Graph

```
doc-ripple-agent Task 1 (finalize contract — DRAFT→ACTIVE) — INDEPENDENT
  └──▶ doc-ripple-agent Task 2 (create gsd-t-doc-ripple.md — full workflow)
       └──▶ doc-ripple-agent Task 3 (write tests — threshold + manifest + blast radius)

doc-ripple-agent Task 3 complete — CHECKPOINT (verify contract ACTIVE, command file exists, tests pass)
  └──▶ command-integration Task 1 (wire into execute + integrate — parallel-safe)
  └──▶ command-integration Task 2 (wire into quick + debug — parallel-safe)
  └──▶ command-integration Task 3 (wire into wave — parallel-safe)
  └──▶ command-integration Task 4 (update 4 reference docs — parallel-safe)
```

## Wave Execution Groups

### Wave 1 — Foundation
- doc-ripple-agent: Tasks 1-3 (sequential — contract → command → tests)

### Wave 2 — Integration (all parallel-safe after checkpoint)
- command-integration: Tasks 1-4 (parallel-safe — each touches different files)

## Shared File Analysis

No shared files between domains. Each domain owns distinct files:
- doc-ripple-agent: commands/gsd-t-doc-ripple.md, .gsd-t/contracts/doc-ripple-contract.md
- command-integration: 5 existing command files + 4 reference docs
