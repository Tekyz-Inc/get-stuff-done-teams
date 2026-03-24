# Tasks: command-integration

## Summary
Wire the doc-ripple agent into the 5 GSD-T commands that produce code changes, and update all reference documentation. When complete, execute/integrate/quick/debug/wave auto-spawn doc-ripple before reporting completion.

## Tasks

### Task 1: Wire doc-ripple into execute and integrate commands
- **Files**: commands/gsd-t-execute.md (UPDATE), commands/gsd-t-integrate.md (UPDATE)
- **Contract refs**: doc-ripple-contract.md (Integration Pattern section — copy-paste the spawn block)
- **Dependencies**: BLOCKED BY doc-ripple-agent (all 3 tasks — checkpoint gate)
- **Acceptance criteria**:
  - gsd-t-execute.md has new Step after Step 6 (completion) with doc-ripple threshold check + spawn block
  - gsd-t-integrate.md has new Step after Step 7 (test verification) with doc-ripple threshold check + spawn block
  - Spawn blocks follow exact pattern from doc-ripple-contract.md Integration Pattern section
  - Includes observability logging (model display before spawn)
  - Existing steps are NOT modified — doc-ripple is appended before the Autonomy Behavior / completion section

### Task 2: Wire doc-ripple into quick and debug commands
- **Files**: commands/gsd-t-quick.md (UPDATE), commands/gsd-t-debug.md (UPDATE)
- **Contract refs**: doc-ripple-contract.md (Integration Pattern section)
- **Dependencies**: BLOCKED BY doc-ripple-agent (all 3 tasks — checkpoint gate)
- **Acceptance criteria**:
  - gsd-t-quick.md has new Step after Step 5 (test & verify) with doc-ripple threshold check + spawn block
  - gsd-t-debug.md has new Step after Step 5 (test verification) with doc-ripple threshold check + spawn block
  - Spawn blocks follow exact pattern from doc-ripple-contract.md
  - Existing steps are NOT modified

### Task 3: Wire doc-ripple into wave command
- **Files**: commands/gsd-t-wave.md (UPDATE)
- **Contract refs**: doc-ripple-contract.md (Integration Pattern section)
- **Dependencies**: BLOCKED BY doc-ripple-agent (all 3 tasks — checkpoint gate)
- **Acceptance criteria**:
  - gsd-t-wave.md includes doc-ripple in the phase orchestration — fires after each phase agent completes (not just at end of wave)
  - Or alternatively: fires once after the final phase (verify/complete-milestone) before wave reports completion
  - Decision: fire once at wave end (after verify completes) — per-phase firing would be excessive since wave phases are sequential and intermediate doc updates would be overwritten by later phases
  - Existing wave phase sequence is NOT modified

### Task 4: Update reference documentation
- **Files**: commands/gsd-t-help.md (UPDATE), docs/GSD-T-README.md (UPDATE), README.md (UPDATE), templates/CLAUDE-global.md (UPDATE)
- **Contract refs**: none (documentation-only task)
- **Dependencies**: BLOCKED BY doc-ripple-agent (all 3 tasks — checkpoint gate)
- **Acceptance criteria**:
  - gsd-t-help.md includes doc-ripple in the command list with brief description
  - GSD-T-README.md includes doc-ripple in the command reference table
  - README.md includes doc-ripple in the commands table
  - templates/CLAUDE-global.md includes doc-ripple in the commands table
  - Command count is accurate in all 4 files
  - bin/gsd-t.js command count logic updated if it references a hardcoded count
  - Run full test suite after updates: `node --test test/*.test.js` — 0 failures

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0 (all blocked by doc-ripple-agent Task 2)
- Blocked tasks (waiting on other domains): 4
- Estimated checkpoints: 1 (doc-ripple-agent completion gate)
