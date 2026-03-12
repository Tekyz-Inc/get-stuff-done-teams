# GSD-T: Global Change — Apply Changes Across All GSD-T Projects

You are applying a file-level change to every GSD-T project registered in `.claude/.gsd-t-projects`. This is a **global** slash command (installed to `~/.claude/commands/`) that enables bulk updates to project configuration, CLAUDE.md files, templates, and any other files that need to stay consistent across the GSD-T ecosystem.

## Syntax

```
/global-change <operation> <relative-path/filename> [arguments]
```

### Operations

| Operation | Arguments | Description |
|-----------|-----------|-------------|
| `copy`    | `<relative-path/filename>` | Copy file from the GSD-T package directory to the same relative path in all projects |
| `insert`  | `<relative-path/filename> <content>` | Append content to the specified file in all projects |
| `update`  | `<relative-path/filename> <old_content> %%REPLACE_WITH%% <new_content>` | Find `old_content` in the file and replace it with `new_content` in all projects |
| `delete`  | `<relative-path/filename>` | Delete the specified file from all projects |

### Examples

```
/global-change copy .gsd-t/templates/contract.md

/global-change insert .gsd-t/config.json {"newSetting": true}

/global-change update CLAUDE.md
- `model: haiku` — mechanical tasks
- `model: sonnet` (default) — reasoning tasks
%%REPLACE_WITH%%
- `model: haiku` — mechanical tasks (same as now)
- `model: sonnet` — mid-tier reasoning: routine code changes, standard refactors, test writing, straightforward synthesis
- `model: opus` — high-stakes reasoning: architecture decisions, security analysis, complex debugging, cross-module refactors, quality judgment on critical paths

/global-change delete .gsd-t/deprecated-template.md
```

## Step 1: Load the Project Registry

Read `~/.claude/.gsd-t-projects`. This file contains one absolute project path per line.

```
# Example .gsd-t-projects
C:/Users/david/MyNextListen
C:/Users/david/TimeTracking
C:/Users/david/tekyz-ai-copilot
```

If the file does not exist or is empty:
- STOP. Tell the user: "No GSD-T projects registered. Register projects by adding their absolute paths (one per line) to `~/.claude/.gsd-t-projects`."
- Do NOT proceed.

Parse the file:
- Skip blank lines
- Skip lines starting with `#` (comments)
- Trim whitespace from each path
- Store as `PROJECT_PATHS[]`

## Step 2: Parse Arguments

Extract from $ARGUMENTS:
1. **operation** — first word: `copy`, `insert`, `update`, or `delete`
2. **relative-path/filename** — second token: the file path relative to each project root (e.g., `CLAUDE.md`, `.gsd-t/config.json`, `docs/architecture.md`)
3. **Remaining arguments** depend on the operation:
   - `copy` — no additional arguments
   - `insert` — everything after the filename is the content to append
   - `update` — everything after the filename is split by the `%%REPLACE_WITH%%` delimiter into **old_content** (before) and **new_content** (after)
   - `delete` — no additional arguments

### Parsing the `update` Delimiter

For `update` operations, the content portion (everything after the filename) MUST contain the literal string `%%REPLACE_WITH%%` on its own line. Split on this delimiter:
- **old_content** = trimmed text before `%%REPLACE_WITH%%` — the exact text to find in the target file
- **new_content** = trimmed text after `%%REPLACE_WITH%%` — the replacement text

If the delimiter is missing, STOP and show the user the correct syntax:
```
Usage: /global-change update <file> <old content> %%REPLACE_WITH%% <new content>
```

### Validation Rules

- If operation is missing or not one of `copy|insert|update|delete` → STOP, show usage syntax
- If relative-path/filename is missing → STOP, show usage syntax
- If operation is `insert` and no content is provided → STOP, tell the user content is required
- If operation is `update` and `%%REPLACE_WITH%%` delimiter is missing → STOP, show correct syntax
- If operation is `update` and either old_content or new_content is empty → STOP, both sides of the delimiter are required
- If operation is `copy` and the source file does not exist in the GSD-T package directory → STOP, tell the user the source file was not found

### Determine GSD-T Package Directory

The source directory for `copy` operations is the installed GSD-T package location. Resolve it by checking (in order):
1. The directory containing this command file (walk up to the package root)
2. `node_modules/@tekyz/gsd-t/` relative to the global npm prefix
3. Ask the user if neither resolves

## Step 3: Dry Run — Scan All Projects First

Before making any changes, scan every project to preview what will happen. For each project in `PROJECT_PATHS[]`:

### For `copy`:
- Check if the target file already exists → note "will overwrite" or "will create"

### For `insert`:
- Check if the target file exists → note "will append to existing" or "will create new file"

### For `update`:
- Read the target file
- Search for `old_content` in the file contents
- If found → note "match found — will replace"
- If NOT found → note "⚠ NO MATCH — will skip" (do NOT modify files where the old content isn't found)
- If found multiple times → note "⚠ MULTIPLE MATCHES ([count]) — will replace all occurrences"

### For `delete`:
- Check if the target file exists → note "will delete" or "will skip (not found)"

### Display the dry run summary:

```
Global Change — Pre-flight Summary
Operation:  [operation]
Target:     [relative-path/filename]
Projects:   [N] registered

[For update — show old/new content preview]

Dry run results:
  [status] [project-name] — [description]
  [status] [project-name] — [description]
```

**Level 3 (Full Auto)**: If ALL projects show clean matches (no warnings), auto-proceed to Step 4 without asking. If ANY project shows a warning (no match, multiple matches), pause and ask.

**Level 1-2**: Always pause and ask for confirmation.

## Step 4: Execute Changes

For each project that passed the dry run:

### `copy`
1. Determine the target: `{PROJECT_PATH}/{relative-path/filename}`
2. If the target directory does not exist → create it (including intermediate directories)
3. Copy the source file to the target, overwriting if it exists

### `insert`
1. Determine the target: `{PROJECT_PATH}/{relative-path/filename}`
2. If the target directory does not exist → create it (including intermediate directories)
3. If the target file does not exist → create it with the provided content
4. If the target file exists → append a newline + the provided content to the end

### `update`
1. Determine the target: `{PROJECT_PATH}/{relative-path/filename}`
2. If the file does not exist → skip
3. Read the file contents
4. Search for `old_content` (exact string match, whitespace-sensitive)
5. If NOT found → skip
6. If found → replace ALL occurrences of `old_content` with `new_content`
7. Write the modified contents back to the file

### `delete`
1. Determine the target: `{PROJECT_PATH}/{relative-path/filename}`
2. If the target file does not exist → skip
3. If the target file exists → delete it
4. Do NOT delete the parent directory even if empty

### Error Handling
- On failure, record: `FAILED: {error message}`
- Never abort the entire run because one project failed — continue to the next

## Step 5: Report Results

Display the final summary:

```
Global Change — Results
Operation:  [operation] [relative-path/filename]
Succeeded:  [N] / [total] projects
Failed:     [N]
Skipped:    [N]

  [status] [project-name] — [result]
  [status] [project-name] — [result]
```

Status icons:
- `✓` — success
- `⊘` — skipped (file not found, no match, etc.)
- `✗` — failed with error

If there were failures, list them with actionable error messages.

## Notes

- **Relative paths use forward slashes** regardless of OS
- **No glob patterns** — operates on a single file per invocation
- **Content for `insert`** can be provided inline or pasted in the user's message
- **Content for `update`** uses the `%%REPLACE_WITH%%` delimiter — old_content match is exact and whitespace-sensitive
- **Project names in logs** are derived from the last segment of the project path
- **The `.gsd-t-projects` file** is maintained by `gsd-t init` (auto-registers) and `gsd-t update-all` (reads)

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
