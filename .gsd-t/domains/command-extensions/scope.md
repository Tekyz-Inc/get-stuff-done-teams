# Domain: command-extensions

## Responsibility
Extends existing GSD-T command files with cross-project capabilities. Adds cross-project comparison mode to `gsd-t-metrics`, global ELO display to `gsd-t-status`, and global rule promotion check to `gsd-t-complete-milestone`. All changes are additive steps appended to existing command flows.

## Owned Files/Directories
- `commands/gsd-t-metrics.md` — extends with `--cross-project` argument handling and cross-project comparison display (new steps appended)
- `commands/gsd-t-status.md` — extends with global ELO and cross-project rank display (new step appended)
- `commands/gsd-t-complete-milestone.md` — extends distillation section with global rule promotion check (new step appended after local promotion)

## NOT Owned (do not modify)
- `bin/global-sync-manager.js` — owned by global-metrics domain (USE its exports via inline JS or bash calls)
- `bin/gsd-t.js` — owned by cross-project-sync domain
- `bin/rule-engine.js` — owned by M26
- `bin/patch-lifecycle.js` — owned by M26
- `bin/metrics-collector.js` — owned by M25
- `bin/metrics-rollup.js` — owned by M25
- All other `commands/*.md` files not listed above
