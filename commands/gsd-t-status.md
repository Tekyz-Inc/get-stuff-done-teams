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

## Token Usage Breakdown

If `.gsd-t/token-log.md` exists, read it and append a token breakdown to the status report.

Parse each row in the table. Handle both old format (9 columns) and extended format (12 columns with Domain, Task, Ctx%). Rows with missing or empty Domain column are assigned domain "(untagged)".

### Token Usage by Domain
Group rows by Domain. For each domain, sum Tokens and collect all Ctx% values (ignoring "N/A" and empty). Display:

```
## Token Usage by Domain
| Domain         | Tokens | Subagents | Peak Ctx% |
|----------------|--------|-----------|-----------|
| auth           | 12,400 | 4         | 14%       |
| notifications  | 45,200 | 3         | 52% ⚠️    |
| (untagged)     | 8,100  | 6         | N/A       |
```

Flag any domain where Peak Ctx% >= 70 with `⚠️` suffix.

### Token Usage by Phase/Command
Group rows by Command. For each command, sum Tokens and count subagent rows. Display:

```
## Token Usage by Command
| Command       | Tokens | Subagents |
|---------------|--------|-----------|
| gsd-t-execute | 86,200 | 14        |
| gsd-t-wave    | 12,400 | 9         |
| gsd-t-plan    | 3,400  | 1         |
```

If token-log.md does not exist or is empty, skip this section entirely (no error).

## Graph Status

If `.gsd-t/graph/meta.json` exists, read it and append to the status report:
```
Graph: {entityCount} entities indexed — last indexed {lastIndexed timestamp}
```
If the graph does not exist, skip this section.

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
