# Tasks: m35-headless-auto-spawn

## Summary

Implement `bin/headless-auto-spawn.js` with detached child-process spawn, macOS notification on completion, and session state tracking. Wire the debug mid-loop handoff (coordinate with runway-estimator T5). Implement the interactive read-back banner via `bin/check-headless-sessions.js`. Validate with a full unit and end-to-end test suite.

## Contract References

- `.gsd-t/contracts/headless-auto-spawn-contract.md` — v1.0.0 (NEW, created in T1)
- `.gsd-t/contracts/runway-estimator-contract.md` — v1.0.0 (read-only — defines the handoff protocol from the estimator side)
- `.gsd-t/contracts/headless-contract.md` — read-only (M29 existing headless contract — reuse, don't duplicate)

---

## Tasks

### Task 1: Implement `bin/headless-auto-spawn.js` + contract v1.0.0

- **Files**:
  - `bin/headless-auto-spawn.js` (create)
  - `.gsd-t/contracts/headless-auto-spawn-contract.md` (create)
  - `.gsd-t/headless-sessions/` (create directory — `.gitkeep` placeholder)
- **Contract refs**: `.gsd-t/contracts/headless-contract.md` (M29 — reuse headless invocation pattern, do not duplicate)
- **Dependencies**: NONE (first Wave 3 task — can start immediately after Wave 2 completes)
- **Acceptance criteria**:
  - `bin/headless-auto-spawn.js` exports `autoSpawnHeadless({command, args, continue_from})` → `{id, pid, logPath, timestamp}`
  - Spawns child: `node bin/gsd-t.js headless {command} --resume --log` using `child_process.spawn` with `detached: true`, `stdio: ['ignore', logFd, logFd]`, followed by `child.unref()` — interactive session never blocks on the child
  - `id` is a slug: `{command}-{YYYY-MM-DD}-{HH-MM-SS}`
  - Writes `.gsd-t/headless-sessions/{id}.json`: `{id, pid, logPath, startTimestamp, command, args, status: 'running', continueFromPath}`
  - Writes a continue-here context file at `.gsd-t/headless-sessions/{id}-context.json` with: current domain, pending tasks list, last decision log entry, current wave
  - `logPath` is `.gsd-t/headless-{id}.log`
  - Contract v1.0.0 documents: `autoSpawnHeadless` API, return shape, session file schema, continue-here file format, notification channel (T2 adds it), explicit "interactive session never blocked" guarantee, handoff protocol used by runway-estimator

### Task 2: macOS notification integration

- **Files**:
  - `bin/headless-auto-spawn.js` (extend — add completion watcher)
- **Contract refs**: `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 (T1 output — update notification channel section)
- **Dependencies**: Requires Task 1 (extends the module created in T1)
- **Acceptance criteria**:
  - After spawning the child, installs a completion watcher: reads the log file, or uses `child.on('exit')` if the child reference is kept before `unref()` — one valid approach: write a thin wrapper script that fires osascript after the main headless process exits
  - On child completion, fires: `osascript -e 'display notification "GSD-T headless run complete: {id}" with title "GSD-T" subtitle "{command}"'`
  - Graceful degradation: wrap osascript call in a `try/catch`; on non-macOS (`process.platform !== 'darwin'`) skip silently without crashing
  - On completion: reads `.gsd-t/headless-sessions/{id}.json`, updates `status: 'completed'`, `exitCode`, `endTimestamp`
  - Update `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 to document the notification channel and the session file completion shape

### Task 3: Debug mid-loop handoff

- **Files**:
  - `commands/gsd-t-debug.md` (modify — add between-iteration runway check with state persistence)
  - `test/runway-debug-handoff.test.js` (create)
- **Contract refs**: `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 (T1 output), `.gsd-t/contracts/runway-estimator-contract.md` v1.0.0
- **Dependencies**: Requires Task 1 (`autoSpawnHeadless` must exist); BLOCKED BY m35-runway-estimator Task 5 (that task also modifies `commands/gsd-t-debug.md` with the between-iteration runway check — coordinate: runway-estimator T5 adds the check logic; T3 here adds the state persistence before the handoff call; apply T5 first, then T3 extends it with the state save)
- **Acceptance criteria**:
  - In `commands/gsd-t-debug.md`, the between-iteration runway check (added by runway-estimator T5), when refusal fires:
    1. Persists current hypothesis text to `.gsd-t/debug-ledger.jsonl` (M29 existing schema — append a new entry with `type: 'runway-handoff-snapshot'`)
    2. Persists last fix diff and last test output to the same entry
    3. Calls `autoSpawnHeadless({command: 'gsd-t-debug', args: ['--resume', 'iteration-N+1'], continue_from: '.gsd-t/debug-ledger.jsonl'})`
    4. Outputs: "Runway exceeded mid-loop — headless debug picking up at iteration N+1. Session: {id}. Log: {logPath}"
    5. Exits the debug loop cleanly (no crash, no `/clear` prompt)
  - `test/runway-debug-handoff.test.js`: ~5 tests:
    - State persistence: fixture creates debug-ledger.jsonl, asserts runway-handoff-snapshot entry written with hypothesis + fix + test-output
    - Handoff call: mock `autoSpawnHeadless`, assert called with correct args
    - Session file created: assert `.gsd-t/headless-sessions/{id}.json` exists with status='running'
    - Clean exit: assert debug loop exits without throwing after handoff
    - Headless pickup: assert continue_from path points to existing ledger file

### Task 4: Interactive read-back banner

- **Files**:
  - `bin/check-headless-sessions.js` (create — new shared helper)
  - `commands/gsd-t-resume.md` (modify — add headless session check at the start)
  - `commands/gsd-t-status.md` (modify — add headless session banner in output)
- **Contract refs**: `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 (session file schema)
- **Dependencies**: Requires Task 2 (sessions must have `status: 'completed'` + `endTimestamp` from T2's completion watcher)
- **Acceptance criteria**:
  - `bin/check-headless-sessions.js` exports `checkCompletedSessions(projectDir)` → array of unsurfaced completed sessions
  - Reads all `.json` files in `.gsd-t/headless-sessions/` where `status === 'completed'` and `surfaced !== true`
  - `commands/gsd-t-resume.md` Step 1 now begins with: run `checkCompletedSessions()`, if results → print "## Headless runs since you left" banner listing: session ID, command, duration (endTimestamp - startTimestamp), outcome (exitCode 0 = success), log path
  - `commands/gsd-t-status.md` includes the same banner at the start of its output (before the main status table)
  - After surfacing, marks each session `surfaced: true` in its `.json` file so banner doesn't re-appear
  - No polling loop in the interactive session — check fires only on command invocation, not continuously

### Task 5: End-to-end smoke test + full unit test suite

- **Files**:
  - `test/headless-auto-spawn.test.js` (create)
- **Contract refs**: `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 (all features tested)
- **Dependencies**: Requires Tasks 1, 2, 3, 4 (tests the full feature set)
- **Acceptance criteria**:
  - Unit tests (~8): spawn invocation returns `{id, pid, logPath, timestamp}`, session file written with correct schema, notification fires (mock `osascript` via environment stub), continue-here file written, `status: 'completed'` update after exit, `check-headless-sessions` returns unsurfaced entries, `surfaced: true` set after surfacing, graceful degradation on non-macOS (no crash)
  - End-to-end integration test: spawn a trivially fast headless process (e.g., `node -e "console.log('done')"` wrapped as a fake headless command), assert session file created with `status: 'running'`, wait for completion, assert `status: 'completed'` with exitCode, assert next `checkCompletedSessions()` call returns the session
  - Verify across M35 execution: assertion that zero user-facing `/clear` prompts occurred (this is a qualitative assertion documented in the test file, not a programmatic one, since `/clear` prompts are Claude UI events — document the expected behavior and the verification method)

---

## Execution Estimate

- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 1 (Task 3 blocked by m35-runway-estimator Task 5)
- Estimated checkpoints: 1 (Wave 3 gate: T1/T2/T3 complete → Wave 4 unlocked for T4/T5)

## Wave Assignment

- **Wave 3**: Tasks 1, 2, 3 (foundational spawn + debug handoff; T3 coordinates with runway-estimator T5)
- **Wave 4**: Tasks 4, 5 (read-back banner + full test suite — after Wave 3 smoke tests pass)
