# Domain: design-brief

## Responsibility
Design brief artifact for UI-heavy projects, generated during partition (when UI/frontend domains are detected), and referenced during plan. Provides a single source of truth for visual design decisions — color palette, typography, spacing, component patterns, layout principles, interaction patterns — so execute agents produce visually consistent output.

## Owned Files/Directories
- `commands/gsd-t-partition.md` — add design brief detection and generation step
- `commands/gsd-t-plan.md` — add note referencing design brief for UI task descriptions
- `commands/gsd-t-setup.md` — add design brief generation option for existing projects
- `.gsd-t/contracts/design-brief.md` — generated artifact (owned by this domain's logic, created at partition time)

## NOT Owned (do not modify)
- `commands/gsd-t-execute.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-quick.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-integrate.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-debug.md` — owned by evaluator-interactivity domain
- `commands/gsd-t-init.md` — owned by quality-persona domain
- `templates/CLAUDE-project.md` — owned by quality-persona domain
- `bin/gsd-t.js` — no changes needed
