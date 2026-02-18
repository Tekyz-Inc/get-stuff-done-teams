# Infrastructure — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18

## Quick Reference

| Task | Command |
|------|---------|
| Install GSD-T | `npx @tekyzinc/gsd-t install` |
| Check status | `npx @tekyzinc/gsd-t status` |
| Update GSD-T | `npx @tekyzinc/gsd-t update` |
| Update all projects | `npx @tekyzinc/gsd-t update-all` |
| Diagnose issues | `npx @tekyzinc/gsd-t doctor` |
| View changelog | `npx @tekyzinc/gsd-t changelog` |
| Register project | `npx @tekyzinc/gsd-t register` |
| Publish to npm | `npm publish` |

## Local Development

### Setup
```bash
# Clone and install
git clone https://github.com/Tekyz-Inc/get-stuff-done-teams.git
cd get-stuff-done-teams

# No npm install needed — zero dependencies
# Test the CLI directly:
node bin/gsd-t.js status
```

### Testing
```bash
# Test CLI subcommands
node bin/gsd-t.js install
node bin/gsd-t.js status
node bin/gsd-t.js doctor
node bin/gsd-t.js init test-project

# Validate command files exist
ls commands/*.md | wc -l  # Should be 43
ls templates/*.md | wc -l  # Should be 9
```

### Scripts
| Script | Purpose |
|--------|---------|
| `scripts/gsd-t-heartbeat.js` | Claude Code hook event logger (JSONL output) |
| `scripts/npm-update-check.js` | Background npm registry version checker |

## Distribution

### npm Package
- **Registry**: https://www.npmjs.com/package/@tekyzinc/gsd-t
- **Publish**: `npm publish` (requires npm login with Tekyz account)
- **Version**: Managed in `package.json`, synced to `.gsd-t/progress.md`
- **Files shipped**: `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`

### Installed Locations
| What | Where |
|------|-------|
| Slash commands (43 files) | `~/.claude/commands/` |
| Global config | `~/.claude/CLAUDE.md` |
| Heartbeat script | `~/.claude/scripts/gsd-t-heartbeat.js` |
| Hook configuration | `~/.claude/settings.json` (hooks section) |
| Version file | `~/.claude/.gsd-t-version` |
| Update cache | `~/.claude/.gsd-t-update-check` |
| Project registry | `~/.claude/.gsd-t-projects` |

## Repository Structure

```
get-stuff-done-teams/
├── bin/gsd-t.js        — CLI installer (~1,300 lines, zero dependencies)
├── commands/           — 43 slash command files (39 GSD-T + 4 utility)
├── scripts/            — 2 hook/utility scripts
├── templates/          — 9 document templates
├── examples/           — Reference project structure
├── docs/               — Methodology + living docs
├── .gsd-t/             — GSD-T state (self-managed)
└── package.json        — npm package config
```

## Security Notes

- Zero npm dependencies — no supply chain risk
- All file writes check for symlinks first
- Input validation on project names, versions, session IDs, paths
- Heartbeat stdin capped at 1MB
- HTTP requests use HTTPS with timeouts
- Init operations use exclusive file creation (`{ flag: "wx" }`)
