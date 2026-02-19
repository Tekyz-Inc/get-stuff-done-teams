# Infrastructure — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18 (Post-M13, Scan #6)

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
| Publish to npm | `npm publish` (runs `npm test` automatically via prepublishOnly) |

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
# Run automated test suite (125 tests, zero dependencies)
npm test

# Test CLI subcommands manually
node bin/gsd-t.js install
node bin/gsd-t.js status
node bin/gsd-t.js doctor
node bin/gsd-t.js init test-project

# Validate command files exist
ls commands/*.md | wc -l  # Should be 45
ls templates/*.md | wc -l  # Should be 9

# Test new utility scripts
node scripts/gsd-t-tools.js validate
node scripts/gsd-t-tools.js git pre-commit-check
```

### Scripts
| Script | Purpose |
|--------|---------|
| `scripts/gsd-t-heartbeat.js` | Claude Code hook event logger (JSONL output, secret scrubbing) |
| `scripts/npm-update-check.js` | Background npm registry version checker (path-validated) |
| `scripts/gsd-t-fetch-version.js` | Synchronous npm registry fetch (5s timeout, 1MB limit) |
| `scripts/gsd-t-tools.js` | State utility CLI — state get/set, validate, list, git check, template read (NEW M13) |
| `scripts/gsd-t-statusline.js` | Context usage bar + project state for Claude Code statusLine setting (NEW M13) |

## Distribution

### npm Package
- **Registry**: https://www.npmjs.com/package/@tekyzinc/gsd-t
- **Publish**: `npm publish` (requires npm login with Tekyz account)
- **Version**: Managed in `package.json`, synced to `.gsd-t/progress.md`
- **Files shipped**: `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`

### Installed Locations
| What | Where |
|------|-------|
| Slash commands (45 files) | `~/.claude/commands/` |
| Global config | `~/.claude/CLAUDE.md` |
| Heartbeat script | `~/.claude/scripts/gsd-t-heartbeat.js` |
| State utility CLI | `~/.claude/scripts/gsd-t-tools.js` |
| Statusline script | `~/.claude/scripts/gsd-t-statusline.js` |
| Hook configuration | `~/.claude/settings.json` (hooks section) |
| Version file | `~/.claude/.gsd-t-version` |
| Update cache | `~/.claude/.gsd-t-update-check` |
| Project registry | `~/.claude/.gsd-t-projects` |

## Repository Structure

```
get-stuff-done-teams/
├── bin/gsd-t.js        — CLI installer (~1,438 lines, zero dependencies)
├── commands/           — 45 slash command files (41 GSD-T + 4 utility)
├── scripts/            — 5 hook/utility scripts (added gsd-t-tools.js, gsd-t-statusline.js in M13)
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
