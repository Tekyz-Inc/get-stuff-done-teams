# GSD-T: Pause — Save Exact Position for Later Resume

You are capturing the precise current position in an active GSD-T phase so the user can resume later with zero re-orientation overhead.

## Step 1: Gather Current State

Read the following (use whatever is already in context first — only read files if needed):

1. `.gsd-t/progress.md` — milestone name, current status/phase, version
2. `.gsd-t/domains/*/tasks.md` — identify which tasks are done, in-progress, or pending
3. Last entry in the Decision Log (from progress.md)
4. `$ARGUMENTS` — if user provided a note, capture it verbatim

## Step 2: Determine Exact Position

Identify:
- **Milestone**: current milestone name
- **Phase**: current phase (PARTITIONED, PLANNED, EXECUTED, etc.)
- **Domain** (if in execute/test-sync): which domain was being worked on
- **Task** (if in execute): which task number was in progress or next up
- **Last completed action**: what was the last thing that finished
- **Next action**: what should happen first when resuming
- **Blockers**: any known blockers or open questions

## Step 3: Create Continue-Here File

Generate a timestamp: `{YYYY}-{MM}-{DD}T{HH}{MM}{SS}` (local time, no separators in time part).

Create `.gsd-t/continue-here-{timestamp}.md`:

```markdown
# Continue Here — {YYYY-MM-DD HH:MM}

## Snapshot
- **Milestone**: {milestone name}
- **Phase**: {phase}
- **Version**: {version from progress.md}
- **Paused at**: {domain} → Task {N} | Between phases | {other description}

## Last Completed
{description of the last thing that finished — specific task, commit, or action}

## Next Action
{exactly what to do first when resuming — specific, actionable}

## Open Items
{any known blockers, pending decisions, or things to watch out for}
{None if clean}

## User Note
{$ARGUMENTS if provided, otherwise: _No note provided._}

## Resume Command
/user:gsd-t-resume
```

## Step 4: Confirm to User

Output:

```
⏸ Paused: {milestone name} — {phase}

Saved position: .gsd-t/continue-here-{timestamp}.md
Next action:    {next action summary}

To resume: /user:gsd-t-resume
```

## Step 5: Do NOT Stop Work (unless user asked to pause all work)

This command only saves position. If the user invoked /pause mid-task intending to stop:
- They will close the session themselves
- Do not auto-continue executing tasks after creating the file

If invoked with $ARGUMENTS containing "and continue" or similar, create the file and then continue the current task normally.

$ARGUMENTS
