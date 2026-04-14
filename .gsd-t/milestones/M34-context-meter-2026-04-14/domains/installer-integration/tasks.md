# Tasks: installer-integration

## Summary

Extend `bin/gsd-t.js` to install/update/doctor/status the Context Meter across the install lifecycle. Prompt for API key on fresh install (skippable). Retire `task-counter.cjs` from `PROJECT_BIN_TOOLS` with a one-time migration that cleans up downstream projects.

## Tasks

### Task 1: Read bin/gsd-t.js and inventory touch points
- **Files**: (read-only pass — no file changes)
- **Contract refs**: `context-meter-contract.md`, `integration-points.md`
- **Dependencies**: NONE (planning/reading task)
- **Acceptance criteria**:
  - Doc-comment at the top of this domain's next task notes exactly: where `PROJECT_BIN_TOOLS` is defined, where `copyBinToolsToProject` is called, current `doInit`, `doInstall`, `doUpdate`, `doUpdateAll`, `doDoctor`, `doStatus` function locations (line numbers), current settings.json handling (if any), current task-counter references that need removing, and the migration-marker pattern from v2.74.11 (`.archive-migration-v1`)
  - No code changes — this is a surgical-plan task so the implementation tasks below are precise edits, not rewrites

### Task 2: Extend doInit / doInstall (hook install + config template + API key prompt)
- **Files**: `bin/gsd-t.js` (surgical edits to `doInit` / `doInstall` / `copyBinToolsToProject`)
- **Contract refs**: `context-meter-contract.md` — config schema + hook I/O
- **Dependencies**: Requires Task 1, BLOCKED by context-meter-hook Task 4 (CP2 — script must exist to copy) and context-meter-config Task 2 (template) + Task 3 (loader)
- **Acceptance criteria**:
  - Copies `scripts/gsd-t-context-meter.js` and `scripts/context-meter/**` into the project's `scripts/` on init
  - Copies `bin/context-meter-config.cjs` into project `bin/` via `PROJECT_BIN_TOOLS` (add to array)
  - Copies `templates/context-meter-config.json` → `.gsd-t/context-meter-config.json` (only if not already present — never overwrite user config)
  - Merges a PostToolUse hook entry into `~/.claude/settings.json`:
    - Matches on a distinctive marker (`gsd-t-context-meter` in the command field)
    - If absent → append
    - If present → update in place
    - Preserves all other hook types and entries
    - Atomic write (temp + rename)
  - Adds `.gsd-t/.context-meter-state.json` and `.gsd-t/context-meter.log` to `.gitignore` (append only if not present)
  - API key prompt: if the configured env var (default `ANTHROPIC_API_KEY`) is unset AND stdin is a TTY, prompts interactively with: env var name, one-line reason, console link, skip option. Always non-blocking — never fails the install.
  - NEVER writes the API key to any file — only offers an `.env` line suggestion if the user pastes one
  - Existing `doInit` / `doInstall` behavior for other files is preserved exactly

### Task 3: Extend doDoctor (hard-gate API key + hook + dry-run)
- **Files**: `bin/gsd-t.js` (surgical edits to `doDoctor`)
- **Contract refs**: `context-meter-contract.md` — rules section
- **Dependencies**: Requires Task 2
- **Acceptance criteria**:
  - Checks that `process.env[apiKeyEnvVar]` (from loaded config) is set → if not, reports RED "Missing API key: set $VAR" with console link, exits non-zero
  - Checks that `~/.claude/settings.json` contains the gsd-t-context-meter PostToolUse hook → if not, reports RED "Hook not installed — run `gsd-t install`"
  - Checks that `scripts/gsd-t-context-meter.js` exists in the project → if not, reports RED "Hook script missing — run `gsd-t update`"
  - Checks that `.gsd-t/context-meter-config.json` parses via the loader → reports RED with field name on failure
  - Runs a dry-run count_tokens call with a minimal messages array (≤ 10 tokens) → reports RED on 401/403/network failure, GREEN with token count on success
  - Preserves all existing doctor checks (no regressions to pre-M34 diagnostics)
  - Exit code: 0 if all checks GREEN, 1 if any RED (existing doctor semantics)

### Task 4: Extend doStatus (real context% from state file)
- **Files**: `bin/gsd-t.js` (surgical edits to `doStatus`)
- **Contract refs**: `context-meter-contract.md` — state file schema
- **Dependencies**: Requires Task 2
- **Acceptance criteria**:
  - Reads `.gsd-t/.context-meter-state.json` if present
  - Displays a line: `Context: {pct}% of {modelWindowSize} tokens ({threshold} band) — last check {relativeTime}`
  - If state file missing → displays `Context: N/A (meter hook not run this session)`
  - If state file stale (> 5 min old) → flags with `(stale)` suffix
  - Preserves all existing status output (version, commands installed, etc.)

### Task 5: Extend doUpdate / doUpdateAll + task-counter retirement migration
- **Files**: `bin/gsd-t.js` (surgical edits to `doUpdate` / `doUpdateAll`)
- **Contract refs**: `context-meter-contract.md`; `token-budget-contract.md` — Task Counter Retirement section
- **Dependencies**: Requires Task 2, BLOCKED by token-budget-replacement Task 9 (CP3 — task-counter.cjs already deleted from the package and command files no longer reference it)
- **Acceptance criteria**:
  - Copies updated `scripts/gsd-t-context-meter.js`, `scripts/context-meter/**`, `bin/context-meter-config.cjs`, `templates/context-meter-config.json` into every registered project (per existing update-all flow)
  - Task-counter retirement migration: checks for `.gsd-t/.task-counter-retired-v1` marker in each project
    - If absent:
      - `rm -f bin/task-counter.cjs` in the project
      - `rm -f .gsd-t/task-counter-config.json` in the project
      - `rm -f .gsd-t/.task-counter-state.json` (and any other `.task-counter*` files) in the project
      - Write `.gsd-t/.task-counter-retired-v1` marker with the date and version
      - Log "Migrated from task-counter to context-meter" to stdout
    - If present: no-op
  - Updates `PROJECT_BIN_TOOLS`: remove `"task-counter.cjs"`, add `"context-meter-config.cjs"` (if not already added in Task 2)
  - Preserves existing update-all flow — this is additive migration, not a rewrite
  - Idempotent: running update-all twice is safe (marker prevents double migration)

### Task 6: Installer unit tests
- **Files**: `bin/gsd-t.test.js` (extend existing if present, or new file)
- **Contract refs**: all M34 contracts
- **Dependencies**: Requires Tasks 2–5
- **Acceptance criteria**:
  - Tests `doInit` in an `os.tmpdir()` fixture project: asserts hook script copied, config template copied, settings.json merged, `.gitignore` updated
  - Tests settings.json merge: preserves existing PreToolUse/other PostToolUse entries, appends gsd-t-context-meter hook, idempotent on second run
  - Tests `doDoctor` failure modes: missing env var, missing hook, missing script, bad config, 401 response (stubbed)
  - Tests `doDoctor` happy path with stubbed count_tokens server
  - Tests migration marker: first run writes marker + deletes task-counter files, second run is a no-op
  - Tests `doStatus` with state file present / missing / stale
  - Uses `node --test` runner
  - All tests clean up after themselves (no leaked tempdirs or settings.json modifications)
