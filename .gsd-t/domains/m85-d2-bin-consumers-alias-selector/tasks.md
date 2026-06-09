# Tasks: m85-d2-bin-consumers-alias-selector

## Summary
Fix the live `opus → claude-opus-4-7` alias bug, add the FABLE tier + escalation ladder to the model selector, and reconcile the model-selector test — all sourcing ids from the policy contract.

## Tasks

### Task 1: Fix the stale alias map (Headline)
- **Files**: `bin/gsd-t-parallel.cjs`
- **Contract refs**: `model-tier-policy-contract.md`
- **Dependencies**: BLOCKED by m85-d1-tier-policy-module Task 1 (needs published constants)
- **Acceptance criteria**:
  - `modelAlias.opus` resolves to `claude-opus-4-8` (the stale `claude-opus-4-7` is gone).
  - `modelAlias.fable` added, resolves to `claude-fable-5`.
  - Ids sourced from the policy module/contract, not re-hardcoded rationale.
  - **Killing test**: existing parallel/alias tests (or a targeted assertion) prove `opus → 4-8` and `fable → 5`, and that `claude-opus-4-7` no longer appears in the alias map.

### Task 2: Add FABLE tier + escalation ladder to model-selector
- **Files**: `bin/model-selector.js`
- **Contract refs**: `model-tier-policy-contract.md`
- **Dependencies**: BLOCKED by m85-d1-tier-policy-module Task 1
- **Acceptance criteria**:
  - `TIERS` enum gains `FABLE: "fable"`.
  - Escalation ladder: cycle-1 `opus` → cycle-2 `fable` → needs-human.
  - `haiku`/`sonnet` bottom-of-ladder rules UNCHANGED (no drift) — AC(f).
  - Concrete ids reconciled to the policy module constants.

### Task 3: Reconcile the model-selector test
- **Files**: `test/model-selector.test.js`
- **Contract refs**: `model-tier-policy-contract.md`
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - Asserts FABLE tier exists.
  - Asserts escalation ladder cycle-2 resolves to fable.
  - Asserts haiku/sonnet bottom-of-ladder unchanged.
  - `npm test` green for this suite.
