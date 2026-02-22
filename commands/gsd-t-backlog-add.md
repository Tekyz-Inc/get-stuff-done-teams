# GSD-T: Backlog Add — Capture and Categorize a Backlog Item

You are adding a new item to the project backlog. The item will be auto-categorized if needed and appended to the bottom of the backlog.

## Step 1: Load Settings

Read `.gsd-t/backlog-settings.md` to load:
- **Types**: The allowed type values (bug, feature, improvement, ux, architecture, etc.)
- **Apps**: The allowed app values
- **Categories**: The allowed category values
- **Default App**: The fallback app when `--app` is not specified
- **Auto-categorize**: Whether to infer missing fields from title/description

If `.gsd-t/backlog-settings.md` does not exist, STOP and tell the user:
"No backlog settings found. Run `/gsd-t-init` or create `.gsd-t/backlog-settings.md` first."

## Step 2: Parse Arguments

Extract from `$ARGUMENTS`:
- **title** (required) — The quoted string at the start, e.g., `"Fix login timeout"`
- **--desc "..."** (optional) — A longer description
- **--type ...** (optional) — The item type (e.g., bug, feature)
- **--app ...** (optional) — The target app
- **--category ...** (optional) — The category

If no title is provided, STOP and tell the user:
"Usage: `/gsd-t-backlog-add \"<title>\" [--desc \"...\"] [--type ...] [--app ...] [--category ...]`"

## Step 3: Auto-Categorize

For any field NOT explicitly provided:

1. **--app not provided**: Use the **Default App** from settings
2. **--type not provided**: If Auto-categorize is true, infer the type from the title and description:
   - Words like "bug", "fix", "broken", "error", "crash" → `bug`
   - Words like "add", "new", "create", "implement" → `feature`
   - Words like "improve", "optimize", "refactor", "clean" → `improvement`
   - Words like "ui", "ux", "design", "layout", "style" → `ux`
   - Words like "architecture", "structure", "pattern", "system" → `architecture`
   - If unclear, default to `feature`
3. **--category not provided**: If Auto-categorize is true and categories exist in settings, infer the best-matching category from the title and description. If no good match or no categories defined, leave as `general`.

## Step 4: Validate

Check that the resolved values exist in `.gsd-t/backlog-settings.md`:

- **Type**: Must be in the Types list. If not found, warn: "Type '{value}' is not in settings. Known types: {list}. Did you mean '{closest match}'?"
- **App**: Must be in the Apps list. If not found, warn: "App '{value}' is not in settings. Known apps: {list}. Did you mean '{closest match}'?"
- **Category**: Must be in the Categories list (if categories are defined). If not found and categories exist, warn: "Category '{value}' is not in settings. Known categories: {list}. Did you mean '{closest match}'?"

If any validation fails, STOP and show the warning. Do not add the entry until the user confirms or corrects.

## Step 5: Append Entry

1. Read `.gsd-t/backlog.md`
2. Count existing entries (count `## {N}.` headings) to determine the next position number
3. Append the new entry at the bottom of the file using this EXACT format:

```
## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

Where:
- `{N}` = next sequential position number (existing count + 1)
- `{title}` = the item title
- `{type}`, `{app}`, `{category}` = the resolved/validated values
- `{YYYY-MM-DD}` = today's date
- `{description}` = the --desc value, or a brief description derived from the title if --desc was not provided

Ensure there is an empty line before the new entry.

4. If `.gsd-t/backlog.md` does not exist, create it with the `# Backlog` heading first, then append the entry.

## Step 6: Document Ripple

Update `.gsd-t/progress.md` Decision Log:
- Add entry: `{date} — Added backlog item #{N}: "{title}" (type: {type}, app: {app}, category: {category})`

## Step 7: Test Verification

Verify the entry was added correctly:
1. Re-read `.gsd-t/backlog.md`
2. Confirm the new entry exists at the expected position
3. Confirm the format matches the file-format contract exactly
4. Report: "Added backlog item #{N}: **{title}** — Type: {type} | App: {app} | Category: {category}"

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
