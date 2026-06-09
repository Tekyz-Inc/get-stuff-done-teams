# Tasks: m85-d1-tier-policy-module

## Summary
Ship the single zero-dep canonical tier-policy module and its cross-domain contract. When complete, the SOLE source of truth for `{stage → tier → model id}` exists, the Fable thinking-disabled-400 breaking change is encoded once via `requiresThinkingOmitted`, and the contract publishes the id constants every other M85 domain codes against.

## Tasks

### Task 1: Write the tier-policy module (Headline)
- **Files**: `bin/gsd-t-model-tier-policy.cjs` (NEW)
- **Contract refs**: `model-tier-policy-contract.md` (this domain authors it)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Exports named id constants: `MODEL_OPUS = "claude-opus-4-8"`, `MODEL_FABLE = "claude-fable-5"`, `MODEL_SONNET = "claude-sonnet-4-6"`, `MODEL_HAIKU = "claude-haiku-4-5-20251001"`.
  - Exports a `TIER_TO_MODEL` map (`opus/fable/sonnet/haiku → concrete id`).
  - Exports a `STAGE_POLICY` map keyed by the M85 designated stages (solution-space probe, partition probe, pre-mortem, competition judge, red-team, debug cycle-2) → tier, with the 5 Fable assignments resolving to `fable`.
  - Exports `requiresThinkingOmitted(model)` returning `true` iff `model === MODEL_FABLE`; comment cites the HTTP-400 breaking change as the rationale, encoded ONCE.
  - Exports a `resolve(stageKey)` function returning the concrete model id for a stage key.
  - Provides a CLI surface (`node bin/gsd-t-model-tier-policy.cjs resolve <stageKey>` and/or `--json`) so invokers can inject ids via args at invoke time (M69 pattern). Emits a JSON envelope.
  - Zero external deps; loads under plain `require`.
  - **Killing test** (D4 owns the lint that proves this): a deliberately-drifted literal must FAIL the lint; `requiresThinkingOmitted("claude-fable-5") === true` and `=== false` for every other tier id.

### Task 2: Author the cross-domain contract
- **Files**: `.gsd-t/contracts/model-tier-policy-contract.md` (NEW)
- **Contract refs**: self
- **Dependencies**: Requires Task 1 (within domain) — contract documents the module surface
- **Acceptance criteria**:
  - Documents the published id constants, the `TIER_TO_MODEL` + `STAGE_POLICY` maps, the `requiresThinkingOmitted` predicate, and the resolver CLI surface.
  - Marked `Version: 1.0.0` / `Status: STABLE`.
  - Lists consumers: `bin/gsd-t-parallel.cjs`, `bin/model-selector.js`, the 3 workflow files, the M85 lint test.
  - States the serial-gate property: D2/D3/D4 code against the published constants, not the implementation internals.
