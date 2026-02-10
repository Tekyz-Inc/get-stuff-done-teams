# Tasks: integration

## Summary
Update 5 existing files to integrate the backlog feature: init bootstrapping (create backlog files + category derivation), status display (backlog summary), help listing (7 new commands), CLAUDE-global commands table (7 new rows), and README documentation (backlog feature section).

## Tasks

### Task 1: Update gsd-t-init.md — backlog bootstrapping
- **Files**: `commands/gsd-t-init.md` (modify)
- **Contract refs**: file-format-contract.md — both file formats; integration-points.md — "Final" checkpoint
- **Dependencies**: BLOCKED by commands domain (all 7 command files must exist before integration)
- **Acceptance criteria**:
  - Add a new step after Step 2 (Create Directory Structure) that copies `templates/backlog.md` → `.gsd-t/backlog.md` and `templates/backlog-settings.md` → `.gsd-t/backlog-settings.md`
  - Add category derivation step: reads project's `CLAUDE.md` to extract app names, tech stack terms, and domain concepts, then populates the Categories list in `backlog-settings.md`
  - Add app derivation: if CLAUDE.md mentions specific apps or services, populate the Apps list and set Default App
  - Update the directory structure diagram in Step 2 to include `backlog.md` and `backlog-settings.md`
  - Step 8 report mentions backlog files were created
  - Preserves all existing init behavior — only ADDS backlog sections

### Task 2: Update gsd-t-status.md — backlog summary
- **Files**: `commands/gsd-t-status.md` (modify)
- **Contract refs**: file-format-contract.md — backlog.md format; command-interface-contract.md — list command behavior
- **Dependencies**: BLOCKED by commands domain
- **Acceptance criteria**:
  - Add a "Backlog" section to the report format, shown only if `.gsd-t/backlog.md` exists
  - Shows: total item count, top 3 items (position, title, type)
  - Format matches existing status output style
  - Gracefully handles empty backlog (show "No backlog items")
  - Preserves all existing status behavior — only ADDS backlog section

### Task 3: Update gsd-t-help.md — add backlog commands
- **Files**: `commands/gsd-t-help.md` (modify)
- **Contract refs**: command-interface-contract.md — all 7 command names and purposes
- **Dependencies**: BLOCKED by commands domain
- **Acceptance criteria**:
  - Add a "BACKLOG" section to the Default Behavior command reference, between "UTILITIES" and the footer
  - Lists all 7 commands: backlog-add, backlog-list, backlog-move, backlog-promote, backlog-edit, backlog-remove, backlog-settings
  - Each with a short description matching command-interface-contract.md purposes
  - Add Command Summaries entries for all 7 backlog commands in the "## Command Summaries" section
  - Each summary follows existing format: Summary, Auto-invoked (No for all), Files, Use when

### Task 4: Update CLAUDE-global.md — commands reference table
- **Files**: `templates/CLAUDE-global.md` (modify)
- **Contract refs**: command-interface-contract.md — command names and purposes
- **Dependencies**: BLOCKED by commands domain
- **Acceptance criteria**:
  - Add 7 rows to the "## Commands Reference" table for all backlog commands
  - Each row: `/user:gsd-t-backlog-{name}` | `{purpose from contract}`
  - Place them logically grouped together (after utility commands or in a new section)
  - Preserves all existing table content

### Task 5: Update README.md — document backlog feature
- **Files**: `README.md` (modify)
- **Contract refs**: command-interface-contract.md — all 7 commands; file-format-contract.md — file formats
- **Dependencies**: BLOCKED by commands domain
- **Acceptance criteria**:
  - Add a "Backlog Management" section to Commands Reference, with a table of all 7 commands
  - Update the command count references (currently "24 GSD-T commands" → "31 GSD-T commands")
  - Update "Repo Contents" section command count
  - Add backlog template files to "Repo Contents" templates listing
  - Add `.gsd-t/backlog.md` and `.gsd-t/backlog-settings.md` to the "Project Structure" diagram
  - Preserves all existing README content — only ADDS backlog documentation

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 0 (all blocked by commands domain)
- Blocked tasks (waiting on other domains): 5
- Estimated checkpoints: 1 (commands must complete first)
