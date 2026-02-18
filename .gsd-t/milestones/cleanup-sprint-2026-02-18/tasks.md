# Tasks: cleanup

## Summary
Resolve all 10 LOW-severity scan #5 findings across 4 JS files, 2 contracts, and 1 state file. Each task is small and independent.

## Tasks

### Task 1: Dead code removal (TD-057, TD-058)
- **Files**: `bin/gsd-t.js`, `test/cli-quality.test.js`
- **Contract refs**: none
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `PKG_EXAMPLES` constant removed from bin/gsd-t.js line 39
  - `writeTemplateFile` and `showStatusVersion` removed from test/cli-quality.test.js imports (lines 21-22)
  - All 116 existing tests still pass

### Task 2: summarize() case fallthrough (TD-056)
- **Files**: `scripts/gsd-t-heartbeat.js`
- **Contract refs**: none
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Read/Edit/Write cases combined using fallthrough
  - summarize() is under 27 lines
  - All 116 existing tests still pass (buildEvent tests cover summarize indirectly)

### Task 3: checkForUpdates() condition fix (TD-061)
- **Files**: `bin/gsd-t.js`
- **Contract refs**: none
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Redundant `!cached && isStale` simplified to `if (!cached)` with `else if (isStale)`
  - All 116 existing tests still pass

### Task 4: Notification title scrubbing (TD-063)
- **Files**: `scripts/gsd-t-heartbeat.js`
- **Contract refs**: none
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `h.title` wrapped in `scrubSecrets()` in Notification handler (line 100)
  - Existing notification buildEvent test updated to verify title scrubbing

### Task 5: Add tests for readSettingsJson() and shortPath() (TD-059, TD-060)
- **Files**: `test/cli-quality.test.js`, `test/security.test.js`
- **Contract refs**: none
- **Dependencies**: Requires Task 1 (dead imports removed from cli-quality.test.js)
- **Acceptance criteria**:
  - readSettingsJson() has 3+ tests in cli-quality.test.js (null return, valid JSON, corrupt file)
  - shortPath() has 4+ tests in security.test.js (null, cwd-relative, home-relative, absolute)
  - All tests pass

### Task 6: Documentation and contract fixes (TD-062, TD-064, TD-065)
- **Files**: `.gsd-t/techdebt.md`, `.gsd-t/contracts/wave-phase-sequence.md`, `.gsd-t/contracts/file-format-contract.md`
- **Contract refs**: wave-phase-sequence.md
- **Dependencies**: NONE
- **Acceptance criteria**:
  - SEC-N16 note in techdebt.md is factually accurate (already corrected in scan #5 — verify)
  - wave-phase-sequence.md integrity check section updated: Version replaced with Domains table
  - file-format-contract.md deleted (backlog-file-formats.md is authoritative)

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 5
- Blocked tasks (waiting on other tasks): 1 (Task 5 depends on Task 1)
- Estimated checkpoints: 0
