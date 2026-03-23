# Domain: metrics-commands

## Responsibility
Create the new `gsd-t-metrics.md` command (50th command). Update `gsd-t-status.md` to display ELO and key metrics. Update CLI installer (`bin/gsd-t.js`) to count the new command. Update all 4 reference files (README.md, GSD-T-README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md).

## Owned Files/Directories
- `commands/gsd-t-metrics.md` — NEW: 50th command, displays metrics summary + trend analysis
- `commands/gsd-t-status.md` — MODIFY: add ELO display + quality budget summary
- `bin/gsd-t.js` — MODIFY: update command count logic for 50th command
- `README.md` — MODIFY: add gsd-t-metrics to commands table
- `GSD-T-README.md` — MODIFY: add gsd-t-metrics to detailed command reference
- `templates/CLAUDE-global.md` — MODIFY: add gsd-t-metrics to commands table
- `commands/gsd-t-help.md` — MODIFY: add gsd-t-metrics to help summaries

## NOT Owned (do not modify)
- `bin/metrics-collector.js` — owned by metrics-collection domain
- `bin/metrics-rollup.js` — owned by metrics-rollup domain
- `scripts/gsd-t-dashboard-server.js` — owned by metrics-dashboard domain
- `scripts/gsd-t-dashboard.html` — owned by metrics-dashboard domain
- `commands/gsd-t-execute.md` — owned by metrics-collection domain
- `commands/gsd-t-complete-milestone.md` — owned by metrics-rollup domain
- `commands/gsd-t-verify.md` — owned by metrics-rollup domain
