# GSD-T: Resume — Continue From Last State

You are restoring context and continuing from where the last session left off. This is the first command to run when starting a new Claude Code session on an existing GSD-T project.

## Step 1: Load Full State

Read in this exact order:
1. `CLAUDE.md` — project context and conventions
2. `.gsd-t/progress.md` — current status, decisions, blockers
3. `.gsd-t/contracts/` — all contract files
4. `.gsd-t/domains/*/scope.md` — domain boundaries
5. `.gsd-t/domains/*/tasks.md` — task lists with completion status
6. `.gsd-t/domains/*/constraints.md` — domain rules
7. `.gsd-t/contracts/integration-points.md` — dependency graph
8. `.gsd-t/verify-report.md` (if exists) — verification findings

## Step 2: Determine Current Position

From progress.md, identify:
- Current milestone and status
- Which phase we're in
- Which tasks are done, in progress, or blocked
- Any pending decisions or user-input-needed items
- Last entry in the Decision Log

## Step 3: Report Context

Present to the user:
```
🔄 GSD-T Resuming: {milestone name}
Phase: {current phase}
Last activity: {last Decision Log entry}

Progress:
  {domain-1}: {completed}/{total} tasks
  {domain-2}: {completed}/{total} tasks

Next up: {specific next action}
Blockers: {any pending items} | None

Ready to continue? Or run /user:gsd-t-status for full details.
```

## Step 4: Continue

If $ARGUMENTS specifies what to do next, proceed with that.
Otherwise, recommend the logical next action based on current state:
- Mid-execution → Continue with next unblocked task
- Between phases → Start next phase
- Blocked → Explain what's needed to unblock
- Verify failed → Show remediation tasks

$ARGUMENTS
