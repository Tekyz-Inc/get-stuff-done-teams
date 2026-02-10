# Domain: integration

## Responsibility
Update existing GSD-T files to integrate the backlog feature: init bootstrapping, status display, help listing, global CLAUDE.md commands table, and README documentation.

## Owned Files (modifications only — these files already exist)
- `commands/gsd-t-init.md` — Add backlog.md and backlog-settings.md creation + category derivation
- `commands/gsd-t-status.md` — Add backlog summary (total items, top 3)
- `commands/gsd-t-help.md` — Add 7 backlog commands to help output
- `templates/CLAUDE-global.md` — Add backlog commands to commands reference table
- `README.md` — Document the backlog feature

## NOT Owned (do not modify)
- New command files (commands/gsd-t-backlog-*.md — owned by commands domain)
- Template files for backlog (templates/backlog.md, templates/backlog-settings.md — owned by templates domain)
- CLI installer (bin/gsd-t.js)
- All other existing command files not listed above
