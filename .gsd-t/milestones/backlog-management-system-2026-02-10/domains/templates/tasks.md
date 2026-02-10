# Tasks: templates

## Summary
Create the two template files (backlog.md and backlog-settings.md) that define the exact file format used by all backlog commands. These templates are copied into `.gsd-t/` during `gsd-t-init`.

## Tasks

### Task 1: Create backlog.md template
- **Files**: `templates/backlog.md` (create)
- **Contract refs**: file-format-contract.md — "backlog.md Format" section
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File exists at `templates/backlog.md`
  - Contains only the `# Backlog` heading (empty template — no entries)
  - Matches the exact format from file-format-contract.md Rules section
  - Uses no replacement tokens (backlog starts empty, entries are added by commands)

### Task 2: Create backlog-settings.md template
- **Files**: `templates/backlog-settings.md` (create)
- **Contract refs**: file-format-contract.md — "backlog-settings.md Format" section
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File exists at `templates/backlog-settings.md`
  - Contains `# Backlog Settings` heading
  - Has `## Types` section with default list: bug, feature, improvement, ux, architecture
  - Has `## Apps` section with placeholder: `- {app1}`, `- {app2}`
  - Has `## Categories` section (empty list — populated during init category derivation)
  - Has `## Defaults` section with: `- **Default App:** {app}` and `- **Auto-categorize:** true`
  - Matches the exact format from file-format-contract.md Rules section

## Execution Estimate
- Total tasks: 2
- Independent tasks (no blockers): 2
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0
