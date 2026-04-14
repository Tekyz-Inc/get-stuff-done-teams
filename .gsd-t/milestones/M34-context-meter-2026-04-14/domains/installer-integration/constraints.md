# Constraints: installer-integration

## Must Follow

- **Zero external dependencies** in `bin/gsd-t.js` — use only Node.js built-ins (`fs`, `path`, `https`, `readline`, `child_process`). No schema libraries, no prompt libraries.
- **Preserve existing CLI UX**: ANSI color helpers (BOLD/GREEN/YELLOW/RED/CYAN/DIM), step-numbered output, existing argv parsing.
- **Settings.json merge must be non-destructive**: read existing `~/.claude/settings.json`, preserve any existing `hooks` entries (PreToolUse, PostToolUse, SessionStart, UserPromptSubmit), append context-meter PostToolUse hook if absent, update in-place if present (match on a distinctive marker like `gsd-t-context-meter`). Write atomically (write to `.tmp`, rename).
- **Doctor check is a hard gate**: if API key env var is unset or the count_tokens dry-run fails with 401, `doDoctor` exits non-zero. Messaging must point at the exact env var name from config and link to `https://console.anthropic.com` for key creation.
- **API key prompt on install**: `doInstall` / `doInit` detects whether the env var is already set. If set → continue silently. If unset → prompt interactively (stdin) with:
  - The env var name (from config default)
  - Why it's needed (one line: "Context Meter measures real token usage to prevent mid-session compaction")
  - A link to create a free key
  - Option to skip ("set up later via `gsd-t doctor`") — install still succeeds; doctor will fail until set
- **Never echo the API key**: if the user pastes a key at the prompt, offer to write an `.env` line suggestion but do NOT persist the key to any file in the repo or user home. Print it back to stdout only if the user explicitly asks for confirmation via a `--show-key` flag.
- **Task-counter retirement is a distinct migration step**: on `doUpdate` / `doUpdateAll`, after copying new context-meter assets, check for a migration marker `.gsd-t/.task-counter-retired-v1`. If absent:
  - Remove `bin/task-counter.cjs` from the project
  - Remove `.gsd-t/task-counter-config.json` if present
  - Remove `.gsd-t/.task-counter-state.json` / equivalent state files
  - Write the marker
  - Log "Migrated from task-counter to context-meter" to stdout
- **Atomic file writes**: every file write in the installer must use write-to-temp + rename, matching the existing installer style.

## Must Not

- Remove or rename any function in `bin/gsd-t.js` that other subcommands call — this is a surgical extension, not a rewrite.
- Add npm dependencies. The zero-dep constraint is project-wide and non-negotiable (see project CLAUDE.md "Don't Do These Things").
- Modify `bin/task-counter.cjs` — it is being retired. Only remove it via the migration step, do not edit it.
- Hard-code paths or model sizes — read from `.gsd-t/context-meter-config.json` via the loader.
- Write the API key into settings.json, config files, or any committed artifact.
- Touch the command files — those are owned by `token-budget-replacement` and `m34-docs-and-tests`.
- Block `doInstall` on doctor failure — install always succeeds; doctor surfaces the remaining work.

## Must Read Before Using

- **`bin/gsd-t.js`** — read the full file before editing. Understand: argv parsing, the existing `PROJECT_BIN_TOOLS` array and `copyBinToolsToProject` function, `doInit` / `doInstall` / `doUpdate` / `doUpdateAll` / `doDoctor` / `doStatus` flow, settings.json handling if any exists, and the migration-marker pattern from v2.74.11's `.archive-migration-v1`.
- **Existing `bin/task-counter.cjs`** (before removing) — understand what state files it creates so the migration step knows exactly what to delete.
- **`.gsd-t/contracts/context-meter-contract.md`** (from context-meter-config domain) — the config schema and state file format this domain must respect.
- **The actual `~/.claude/settings.json` format** for hooks — PostToolUse hook shape, matcher field, command field.
- **The count_tokens endpoint** — construct a minimal request for the dry-run doctor check that costs ~0 tokens.

## Dependencies

- **Depends on**: `context-meter-hook` (for the script file to copy), `context-meter-config` (for the template, loader, and schema).
- **Depended on by**: `token-budget-replacement` (PROJECT_BIN_TOOLS changes coordinate with token-budget file changes), `m34-docs-and-tests` (install UX documented in README).

## Integration Checkpoints

- Must wait for `context-meter-hook` to produce `scripts/gsd-t-context-meter.js` before wiring install.
- Must wait for `context-meter-config` to produce `templates/context-meter-config.json` and `bin/context-meter-config.cjs` before wiring install.
