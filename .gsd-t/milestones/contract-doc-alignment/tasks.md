# Tasks: doc-alignment

## Summary
Fix all contract drift, stale references, and missing gitignore patterns identified in the 2026-02-18 scan. All tasks are independent — no cross-dependencies.

## Tasks

### Task 1: Add heartbeat files to .gitignore (TD-018)
- **Files**: `.gitignore`
- **Contract refs**: None (security fix)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `.gsd-t/heartbeat-*.jsonl` pattern added to `.gitignore`
  - Existing tracked heartbeat files removed from git tracking (`git rm --cached`)
  - Verify: `git status` no longer shows heartbeat files as tracked

### Task 2: Fix backlog.md format to match contract (TD-014)
- **Files**: `.gsd-t/backlog.md`
- **Contract refs**: `.gsd-t/contracts/backlog-file-formats.md`
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Position uses integer `1` instead of `B1`
  - Metadata on single pipe-delimited line: `**Type:** {type} | **App:** {app} | **Category:** {category}`
  - App field present (use `gsd-t` from backlog-settings.md default)
  - No extra `**Priority:**` field
  - No extra `**Description**:` label — description is bare `- {text}`
  - Added date on its own line: `- **Added:** {YYYY-MM-DD}`
  - Entry content preserved (title, type, category, description text, date unchanged)

### Task 3: Fix progress.md format to match contract (TD-015)
- **Files**: `.gsd-t/progress.md`
- **Contract refs**: `.gsd-t/contracts/progress-file-format.md`
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Header order: `## Project:`, `## Version:`, `## Status:`, `## Date:` (contract order)
  - Completed Milestones table has NO `#` column (contract: `| Milestone | Version | Completed | Tag |`)
  - `## Blockers` section present between Integration Checkpoints and Decision Log (use HTML comment placeholder)
  - All existing content (decision log, session log, milestone data) preserved exactly

### Task 4: Add backlog commands to GSD-T-README (TD-016)
- **Files**: `docs/GSD-T-README.md`
- **Contract refs**: `.gsd-t/contracts/command-interface-contract.md`
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Backlog Management section added between "Automation & Utilities" and the "Workflow Phases" sections
  - All 7 commands listed: backlog-add, backlog-list, backlog-move, backlog-edit, backlog-remove, backlog-promote, backlog-settings
  - Table format matches other sections: `| Command | Purpose | Auto |`
  - Descriptions match README.md backlog section exactly

### Task 5: Fix stale command counts (TD-022/TD-023)
- **Files**: `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`
- **Contract refs**: None (documentation accuracy)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - All references to "41 commands" → "42"
  - All references to "37 GSD-T" → "38"
  - All references to "41 slash command" → "42 slash command"
  - Verify: `grep -r "41 " docs/` returns no stale counts
  - Note: CLAUDE.md and README.md already fixed during scan — skip those

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 5
- Blocked tasks: 0
- Estimated checkpoints: 0
- Recommended mode: Solo sequential (< 8 tasks, all independent, all small)
