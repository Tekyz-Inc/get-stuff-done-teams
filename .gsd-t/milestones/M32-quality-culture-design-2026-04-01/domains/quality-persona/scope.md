# Domain: quality-persona

## Responsibility
Configurable quality persona ("Quality North Star") prepended to every subagent prompt. Set during init/setup, stored in project CLAUDE.md. Provides a project-specific quality identity that shapes how subagents evaluate and present their work.

## Owned Files/Directories
- `templates/CLAUDE-project.md` — add Quality North Star section with placeholder and preset options
- `commands/gsd-t-init.md` — persona selection step during project initialization
- `commands/gsd-t-setup.md` — persona configuration option for existing projects

## NOT Owned (do not modify)
- `commands/gsd-t-execute.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-quick.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-integrate.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-debug.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-partition.md` — owned by design-brief domain
- `commands/gsd-t-plan.md` — owned by design-brief domain
- `.gsd-t/contracts/design-brief.md` — owned by design-brief domain
- `bin/gsd-t.js` — no changes needed (persona stored in CLAUDE.md, not a JS module)
