# Domain: quality-persona — Tasks

## Task 1: Add Quality North Star section to CLAUDE-project template and init/setup commands
**Files**: `templates/CLAUDE-project.md`, `commands/gsd-t-init.md`, `commands/gsd-t-setup.md`
**Scope**:
1. Add `## Quality North Star` section to CLAUDE-project.md template with placeholder and 3 preset options (library, web app, CLI tool) plus custom option.
2. In gsd-t-init.md, add a step that detects project type (package.json scripts, file structure) and auto-selects a persona, or lets user choose.
3. In gsd-t-setup.md, add persona configuration option.
**Contract**: Quality persona is stored in project CLAUDE.md under `## Quality North Star`. If section is missing, injection skips silently.
