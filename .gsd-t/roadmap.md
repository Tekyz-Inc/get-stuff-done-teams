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

## Milestone 4: Testing Foundation — Tech Debt
**Source**: Promoted from tech debt scan #1 (2026-02-07)
**Items**: TD-003
**Goal**: Automated test suite covering CLI and helper functions
**Scope**:
- Add test suite using Node.js built-in test runner (`node --test`)
- Target 20+ tests covering: install, update, init, status, doctor, uninstall, and all helper functions
- Zero external test dependencies (use built-in assert + test modules)
**Success criteria**:
- [ ] Test files exist in test/ directory
- [ ] `npm test` runs and passes 20+ tests
- [ ] CLI subcommands (install, update, init, status, doctor, uninstall) have test coverage
- [ ] Helper functions (isNewerVersion, validateProjectName, applyTokens, etc.) tested
- [ ] No regression in existing functionality
**Estimated effort**: 2 sessions
**Priority**: HIGH — before next feature milestone

---

## Milestone 5: Security Hardening — Tech Debt
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035
**Goal**: All known security concerns addressed or documented
**Scope**:
- Scrub sensitive data (passwords, tokens, API keys) from heartbeat bash command logs
- Validate npm-update-check.js cache file path is within ~/.claude/
- Add symlink check to npm-update-check.js before writing cache
- Add HTTP response size limits to update fetch paths
- Validate parent path components in ensureDir for symlink attacks
- Document bypassPermissions security implications in wave command and README
**Success criteria**:
- [ ] Heartbeat scrubs common secret patterns before logging
- [ ] npm-update-check.js validates path within ~/.claude/
- [ ] npm-update-check.js checks symlink before write
- [ ] HTTP response accumulation bounded (e.g., 1MB limit)
- [ ] ensureDir validates parent symlinks
- [ ] Wave bypassPermissions documented with security implications
- [ ] No regression in existing functionality
**Estimated effort**: 1 session
**Priority**: MEDIUM — before next npm publish

---

## Milestone 6: CLI Quality Improvement — Tech Debt
**Source**: Promoted from tech debt scans #1-3 (2026-02-18)
**Items**: TD-017, TD-021, TD-024, TD-025, TD-033, TD-034
**Goal**: CLI code meets project quality standards (30-line functions, no duplication, consistent config)
**Scope**:
- Wrap per-project iteration in doUpdateAll() with try/catch, extract updateSingleProject()
- Extract sub-functions from 13 functions exceeding 30-line limit
- Run heartbeat cleanup only on SessionStart events (not every hook)
- Add .gitattributes (text=auto) and .editorconfig (end_of_line=lf)
- Deduplicate JSON.parse(settingsJson), hasSwagger/hasApi, and template-write patterns
- Extract inline JavaScript from checkForUpdates into separate module
**Success criteria**:
- [ ] doUpdateAll() continues on per-project failures
- [ ] No function exceeds 30 lines in bin/gsd-t.js or scripts/
- [ ] Heartbeat cleanup only fires on SessionStart
- [ ] .gitattributes and .editorconfig exist with correct settings
- [ ] No repeated code patterns (3 duplication types resolved)
- [ ] checkForUpdates uses external script instead of inline JS
- [ ] No regression in existing functionality
**Estimated effort**: 1-2 sessions
**Priority**: MEDIUM — after count fix

---

## Milestone 7: Command File Cleanup — Tech Debt
**Source**: Promoted from tech debt scans #2-3 (2026-02-18)
**Items**: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041
**Goal**: All command files follow consistent structure and conventions
**Scope**:
- Add Autonomy Behavior sections to gsd-t-discuss.md and gsd-t-impact.md
- Renumber fractional steps (e.g., 4.7 → proper integers) across 17 command files
- Add explicit file-path boundaries to QA agent (write only in test/ and .gsd-t/)
- Add git-status integrity check for wave state handoff
- Add Document Ripple section to gsd-t-qa.md
- Add explicit "QA failure blocks {phase}" language to plan and test-sync commands
- Add multi-framework guidance to QA agent (Jest, Vitest, pytest, not just Playwright)
- Define machine-parseable discuss-skip heuristic for wave orchestrator
**Success criteria**:
- [ ] discuss.md and impact.md have Autonomy Behavior sections
- [ ] Zero fractional step numbers across all command files
- [ ] QA agent has file-path boundary constraints
- [ ] Wave reads progress.md with integrity check
- [ ] gsd-t-qa.md has Document Ripple section
- [ ] All 10 QA-spawning commands have consistent blocking language
- [ ] QA agent supports multiple test frameworks
- [ ] Wave discuss-skip uses structured signal (not subjective judgment)
- [ ] No regression in existing functionality
**Estimated effort**: 0.5-1 session
**Priority**: LOW — during next maintenance window
