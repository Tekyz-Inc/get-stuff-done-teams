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
ls commands/*.md | wc -l  # Should be 41
ls templates/*.md | wc -l  # Should be 9
```

## Distribution

### npm Package
- **Registry**: https://www.npmjs.com/package/@tekyzinc/gsd-t
- **Publish**: `npm publish` (requires npm login with Tekyz account)
- **Version**: Managed in `package.json`, synced to `.gsd-t/progress.md`

### Installed Locations
| What | Where |
|------|-------|
| Slash commands | `~/.claude/commands/` |
| Global config | `~/.claude/CLAUDE.md` |
| Heartbeat hook | `~/.claude/settings.json` (hooks section) |
| Version cache | `~/.claude/.gsd-t-version` |
| Update cache | `~/.claude/.gsd-t-update-cache` |
| Project registry | `~/.claude/.gsd-t-projects` |

## Repository Structure

```
get-stuff-done-teams/
├── bin/gsd-t.js        — CLI (zero dependencies)
├── commands/           — 41 slash command files
├── templates/          — 9 document templates
├── scripts/            — Heartbeat hook script
├── examples/           — Reference project structure
├── docs/               — Methodology + living docs
├── .gsd-t/             — GSD-T state (self-managed)
└── package.json        — npm package config
```
