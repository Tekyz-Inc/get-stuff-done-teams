# Integration Points — Milestone 2: QA Agent

## Dependency Graph

### Independent (can start immediately)
- contract-test-gen: All tasks (no dependencies)

### First Checkpoint
- GATE: contract-test-gen must complete (test generation rules defined for API, schema, component contracts)
- UNLOCKS: qa-agent-spec (needs generation rules to write agent instructions)
- VERIFY: Lead confirms mapping rules cover all 3 contract types with valid test output

### Second Checkpoint
- GATE: qa-agent-spec must complete (QA agent definition finalized in commands/gsd-t-qa.md)
- UNLOCKS: command-integration (needs agent spec to reference when adding spawn steps)
- VERIFY: Lead confirms agent spec matches qa-agent-contract.md interface

### Final
- GATE: command-integration must complete (all 10 commands updated)
- VERIFY: All commands spawn QA agent consistently, no existing functionality broken

## Execution Order (solo mode)
1. contract-test-gen: Define API contract → test mapping rules
2. contract-test-gen: Define schema contract → test mapping rules
3. contract-test-gen: Define component contract → test mapping rules
4. CHECKPOINT: verify all 3 mapping rules produce valid test skeletons
5. qa-agent-spec: Write QA agent definition (commands/gsd-t-qa.md)
6. qa-agent-spec: Add QA Agent spawn rule to templates/CLAUDE-global.md
7. CHECKPOINT: verify agent spec matches qa-agent-contract.md
8. command-integration: Update partition, plan, execute
9. command-integration: Update verify, complete-milestone, integrate
10. command-integration: Update quick, debug
11. command-integration: Update test-sync, wave
12. CHECKPOINT: verify all 10 commands spawn QA agent correctly

## Parallelization Notes
- contract-test-gen tasks 1-3 can run in parallel (each contract type is independent)
- command-integration tasks 8-11 can run in parallel (each modifies different files)
- qa-agent-spec tasks 5-6 are sequential (spec must exist before template references it)
