# GSD-T: Backlog Edit — Modify Entry Fields

You are editing an existing backlog entry. Only the specified fields are updated — all other fields are preserved as-is.

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
"Backlog is empty. Nothing to edit."
Stop here.

## Step 2: Parse Arguments

Extract from $ARGUMENTS:
- `<position>` (required) — the position number of the entry to edit
- `--title "..."` (optional) — new title
- `--desc "..."` (optional) — new description
- `--type ...` (optional) — new type
- `--app ...` (optional) — new app
- `--category ...` (optional) — new category

If no position is provided, show usage:
"Usage: /gsd-t-backlog-edit <position> [--title \"...\"] [--desc \"...\"] [--type ...] [--app ...] [--category ...]"
"Example: /gsd-t-backlog-edit 3 --title \"Updated title\" --type bug"
Stop here.

If no optional flags are provided (only position given), inform the user:
"No fields specified to edit. Use --title, --desc, --type, --app, or --category."
Stop here.

Validate that the position exists in the backlog (between 1 and total entry count). If not:
"Position {value} is out of range. Backlog has {count} items (valid: 1-{count})."
Stop here.

## Step 3: Validate Against Settings

Read `.gsd-t/backlog-settings.md` to load allowed values.

For each provided field that has a constrained value set:
- **--type**: Check against the `## Types` list. If invalid, warn: "Type '{value}' is not in settings. Available types: {list}. Did you mean '{closest match}'?"
- **--app**: Check against the `## Apps` list. If invalid, warn: "App '{value}' is not in settings. Available apps: {list}. Did you mean '{closest match}'?"
- **--category**: Check against the `## Categories` list. If the list is empty, accept any value. If populated and invalid, warn: "Category '{value}' is not in settings. Available categories: {list}. Did you mean '{closest match}'?"

If any value is invalid, stop and ask the user whether to proceed with the invalid value or choose from the available options.

**--title** and **--desc** are free-text fields — no validation needed.

## Step 4: Update Entry

1. Find the entry at the specified position
2. Record the current values as "before" snapshot
3. Update only the fields that were specified:
   - `--title`: Update the title in the `## {position}. {title}` heading
   - `--desc`: Update the description line (`- {description}`)
   - `--type`: Update the Type in the metadata line
   - `--app`: Update the App in the metadata line
   - `--category`: Update the Category in the metadata line
4. Preserve all unspecified fields exactly as they are
5. Preserve the Added date — do not change it
6. Rewrite `.gsd-t/backlog.md` with the updated entry in place

## Step 5: Confirm

Show the user the before and after:
```
Edited backlog item #{position}:

Before:
  Title: {old-title}
  Type: {old-type} | App: {old-app} | Category: {old-category}
  Description: {old-desc}

After:
  Title: {new-title}
  Type: {new-type} | App: {new-app} | Category: {new-category}
  Description: {new-desc}
```

Only highlight fields that actually changed.

## Step 6: Document Ripple

If `.gsd-t/progress.md` exists, log the edit in the Decision Log:
- Date: today's date
- Entry: "Backlog edit: updated {changed-fields} for '{title}' at position {position}"

## Step 7: Test Verification

Verify the rewritten `.gsd-t/backlog.md` is well-formed:
1. Re-read the file
2. Confirm the edited entry parses correctly (heading, metadata, date, description)
3. Confirm all other entries are unchanged
4. Confirm total entry count is the same as before the edit
5. Confirm positions are still sequential (no gaps or duplicates)

If any check fails, report the issue and attempt to fix (up to 2 attempts).

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
