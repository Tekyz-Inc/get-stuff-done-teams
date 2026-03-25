# Domain: command-integration

## Responsibility
Add stack detection logic and prompt injection to all subagent-spawning commands. Modify QA subagent prompts to validate stack rule compliance. Update reference documentation.

## Owned Files/Directories
- `commands/gsd-t-execute.md` — add stack detection + injection into task subagent prompt + QA prompt
- `commands/gsd-t-quick.md` — add stack detection + injection into subagent prompt
- `commands/gsd-t-integrate.md` — add stack detection + injection into subagent prompt
- `commands/gsd-t-wave.md` — add stack detection + injection into phase agent prompts
- `commands/gsd-t-debug.md` — add stack detection + injection into subagent prompt
- `test/stack-rules.test.js` — new test file for stack detection and injection logic
- `README.md` — update features section
- `GSD-T-README.md` — update command reference with stack rules info
- `templates/CLAUDE-global.md` — add Stack Rules Engine documentation
- `commands/gsd-t-help.md` — update if any command behavior descriptions change

## NOT Owned (do not modify)
- `templates/stacks/` — template content (owned by stack-templates domain)
- `bin/gsd-t.js` — CLI installer (no changes needed)
- Other command files not listed above

## Integration Pattern
The stack detection + injection block is a reusable markdown pattern that gets copy-pasted into each command's subagent spawn section. It reads project files, matches against templates/stacks/*.md, and appends matched rules to the subagent prompt.
