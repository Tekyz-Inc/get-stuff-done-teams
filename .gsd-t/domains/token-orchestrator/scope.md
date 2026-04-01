# Domain: token-orchestrator

## Responsibility
Token budget estimation, tracking, and graduated degradation for session-level token management on the $200 Max plan.

## Files Owned
- `bin/token-budget.js` — budget estimation, tracking, threshold logic, degradation actions

## Files Touched (shared)
- `commands/gsd-t-execute.md` — pre-spawn budget check, degradation logic
- `commands/gsd-t-wave.md` — milestone pre-flight estimate, per-phase budget check
- `commands/gsd-t-quick.md` — budget-aware model selection
- `templates/CLAUDE-global.md` — document token-aware orchestration
- `templates/CLAUDE-project.md` — optional Daily Token Budget field

## Constraints
- Zero external dependencies (Node.js built-ins only)
- Graduated thresholds: 60% warn, 70% downgrade, 85% conserve, 95% stop
- Progress always checkpointed before hard stop
- Default behavior unchanged when no budget concern exists
- Model cost ratios: Opus ≈ 5x Sonnet ≈ 25x Haiku
