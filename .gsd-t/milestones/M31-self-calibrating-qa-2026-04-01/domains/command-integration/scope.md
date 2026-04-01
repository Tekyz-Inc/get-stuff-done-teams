# Domain: command-integration (M31)

## Responsibility
Wire harness-audit, qa-calibrator, and token-orchestrator into existing GSD-T commands. Update all documentation references.

## Files Touched
- `commands/gsd-t-execute.md` — QA calibration injection + token budget checks
- `commands/gsd-t-quick.md` — QA calibration injection + token budget checks
- `commands/gsd-t-integrate.md` — QA calibration injection
- `commands/gsd-t-wave.md` — token budget pre-flight + per-phase checks
- `commands/gsd-t-complete-milestone.md` — component impact evaluation + QA miss-rate logging
- `commands/gsd-t-status.md` — flagged components + QA miss-rate summary
- `commands/gsd-t-help.md` — audit command entry
- `bin/gsd-t.js` — command count update
- `README.md` — command table + feature section
- `GSD-T-README.md` — audit command reference
- `templates/CLAUDE-global.md` — all three features documented
- `templates/CLAUDE-project.md` — optional fields

## Constraints
- Injection points are conditional (skip silently if data doesn't exist)
- All injections are max 5-15 lines each
- Backward compatible with pre-M31 projects
