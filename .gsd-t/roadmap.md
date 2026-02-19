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

## Milestone 10: Token Efficiency (COMPLETED v2.25.10)
**Source**: Promoted from backlog items #2, #3, #4 (2026-02-18)
**Goal**: Reduce wave token consumption by ~124K+ tokens with zero quality loss, and prevent context compaction during consecutive standalone command invocations
**Backlog items**: #2 QA Agent Optimization, #3 Inline Test Steps for Quick/Debug, #4 Subagent Execution for Standalone Commands
**Scope**:
- QA optimization: skip QA spawn on partition, plan, complete-milestone; fold QA into test-sync and verify agents inline; change execute and integrate QA from TeamCreate teammate to Task subagent
- Inline tests: add mandatory "run affected tests" step to gsd-t-quick.md and gsd-t-debug.md
- Subagent execution: wrap debug, quick, scan, status invocations as Task subagents for fresh context windows
**Success criteria**:
- [ ] QA not spawned in partition, plan, complete-milestone command files
- [ ] test-sync and verify agents perform contract testing and gap analysis inline (no separate QA spawn)
- [ ] execute and integrate spawn QA via Task tool (not TeamCreate)
- [ ] gsd-t-quick.md includes explicit "run all affected tests" step
- [ ] gsd-t-debug.md includes explicit "run tests confirming fix" step
- [ ] standalone commands spawn as subagents with fresh context
- [ ] All 125 tests pass with no regressions
- [ ] No quality gates removed — testing still happens at every appropriate phase

---

## Milestone 11: Execution Quality (COMPLETED v2.26.10)
**Source**: Promoted from backlog items #5, #7, #8 (2026-02-18)
**Goal**: Make the execution loop more reliable and correct across milestones — formalized deviation handling, per-task git commits, and filesystem-verified phase completion
**Backlog items**: #5 Deviation Rules, #7 Atomic Commits Per Task, #8 Spot-Check Verification
**Scope**:
- Deviation rules: add 4-rule protocol to execute, quick, debug — auto-fix bugs/blockers/missing functionality, STOP for architectural changes, 3-attempt limit, deferred-items.md for pre-existing issues
- Atomic commits: change execute phase from per-phase to per-task commits (format: `feat(domain/task-N): description`), update team mode teammate instructions
- Spot-check: add filesystem + git verification step to wave orchestrator's between-phase check — verify files exist, commits present, no FAILED markers
**Success criteria**:
- [ ] gsd-t-execute.md, gsd-t-quick.md, gsd-t-debug.md contain Deviation Rules section with 4 rules and 3-attempt limit
- [ ] execute commits after each task (not at phase end)
- [ ] Team mode teammate instructions include per-task commit requirement
- [ ] Wave orchestrator's between-phase verification checks filesystem and git, not just agent-reported status
- [ ] All 125 tests pass with no regressions

---

## Milestone 12: Planning Intelligence (COMPLETED v2.27.10)
**Source**: Promoted from backlog items #6, #9, #10 (2026-02-18)
**Goal**: Improve correctness across milestones by preventing assumption drift between discuss→plan, catching bad plans before execute runs, and tracking requirement coverage automatically
**Backlog items**: #6 CONTEXT.md from Discuss Phase, #9 Plan Validation Loop, #10 Requirements Traceability
**Scope**:
- CONTEXT.md: restructure discuss output into Locked Decisions / Deferred Ideas / Claude's Discretion sections; add fidelity enforcement step to plan (planner must map each locked decision to a task)
- Plan validation: spawn checker agent after plan phase to validate REQ coverage, task acceptance criteria, cross-domain dependencies, contract existence; max 3 iterations; replaces/absorbs existing QA spawn in plan
- Requirements traceability: during plan, map each REQ-ID to implementing domain/task; after verify, mark requirements complete; orphan detection for planning gaps and scope creep; traceability table in requirements.md
**Note**: Requires discuss phase — do NOT skip to plan. Locked decisions from discuss feed the plan validator.
**Success criteria**:
- [ ] gsd-t-discuss.md produces CONTEXT.md with three named sections
- [ ] gsd-t-plan.md reads CONTEXT.md locked decisions and maps each to a task (fidelity enforcement step)
- [ ] Plan validation checker spawned after plan generation, blocks on failure (max 3 iterations)
- [ ] Plan phase outputs REQ-ID → domain/task traceability table in requirements.md
- [ ] Verify phase marks matched requirements as complete
- [ ] Orphan detection reports requirements with no task and tasks with no REQ reference
- [ ] All 125 tests pass with no regressions

---

## Milestone 13: Tooling & UX (COMPLETED v2.28.10)
**Source**: Promoted from backlog items #11, #12, #13, #14, #15 (2026-02-18)
**Goal**: Infrastructure and UX improvements — CLI state utility, smarter parallel execution, health diagnostics, reliable pause/resume, context usage visibility
**Backlog items**: #11 gsd-t-tools.js Utility CLI, #12 Wave-Based Parallel Execution, #13 Health Command, #14 Pause/Resume with Continue-Here Files, #15 Statusline Context Usage Bar
**Scope**:
- gsd-t-tools.js: new Node.js CLI (zero external deps) with subcommands: state get/set, validate, parse progress --section, list domains/contracts, git pre-commit-check, template scope/tasks; returns compact JSON
- Wave parallel execution: dependency analysis in plan outputs wave groupings to integration-points.md; execute uses groupings for automatic parallel/sequential ordering with file conflict detection
- Health command: new gsd-t-health slash command + optional CLI subcommand; validates .gsd-t/ integrity; --repair creates missing files
- Pause/resume: new /pause command creates .continue-here-{timestamp}.md; gsd-t-resume reads most recent continue-here file before progress.md
- Statusline bar: extend statusline script to show context usage % color-coded (green/yellow/orange/red)
**Success criteria**:
- [x] gsd-t-tools.js exists with all 6 subcommand categories, returns JSON, zero external deps
- [x] plan phase outputs wave groupings in integration-points.md
- [x] execute uses wave groupings for parallel task scheduling
- [x] gsd-t-health.md command validates structure and --repair creates missing files
- [x] /pause creates timestamped continue-here file
- [x] gsd-t-resume.md reads continue-here file if present
- [x] Statusline shows context usage bar
- [x] All 125 tests pass with no regressions
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
