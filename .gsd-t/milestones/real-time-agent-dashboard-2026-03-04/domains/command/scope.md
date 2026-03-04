# Domain: command

## Responsibility
Create the `gsd-t-visualize` command (48th command), update `bin/gsd-t.js` to install dashboard files, and update all 4 reference files (README.md, GSD-T-README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md) with the new command and count 47→48. Also updates test/filesystem.test.js counts.

## Owned Files/Directories
- `commands/gsd-t-visualize.md` — new command file (create)
- `bin/gsd-t.js` — add dashboard files to UTILITY_SCRIPTS or new install function (modify)
- `README.md` — count update + gsd-t-visualize row (modify)
- `docs/GSD-T-README.md` — count update + gsd-t-visualize row (modify)
- `templates/CLAUDE-global.md` — count update + gsd-t-visualize row (modify)
- `commands/gsd-t-help.md` — count update + visualize entry (modify)
- `test/filesystem.test.js` — count assertions 47→48 (modify)

## NOT Owned (do not modify)
- `scripts/gsd-t-dashboard-server.js` — owned by server domain
- `scripts/gsd-t-dashboard.html` — owned by dashboard domain
- All other existing scripts, test files, and command files
