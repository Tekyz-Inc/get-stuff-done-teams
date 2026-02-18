# Tasks: count-contract-fix

## Summary
Fix stale command counts (42→43, 38→39), add missing test-sync phase to QA agent, archive orphaned domain files.

## Tasks

### Task 1: Fix stale command counts across all files (TD-022)
- **Files**: CLAUDE.md (3 locations), README.md (3 locations), package.json (1), docs/infrastructure.md (1)
- **Contract refs**: None (documentation accuracy)
- **Dependencies**: NONE
- **Status**: pending
- **Exact changes**:
  - `CLAUDE.md:13` — "42 slash commands (38 GSD-T workflow + 4 utility)" → "43 slash commands (39 GSD-T workflow + 4 utility)"
  - `CLAUDE.md:34` — "42 slash commands for Claude Code" → "43 slash commands for Claude Code"
  - `CLAUDE.md:35` — "38 GSD-T workflow commands" → "39 GSD-T workflow commands"
  - `README.md:21` — "38 GSD-T commands + 4 utility commands (42 total)" → "39 GSD-T commands + 4 utility commands (43 total)"
  - `README.md:286` — "# 42 slash commands" → "# 43 slash commands"
  - `README.md:287` — "# 38 GSD-T workflow commands" → "# 39 GSD-T workflow commands"
  - `package.json:4` — "42 slash commands" → "43 slash commands"
  - `docs/infrastructure.md:61` — "42 files" → "43 files"
- **Already correct (skip)**:
  - `docs/architecture.md:25` — already shows "43 (39 GSD-T workflow + 4 utility)"
  - `docs/workflows.md:9,17` — already shows "43 commands"
  - `docs/requirements.md:10` — already shows "39 GSD-T"
  - `docs/infrastructure.md:74` — already shows "43 slash command files (39 GSD-T + 4 utility)"
  - `templates/` — no stale counts found
- **Acceptance criteria**:
  - All 8 stale references updated
  - `grep -r "42 slash\|38 GSD-T" CLAUDE.md README.md package.json docs/` returns zero matches (excluding scan/ and techdebt references)

### Task 2: Add test-sync phase to QA agent (TD-042)
- **Files**: commands/gsd-t-qa.md, .gsd-t/contracts/qa-agent-contract.md
- **Contract refs**: qa-agent-contract.md
- **Dependencies**: NONE
- **Status**: pending
- **Exact changes**:
  - `commands/gsd-t-qa.md` — Add "### During Test-Sync" section between "During Execute" and "During Verify"
  - `.gsd-t/contracts/qa-agent-contract.md:12` — Add "test-sync" to phase context enum
  - `.gsd-t/contracts/qa-agent-contract.md:16-25` — Add "test-sync" row to Output table
- **Acceptance criteria**:
  - gsd-t-qa.md has "### During Test-Sync" section with defined QA behavior
  - qa-agent-contract.md phase context list includes "test-sync"
  - qa-agent-contract.md Output table includes test-sync row
  - Phase context count goes from 8 to 9

### Task 3: Archive orphaned domain files (TD-043)
- **Files**: .gsd-t/domains/doc-alignment/ → .gsd-t/milestones/contract-doc-alignment/
- **Contract refs**: None (housekeeping)
- **Dependencies**: NONE
- **Status**: DONE (completed during milestone definition)
- **Acceptance criteria**:
  - .gsd-t/domains/doc-alignment/ no longer exists
  - Files preserved in .gsd-t/milestones/contract-doc-alignment/

## Execution Estimate
- Total tasks: 3 (1 already done)
- Independent tasks: 3
- Blocked tasks: 0
- Recommended mode: Solo sequential
