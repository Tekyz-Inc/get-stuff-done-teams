# Tasks: housekeeping

## Summary
All 13 scan #4 tech debt items resolved through doc fixes, contract sync, code cleanup, and git renormalization.

## Tasks

### Task 1: Quick doc/config fixes (TD-044, TD-046, TD-048, TD-051)
- **Files**: `.gsd-t/progress.md`, `CLAUDE.md`, `package.json`
- **Contract refs**: progress-file-format.md (TD-044 status values)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - TD-044: progress.md Status uses contract-recognized value (note: will be READY after milestone completes)
  - TD-046: No orphaned domain directories exist (already done during partition)
  - TD-048: CLAUDE.md version reference no longer hardcodes a specific version
  - TD-051: package.json has `"prepublishOnly": "npm test"` in scripts

### Task 2: Contract sync (TD-047, TD-053, TD-054, TD-055)
- **Files**: `.gsd-t/contracts/progress-file-format.md`, `.gsd-t/contracts/wave-phase-sequence.md`, `.gsd-t/contracts/command-interface-contract.md` (renamed), `.gsd-t/contracts/integration-points.md`
- **Contract refs**: Self-referential — updating contracts to match implementation
- **Dependencies**: NONE
- **Acceptance criteria**:
  - TD-047: progress-file-format contract documents enriched Current Milestone format (Goal, Result, Tech Debt Items, Success Criteria)
  - TD-053: wave-phase-sequence contract documents Security Considerations and integrity check
  - TD-054: command-interface-contract.md renamed to backlog-command-interface.md
  - TD-055: integration-points.md updated to reflect current state (no active cross-domain dependencies)

### Task 3: CHANGELOG entries (TD-045)
- **Files**: `CHANGELOG.md`
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - CHANGELOG has entries for v2.24.0 (Testing Foundation), v2.24.1 (Security Hardening), v2.24.2 (CLI Quality), v2.24.3 (Command Cleanup)
  - Entries are between existing v2.23.0 and any future entries

### Task 4: Code changes (TD-050, TD-052)
- **Files**: `bin/gsd-t.js`, `scripts/gsd-t-heartbeat.js`
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - TD-050: `readSettingsJson()` helper replaces 3 duplicate JSON.parse patterns in bin/gsd-t.js
  - TD-052: Notification event handler passes message through `scrubSecrets()` before logging
  - All 116 tests pass

### Task 5: Git renormalize (TD-049)
- **Files**: All tracked `.js` files (line ending conversion)
- **Contract refs**: None
- **Dependencies**: Requires Tasks 1-4 complete (renormalize should be last code change)
- **Acceptance criteria**:
  - `git add --renormalize .` applied
  - JS files use LF line endings in git

### Task 6: TOCTOU documentation (TD-029)
- **Files**: `.gsd-t/techdebt.md`
- **Contract refs**: None
- **Dependencies**: NONE
- **Acceptance criteria**:
  - TD-029 documented as accepted risk with rationale (single-threaded Node.js, user-local CLI tool, admin-only symlinks on Windows)
  - Entry updated with explicit "ACCEPTED RISK" status

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 5
- Blocked tasks: 1 (Task 5 depends on Tasks 1-4)
- Estimated checkpoints: 0
