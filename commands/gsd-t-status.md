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

Next checkpoint: {description} — waiting on {domain} Task {N}
Next action: {what should happen next}

Recent decisions:
  - {latest decision from Decision Log}
```

If there are blockers or issues, highlight them.
If the user provides $ARGUMENTS, focus the status on that specific domain or aspect.

$ARGUMENTS
