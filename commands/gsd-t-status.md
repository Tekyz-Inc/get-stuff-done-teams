# GSD-T: Status — Cross-Domain Progress View

You are checking the current state of the project across all domains.

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

$ARGUMENTS
