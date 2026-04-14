# Tasks: m35-headless-auto-spawn

## T1 — Implement `bin/headless-auto-spawn.js` + contract v1.0.0 (Wave 3)
**Files**: `bin/headless-auto-spawn.js`, `.gsd-t/contracts/headless-auto-spawn-contract.md`
**Acceptance**:
- Exports `autoSpawnHeadless({command, args, continue_from})` → returns `{id, pid, logPath, timestamp}`
- Uses `child_process.spawn` with `detached: true`, `stdio: ['ignore', logFd, logFd]`, `unref()`
- Writes `.gsd-t/headless-sessions/{id}.json` with status, PID, log path, start timestamp, command, args
- Writes continue-here context file next to the session file
- Contract v1.0.0 documents: API, handoff protocol, continue-here format, notification channel, explicit "interactive session never blocked" guarantee

## T2 — macOS notification integration (Wave 3)
**File**: `bin/headless-auto-spawn.js` (extended)
**Acceptance**:
- Reuses existing Stop hook `osascript` pattern (find and reference existing code)
- On headless child completion (detected via log-tail or exit watcher), fires `osascript -e 'display notification "..." with title "GSD-T"'`
- Graceful degradation: non-macOS platforms skip notification silently (no crash)
- Session file updated with `status: completed`, `exitCode`, `endTimestamp`

## T3 — Debug mid-loop handoff (Wave 3)
**Files**: `commands/gsd-t-debug.md`, `test/runway-debug-handoff.test.js`
**Acceptance**:
- Debug command's between-iteration runway check, on refusal:
  - Persists hypothesis, last fix diff, last test output to `.gsd-t/debug-ledger.jsonl` (existing ledger from M29)
  - Calls `autoSpawnHeadless({command: 'gsd-t-debug', args: ['--resume', iteration_n+1]})`
  - Interactive session reports the handoff and exits the debug loop cleanly
- Headless debug picks up at iteration N+1 with clean context
- Integration test: fixture sets CTX_PCT=82 mid-loop, asserts handoff fires with state preserved (~5 tests)

## T4 — Interactive read-back banner (Wave 4)
**File**: Shared preamble logic — likely a new helper `bin/check-headless-sessions.js` called from gsd-t-resume and gsd-t-status, plus a check in every command's Step 0 observability block
**Acceptance**:
- On next interactive GSD-T command invocation, check `.gsd-t/headless-sessions/` for entries with `status: completed` that haven't been surfaced yet
- Output a "Headless runs since you left" banner at the top of the response with: session ID, command, duration, outcome, link to log file
- Mark surfaced entries as `surfaced: true` so they don't re-appear
- Works from both `gsd-t-resume` and any other command invocation

## T5 — End-to-end smoke test + unit tests (Wave 4)
**Files**: `test/headless-auto-spawn.test.js`
**Acceptance**:
- Unit tests: spawn invocation, session file write, notification firing (mocked osascript), continue-here file format (~8 tests)
- End-to-end: simulate a runway refusal in a test environment, assert child process starts, `.gsd-t/headless-sessions/{id}.json` written, notification invoked, banner appears on next command invocation
- Full M35 test run across Waves 3-5 produces ZERO user-facing `/clear` prompts
