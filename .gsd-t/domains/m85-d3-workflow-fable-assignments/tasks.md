# Tasks: m85-d3-workflow-fable-assignments

## Summary
Slot Fable into the 5 designated workflow stages across 3 files, preserving the competition-producer-stays-opus / judge-moves-to-fable blindness invariant, and verify all 5 show `⚙ [fable]` in a real sandbox run.

## Tasks

### Task 1: Fable the 4 gsd-t-phase stages + hold the producer invariant (Headline)
- **Files**: `templates/workflows/gsd-t-phase.workflow.js`
- **Contract refs**: `model-tier-policy-contract.md`, `competition-mode-contract.md`
- **Dependencies**: BLOCKED by m85-d1-tier-policy-module Task 2 (contract) and m85-d4-lint-shadow-docs Task 1 (lint exists to prove conformance)
- **Acceptance criteria**:
  - Solution-space probe (~172): `opus` → `fable`.
  - Partition probe (~198): `opus` → `fable`.
  - Competition judge (~476): `sonnet` → `fable`.
  - Pre-mortem (~656): `opus` → `fable`.
  - Competition producers (~432): STAY `opus` (invariant — unchanged).
  - No `require`/`fs`/`process` reintroduced (M71 runtime-native lint stays green).
  - **Killing test**: D4's lint asserts these 4 stages resolve to fable AND producers stay opus.

### Task 2: Fable Red Team in verify
- **Files**: `templates/workflows/gsd-t-verify.workflow.js`
- **Contract refs**: `model-tier-policy-contract.md`, `orthogonal-validation-contract.md`
- **Dependencies**: BLOCKED by m85-d1 Task 2, m85-d4 Task 1
- **Acceptance criteria**:
  - Red Team (~307): `opus` → `fable`.
  - Red Team stays NON-SKIPPABLE (only tier changed) — AC(f).

### Task 3: Fable debug cycle-2 escalation
- **Files**: `templates/workflows/gsd-t-debug.workflow.js`
- **Contract refs**: `model-tier-policy-contract.md`, `debug-loop-contract.md`
- **Dependencies**: BLOCKED by m85-d1 Task 2, m85-d4 Task 1
- **Acceptance criteria**:
  - Cycle-2 escalation (~97): → `fable` (cycle-1 stays opus, then needs-human).

### Task 4: Real-sandbox verification (AC c/d)
- **Files**: (none — verification run)
- **Dependencies**: Requires Tasks 1–3 (within domain)
- **Acceptance criteria**:
  - A real Workflow run shows `⚙ [fable]` in `/workflows` for all 5 designated stages. `node --check` alone is insufficient.
