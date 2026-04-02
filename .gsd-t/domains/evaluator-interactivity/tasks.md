# Domain: evaluator-interactivity — Tasks

## Task 1: Add exploratory testing blocks to execute, quick, integrate, debug commands
**Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`
**Scope**:
1. In each command's QA/Red Team subagent spawn section, add an exploratory testing instruction block.
2. Block checks if Playwright MCP is registered (look for `playwright` in Claude Code MCP settings).
3. If available, after scripted tests pass, QA gets 3 minutes and Red Team gets 5 minutes for interactive exploration.
4. Findings tagged [EXPLORATORY] in qa-issues.md and red-team-report.md.
5. If MCP not available, skip silently.
**Contract**: Exploratory findings feed into QA calibration loop (M31) as a separate category.
