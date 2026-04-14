# Task 2 Summary — Hook Install + Config Template + API Key Prompt

**Domain**: installer-integration
**Milestone**: M34 (Context Meter)
**Status**: PASS
**Date**: 2026-04-14

---

## Scope

Extend `bin/gsd-t.js` to install the Context Meter runtime (scripts, config
template, .gitignore) into projects and register the PostToolUse hook in
`~/.claude/settings.json`. Prompt the user for an Anthropic API key at install
time without ever writing the key to disk.

---

## Files Modified

- `bin/gsd-t.js` — only file changed (additive).

### Additions

- `require("readline")` added to top-level imports.
- `"context-meter-config.cjs"` appended to `PROJECT_BIN_TOOLS` (line 1564).
  `task-counter.cjs` retained — Task 5 removes it after CP3.
- New helpers added after `addHeartbeatHook`:
  - `ensureGitignoreEntries(projectDir, entries)` — idempotent .gitignore
    appender. Creates the file if missing. Skips duplicate lines. Skips if
    target is a symlink. Writes a single `# GSD-T context meter` block on
    first install.
  - `installContextMeter(projectDir)` — copies
    `scripts/gsd-t-context-meter.js` and `scripts/context-meter/*.js` (runtime
    only — skips `.test.js` and `test-injector.js`) into the project, copies
    `templates/context-meter-config.json` → `.gsd-t/context-meter-config.json`
    only when absent (never overwrites user config), and invokes
    `ensureGitignoreEntries` with the two session-state paths.
  - `configureContextMeterHooks(settingsPath)` — reads `settingsPath`
    directly (not via the hardcoded `readSettingsJson` global), ensures
    `hooks.PostToolUse` array exists, searches for an existing entry whose
    command contains the marker `gsd-t-context-meter` and either refreshes
    the command string in-place or appends a new
    `{matcher:"*", hooks:[{type:"command", command:"..."}]}` entry. Preserves
    ALL other top-level keys, hook events, and matchers. Uses the same
    non-atomic `fs.writeFileSync` + symlink guard pattern as
    `configureHeartbeatHooks`. Returns `{installed, action}` where action is
    `"added"`, `"updated"`, or `"noop"`.
  - `promptForApiKeyIfMissing(envVarName)` — async readline prompt. Skips
    silently in non-TTY shells or when the env var is already set. If the
    user pastes a key, prints the literal `export VAR="key"` line for the
    user to copy into their own shell profile — the key is NEVER written to
    any file by the installer. All errors caught; the prompt can never block
    or fail the install.
  - `resolveApiKeyEnvVar(projectDir)` — loads the config via
    `bin/context-meter-config.cjs` and returns `apiKeyEnvVar` (defaults to
    `"ANTHROPIC_API_KEY"` if loader or file is missing).

### Async ripple

- `doInstall`, `doUpdate`, `doUpdateAll`, `updateGlobalCommands`, `doInit`
  all made `async`.
- Main switch cases `install`, `update`, `update-all`, `init` now call the
  async function with `.catch((e) => { error(...); process.exit(1); })`.
- `module.exports` gained the five new helpers so Task 6 unit tests (and the
  smoke tests in this task) can target them directly.

### Wiring

- `doInstall` (global install): runs
  `configureContextMeterHooks(SETTINGS_JSON)` in a new "Context Meter
  (PostToolUse)" section between "Utility Scripts" and "Graph Engine (CGC)",
  then at the very end awaits `promptForApiKeyIfMissing(resolveApiKeyEnvVar(cwd))`.
- `doInit` (per-project init): after `copyBinToolsToProject` runs
  `installContextMeter(projectDir)` + `configureContextMeterHooks(SETTINGS_JSON)`,
  then at the end awaits `promptForApiKeyIfMissing(resolveApiKeyEnvVar(projectDir))`.

---

## Hook Command

```
node "$CLAUDE_PROJECT_DIR/scripts/gsd-t-context-meter.js"
```

The hook lives globally in `~/.claude/settings.json`. The script ships
per-project and is located via Claude Code's `$CLAUDE_PROJECT_DIR` env var.
Idempotency marker is the substring `gsd-t-context-meter` in any
`hooks.PostToolUse[].hooks[].command` field.

---

## Smoke Tests (tempdir: `/tmp/gsd-t-m34-smoke/`)

Functions imported directly from `bin/gsd-t.js` via `require(...)` and
invoked against the tempdir. No real `~/.claude` mutation.

### Test 1 — Fresh install

| Assertion | Result |
|-----------|--------|
| `installContextMeter` returned true | PASS |
| `configureContextMeterHooks` returned `{installed:true, action:"added"}` | PASS |
| `scripts/gsd-t-context-meter.js` exists | PASS |
| `scripts/context-meter/transcript-parser.js` exists | PASS |
| `scripts/context-meter/count-tokens-client.js` exists | PASS |
| `scripts/context-meter/threshold.js` exists | PASS |
| `scripts/context-meter/test-injector.js` NOT shipped | PASS |
| `scripts/context-meter/transcript-parser.test.js` NOT shipped | PASS |
| `scripts/context-meter/count-tokens-client.test.js` NOT shipped | PASS |
| `scripts/context-meter/threshold.test.js` NOT shipped | PASS |
| `.gsd-t/context-meter-config.json` exists | PASS |
| `.gitignore` contains `.gsd-t/.context-meter-state.json` | PASS |
| `.gitignore` contains `.gsd-t/context-meter.log` | PASS |
| PostToolUse `gsd-t-context-meter` hook count = 1 | PASS |

### Test 2 — Idempotency (2nd invocation)

| Assertion | Result |
|-----------|--------|
| `configureContextMeterHooks` returns `{installed:true, action:"noop"}` | PASS |
| Config file mtime unchanged (not overwritten) | PASS |
| Hook count still 1 (not doubled) | PASS |
| `.gitignore` state-file line count = 1 (not duplicated) | PASS |
| `.gitignore` log-file line count = 1 (not duplicated) | PASS |

### Test 3 — Settings.json merge preserves existing hooks

Pre-populated `fake-home/.claude/settings.json` with `env.FOO=bar`,
`theme="dark"`, one PreToolUse `matcher:"Bash"` hook, one PostToolUse
`matcher:"Read"` hook.

| Assertion | Result |
|-----------|--------|
| `env.FOO` preserved | PASS |
| `theme` preserved | PASS |
| PreToolUse Bash hook preserved | PASS |
| PostToolUse array length = 2 (original + ours) | PASS |
| Original `echo pre-existing-read-hook` preserved | PASS |
| New `gsd-t-context-meter` hook appended | PASS |

### Pre-Commit Gate — CLI subcommand smoke

| Command | Result |
|---------|--------|
| `node bin/gsd-t.js --version` | exit 0, prints `2.74.13` |
| `node bin/gsd-t.js help` | exit 0, full command list displayed |
| `node bin/gsd-t.js status` | exit 0, 56/56 commands, GSD-T config OK |
| `node bin/gsd-t.js doctor` | exit 0, 2 warnings (Playwright + CGC — unrelated) |

`install`, `update`, and `update-all` were NOT run end-to-end against the
real `~/.claude/` — the new code paths they exercise are already covered
by the direct function-level smoke tests above, and running them live would
mutate global state. Task 6 will wrap them with readline mocks.

### Full test suite

```
ℹ tests 924
ℹ pass 924
ℹ fail 0
```

No regressions.

---

## Constraint Discoveries

1. **`readSettingsJson()` ignores its input** — the existing helper always
   reads `SETTINGS_JSON` (the hardcoded `~/.claude/settings.json` path) and
   ignores any passed-in path. I initially wired my `configureContextMeterHooks`
   through it and the test passed by accident (the tempdir settings file
   happened to get written even though the read came from the real
   `~/.claude/settings.json`). Fixed by having `configureContextMeterHooks`
   read `targetPath` directly via `fs.readFileSync`. This keeps the function
   testable against arbitrary paths and bug-compatible with the rest of the
   file.

2. **Async ripple was contained to 4 switch cases**. No need to await
   `checkForUpdates(command)` — it runs after the switch and stays sync.
   The four `.catch(...)` wrappers are uniform and one-line each.

3. **test-injector.js exclusion**. The runtime install filters on two
   rules: `fname.includes(".test.")` AND `fname === "test-injector.js"`.
   Both are required — `test-injector.js` does not contain `.test.` in its
   name so the first rule alone would have shipped it. Also filters on
   `fs.statSync(...).isFile()` to skip nested subdirectories if any ever
   appear.

4. **Zero-dep rule holds**. Only `readline` added. All Node built-in.

5. **No atomic writes introduced**. Followed existing heartbeat pattern
   (direct `writeFileSync` + symlink guard). Inventory flagged atomic
   writes as out-of-scope for M34.

6. **`promptForApiKeyIfMissing` is non-blocking by design**. Any
   readline error or prompt failure resolves with `""`. The install can
   never hang or abort because of the prompt. Interactive testing deferred
   to Task 6 with readline mocks.

---

## Deferred Items

- Interactive API-key prompt TTY testing (Task 6, full unit suite with
  readline mocks).
- `updateSingleProject` was intentionally left alone — Task 5 handles
  update-all integration for the task-counter retirement + context-meter
  propagation to already-registered projects.
- `task-counter.cjs` retained in `PROJECT_BIN_TOOLS` — Task 5 removes it
  after token-budget-replacement Wave 2 finishes deleting the source
  file.

---

## Next

Unblocks Task 3 (doctor check), Task 4 (status display), Task 5
(task-counter retirement migration) per
`.gsd-t/domains/installer-integration/tasks.md`.
