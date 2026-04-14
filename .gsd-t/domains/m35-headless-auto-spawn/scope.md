# Domain: m35-headless-auto-spawn

## Milestone: M35
## Status: DEFINED
## Wave: 3 (tasks 1-3), 4 (tasks 4-5)

## Purpose

When the runway estimator refuses a run, automatically spawn a headless Claude Code process to continue the work in a fresh context. The user never types `/clear`. The interactive session stays idle and is notified (macOS osascript) when the headless run completes. On next interactive command invocation, a results banner surfaces.

## Why this domain exists

M35's core principle: the user never types `/clear`. Together with the runway estimator, this domain makes long-running multi-wave work truly autonomous. The interactive session is never blocked — even when the active context can't finish the work, the system hands off cleanly and the user's session stays available for other tasks.

## Files in scope

- `bin/headless-auto-spawn.js` — NEW module
- `.gsd-t/contracts/headless-auto-spawn-contract.md` → v1.0.0 NEW
- `test/headless-auto-spawn.test.js` — NEW (~8 tests)
- `test/runway-debug-handoff.test.js` — NEW (~5 tests)
- `.gsd-t/headless-sessions/` — NEW directory for per-session status files
- `commands/gsd-t-debug.md` — mid-loop handoff integration
- Every GSD-T command — on next invocation after a completed headless run, surface results banner (implemented as a shared preamble check, not per-command edits)
- `commands/gsd-t-resume.md` — check `.gsd-t/headless-sessions/` at start

## Files NOT in scope

- `bin/runway-estimator.js` — m35-runway-estimator (this domain is called BY the estimator)
- Core CLI installer logic — unchanged

## Dependencies

- **Depends on**: m35-runway-estimator (provides the refusal signal that triggers auto-spawn)
- **Blocks**: m35-optimization-backlog Wave 4 (final smoke tests run with headless auto-spawn live)

## Acceptance criteria

1. `bin/headless-auto-spawn.js` exists, exports `autoSpawnHeadless({command, args, continue_from})`
2. Detaches child process via `spawn` with `detached: true` + `stdio: 'ignore'` + `unref()` so interactive session is not blocked
3. Captures PID, log file path, timestamp → writes `.gsd-t/headless-sessions/{id}.json`
4. Installs macOS `osascript` notification (reuses existing Stop hook pattern)
5. Writes continue-here file with full context (current domain, pending tasks, decision log snapshot)
6. Invokes `node bin/gsd-t.js headless {command} --resume --log` as child
7. Debug mid-loop handoff: persists hypothesis + last fix + last test output, hand off preserves state across iteration boundary
8. Interactive read-back: next GSD-T command checks `.gsd-t/headless-sessions/` for completed runs and surfaces "Headless runs since you left" banner
9. End-to-end smoke test: simulate runway refusal → child process starts → session file written → notification fires
10. Debug mid-loop test: simulate pathological context growth mid-iteration → handoff preserves state → headless picks up at iteration N+1
11. User never sees `/clear` prompt in the full M35 test run
