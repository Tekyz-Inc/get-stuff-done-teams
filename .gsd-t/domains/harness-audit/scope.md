# Domain: harness-audit

## Responsibility
Component registry and audit infrastructure for measuring whether GSD-T enforcement mechanisms earn their context-token cost.

## Files Owned
- `bin/component-registry.js` — registry CRUD, cost calculation, flagging logic
- `commands/gsd-t-audit.md` — audit command (new)
- `templates/component-registry.jsonl` — template for component registry

## Files Touched (shared)
- `commands/gsd-t-complete-milestone.md` — add component impact evaluation to distillation step
- `commands/gsd-t-status.md` — show flagged components
- `commands/gsd-t-help.md` — add audit command entry
- `bin/gsd-t.js` — update command count
- `README.md` — add audit to command table
- `GSD-T-README.md` — add audit command reference
- `templates/CLAUDE-global.md` — document audit capability

## Constraints
- Zero external dependencies (Node.js built-ins only)
- Component registry is JSONL format (consistent with other .gsd-t/metrics/ files)
- Shadow mode logs results without blocking execution
- Audit is always opt-in, never automatic
