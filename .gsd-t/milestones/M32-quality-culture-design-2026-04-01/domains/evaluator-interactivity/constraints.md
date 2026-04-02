# Constraints: evaluator-interactivity

## Must Follow
- Exploratory testing block is only activated when Playwright MCP is registered in Claude Code settings (check for `playwright` in MCP config or Claude Code settings.json)
- If Playwright MCP is not available, the block is skipped entirely (no errors, no warnings — silent graceful degradation)
- Scripted tests (unit + E2E) MUST pass before exploratory testing begins — exploratory is post-scripted, not a replacement
- Time budgets: QA gets 3 minutes, Red Team gets 5 minutes of interactive exploration
- All exploratory findings must be tagged `[EXPLORATORY]` in qa-issues.md and red-team-report.md
- Exploratory findings count as a separate category in QA calibration (M31 qa-calibration-contract.md)
- Command file edits follow existing GSD-T markdown step-numbered format
- Exploratory block is injected into existing QA/Red Team subagent spawn sections — not a new section

## Must Not
- Replace scripted testing with exploratory testing (additive only)
- Block phase completion if Playwright MCP is unavailable
- Modify QA calibration contract (M31 owns that — read-only reference)
- Create new npm dependencies or JS modules
- Change QA/Red Team model assignments (haiku/sonnet/opus assignments remain unchanged)
- Touch files outside owned scope (partition, plan, setup, init, templates)

## Dependencies
- Depends on: M31 qa-calibration-contract.md for the exploratory findings category definition (READ ONLY — do not modify)
- Depended on by: nothing in M32

## Must Read Before Using
- `commands/gsd-t-execute.md` — understand existing QA/Red Team subagent spawn patterns before inserting exploratory block
- `commands/gsd-t-quick.md` — understand inline QA pattern before inserting exploratory block
- `commands/gsd-t-integrate.md` — understand integration QA/Red Team pattern before inserting exploratory block
- `commands/gsd-t-debug.md` — understand debug verification pattern before inserting exploratory block
- `.gsd-t/contracts/qa-calibration-contract.md` — understand exploratory findings category expected by M31
