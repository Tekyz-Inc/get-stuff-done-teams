# Tasks: command-integration

## Summary
Wires the rule engine and patch lifecycle into GSD-T command files. Extends `gsd-t-execute.md` with active rule injection, `gsd-t-plan.md` with rule-based pre-mortem, and `gsd-t-complete-milestone.md` with rule evaluation, patch candidate generation, promotion gate checks, graduation, consolidation, and quality budget governance.

## Tasks

### Task 1: Extend gsd-t-execute.md — active rule injection into subagent prompts ✅ COMPLETE
- **Files**: `commands/gsd-t-execute.md` (MODIFY)
- **Contract refs**: rule-engine-contract.md — Rule Engine API (`getActiveRules`, `evaluateRules`), command-integration constraints (max 10 lines injected)
- **Dependencies**: BLOCKED by rule-engine Task 5 (rule-engine must be tested and working); BLOCKED by patch-lifecycle Task 4 (patch-lifecycle must be tested)
- **Acceptance criteria**:
  - New step added after existing pre-flight check: "Active Rule Injection"
  - Step queries `evaluateRules(domain)` for the current domain before dispatching each task subagent
  - If rules fire: injects up to 10 lines of warnings/constraints into the subagent prompt (concise format: "RULE: {name} — {description}")
  - If no rules fire: step logs "No active rules for {domain}" and continues
  - Non-blocking — rule injection warnings inform the subagent, they do not prevent execution
  - Existing steps not removed or renamed (additive only)

### Task 2: Extend gsd-t-plan.md — rule-based pre-mortem enhancement ✅ COMPLETE
- **Files**: `commands/gsd-t-plan.md` (MODIFY)
- **Contract refs**: rule-engine-contract.md — Rule Engine API (`getPreMortemRules`, `evaluateRules`)
- **Dependencies**: BLOCKED by rule-engine Task 5 (rule-engine must be tested and working)
- **Acceptance criteria**:
  - Step 1.7 (Pre-Mortem) enhanced: in addition to existing `getPreFlightWarnings`, also calls `getPreMortemRules(domainType)` from `bin/rule-engine.js`
  - Displays any matching rules as warnings: "RULE {id}: {name} — historically triggered for domains like {domainType}"
  - Pre-mortem output remains non-blocking (informs task design, does not prevent planning)
  - Falls back gracefully if rules.jsonl does not exist or is empty

### Task 3: Extend gsd-t-complete-milestone.md — distillation with rule evaluation, patches, promotion, graduation ✅ COMPLETE
- **Files**: `commands/gsd-t-complete-milestone.md` (MODIFY)
- **Contract refs**: rule-engine-contract.md — all APIs: evaluateRules, createCandidate, checkPromotionGate, promote, graduate, deprecate, flagInactiveRules, consolidateRules, Quality Budget Governance
- **Dependencies**: BLOCKED by rule-engine Task 5; BLOCKED by patch-lifecycle Task 4
- **Acceptance criteria**:
  - Distillation step (Step 2.5) extended with 5 sub-steps:
    1. **Rule Evaluation**: run `evaluateRules` across all milestone domains, `recordActivation` for fired rules
    2. **Patch Candidate Generation**: for each fired rule with `action: 'patch'`, call `createCandidate`
    3. **Promotion Gate Check**: for all `applied`/`measured` patches, call `checkPromotionGate`, promote or deprecate accordingly
    4. **Graduation**: for promoted patches sustained 3+ milestones, call `graduate`
    5. **Consolidation & Deprecation**: call `flagInactiveRules(5)`, and if milestone count % 5 === 0, call consolidation
  - Quality budget governance: compute rework percentage from task-metrics, compare against `rework_ceiling_pct` (default 20%), log warning and apply constraint tightening actions if exceeded
  - Existing distillation step preserved (event-stream pattern detection runs first, new sub-steps follow)
  - All new logic expressed as Bash `node -e` invocations calling the bin modules (consistent with existing pattern)

### Task 4: Update reference documentation for M26 changes ✅ COMPLETE
- **Files**: `GSD-T-README.md` (MODIFY), `README.md` (MODIFY), `templates/CLAUDE-global.md` (MODIFY), `commands/gsd-t-help.md` (MODIFY)
- **Contract refs**: Pre-Commit Gate (command behavior changes require updating all 4 reference files)
- **Dependencies**: Requires Tasks 1-3 (all command changes must be finalized first)
- **Acceptance criteria**:
  - GSD-T-README.md updated with rule engine and patch lifecycle documentation
  - README.md updated with M26 feature descriptions
  - CLAUDE-global.md template reflects any new workflow steps
  - gsd-t-help.md reflects any behavior changes to execute, plan, complete-milestone
  - No new commands added (only existing commands extended), so command count stays at 50

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 3 (Tasks 1-3 blocked by rule-engine + patch-lifecycle)
- Estimated checkpoints: 1 (rule-engine + patch-lifecycle checkpoint before Wave 3)
