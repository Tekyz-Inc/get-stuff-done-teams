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

---

## Milestone 8: Housekeeping + Contract Sync — Tech Debt (COMPLETED v2.24.4)
**Source**: Promoted from tech debt scan #4 (2026-02-18)
**Items**: TD-029, TD-044, TD-045, TD-046, TD-047, TD-048, TD-049, TD-050, TD-051, TD-052, TD-053, TD-054, TD-055
**Goal**: All 13 scan #4 findings resolved — contracts synced, docs updated, orphans cleaned, quality gates added
**Success criteria**:
- [x] progress.md Status uses contract-recognized values
- [x] CHANGELOG.md has entries for v2.24.0 through v2.24.3
- [x] Zero orphaned domain directories
- [x] All contracts reflect current implementation
- [x] CLAUDE.md version reference accurate or pattern-resistant
- [x] All JS files have LF line endings after git renormalization
- [x] 116/116 tests pass with no regressions
**Completed**: 2026-02-18

---

## Milestone 9: Cleanup Sprint — Tech Debt (COMPLETED v2.24.5)
**Source**: Promoted from tech debt scan #5 (2026-02-18)
**Items**: TD-056, TD-057, TD-058, TD-059, TD-060, TD-061, TD-062, TD-063, TD-064, TD-065
**Goal**: Resolve all 10 LOW-severity scan #5 findings — dead code, untested exports, documentation errors, minor security gap, contract drift
**Scope**:
- Remove dead code: PKG_EXAMPLES constant (TD-057), dead test imports (TD-058)
- Code quality: summarize() case fallthrough (TD-056), redundant condition (TD-061)
- Test coverage: add tests for readSettingsJson() (TD-059) and shortPath() (TD-060)
- Documentation: correct SEC-N16 note (TD-062)
- Security: scrub notification title (TD-063)
- Contract sync: update wave integrity check contract (TD-064), remove duplicate format contract (TD-065)
**Success criteria**:
- [x] Zero dead code (PKG_EXAMPLES removed, dead imports removed)
- [x] summarize() uses case fallthrough, under 27 lines
- [x] checkForUpdates() condition simplified
- [x] readSettingsJson() and shortPath() have direct unit tests
- [x] SEC-N16 informational note is factually accurate
- [x] Notification title scrubbed via scrubSecrets()
- [x] wave-phase-sequence.md integrity check matches implementation
- [x] file-format-contract.md deleted (backlog-file-formats.md is authoritative)
- [x] All tests pass with no regressions (125/125)
- [x] No new tech debt introduced
**Completed**: 2026-02-18
