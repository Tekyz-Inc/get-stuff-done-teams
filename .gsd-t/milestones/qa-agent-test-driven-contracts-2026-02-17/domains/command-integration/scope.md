# Domain: Command Integration

## Responsibility
Update all GSD-T commands that produce or validate code to spawn the QA teammate. Add the QA spawn step at the correct moment in each command's workflow.

## Owned Files/Directories
- `commands/gsd-t-partition.md` — add QA spawn after contracts written
- `commands/gsd-t-plan.md` — add QA spawn for acceptance test generation
- `commands/gsd-t-execute.md` — add QA teammate to team mode, solo mode
- `commands/gsd-t-verify.md` — add QA spawn for test audit
- `commands/gsd-t-complete-milestone.md` — add QA spawn for final gate
- `commands/gsd-t-quick.md` — add QA spawn for test creation/execution
- `commands/gsd-t-debug.md` — add QA spawn for regression test creation
- `commands/gsd-t-integrate.md` — add QA spawn for integration test verification
- `commands/gsd-t-test-sync.md` — update to reference QA agent as authority
- `commands/gsd-t-wave.md` — ensure wave spawns QA at each phase

## NOT Owned (do not modify)
- `commands/gsd-t-qa.md` (owned by qa-agent-spec)
- Contract test generation logic (owned by contract-test-gen)
