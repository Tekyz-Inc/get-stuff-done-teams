# GSD-T Roadmap — Tech Debt Reduction

## Milestone 3: Count Fix + QA Contract Alignment — Tech Debt (COMPLETED v2.23.1)
**Source**: Promoted from tech debt scan #3 (2026-02-18)
**Items**: TD-022, TD-042, TD-043
**Goal**: All command counts accurate, QA contract complete, orphaned files cleaned up
**Success criteria**:
- [x] All count references show 43/39 across CLAUDE.md, README.md, package.json, docs/*
- [x] gsd-t-qa.md has "During Test-Sync" section
- [x] qa-agent-contract.md lists test-sync in phase contexts and Output table
- [x] .gsd-t/domains/doc-alignment/ archived
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 4: Testing Foundation — Tech Debt (COMPLETED v2.24.0)
**Source**: Promoted from tech debt scan #1 (2026-02-07)
**Items**: TD-003
**Goal**: Automated test suite covering CLI and helper functions
**Success criteria**:
- [x] Test files exist in test/ directory
- [x] `npm test` runs and passes 20+ tests (64 tests passing)
- [x] CLI subcommands (status, doctor, help, --version) have test coverage
- [x] Helper functions (isNewerVersion, validateProjectName, applyTokens, etc.) tested
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 5: Security Hardening — Tech Debt (COMPLETED v2.24.1)
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035
**Goal**: All known security concerns addressed or documented
**Success criteria**:
- [x] Heartbeat scrubs common secret patterns before logging
- [x] npm-update-check.js validates path within ~/.claude/
- [x] npm-update-check.js checks symlink before write
- [x] HTTP response accumulation bounded (1MB limit)
- [x] ensureDir validates parent symlinks
- [x] Wave bypassPermissions documented with security implications
- [x] No regression in existing functionality
**Completed**: 2026-02-18

---

## Milestone 6: CLI Quality Improvement — Tech Debt (COMPLETED v2.24.2)
**Source**: Promoted from tech debt scans #1-3 (2026-02-18)
**Items**: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034
**Goal**: CLI code meets project quality standards (30-line functions, no duplication, consistent config)
**Success criteria**:
- [x] doUpdateAll() continues on per-project failures
- [x] No function exceeds 30 lines in bin/gsd-t.js or scripts/
- [x] Heartbeat cleanup only fires on SessionStart
- [x] .gitattributes and .editorconfig exist with correct settings
- [x] No repeated code patterns (3 duplication types resolved)
- [x] checkForUpdates uses external script instead of inline JS
- [x] No regression in existing functionality — 76/76 tests pass
**Completed**: 2026-02-19

---

## Milestone 7: Command File Cleanup — Tech Debt (COMPLETED v2.24.3)
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041
**Goal**: All command files follow consistent structure and conventions
**Success criteria**:
- [x] discuss.md and impact.md have Autonomy Behavior sections
- [x] Zero fractional step numbers across all command files (85 renumbered across 17 files)
- [x] QA agent has file-path boundary constraints
- [x] Wave reads progress.md with integrity check
- [x] gsd-t-qa.md has Document Ripple section
- [x] All QA-spawning commands have consistent blocking language (9 active spawners)
- [x] QA agent supports multiple test frameworks (Playwright, Jest, Vitest, node:test, pytest)
- [x] Wave discuss-skip uses structured signal (domain count + contracts + open questions)
- [x] No regression in existing functionality — 76/76 tests pass
**Completed**: 2026-02-19
