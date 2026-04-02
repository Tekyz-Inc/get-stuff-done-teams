# Tasks: evaluator-interactivity

## Summary
Adds exploratory testing blocks to the QA and Red Team subagent prompts in gsd-t-execute, gsd-t-quick, gsd-t-integrate, and gsd-t-debug. When Playwright MCP is registered in Claude Code settings, QA agents get 3 minutes and Red Team gets 5 minutes of interactive exploration after scripted tests pass. All findings are tagged [EXPLORATORY] and feed into the M31 QA calibration loop as a separate category.

## Tasks

### Task 1: Add exploratory testing blocks to execute, quick, integrate, and debug commands
- **Files**:
  - `commands/gsd-t-execute.md` — in the QA subagent spawn prompt (Step 5), append the exploratory testing block from exploratory-testing-contract.md (Prompt Block Template); in the Red Team subagent spawn prompt (Step 5.5), append the exploratory block with 5-minute budget; both blocks check for playwright in MCP settings and skip silently if absent
  - `commands/gsd-t-quick.md` — in the inline QA section, append the exploratory testing block with 3-minute QA budget and 5-minute Red Team budget; silent skip if Playwright MCP absent
  - `commands/gsd-t-integrate.md` — in the integration QA and Red Team subagent prompts, append the exploratory testing block; same budget and skip behavior
  - `commands/gsd-t-debug.md` — in the debug verification step's QA prompt, append the exploratory testing block with 3-minute budget; silent skip if Playwright MCP absent
- **Contract refs**:
  - `exploratory-testing-contract.md` — activation condition (Playwright MCP registered), ordering protocol (scripted tests must pass first), time budgets (QA: 3 min, Red Team: 5 min), finding format ([EXPLORATORY] tag in qa-issues.md and red-team-report.md), Prompt Block Template to inject, QA calibration integration (category key: `exploratory`, does NOT count against scripted pass/fail ratio)
  - `qa-calibration-contract.md` (M31, read-only) — `exploratory` signal type definition; do not modify this file
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `commands/gsd-t-execute.md` QA and Red Team subagent prompts each contain the exploratory testing block
  - `commands/gsd-t-quick.md` inline QA contains the exploratory block
  - `commands/gsd-t-integrate.md` integration QA and Red Team prompts each contain the exploratory block
  - `commands/gsd-t-debug.md` debug verification QA prompt contains the exploratory block
  - Each block explicitly instructs: check for `playwright` in mcpServers; if not found, skip silently
  - Each block explicitly states scripted tests must pass before exploratory phase begins
  - QA block specifies 3-minute budget; Red Team block specifies 5-minute budget
  - All exploratory findings are tagged `[EXPLORATORY]` in the report format instructions
  - No existing QA model assignments (haiku/sonnet/opus) are changed
  - No new JS modules, npm dependencies, or command files created
  - No files outside owned scope are modified (partition/plan/setup/init/templates remain untouched)

## Execution Estimate
- Total tasks: 1
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0 (single-task domain, completes when Task 1 criteria pass)
