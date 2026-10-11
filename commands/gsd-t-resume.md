# GSD-T: Resume — Continue From Last State

You are resuming work after an interruption — a pause in this session or a new Claude Code session.

## Step 1: Load State

Read in this order:
1. `CLAUDE.md` — project context and conventions.
2. The newest `.gsd-t/continue-here-*.md` (highest timestamp), if any exists. It holds the exact position, the next action, open items, and any outstanding user directive — it is the primary resume point.
3. `.gsd-t/progress.md` — current milestone, status, version, and the latest Decision Log entries. Always read it, even when a continue-here file exists.

If neither `.gsd-t/progress.md` nor a continue-here file exists, STOP and say so: there is no saved state to resume from.

## Step 2: Report Position

Output one block:

```
🔄 Resuming: {milestone} — {status/phase}
Last activity: {latest Decision Log entry}
Next action:   {from the continue-here "Next Action", else inferred from progress.md}
Open items:    {blockers / pending decisions} | None
```

## Step 3: Continue

- If `$ARGUMENTS` says what to do next, do that.
- Otherwise do the **Next Action**, then honor any **Outstanding User Directive** from the continue-here file once that action is finished.
- If the position shows a blocker, explain what is needed to unblock it and stop.

After resuming from a continue-here file, delete it (it has been consumed).

$ARGUMENTS
