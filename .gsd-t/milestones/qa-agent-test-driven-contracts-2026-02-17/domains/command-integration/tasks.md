# Tasks: command-integration

## Task 1: Update partition and plan commands
**Status**: pending
**Blocked by**: qa-agent-spec Task 1
- `gsd-t-partition.md`: After Step 3 (Write Contracts), add step to spawn QA teammate to generate contract test skeletons
- `gsd-t-plan.md`: Add step to spawn QA teammate to generate acceptance test scenarios from task lists

## Task 2: Update execute command
**Status**: pending
**Blocked by**: qa-agent-spec Task 1
- `gsd-t-execute.md`: Add QA teammate to team mode spawns. In solo mode, spawn QA teammate alongside execution. QA agent runs tests as implementation proceeds.

## Task 3: Update verify and complete-milestone commands
**Status**: pending
**Blocked by**: qa-agent-spec Task 1
- `gsd-t-verify.md`: Add QA teammate spawn for full test audit. Contract tests become the primary quality gate.
- `gsd-t-complete-milestone.md`: Add QA teammate spawn for final gate check in Gap Analysis Gate.

## Task 4: Update quick and debug commands
**Status**: pending
**Blocked by**: qa-agent-spec Task 1
- `gsd-t-quick.md`: Spawn QA teammate to create/run tests for the quick change.
- `gsd-t-debug.md`: Spawn QA teammate to create regression test for the bug being fixed.

## Task 5: Update integrate, test-sync, and wave commands
**Status**: pending
**Blocked by**: qa-agent-spec Task 1
- `gsd-t-integrate.md`: Spawn QA teammate for cross-domain integration test verification.
- `gsd-t-test-sync.md`: Update to reference QA agent as the test authority. When invoked standalone, spawn QA teammate.
- `gsd-t-wave.md`: Ensure QA agent is spawned at each applicable phase during wave execution.
