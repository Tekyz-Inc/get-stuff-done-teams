# Domain: evaluator-interactivity

## Responsibility
Give QA and Red Team agents access to Playwright MCP for interactive exploratory testing beyond scripted assertions. After all scripted tests pass, QA gets 3 minutes and Red Team gets 5 minutes of free-form interactive exploration. Findings are tagged [EXPLORATORY] and feed into the QA calibration loop (M31).

## Owned Files/Directories
- `commands/gsd-t-execute.md` — add exploratory testing block to QA/Red Team subagent prompts
- `commands/gsd-t-quick.md` — add exploratory testing block to inline QA
- `commands/gsd-t-integrate.md` — add exploratory testing block to integration QA/Red Team
- `commands/gsd-t-debug.md` — add exploratory testing block to debug verification

## NOT Owned (do not modify)
- `commands/gsd-t-partition.md` — owned by design-brief domain
- `commands/gsd-t-plan.md` — owned by design-brief domain
- `commands/gsd-t-setup.md` — owned by design-brief and quality-persona domains
- `commands/gsd-t-init.md` — owned by quality-persona domain
- `templates/CLAUDE-project.md` — owned by quality-persona domain
- `bin/gsd-t.js` — no changes needed (MCP check is prompt-level, not CLI-level)
- `.gsd-t/contracts/qa-calibration-contract.md` — read-only reference (M31 owns this)
