# Code Quality Analysis — 2026-02-07

## Dead Code
- None found in bin/gsd-t.js

## Duplication
- **Template token replacement**: Pattern `content.replace(/\{Project Name\}/g, projectName).replace(/\{Date\}/g, today)` appears 4x in `doInit()` (lines 265, 283, 312, and similar). Should be extracted to a helper function.

## Complexity Hotspots
- `doInstall()` (lines 117-220) — 103 lines, handles command copy + CLAUDE.md merge + version save + summary. Should split into `copyCommands()`, `mergeClaudeMd()`, `printSummary()`.
- `doStatus()` (lines 341-438) — 98 lines, checks 5 different system components. Each check could be its own function.
- `doDoctor()` (lines 472-573) — 101 lines, runs 7 diagnostic checks. Each check could be its own function.

## Error Handling Gaps
- `doInit()` lines 264-316: `fs.writeFileSync` calls have no try/catch — will crash on permission denied or disk full
- `doInstall()` lines 137-153: `fs.copyFileSync` has no try/catch — will crash if source missing or dest readonly
- `doUninstall()` line 449: `fs.unlinkSync` has no try/catch — will crash if file already removed
- `doInit()` line 282: `fs.readFileSync` on template has no try/catch — will crash if template missing from package

## Performance Issues
- None significant. Synchronous I/O is appropriate for a CLI tool with ~30 files.

## Unresolved Developer Notes
- None found (no TODO/FIXME comments in codebase)

## Test Coverage Gaps
- **No test files exist anywhere in the project**
- Critical paths needing tests:
  - `doInstall()`: fresh install, update mode, CLAUDE.md append vs skip vs backup
  - `doInit()`: empty dir, existing files, token replacement
  - `doUpdate()`: same version skip, content diff, backup creation
  - `doDoctor()`: all 7 check paths (pass and fail)
  - `doUninstall()`: normal removal, already-removed files
  - `getCommandFiles()`, `getGsdtCommands()`, `getUtilityCommands()`: filtering logic
  - Edge cases: missing `~/.claude/`, unreadable files, invalid JSON in settings

## Stale Dependencies
- No npm dependencies to update

## Package.json Gaps
- Missing `scripts` section (no `test`, `lint`, etc.)
- Missing `main` field
- `files` array includes `commands/` and `templates/` but most commands are deleted from disk

## Documentation-Code Drift
- CLAUDE.md says "25 slash commands" — but only 1 exists on disk (gsd-t-brainstorm.md)
- README.md references 26 commands (22 GSD-T + 3 utility + GSD-T-README)
- package.json description says "26 slash commands"
- The brainstorm command is NOT listed in README.md, GSD-T-README.md, or the help command
- Git tracks 26 files in commands/ but only gsd-t-brainstorm.md is on disk
