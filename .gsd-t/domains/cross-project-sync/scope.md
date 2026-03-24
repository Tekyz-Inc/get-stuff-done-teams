# Domain: cross-project-sync

## Responsibility
Extends the CLI installer (`bin/gsd-t.js`) `doUpdateAll()` function with a global rule sync step. When `gsd-t-version-update-all` runs, this domain propagates global rules to all registered projects as candidates. Handles the npm distribution pipeline logic for universal rules (rules promoted in 5+ projects become candidates for shipping in `templates/` or `examples/rules/`).

## Owned Files/Directories
- `bin/gsd-t.js` — extends `doUpdateAll()` with global rule sync step (additive only — new helper functions, modify `doUpdateAll` to call them)
- `examples/rules/` — directory for universal rules shipped with npm package (created when rules qualify)
- `test/global-rule-sync.test.js` — unit tests for the sync integration

## NOT Owned (do not modify)
- `bin/global-sync-manager.js` — owned by global-metrics domain (USE its exports)
- `bin/rule-engine.js` — owned by M26 (USE its exports for rule format validation)
- `bin/patch-lifecycle.js` — owned by M26 (USE its exports)
- `bin/metrics-collector.js` — owned by M25
- `bin/metrics-rollup.js` — owned by M25
- `commands/*.md` — owned by command-extensions domain
- `.gsd-t/metrics/` — local metrics (do not write directly; use global-sync-manager API)

## NOT Owned (within gsd-t.js — do not modify existing functions)
- All existing `doUpdateAll()` helper functions (updateSingleProject, updateGlobalCommands, etc.) — only ADD new functions and a call site in `doUpdateAll()`
