# GSD-T: Backlog Remove — Drop Item with Optional Reason

You are removing an entry from the backlog. This deletes the item, renumbers remaining entries, and logs the removal.

## Step 1: Read Backlog

Read `.gsd-t/backlog.md` and parse all entries.

Find the entry at the specified position from $ARGUMENTS.

If the file doesn't exist or has no entries:
- "No backlog found. Nothing to remove."
- Stop.

If the position doesn't exist (out of range or invalid):
- "Position {N} not found. The backlog has {count} entries."
- Stop.

## Step 2: Confirm Removal

Display the entry details to the user:

```
Remove this backlog item?

  ## {position}. {title}
  - Type: {type} | App: {app} | Category: {category}
  - Added: {date}
  - {description}

Confirm removal? (y/n)
```

Wait for user confirmation before proceeding. If the user declines, stop.

## Step 3: Remove Entry

Delete the entry from `.gsd-t/backlog.md`.

## Step 4: Renumber Entries

Renumber ALL remaining entries sequentially starting from 1.

Each entry heading must follow the format: `## {position}. {title}`

Rewrite `.gsd-t/backlog.md` with the updated entries. If no entries remain, the file should contain only the `# Backlog` heading.

## Step 5: Log Removal

Parse $ARGUMENTS for the optional `--reason "..."` flag.

Add a Decision Log entry in `.gsd-t/progress.md`:

```
| {YYYY-MM-DD} | Removed backlog item "{title}"{reason_suffix} |
```

Where `{reason_suffix}` is ` — Reason: {reason}` if `--reason` was provided, or empty if not.

## Step 6: Document Ripple

If `.gsd-t/progress.md` exists, update:

### Always update:
1. **`.gsd-t/progress.md`** — Decision Log entry for the removal (done in Step 5)

### Check if affected:
2. **`.gsd-t/techdebt.md`** — If the removed item was related to tracked debt, note its removal

### Skip what's not affected — most removals only touch progress.md.

## Step 7: Test Verification

Verify the backlog file is well-formed after removal:

1. Read `.gsd-t/backlog.md` and confirm:
   - Entries are numbered sequentially (1, 2, 3...) with no gaps
   - Each entry follows the format: `## {N}. {title}` + metadata line + date line + description
   - No orphaned content or broken formatting
2. If any issues found, fix them before finishing

$ARGUMENTS
