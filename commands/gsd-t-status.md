# GSD-T: Status — Cross-Domain Progress View

You are checking the current state of the project across all domains.

## Launch via Subagent

To keep the main conversation context lean, run status via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):
Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
model: haiku
prompt: "You are running gsd-t-status. Working directory: {current project root}
Read .gsd-t/progress.md and execute the full status report workflow."
```
Wait for the subagent to complete. Relay its output to the user. **Do not read files yourself.**

**If you are the spawned subagent** (your prompt says "running gsd-t-status"):
Continue below.

## Read These Files

1. `.gsd-t/progress.md`
2. `.gsd-t/domains/*/tasks.md` — all domain task lists
3. `.gsd-t/contracts/integration-points.md` — dependency graph

## Report Format

Present a concise status to the user:

```
📊 GSD-T Status: {milestone name}
Phase: {PARTITIONED | DISCUSSED | PLANNED | EXECUTING | INTEGRATED | VERIFIED}

Domains:
  {domain-1}: {completed}/{total} tasks {✅ done | 🔄 in progress | ⏳ blocked}
  {domain-2}: {completed}/{total} tasks {✅ done | 🔄 in progress | ⏳ blocked}
  {domain-3}: {completed}/{total} tasks {✅ done | 🔄 in progress | ⏳ blocked}

Backlog: {N} items
  1. {title} ({type})
  2. {title} ({type})
  3. {title} ({type})

Next checkpoint: {description} — waiting on {domain} Task {N}
Next action: {what should happen next}

Recent decisions:
  - {latest decision from Decision Log}
```

### Backlog Section

If `.gsd-t/backlog.md` exists, read and parse it. Show total count and top 3 items (position, title, type). If no backlog file exists, skip the Backlog section entirely. If the backlog file exists but is empty (no entries), show `Backlog: No items`.

If there are blockers or issues, highlight them.
If the user provides $ARGUMENTS, focus the status on that specific domain or aspect.

## Version Check

After displaying the project status, check for GSD-T updates:

1. Read `~/.claude/.gsd-t-version` to get the installed version
2. Read `~/.claude/.gsd-t-update-check` (JSON with `latest` and `timestamp` fields) to get the latest known version
3. If the file doesn't exist or is unreadable, run `gsd-t status` (CLI) in the background to trigger a cache refresh, and skip the notice
4. If `latest` is newer than the installed version, append to the report:

```
⬆️  GSD-T update available: {installed} → {latest}
   Run: npm update -g @tekyzinc/gsd-t && gsd-t update-all
```

5. If versions match, skip — don't show anything

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
