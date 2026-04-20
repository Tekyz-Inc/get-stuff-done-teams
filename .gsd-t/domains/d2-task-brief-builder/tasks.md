# Tasks: d2-task-brief-builder

## Summary
Deterministic, size-budgeted per-task prompt builder. Reads tasks.md + scope + constraints + relevant contracts + stack rules, produces 2–5 KB self-contained briefs that D1 workers receive at spawn time.

## Tasks

### Task 1: Brief template (prose envelope)
- **Files**: `bin/gsd-t-task-brief-template.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/task-brief-contract.md`
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `renderTemplate({ preamble, taskStatement, scope, constraints, contractExcerpts, stackRules, completionSpec, cwdInvariant })` → string
  - Preamble matches contract verbatim (projectName, milestone, domain, task, expectedBranch, projectDir)
  - CWD Invariant block is the exact prose from the contract (testable by string compare)
  - Sections are ordered 1–8 per contract
  - Markdown section headers match contract: `## Task`, `## Scope`, `## Constraints`, `## Contracts`, `## Stack Rules`, `## Done Signal`, `## CWD Invariant`
  - Unit-tested: full render, section presence check

### Task 2: Size-budget compactor
- **Files**: `bin/gsd-t-task-brief-compactor.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/task-brief-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `compactToTarget(sections, maxBytes)` → sections (possibly trimmed)
  - Drops in order: stack rules → contract excerpts beyond task's scope → constraints beyond Must Not
  - Never drops: preamble, taskStatement, scope, constraints Must Follow, completionSpec, cwdInvariant
  - If non-droppable sections alone exceed `maxBytes` → throws `TaskBriefTooLarge` with breakdown
  - Unit-tested: under budget (no trim), over budget (trims in order), exceeds non-droppable (throws)

### Task 3: Public buildTaskBrief API
- **Files**: `bin/gsd-t-task-brief.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/task-brief-contract.md`, `.gsd-t/contracts/completion-signal-contract.md`
- **Dependencies**: Requires Tasks 1 & 2, BLOCKED BY d3-completion-protocol Task 1 (consumes contract excerpt for completion spec)
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `buildTaskBrief({ milestone, domain, taskId, projectDir, expectedBranch })` → string
  - Reads: `.gsd-t/domains/{domain}/{scope,constraints,tasks}.md`, `.gsd-t/contracts/*.md` (only contracts listed in task's `contract refs` field), `CLAUDE.md`, stack rules via `bin/rule-engine.js`
  - Deterministic: same inputs → byte-identical output (unit-tested by calling twice, asserting equality)
  - Target 2 KB, hard max 5 KB — integrates compactor
  - Includes Done Signal checklist excerpted verbatim from completion-signal-contract.md (no paraphrase)
  - Unit-tested end-to-end: fixture domain with real scope/constraints/tasks → assert output contains required sections + size under 5000 bytes

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 1 (Task 3 on D3 Task 1)
- Blocked tasks (within domain): 2
- Estimated checkpoints: 1 (D3 contract-freeze required for Task 3)
