# Tech Debt Register — 2026-02-07

## Summary
- Critical items: 2
- High priority: 4
- Medium priority: 4
- Low priority: 3
- Total estimated effort: ~2-3 focused sessions

---

## Critical Priority
Items that pose active risk or block progress.

### TD-001: 25 of 26 Command Files Missing from Working Tree
- **Category**: quality
- **Severity**: CRITICAL
- **Location**: `commands/` directory
- **Description**: Only `gsd-t-brainstorm.md` exists on disk. The other 25 command files (22 GSD-T workflow + 3 utilities) are tracked in git but deleted from the working tree. The package cannot be published or installed in this state.
- **Impact**: Package is broken — `npx @tekyzinc/gsd-t install` would copy 0-1 files instead of 26. Users get an empty command set.
- **Remediation**: Either restore the deleted files with `git checkout -- commands/` or intentionally commit the deletions and restructure. Determine which state is intended.
- **Effort**: small (if restoring) or large (if restructuring)
- **Milestone candidate**: YES — blocks all other work
- **Promoted**: [ ]

### TD-002: Command Injection in Doctor via execSync
- **Category**: security
- **Severity**: CRITICAL
- **Location**: `bin/gsd-t.js:490`
- **Description**: `execSync("claude --version 2>&1")` passes a string to the shell interpreter, which could execute injected commands if PATH is manipulated.
- **Impact**: Arbitrary command execution in the doctor subcommand
- **Remediation**: Replace with `execFileSync("claude", ["--version"], { encoding: "utf8" })`
- **Effort**: small
- **Milestone candidate**: NO — fold into security hardening
- **Promoted**: [ ]

---

## High Priority
Items that should be addressed in the next 1-2 milestones.

### TD-003: No Test Coverage
- **Category**: quality
- **Severity**: HIGH
- **Location**: Project-wide
- **Description**: Zero test files exist. The CLI installer has 6 subcommands with branching logic that are completely untested.
- **Impact**: Regressions go undetected. Refactoring is risky without safety net.
- **Remediation**: Add test suite (Node.js built-in test runner or minimal framework). Target 15-25 tests covering: install, update, init, status, doctor, uninstall, and edge cases.
- **Effort**: medium
- **Milestone candidate**: YES — standalone milestone
- **Promoted**: [ ]

### TD-004: Missing Error Handling in File Operations
- **Category**: quality
- **Severity**: HIGH
- **Location**: `bin/gsd-t.js` — `doInit()` (lines 264-316), `doInstall()` (lines 137-153), `doUninstall()` (line 449)
- **Description**: `fs.writeFileSync`, `fs.copyFileSync`, and `fs.unlinkSync` calls lack try/catch. Will crash with unhelpful stack trace on permission denied, disk full, or missing source.
- **Impact**: Poor user experience; confusing error messages
- **Remediation**: Wrap each file operation in try/catch with user-friendly error messages
- **Effort**: small
- **Milestone candidate**: NO — fold into quality improvements
- **Promoted**: [ ]

### TD-005: Symlink Attack Vulnerability
- **Category**: security
- **Severity**: HIGH
- **Location**: `bin/gsd-t.js:74` (`copyFile` helper) and all callers
- **Description**: `fs.copyFileSync(src, dest)` follows symlinks. An attacker could pre-create a symlink at `~/.claude/commands/gsd-t-X.md` pointing to a sensitive file, causing the installer to overwrite it.
- **Impact**: Potential overwrite of arbitrary files on the filesystem
- **Remediation**: Check `fs.lstatSync(dest).isSymbolicLink()` before any write; refuse to overwrite symlinks
- **Effort**: small
- **Milestone candidate**: NO — fold into security hardening
- **Promoted**: [ ]

### TD-006: Brainstorm Command Not Documented
- **Category**: quality
- **Severity**: HIGH
- **Location**: README.md, docs/GSD-T-README.md, commands/gsd-t-help.md, templates/CLAUDE-global.md
- **Description**: `gsd-t-brainstorm.md` is a new command that exists on disk but is not listed in any of the 4 reference files (README, GSD-T-README, help command, CLAUDE-global template). The Pre-Commit Gate explicitly requires all 4 be updated when adding a command.
- **Impact**: Users won't discover the command. Documentation is inconsistent with actual commands.
- **Remediation**: Add brainstorm to all 4 reference files. Update command counts.
- **Effort**: small
- **Milestone candidate**: NO — fix immediately
- **Promoted**: [ ]

---

## Medium Priority
Items to plan for but not urgent.

### TD-007: Hardcoded Utility Command List
- **Category**: architecture
- **Severity**: MEDIUM
- **Location**: `bin/gsd-t.js:109` — `getInstalledCommands()`
- **Description**: Utility commands are identified by a hardcoded list `["branch.md", "checkin.md", "Claude-md.md"]`. Adding a new utility requires editing the source code.
- **Impact**: Low extensibility; easy to forget updating the list
- **Remediation**: Use a convention (e.g., all non-`gsd-t-` prefixed `.md` files are utilities) or a manifest file
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-008: CRLF/LF Mismatch Causes False-Positive Updates
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `bin/gsd-t.js:144-148` — content comparison in `doInstall()`
- **Description**: Strict string equality for content diffing means CRLF vs LF line endings trigger unnecessary file replacements on Windows.
- **Impact**: Update command reports changes when none exist; unnecessary backup creation
- **Remediation**: Normalize line endings before comparison, or use a hash-based comparison
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-009: Missing Input Validation on Project Name
- **Category**: security
- **Severity**: MEDIUM
- **Location**: `bin/gsd-t.js:243-246`
- **Description**: Project name from CLI args or `path.basename(process.cwd())` is used unvalidated in template token replacement. Crafted names could inject unexpected markdown content.
- **Remediation**: Validate with regex `/^[a-zA-Z0-9._\- ]+$/`
- **Effort**: small
- **Milestone candidate**: NO — fold into security hardening
- **Promoted**: [ ]

### TD-010: Large Functions Approaching Complexity Threshold
- **Category**: quality
- **Severity**: MEDIUM
- **Location**: `doInstall()` (103 lines), `doStatus()` (98 lines), `doDoctor()` (101 lines)
- **Description**: Three functions exceed 100 lines. Each handles multiple distinct concerns.
- **Impact**: Harder to test, maintain, and extend
- **Remediation**: Extract sub-functions: `copyCommands()`, `mergeClaudeMd()`, `checkNode()`, `checkCommands()`, etc.
- **Effort**: medium
- **Milestone candidate**: NO — fold into quality improvements
- **Promoted**: [ ]

---

## Low Priority
Nice-to-haves and cleanup.

### TD-011: Version Comparison Uses String Equality
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js:225`
- **Description**: Version comparison is `installedVersion === PKG_VERSION` (strict string). Not semver-aware. Would fail if versions have different formatting (e.g., `v2.0.0` vs `2.0.0`).
- **Impact**: Unlikely to cause issues with current convention, but fragile
- **Remediation**: Normalize version strings or use basic semver comparison
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-012: Package.json Missing Metadata
- **Category**: quality
- **Severity**: LOW
- **Location**: `package.json`
- **Description**: Missing `scripts` section (no `test` command), missing `main` field.
- **Impact**: `npm test` fails; package metadata incomplete
- **Remediation**: Add `"scripts": { "test": "node --test" }` and `"main": "bin/gsd-t.js"`
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

### TD-013: Template Token Replacement Duplicated
- **Category**: quality
- **Severity**: LOW
- **Location**: `bin/gsd-t.js` — `doInit()` has 4 nearly identical replacement blocks
- **Description**: The pattern `content.replace(/\{Project Name\}/g, name).replace(/\{Date\}/g, today)` is repeated for each template file.
- **Impact**: Minor DRY violation; easy to miss a token if a new one is added
- **Remediation**: Extract to `function applyTokens(content, vars)` helper
- **Effort**: small
- **Milestone candidate**: NO
- **Promoted**: [ ]

---

## Dependency Updates
No npm dependencies — nothing to update.

---

## Suggested Tech Debt Milestones

### Suggested: Restore & Stabilize Commands (Critical)
Combines: TD-001, TD-006
Estimated effort: 1 session
Should be prioritized: IMMEDIATELY — package is non-functional without command files

### Suggested: Security Hardening
Combines: TD-002, TD-005, TD-009
Estimated effort: 1 session
Should be prioritized: BEFORE next npm publish

### Suggested: Quality & Testing Foundation
Combines: TD-003, TD-004, TD-010, TD-012, TD-013
Estimated effort: 2 sessions
Can be scheduled: AFTER commands restored and security fixed

### Suggested: Windows Compatibility
Combines: TD-008
Estimated effort: 0.5 session
Can be scheduled: During next maintenance window

---

## Scan Metadata
- Scan date: 2026-02-07
- Files analyzed: ~40 (1 JS, 1 MD command, 7 templates, 6 examples, 2 docs, package.json, README, CLAUDE.md, LICENSE + git-tracked deletions)
- Lines of code: ~642 (JS) + ~2000 (markdown)
- Languages: JavaScript, Markdown
- Last scan: first scan
