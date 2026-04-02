# Domain: evaluator-interactivity

## Responsibility
Give QA and Red Team agents access to Playwright MCP for interactive exploratory testing beyond scripted assertions.

## Files Owned
- None (no new JS modules — this is a prompt engineering feature)

## Files Touched
- `commands/gsd-t-execute.md` — add exploratory testing block to QA/Red Team prompts
- `commands/gsd-t-quick.md` — same for inline QA
- `commands/gsd-t-integrate.md` — same for integration QA/Red Team
- `commands/gsd-t-debug.md` — same for debug verification

## Constraints
- Requires Playwright MCP to be registered in Claude Code settings
- If MCP not available, skip silently (graceful degradation)
- Time budget: 3 minutes QA, 5 minutes Red Team (configurable)
- Exploratory findings tagged [EXPLORATORY] in reports
- Scripted tests must pass BEFORE exploratory testing begins
