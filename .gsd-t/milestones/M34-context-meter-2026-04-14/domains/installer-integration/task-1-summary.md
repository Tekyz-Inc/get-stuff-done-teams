# installer-integration — Task 1 Summary

**Task**: Read-only inventory of `bin/gsd-t.js` touch points for M34 context meter.
**Status**: PASS.
**Artifact**: `.gsd-t/domains/installer-integration/inventory.md` (surgical-plan map, ~260 lines).

## What was done
- Read all 2809 lines of `bin/gsd-t.js`.
- Grepped for `task-counter`, `archive-migration`, `settings.json`, `.gitignore`.
- Confirmed structural patterns against `context-meter-contract.md` and `integration-points.md`.
- Produced `inventory.md` mapping exact line ranges, signatures, and current behavior for every area Tasks 2-5 will touch.

## Key findings
- `task-counter.cjs` is referenced in exactly ONE place in bin/gsd-t.js — line 1563 (`PROJECT_BIN_TOOLS` array). Retirement is a one-string delete plus a new migration function.
- `installHeartbeat` / `configureHeartbeatHooks` (lines 315–367) are near-perfect templates for Task 2's PostToolUse hook registration.
- `runProgressArchiveMigration` (lines 1609–1635) is the template Task 5 will mirror for the task-counter cleanup migration (marker: `.gsd-t/.context-meter-migration-v1`).
- No existing `.gitignore` handling — Task 2 must add a new `ensureGitignoreEntries` helper and call it from both `doInit` and `updateSingleProject`.
- No existing TTY detection or `readline` usage — Task 2 will add both (built-in, zero-dep clean).
- `doInstall` is synchronous; adding the API key prompt will require either async-ifying install/update/update-all OR a blocking readline pattern. Inventory documents both options.
- `doDoctor` and `doStatus` are thin orchestrators — Tasks 3 and 4 each add a single sub-fn and one wiring line. Very low risk.

## No code changed
This was a read-only inventory task. Tasks 2-5 now have a precise map to edit against.

## Next task
**Task 2** — `installer-integration/02-install-hook-and-apikey.md`: install the context meter hook (PostToolUse), prompt for API key interactively (TTY-aware), and add `.gitignore` entries for session state files.
