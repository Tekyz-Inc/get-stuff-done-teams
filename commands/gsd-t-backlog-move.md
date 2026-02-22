# GSD-T: Backlog Move — Reorder Items by Position

You are reordering a backlog item from one position to another. Position in the backlog represents priority — item 1 is highest priority.

## Step 1: Read Backlog

Read `.gsd-t/backlog.md` and parse all entries.

Each entry follows this format:
```
## {position}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

Count the total number of entries. If the backlog is empty (no entries), inform the user:
"Backlog is empty. Nothing to move."
Stop here.

## Step 2: Parse Arguments

Extract from $ARGUMENTS:
- `<from-position>` — the current position number of the item to move
- `<to-position>` — the target position number to move it to

Both arguments are required. If either is missing, show usage:
"Usage: /gsd-t-backlog-move <from-position> <to-position>"
"Example: /gsd-t-backlog-move 5 2 — moves item 5 to position 2"
Stop here.

## Step 3: Validate Positions

Check that:
1. Both `from-position` and `to-position` are positive integers
2. Both positions exist in the backlog (between 1 and total entry count)
3. `from-position` and `to-position` are different

If any check fails, inform the user:
- Invalid number: "Position must be a positive integer. Got: {value}"
- Out of range: "Position {value} is out of range. Backlog has {count} items (valid: 1-{count})."
- Same position: "From and to positions are the same. Nothing to move."
Stop here.

## Step 4: Move Item

1. Remove the entry at `from-position` from the list
2. Insert it at `to-position` in the list
3. This shifts other entries up or down accordingly

## Step 5: Renumber and Rewrite

1. Renumber ALL entries sequentially starting from 1 (update the `## {N}. {title}` heading for each)
2. Rewrite `.gsd-t/backlog.md` with the reordered entries
3. Preserve the `# Backlog` heading at the top
4. Preserve all entry content (metadata, date, description) — only the position number in the heading changes

## Step 6: Confirm

Show the user what happened:
```
Moved: "{title}" from position {from} to position {to}

Updated backlog order (top 5):
  1. {title}
  2. {title}
  3. {title}
  4. {title}
  5. {title}
```

If the backlog has fewer than 5 items, show all of them.

## Step 7: Document Ripple

If `.gsd-t/progress.md` exists, log the move in the Decision Log:
- Date: today's date
- Entry: "Backlog reorder: moved '{title}' from position {from} to {to}"

## Step 8: Test Verification

Verify the rewritten `.gsd-t/backlog.md` is well-formed:
1. Re-read the file
2. Confirm all entries parse correctly (heading, metadata, date, description)
3. Confirm positions are sequential (1, 2, 3... with no gaps or duplicates)
4. Confirm total entry count is unchanged from before the move

If any check fails, report the issue and attempt to fix (up to 2 attempts).

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
