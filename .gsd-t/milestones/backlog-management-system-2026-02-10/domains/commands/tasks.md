# Tasks: commands

## Summary
Create all 7 backlog slash command files following existing GSD-T command patterns (pure markdown, step-numbered, with Document Ripple and Test Verification steps).

## Tasks

### Task 1: Create gsd-t-backlog-add.md
- **Files**: `commands/gsd-t-backlog-add.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Add" row; file-format-contract.md — backlog.md entry format
- **Dependencies**: BLOCKED by templates Task 2 (needs backlog-settings.md format for auto-categorize validation)
- **Acceptance criteria**:
  - Command accepts: `"<title>" [--desc "..."] [--type ...] [--app ...] [--category ...]`
  - Reads `.gsd-t/backlog-settings.md` to validate type/app/category against allowed values
  - Auto-categorizes: infers Type, App, Category from title/description if not provided
  - Falls back to Default App from settings when --app not specified
  - Appends new entry to bottom of `.gsd-t/backlog.md` with next sequential position number
  - Entry format matches file-format-contract.md exactly: `## {N}. {title}` + metadata line + date line + description
  - Sets `**Added:** {YYYY-MM-DD}` to today's date
  - Includes Document Ripple step (update progress.md Decision Log)
  - Includes Test Verification step

### Task 2: Create gsd-t-backlog-list.md
- **Files**: `commands/gsd-t-backlog-list.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog List" row; file-format-contract.md — backlog.md format
- **Dependencies**: BLOCKED by templates Task 1 (needs backlog.md format to parse)
- **Acceptance criteria**:
  - Command accepts: `[--type ...] [--app ...] [--category ...] [--top N]`
  - Reads `.gsd-t/backlog.md` and parses all entries
  - Displays entries in order (position = priority)
  - Supports filtering by type, app, and/or category (multiple filters are AND)
  - Supports `--top N` to show only the first N items
  - With no arguments, shows all entries
  - Shows empty-state message if no entries or no matches
  - Read-only — does not modify any files

### Task 3: Create gsd-t-backlog-move.md
- **Files**: `commands/gsd-t-backlog-move.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Move" row; file-format-contract.md — backlog.md format
- **Dependencies**: BLOCKED by templates Task 1 (needs backlog.md format to parse/rewrite)
- **Acceptance criteria**:
  - Command accepts: `<from-position> <to-position>`
  - Reads `.gsd-t/backlog.md`, parses entries
  - Moves item at from-position to to-position
  - Renumbers all entries sequentially (1, 2, 3...) after move
  - Validates both positions exist
  - Includes Document Ripple step
  - Includes Test Verification step

### Task 4: Create gsd-t-backlog-edit.md
- **Files**: `commands/gsd-t-backlog-edit.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Edit" row; file-format-contract.md — backlog.md entry format
- **Dependencies**: BLOCKED by templates Task 2 (needs backlog-settings.md format for validation)
- **Acceptance criteria**:
  - Command accepts: `<position> [--title "..."] [--desc "..."] [--type ...] [--app ...] [--category ...]`
  - Reads `.gsd-t/backlog.md`, finds entry at position
  - Updates only the specified fields, preserves others
  - Validates type/app/category against `.gsd-t/backlog-settings.md` allowed values
  - Rewrites the file with updated entry
  - Includes Document Ripple step
  - Includes Test Verification step

### Task 5: Create gsd-t-backlog-remove.md
- **Files**: `commands/gsd-t-backlog-remove.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Remove" row; file-format-contract.md — backlog.md format
- **Dependencies**: BLOCKED by templates Task 1 (needs backlog.md format to parse/rewrite)
- **Acceptance criteria**:
  - Command accepts: `<position> [--reason "..."]`
  - Reads `.gsd-t/backlog.md`, finds entry at position
  - Confirms with user before removing (shows entry title and details)
  - Removes the entry and renumbers remaining entries sequentially
  - Logs removal (with optional reason) in progress.md Decision Log
  - Includes Document Ripple step
  - Includes Test Verification step

### Task 6: Create gsd-t-backlog-settings.md
- **Files**: `commands/gsd-t-backlog-settings.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Settings" row + "Settings Subcommands" table; file-format-contract.md — backlog-settings.md format
- **Dependencies**: BLOCKED by templates Task 2 (needs backlog-settings.md format to parse/rewrite)
- **Acceptance criteria**:
  - Command accepts: `<subcommand> [args]`
  - Supports all 8 subcommands from contract: list, add-type, remove-type, add-app, remove-app, add-category, remove-category, default-app
  - `list` shows all current settings (types, apps, categories, defaults)
  - `add-*` appends value to the appropriate section (lowercase, no duplicates)
  - `remove-*` removes value from the appropriate section (warns if not found)
  - `default-app` changes the Default App value in Defaults section
  - Validates that removed types/apps/categories are not in use by existing backlog entries (warn if so)
  - Includes Document Ripple step
  - Includes Test Verification step

### Task 7: Create gsd-t-backlog-promote.md
- **Files**: `commands/gsd-t-backlog-promote.md` (create)
- **Contract refs**: command-interface-contract.md — "Backlog Promote" row + "Promote Flow Classification" section
- **Dependencies**: BLOCKED by templates Task 1 (needs backlog.md format to read entry)
- **Acceptance criteria**:
  - Command accepts: `<position>`
  - Reads `.gsd-t/backlog.md`, finds entry at position
  - **Refine**: Expands the 1-2 sentence description into full context (asks clarifying questions if needed)
  - **Classify**: Determines which GSD-T artifact to create:
    - Milestone — multi-file, multi-phase, needs partitioning → triggers `gsd-t-milestone`
    - Quick — small scope, obvious implementation → triggers `gsd-t-quick`
    - Debug — diagnosis + fix for specific broken behavior → triggers `gsd-t-debug`
    - Feature analysis — triggers `gsd-t-feature` for impact assessment first
  - **Create**: Removes the entry from backlog, renumbers remaining entries, then invokes the appropriate GSD-T command with the refined description
  - Logs promotion in progress.md Decision Log
  - Includes Document Ripple step
  - Includes Test Verification step

## Execution Estimate
- Total tasks: 7
- Independent tasks (no blockers): 0 (all blocked by templates domain)
- Blocked tasks (waiting on other domains): 7
- Estimated checkpoints: 1 (templates must complete first)
