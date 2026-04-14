# Domain: installer-integration

## Responsibility

Extend the GSD-T CLI installer (`bin/gsd-t.js`) to install, configure, and validate the context meter across the install/update/doctor/status lifecycle. Replace task-counter installation wiring with context-meter wiring. Prompt the user for API key setup during fresh install.

## Owned Files/Directories

- `bin/gsd-t.js` — CLI installer (all M34-related extensions)
  - `doInstall` / `doInit`: copy `scripts/gsd-t-context-meter.js`, copy `bin/context-meter-config.cjs`, copy `templates/context-meter-config.json` to `.gsd-t/`, merge PostToolUse hook into `~/.claude/settings.json`, prompt for API key
  - `doDoctor`: check (a) API key env var is set, (b) PostToolUse hook is present in settings.json and points at the installed script, (c) `scripts/gsd-t-context-meter.js` exists in the project, (d) config file parses, (e) a dry-run `count_tokens` call succeeds with a minimal message
  - `doStatus`: display current context% from hook state file; fall back gracefully if meter hasn't run yet
  - `doUpdate` / `doUpdateAll`: copy updated hook script + config loader into every registered project; run a one-time migration that removes stale `bin/task-counter.cjs` and `.task-counter` state files after a marker file is written
  - `PROJECT_BIN_TOOLS`: remove `task-counter.cjs`, add `context-meter-config.cjs`
- `bin/gsd-t.test.js` — installer unit tests (if the existing test file covers installer — confirm during plan)

## NOT Owned (do not modify)

- `scripts/gsd-t-context-meter.js` — owned by context-meter-hook (installer copies it, does not edit it)
- `.gsd-t/context-meter-config.json` schema — owned by context-meter-config
- `bin/token-budget.js` — owned by token-budget-replacement
- Command files (`commands/*.md`) — owned by token-budget-replacement + m34-docs-and-tests
- `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md` — owned by m34-docs-and-tests
