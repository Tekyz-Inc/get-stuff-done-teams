# Tasks: doc-ripple-agent

## Summary
Deliver the core doc-ripple command file and finalize its contract. When complete, `commands/gsd-t-doc-ripple.md` defines the full workflow: threshold check, blast radius analysis, manifest generation, and parallel update dispatch.

## Tasks

### Task 1: Finalize doc-ripple contract
- **Files**: .gsd-t/contracts/doc-ripple-contract.md (UPDATE — already drafted during partition)
- **Contract refs**: doc-ripple-contract.md (self — finalize from DRAFT to ACTIVE)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Contract status changed from DRAFT to ACTIVE
  - Threshold trigger conditions are complete and unambiguous (7 FIRE conditions, 3 SKIP conditions)
  - Manifest format includes all columns (Document, Status, Action, Reason)
  - Integration pattern section provides exact copy-paste block for consumer commands
  - Model assignments documented (inline for threshold, haiku for mechanical updates, sonnet for complex docs)

### Task 2: Create gsd-t-doc-ripple.md command file
- **Files**: commands/gsd-t-doc-ripple.md (NEW)
- **Contract refs**: doc-ripple-contract.md (implements full contract), pre-commit-gate.md (cross-references checklist), fresh-dispatch-contract.md (follows dispatch pattern)
- **Dependencies**: Requires Task 1 (contract must be ACTIVE)
- **Acceptance criteria**:
  - Step-numbered workflow following GSD-T command conventions
  - Step 1: Load context (read CLAUDE.md, git diff, pre-commit-gate contract)
  - Step 2: Threshold check — deterministic FIRE/SKIP decision per contract trigger conditions
  - Step 3: Blast radius analysis — classify changed files, cross-reference pre-commit gate, identify affected documents
  - Step 4: Generate manifest at .gsd-t/doc-ripple-manifest.md
  - Step 5: Update documents — inline for <3, parallel subagents for 3+
  - Step 6: Report summary (N checked, N updated, N skipped)
  - Includes OBSERVABILITY LOGGING block per CLAUDE.md
  - Includes $ARGUMENTS and Auto-Clear sections
  - File is under 200 lines (per code standards)

### Task 3: Write tests for doc-ripple
- **Files**: test/doc-ripple.test.js (NEW)
- **Contract refs**: doc-ripple-contract.md (test threshold logic and manifest format)
- **Dependencies**: Requires Task 2 (command file must exist to test against)
- **Acceptance criteria**:
  - Tests for threshold logic: verify FIRE on cross-cutting changes (3+ dirs, contract modified, template modified, CLAUDE.md modified, command file modified, convention keywords detected)
  - Tests for threshold logic: verify SKIP on trivial changes (1-2 dirs, implementation-only, no interface changes)
  - Tests for manifest format: verify correct columns and status values
  - Tests for blast radius analysis: verify pre-commit gate cross-referencing produces correct document list
  - All new tests pass alongside existing 480 tests
  - Run full test suite: `node --test test/*.test.js` — 0 failures
