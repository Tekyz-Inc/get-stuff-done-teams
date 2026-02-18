# Tasks: cmd-cleanup

## Summary
Bring all command files to consistent structure and conventions: add missing Autonomy Behavior sections, harden QA agent with file-path boundaries and multi-framework support, secure wave state handoff, standardize QA blocking language, and renumber all fractional steps to integers.

## Tasks

### Task 1: Add Autonomy Behavior sections to discuss.md and impact.md (TD-030)
- **Files**: commands/gsd-t-discuss.md, commands/gsd-t-impact.md
- **Contract refs**: None (internal command structure)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - gsd-t-discuss.md has a `### Autonomy Behavior` section with Level 3 / Level 1-2 blocks following the pattern used by partition.md, plan.md, execute.md
  - Level 3 for discuss: auto-resolve open questions and continue (when auto-invoked); always pause when manually invoked
  - gsd-t-impact.md has a `### Autonomy Behavior` section extracted from or added alongside the Decision Gate in Step 7
  - Both files' existing behavior is preserved — no change to observable flow

### Task 2: Harden gsd-t-qa.md — file-path boundaries, Document Ripple, multi-framework (TD-036, TD-037, TD-040)
- **Files**: commands/gsd-t-qa.md
- **Contract refs**: .gsd-t/contracts/qa-agent-contract.md (if exists)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - QA agent has explicit file-path boundary constraints: which directories/files it CAN modify (test directories only) and which it MUST NOT modify (source code, contracts, docs, commands)
  - Document Ripple section exists: after test generation, check if test file paths need adding to requirements.md or domain scope.md
  - Multi-framework guidance: test generation instructions cover jest/vitest/node:test (not just Playwright). QA agent detects the project's test framework before generating tests
  - Existing phase-specific behaviors are unchanged

### Task 3: Secure wave — integrity check + structured discuss-skip heuristic (TD-038, TD-041)
- **Files**: commands/gsd-t-wave.md
- **Contract refs**: .gsd-t/contracts/wave-phases-contract.md (if exists)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Wave Step 1 reads progress.md and validates its format integrity: checks for required fields (Status, Milestone name, Domains table) before proceeding
  - If integrity check fails, wave reports the issue and stops (does not blindly proceed with corrupted state)
  - Discuss-skip heuristic in Step 3 Phase 2 (DISCUSS) uses structured signals instead of subjective question: checks for presence of contracts, domain count, and open questions in progress.md Decision Log
  - Structured signal: skip discuss if (a) all contracts exist for cross-domain boundaries AND (b) no "OPEN QUESTION" items in Decision Log AND (c) single domain milestone
  - Existing phase sequence and agent-per-phase model are unchanged

### Task 4: Standardize QA blocking language across all 10 spawning commands (TD-039)
- **Files**: commands/gsd-t-test-sync.md, commands/gsd-t-plan.md
- **Contract refs**: None (internal consistency)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - gsd-t-test-sync.md line ~35 updated from "QA failure flags are included in the coverage report" to "QA failure blocks test-sync completion"
  - gsd-t-plan.md line ~132 updated from "Wait for QA agent to complete before proceeding" to "Wait for QA agent to complete before proceeding. QA failure blocks plan completion."
  - All 10 QA-spawning commands now use the pattern "QA failure blocks {phase} completion" (7 already correct: partition, execute, verify, complete-milestone, debug, quick, integrate)
  - No changes to the 7 files that already have correct language

### Task 5: Renumber all fractional steps to integers (TD-031)
- **Files**: commands/gsd-t-complete-milestone.md (3), commands/gsd-t-debug.md (1), commands/gsd-t-discuss.md (1), commands/gsd-t-execute.md (1), commands/gsd-t-feature.md (1), commands/gsd-t-impact.md (2), commands/gsd-t-init.md (5), commands/gsd-t-integrate.md (2), commands/gsd-t-milestone.md (2), commands/gsd-t-partition.md (3), commands/gsd-t-plan.md (3), commands/gsd-t-project.md (2), commands/gsd-t-promote-debt.md (2), commands/gsd-t-quick.md (1), commands/gsd-t-scan.md (1), commands/gsd-t-test-sync.md (1), commands/gsd-t-verify.md (1)
- **Contract refs**: None (formatting convention)
- **Dependencies**: Requires Tasks 1-4 (content changes must be done before renumbering so final step numbers are stable)
- **Acceptance criteria**:
  - Zero fractional step numbers (e.g., Step 4.5, Step 4.7, Step 7.6) across all 17 command files
  - All steps use sequential integers: Step 1, Step 2, Step 3, ...
  - Step content and ordering are preserved — only the numbers change
  - Internal cross-references (if any) to step numbers are updated
  - 32 fractional steps across 17 files are renumbered

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 4 (Tasks 1-4)
- Blocked tasks (waiting on other tasks): 1 (Task 5 requires Tasks 1-4)
- Estimated checkpoints: 0
