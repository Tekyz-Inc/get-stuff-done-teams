# Tasks: m35-model-selector-advisor

## T1 — Resolve /advisor programmable API open question (Wave 1)
**Type**: Investigation only — no file edits (safe to run in Wave 1 parallel with degradation-rip-out T1/T2)
**Acceptance**:
- Determine whether Claude Code's native `/advisor` tool exposes a programmable API callable from a subagent prompt, or is user-initiated only
- Write findings to `.gsd-t/M35-advisor-findings.md` with at least:
  - API surface discovered (or "none")
  - Invocation pattern (programmable vs. convention)
  - Fallback plan if not programmable
  - Impact on `bin/advisor-integration.js` design
- If convention-based: document the exact text block command files will inject into subagent prompts
- This file will be consumed by T2 (model-selector.js) and T3 (advisor-integration.js)

## T2 — Implement `bin/model-selector.js` (Wave 2)
**File**: `bin/model-selector.js`
**Acceptance**:
- Exports `selectModel({phase, task_type, domain_type, complexity_signals})` → `{model, reason, escalation_hook}`
- Declarative rules table (not hardcoded if/else)
- At least 8 phase mappings covering: execute, wave, quick, integrate, debug, partition, discuss, plan, verify, test-sync, doc-ripple, Red Team, QA
- Tier assignments: haiku (mechanical), sonnet (routine code execution), opus (high-stakes reasoning)
- Escalation hooks: sonnet-default phases can declare in-phase checkpoints that escalate to opus via /advisor
- `test/model-selector.test.js` — unit tests covering each mapping (~15 tests)

## T3 — Implement `bin/advisor-integration.js` (Wave 2)
**File**: `bin/advisor-integration.js`
**Acceptance**:
- Wrapper around /advisor per T1's findings (programmable API call OR convention-based block injection)
- Exports: `invokeAdvisor({question, context})` → returns guidance or a marker that the subagent must self-invoke
- Graceful degradation: if /advisor is unavailable at runtime, the caller proceeds at the assigned model and the miss is logged
- `test/advisor-integration.test.js` — unit tests for both programmable and convention paths (~10 tests)

## T4 — Draft `model-selection-contract.md` v1.0.0 (Wave 2)
**File**: `.gsd-t/contracts/model-selection-contract.md`
**Acceptance**:
- Version 1.0.0, Status: ACTIVE
- Three tiers defined with selection criteria
- Escalation hook pattern documented
- /advisor fallback behavior documented
- Referenced from `commands/gsd-t-execute.md` Model Assignment block
- Consumers list includes all 11 command files that get Model Assignment blocks

## T5 — Inject `## Model Assignment` blocks into command files (Wave 2)
**Files**: 11 command files listed in scope.md
**Acceptance**:
- Each file has a `## Model Assignment` block at the top (after the H1 title and intro paragraph, before Step 1)
- Block format is declarative:
  ```
  ## Model Assignment
  - Default: sonnet
  - Escalation points:
    - Step N (purpose): escalate to opus via /advisor when {condition}
  - Mechanical subroutines: haiku (Step N {purpose})
  ```
- No command file's existing step numbering is broken
- Existing observability logging blocks preserved

## T6 — Update CLAUDE templates for dual-layer model + Model Assignment convention (Wave 2)
**Files**: `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`
**Acceptance**:
- New section documenting the Model Assignment Block convention
- Explicit dual-layer explanation: global `ANTHROPIC_MODEL` stays opus for user-initiated sessions; GSD-T subagent spawns override per-phase
- Reference to `.gsd-t/contracts/model-selection-contract.md`
- Both templates consistent with each other
