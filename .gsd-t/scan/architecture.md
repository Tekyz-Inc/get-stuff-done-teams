# Architecture Analysis — 2026-02-07

## Stack
- Language: JavaScript (Node.js >= 16)
- Framework: None (zero dependencies)
- Database: None (filesystem-based state)
- Cache: None
- Deployment: npm registry (@tekyzinc/gsd-t)

## Structure
```
bin/gsd-t.js           — CLI installer (641 lines, 6 subcommands)
commands/              — Slash commands for Claude Code
  gsd-t-brainstorm.md  — Only file on disk (25 others deleted from working tree)
  (26 tracked in git)  — 22 GSD-T workflow + 3 utilities + 1 brainstorm
templates/             — 7 document templates with token substitution
examples/              — Sample .gsd-t/ structure and settings.json
docs/                  — methodology.md, GSD-T-README.md
```

## Architecture Pattern
**Distributed Markdown-Based Plugin System**
- Commands are static `.md` files copied to `~/.claude/commands/` at install
- CLI manages installation lifecycle only — no runtime involvement
- Each command is self-contained with no inter-command code dependencies
- State persists in `.gsd-t/` directory (git-tracked, session-surviving)

## Data Flow
```
Install: npm package → ~/.claude/commands/ → Claude Code auto-discovers → /user:command
Init:    templates/ → token replacement → project .gsd-t/ + CLAUDE.md + docs/
State:   .gsd-t/progress.md ← → all workflow commands read/write
Config:  3-tier: ~/.claude/CLAUDE.md → project CLAUDE.md → .gsd-t/ runtime state
```

## Configuration Model
| Layer | Location | Purpose |
|-------|----------|---------|
| Global | `~/.claude/CLAUDE.md` | Framework defaults, autonomy, code standards |
| Project | `{cwd}/CLAUDE.md` | Project overview, tech stack, conventions |
| State | `{cwd}/.gsd-t/*` | Live milestone/domain/contract status |

## Patterns Observed
- **Zero-dependency CLI**: Only Node.js built-ins (fs, path, os, child_process)
- **Sync-first I/O**: All file operations are synchronous (acceptable for CLI)
- **Content-based diffing**: Update command only overwrites changed files
- **Backup-on-conflict**: CLAUDE.md backed up with timestamp before overwrite
- **Pattern-based discovery**: GSD-T commands via `gsd-t-*.md` glob; utilities hardcoded

## Architecture Concerns
- **25 missing command files**: Only 1 of 26 commands exists on disk — working tree deletions
- **Hardcoded utility list**: `["branch.md", "checkin.md", "Claude-md.md"]` in `getInstalledCommands()` — adding a utility requires code change
- **No automated contract validation**: Pre-commit gate is a mental checklist, not enforced
- **CLAUDE.md merge complexity**: Append-only strategy can create duplicated GSD-T sections
- **Single-file CLI**: 641 lines in one file — manageable now but approaching refactor threshold
