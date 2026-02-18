# GSD-T Framework (@tekyzinc/gsd-t)

# Prime Directives

1. SIMPLICITY ABOVE ALL. Every change should be minimal and impact as little code as possible. No massive refactors.
2. ALWAYS check for unwanted downstream effects before writing any new code or changing existing code.
3. ALWAYS check for completeness that any code creation/change/deletion is implemented thoroughly in every relevant file.
4. ALWAYS work autonomously. ONLY ask for user input when truly blocked.


## Overview

Contract-driven development methodology for Claude Code. An npm package that provides 42 slash commands (38 GSD-T workflow + 4 utility), a CLI installer, templates, and documentation for reliable, parallelizable AI-assisted development.

## Autonomy Level

**Level 3 — Full Auto** (only pause for blockers or completion)
Only pause for blockers or project completion. Execute phases continuously.


## Tech Stack

- **Language**: JavaScript (Node.js >= 16)
- **Package Manager**: npm
- **Distribution**: npm package (@tekyzinc/gsd-t)
- **CLI**: bin/gsd-t.js (install, update, init, status, uninstall, doctor)
- **Testing**: Manual CLI testing (command files are markdown, CLI is the testable surface)


## Project Structure

```
bin/gsd-t.js           — CLI installer (9 subcommands)
commands/              — 42 slash commands for Claude Code
  gsd-t-*.md           — 38 GSD-T workflow commands
  gsd.md               — Smart router (auto-routes user intent)
  branch.md            — Git branch helper
  checkin.md           — Auto-version + commit/push helper
  Claude-md.md         — Reload CLAUDE.md directives
templates/             — 9 document templates
  CLAUDE-global.md     — Global ~/.claude/CLAUDE.md template
  CLAUDE-project.md    — Per-project CLAUDE.md template
  requirements.md      — Requirements template
  architecture.md      — Architecture template
  workflows.md         — Workflows template
  infrastructure.md    — Infrastructure template
  progress.md          — GSD-T progress template
  backlog.md           — Backlog template
  backlog-settings.md  — Backlog settings template
examples/              — Example project structure and settings
  settings.json        — Claude Code settings with teams enabled
  .gsd-t/              — Example contracts and domain structure
docs/                  — Methodology documentation
  methodology.md       — GSD → GSD-T evolution and concepts
package.json           — npm package config (v2.23.0)
GSD-T-README.md        — Detailed command reference (ships with package)
README.md              — User-facing repo/npm docs
```


## Documentation

- Requirements: docs/requirements.md (if exists)
- Architecture: docs/architecture.md (if exists)
- README.md — User-facing package docs with npm installer instructions
- GSD-T-README.md — Detailed command reference and wave flow diagram
- docs/methodology.md — GSD vs GSD-T evolution and concepts


## Meta-Project Notes

This project uses GSD-T on itself. Key things to understand:

- The "source code" is the `.md` command files in `commands/` and `bin/gsd-t.js` — not a traditional `src/` directory
- Changes to command files affect the methodology itself, so treat them as code: test the workflow after changes
- The `.gsd-t/` state directory will coexist with the command files that *define* `.gsd-t/` — this is intentional
- When running `gsd-t-scan` on this project, it will analyze its own command files as source
- The installer (`bin/gsd-t.js`) is the primary testable code; command files are validated by use


## Conventions

### CLI (bin/gsd-t.js)
- ANSI colors via escape codes (BOLD, GREEN, YELLOW, RED, CYAN, DIM)
- Zero external dependencies — Node.js built-ins only (fs, path, os)
- All file operations use synchronous API for simplicity
- Version tracked in package.json and ~/.claude/.gsd-t-version

### Command Files (commands/*.md)
- Pure markdown, no frontmatter
- All commands accept $ARGUMENTS at the end
- Step-numbered workflow (Step 1, Step 2, etc.)
- Team mode instructions use code blocks with teammate assignments
- Document Ripple section in any command that modifies files

### Templates (templates/*.md)
- Use `{Project Name}`, `{Date}` as replacement tokens
- Tables for structured data (requirements, decisions, etc.)
- Placeholder text uses `{description}` format

### Directory Structure Convention
- `.gsd-t/contracts/` — domain interface definitions
- `.gsd-t/domains/{name}/` — scope, tasks, constraints per domain
- `.gsd-t/milestones/` — archived completed milestones
- `.gsd-t/scan/` — codebase analysis outputs


## GSD-T Workflow

This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/



# Destructive Action Guard (MANDATORY)

**NEVER perform destructive or structural changes without explicit user approval.** This applies at ALL autonomy levels.

Before any of these actions, STOP and ask the user:
- DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE
- Renaming or removing database tables or columns
- Schema migrations that lose data or break existing queries
- Replacing an existing architecture pattern (e.g., normalized → denormalized)
- Removing or replacing existing files/modules that contain working functionality
- Changing ORM models in ways that conflict with the existing database schema
- Removing API endpoints or changing response shapes that existing clients depend on
- Any change that would require other parts of the system to be rewritten

**Rule: "Adapt new code to existing structures, not the other way around."**

# Pre-Commit Gate (MANDATORY)

NEVER commit code without running this checklist. This is not optional.

```
BEFORE EVERY COMMIT:
  ├── Did I change a command file's interface or behavior?
  │     YES → Update GSD-T-README.md command reference
  │     YES → Update README.md commands table
  │     YES → Update templates/CLAUDE-global.md commands table
  │     YES → Update commands/gsd-t-help.md command summaries
  ├── Did I add or remove a command?
  │     YES → Update all 4 files above
  │     YES → Update package.json version (bump minor or major)
  │     YES → Update bin/gsd-t.js command counting logic
  ├── Did I change the CLI installer?
  │     YES → Test: install, update, status, doctor, init, uninstall
  ├── Did I change a template?
  │     YES → Verify gsd-t-init still produces correct output
  ├── Did I change the wave flow (add/remove/reorder phases)?
  │     YES → Update gsd-t-wave.md phase sequence
  │     YES → Update GSD-T-README.md wave diagram
  │     YES → Update README.md workflow section
  ├── Did I make an architectural or design decision?
  │     YES → Add to .gsd-t/progress.md Decision Log
  └── Did I change any contract or domain boundary?
        YES → Update .gsd-t/contracts/ and affected domain scope.md
```


# Don't Do These Things

- NEVER commit without running the Pre-Commit Gate checklist
- NEVER batch doc updates for later — update docs in the same commit as the change
- NEVER add external npm dependencies to the installer — it must stay zero-dependency
- NEVER change command file names without updating all 4 reference files (README, GSD-T-README, CLAUDE-global template, gsd-t-help)
- NEVER modify the wave phase sequence without updating wave, README, and GSD-T-README
- NEVER let the command count in the installer diverge from the actual commands/ directory


# Recovery After Interruption

When resuming work (new session or after /clear):
1. Read `.gsd-t/progress.md` for current state
2. Read `README.md` for what the project delivers
3. Read `package.json` for current version
4. Check `commands/` directory for the actual command list
5. Continue from current task — don't restart the phase

## Current Status

See `.gsd-t/progress.md` for current milestone/phase state.
