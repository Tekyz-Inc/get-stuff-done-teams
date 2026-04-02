# Domain: quality-persona

## Responsibility
Configurable quality persona ("Quality North Star") prepended to every subagent prompt. Set during init/setup, stored in project CLAUDE.md.

## Files Owned
- None (no new JS modules — this is a prompt engineering feature implemented via command file edits)

## Files Touched
- `templates/CLAUDE-project.md` — add Quality North Star section with placeholder
- `commands/gsd-t-init.md` — persona selection during init
- `commands/gsd-t-setup.md` — persona configuration

## Constraints
- Persona is 1-3 sentences, prepended before procedural checks
- Projects without a persona skip injection silently (backward compatible)
- Three preset personas: library/package, web application, CLI tool
- Custom option for user-written persona
