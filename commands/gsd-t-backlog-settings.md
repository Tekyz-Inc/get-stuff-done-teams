# GSD-T: Backlog Settings — Manage Types, Apps, Categories, and Defaults

You are managing the backlog settings file. This controls the allowed values for types, apps, and categories used by backlog entries, and the default app assignment.

## Step 1: Read Settings

Read `.gsd-t/backlog-settings.md` and parse current settings:
- **Types** section — list of allowed type values
- **Apps** section — list of allowed app values
- **Categories** section — list of allowed category values
- **Defaults** section — Default App and Auto-categorize values

If the file doesn't exist:
- "No backlog settings found. Run `/gsd-t-init` with backlog support to create settings."
- Stop.

## Step 2: Parse Subcommand

Parse $ARGUMENTS to identify the subcommand and its arguments.

Valid subcommands:
- `list` — no additional args
- `add-type <name>` — requires a name
- `remove-type <name>` — requires a name
- `add-app <name>` — requires a name
- `remove-app <name>` — requires a name
- `add-category <name>` — requires a name
- `remove-category <name>` — requires a name
- `default-app <name>` — requires a name

If no subcommand or an invalid subcommand is provided:
- Show usage: "Usage: `/gsd-t-backlog-settings <subcommand> [args]`"
- List available subcommands with brief descriptions
- Stop.

If a subcommand requires a name argument and none is provided:
- "Missing argument. Usage: `/gsd-t-backlog-settings {subcommand} <name>`"
- Stop.

## Step 3: Validate

Perform validation based on the subcommand:

- **add-type/add-app/add-category**: Convert name to lowercase. Check the appropriate section for duplicates. If the value already exists: "'{name}' already exists in {section}." — Stop.
- **remove-type/remove-app/remove-category**: Check the appropriate section for existence. If the value doesn't exist: "'{name}' not found in {section}." — Stop.
- **default-app**: Convert name to lowercase. Check that the name exists in the Apps section. If not: "'{name}' is not in the Apps list. Add it first with `add-app {name}`." — Stop.

## Step 4: Execute Subcommand

### `list`

Display all current settings in a formatted view:

```
Backlog Settings:

Types: bug, feature, improvement, ux, architecture
Apps: {app1}, {app2}
Categories: {cat1}, {cat2}

Defaults:
  Default App: {app}
  Auto-categorize: true
```

Stop after displaying. No file modifications needed.

### `add-type`, `add-app`, `add-category`

Append the new value (lowercase) to the appropriate section in `.gsd-t/backlog-settings.md`.

Format: `- {name}` added as the last item in the section's list.

Confirm: "Added '{name}' to {section}."

### `remove-type`, `remove-app`, `remove-category`

Before removing, read `.gsd-t/backlog.md` and check if any existing entries use this value.

If entries use this value:
- Warn: "'{name}' is currently used by {count} backlog entry/entries: {titles}."
- Ask for confirmation: "Remove anyway? (y/n)"
- If user declines, stop.

Remove the value from the appropriate section in `.gsd-t/backlog-settings.md`.

Confirm: "Removed '{name}' from {section}."

### `default-app`

Update the `- **Default App:** {value}` line in the Defaults section of `.gsd-t/backlog-settings.md`.

Confirm: "Default app changed to '{name}'."

## Step 5: Rewrite Settings File

Skip this step for the `list` subcommand.

Rewrite `.gsd-t/backlog-settings.md` with the updated settings, preserving the file format:

```markdown
# Backlog Settings

## Types
- {type1}
- {type2}
...

## Apps
- {app1}
- {app2}
...

## Categories
- {cat1}
- {cat2}
...

## Defaults
- **Default App:** {app}
- **Auto-categorize:** true
```

## Step 6: Document Ripple

Skip this step for the `list` subcommand.

If `.gsd-t/progress.md` exists, update:

### Always update:
1. **`.gsd-t/progress.md`** — Log the settings change in the Decision Log:
   - For add: `"Added '{name}' to backlog {section}"`
   - For remove: `"Removed '{name}' from backlog {section}"`
   - For default-app: `"Changed default app to '{name}'"`

### Check if affected:
2. **`.gsd-t/contracts/file-format-contract.md`** — If this change affects the documented settings format, flag it (should be rare)

### Skip what's not affected — most settings changes only touch progress.md.

## Step 7: Test Verification

Skip this step for the `list` subcommand.

Verify the settings file is well-formed after update:

1. Read `.gsd-t/backlog-settings.md` and confirm:
   - All four sections exist: Types, Apps, Categories, Defaults
   - Each section's items are `- {value}` format, lowercase
   - Defaults section has `- **Default App:** {value}` and `- **Auto-categorize:** {value}`
   - No empty lines within a section's list, no orphaned content
2. If any issues found, fix them before finishing

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
