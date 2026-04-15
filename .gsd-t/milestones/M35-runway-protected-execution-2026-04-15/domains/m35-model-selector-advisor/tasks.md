# Tasks: m35-model-selector-advisor

## Summary

Resolve the open `/advisor` API question, implement `bin/model-selector.js` with declarative per-phase tier assignments, implement `bin/advisor-integration.js` for escalation, create `model-selection-contract.md` v1.0.0, inject `## Model Assignment` blocks into 11 command files, and update both CLAUDE templates for the dual-layer model convention.

## Contract References

- `.gsd-t/contracts/model-selection-contract.md` — v1.0.0 (NEW, created in T4)
- `.gsd-t/contracts/fresh-dispatch-contract.md` — read-only reference for subagent spawn pattern

---

## Tasks

### Task 1: Resolve `/advisor` programmable API open question

- **Files**:
  - `.gsd-t/M35-advisor-findings.md` (create)
- **Contract refs**: None (investigation task — findings shape T2 and T3)
- **Dependencies**: NONE (safe to run in Wave 1 parallel with degradation-rip-out T1/T2)
- **Acceptance criteria**:
  - Determine whether Claude Code's native `/advisor` tool exposes a programmable API callable from a subagent prompt, or is user-initiated only
  - `.gsd-t/M35-advisor-findings.md` created with at minimum:
    - API surface discovered (or "none found")
    - Invocation pattern: programmable (with exact call signature) or convention-based (fallback)
    - Fallback plan if not programmable: exact text block command files inject into subagent prompts at escalation points
    - Impact on `bin/advisor-integration.js` design (which branch to implement first)
  - If convention-based: the fallback block text must be concise, instructional, and reference the declared escalation point
  - File consumed by T2 (model-selector escalation_hook field) and T3 (advisor-integration.js implementation path)

### Task 2: Implement `bin/model-selector.js`

- **Files**:
  - `bin/model-selector.js` (create)
  - `test/model-selector.test.js` (create)
- **Contract refs**: `.gsd-t/M35-advisor-findings.md` (T1 output), `.gsd-t/contracts/model-selection-contract.md` (T4 will formalize — implement first, contract documents what's built)
- **Dependencies**: Requires Task 1 (escalation_hook field design depends on advisor findings)
- **Acceptance criteria**:
  - Exports `selectModel({phase, task_type, domain_type, complexity_signals})` → `{model: 'haiku'|'sonnet'|'opus', reason: string, escalation_hook: string|null}`
  - Declarative rules table in the file (array of rule objects, not hardcoded if/else chains)
  - At least 8 distinct phase mappings covering: execute, wave, quick, integrate, debug, partition, discuss, plan, verify, test-sync, doc-ripple, Red Team, QA (13 phases — all must appear)
  - Tier assignments match M35 definition: `haiku` (mechanical: test runners, branch guards, file existence checks, JSON validation), `sonnet` (routine: execute step 2, test-sync, doc-ripple, quick, integrate wiring, debug fix-apply), `opus` (high-stakes: partition, discuss, Red Team, verify judgment, debug root-cause, architecture, contract design)
  - `escalation_hook` is `null` for opus/haiku phases; for sonnet phases, contains the escalation point description or `null` if no in-phase escalation declared
  - `test/model-selector.test.js`: at least 15 unit tests — one per phase mapping, plus edge cases (unknown phase fallback to sonnet, complexity_signal escalation override)

### Task 3: Implement `bin/advisor-integration.js`

- **Files**:
  - `bin/advisor-integration.js` (create)
  - `test/advisor-integration.test.js` (create)
- **Contract refs**: `.gsd-t/M35-advisor-findings.md` (T1 output determines implementation path)
- **Dependencies**: Requires Task 1 (implementation path determined by advisor API findings)
- **Acceptance criteria**:
  - Exports `invokeAdvisor({question, context, projectDir})` → `{available: bool, guidance: string|null, loggedMiss: bool}`
  - If `/advisor` has a programmable API (T1 finding): calls it and returns the guidance
  - If convention-based (T1 finding): returns `{available: false, guidance: null, loggedMiss: true}` and appends a missed-escalation record to `.gsd-t/token-log.md`
  - Graceful degradation: if `/advisor` unavailable at runtime, caller proceeds at assigned model — no crash, no block
  - `test/advisor-integration.test.js`: at least 10 unit tests covering programmable path (mocked), convention path, runtime unavailability, miss logging

### Task 4: Draft `model-selection-contract.md` v1.0.0

- **Files**:
  - `.gsd-t/contracts/model-selection-contract.md` (create)
- **Contract refs**: `.gsd-t/M35-advisor-findings.md` (T1), `bin/model-selector.js` (T2 output — contract documents what's implemented)
- **Dependencies**: Requires Task 2, Requires Task 3 (contract documents both modules)
- **Acceptance criteria**:
  - Version `1.0.0`, Status: `ACTIVE`
  - Three tiers defined with selection criteria and canonical phase lists (matching T2's declarative table)
  - Escalation hook pattern documented with the exact format (`escalation_hook` field)
  - `/advisor` fallback behavior documented (log miss, proceed at assigned model)
  - Dual-layer model documented: `ANTHROPIC_MODEL=opus` for user sessions; `model:` directive overrides in subagent spawns
  - Referenced from `commands/gsd-t-execute.md` Model Assignment block (T5 will add this reference)
  - Consumers list: all 11 command files that receive Model Assignment blocks in T5

### Task 5: Inject `## Model Assignment` blocks into 11 command files

- **Files**:
  - `commands/gsd-t-execute.md` (modify)
  - `commands/gsd-t-wave.md` (modify)
  - `commands/gsd-t-quick.md` (modify)
  - `commands/gsd-t-integrate.md` (modify)
  - `commands/gsd-t-debug.md` (modify)
  - `commands/gsd-t-partition.md` (modify)
  - `commands/gsd-t-discuss.md` (modify)
  - `commands/gsd-t-plan.md` (modify)
  - `commands/gsd-t-verify.md` (modify)
  - `commands/gsd-t-test-sync.md` (modify)
  - `commands/gsd-t-doc-ripple.md` (modify)
- **Contract refs**: `.gsd-t/contracts/model-selection-contract.md` v1.0.0 (T4 output)
- **Dependencies**: Requires Task 4 (contract must exist before files reference it); note these files are also touched by degradation-rip-out T3 (Wave 2) — T5 is also Wave 2, coordinate by ensuring degradation-rip-out T3 runs before T5 if both touch the same file, OR ensure the edits are to distinct sections (Token Budget Check vs Model Assignment block at top)
- **BLOCKED BY**: m35-degradation-rip-out Task 3 (those edits touch the same 6 files — execute T3 for the Token Budget sweep first, then T5 adds Model Assignment blocks cleanly)
- **Acceptance criteria**:
  - Each of the 11 files has a `## Model Assignment` block positioned after the H1 title and intro paragraph, before Step 1
  - Block format is declarative (see model-selection-contract.md for canonical format):
    ```
    ## Model Assignment
    - Default: {haiku|sonnet|opus}
    - Escalation points:
      - Step N ({purpose}): escalate to opus via /advisor when {condition}
    - Mechanical subroutines: haiku (Step N {purpose})
    ```
  - Assignments match `bin/model-selector.js` declarative table exactly — no contradictions between code and docs
  - No command file's existing step numbering is broken by the insertion
  - Existing OBSERVABILITY LOGGING blocks in each file are preserved unmodified

### Task 6: Update CLAUDE templates for dual-layer model + Model Assignment convention

- **Files**:
  - `templates/CLAUDE-global.md` (modify)
  - `templates/CLAUDE-project.md` (modify)
- **Contract refs**: `.gsd-t/contracts/model-selection-contract.md` v1.0.0
- **Dependencies**: Requires Task 4 (contract must exist); note templates are also modified by degradation-rip-out T4 (Wave 2) — coordinate: T4 there renames the Token-Aware Orchestration section; T6 here adds the Model Assignment Block convention section; these are distinct sections and can be applied sequentially or simultaneously if sections are clearly delineated
- **BLOCKED BY**: m35-degradation-rip-out Task 4 (that task also modifies these files — run degradation-rip-out T4 first for the Token-Aware Orchestration rename, then T6 adds the new Model Assignment section)
- **Acceptance criteria**:
  - Both templates have a new "Model Assignment Block Convention" section (or subsection under "Runway-Protected Execution" from degradation-rip-out T4)
  - Dual-layer explanation: `ANTHROPIC_MODEL=opus` in shell environment stays for user-initiated sessions; GSD-T subagent spawns override per-phase via `model:` directive in the spawn prompt
  - Reference to `.gsd-t/contracts/model-selection-contract.md` v1.0.0
  - Both templates are mutually consistent (identical wording for the shared convention)

---

## Execution Estimate

- Total tasks: 6
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 2 (Task 5 blocked by degradation-rip-out T3; Task 6 blocked by degradation-rip-out T4)
- Estimated checkpoints: 1 (Wave 1 investigation gates all Wave 2 work)

## Wave Assignment

- **Wave 1**: Task 1 (investigation — parallel with degradation-rip-out T1/T2)
- **Wave 2**: Tasks 2, 3, 4, 5, 6 (implementation — after degradation-rip-out Wave 1 completes; T5/T6 must run after degradation-rip-out T3/T4 respectively)
