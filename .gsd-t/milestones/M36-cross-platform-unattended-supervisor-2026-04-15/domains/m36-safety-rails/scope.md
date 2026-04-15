# Domain: m36-safety-rails

## Responsibility

Own all the non-happy-path safeguards that turn the supervisor from "a loop that runs `claude -p` forever" into "a loop that refuses to run on dangerous branches, detects when progress has stalled, stops on genuine blockers, respects wall-clock and iteration caps, and survives corrupted state files." This domain delivers composable check functions that the supervisor-core loop calls between workers. If any check returns "unsafe", the loop halts cleanly with an informative state.json terminal value.

## Owned Files/Directories

- `bin/gsd-t-unattended-safety.js` — NEW. Module exporting pure check functions, each taking `(state, projectDir) → { ok: boolean, reason?: string, code?: number }`:
  - `checkGitBranch(projectDir)` — refuses `main`, `master`, `develop`, or anything in a configurable protected-branch list; reads `.gsd-t/unattended-config.json` for overrides. Also refuses detached-HEAD.
  - `checkWorktreeCleanliness(projectDir)` — uses `git status --porcelain` to detect dirty tree; whitelists hot GSD-T runtime files (`.gsd-t/heartbeat-*.jsonl`, `.gsd-t/.context-meter-state.json`, `.gsd-t/events/*.jsonl`, `.gsd-t/token-metrics.jsonl`, `.gsd-t/.unattended/*`, `.gsd-t/token-log.md`); user's uncommitted work on non-whitelisted files → refuse. Whitelist authoritative in contract.
  - `checkIterationCap(state)` — hard cap from CLI `--max-iterations` (default 200).
  - `checkWallClockCap(state)` — hard cap from CLI `--hours` (default 24).
  - `detectGutter(state, runLogTail)` — the progress-stall detector. Three patterns, any match → halt with exit code 6: (a) repeated-error: same exit code 3× in a row with no progress.md Decision Log growth; (b) file-thrash: same file touched in 3 consecutive iterations with no net change (gated on git diff); (c) no-progress: N iterations with no new Decision Log entry (default N=5).
  - `detectBlockerSentinel(runLogTail)` — scan for `blocker: needs human`, `STOP — unrecoverable`, `DESTRUCTIVE ACTION REQUIRED`, other sentinels defined in `mapHeadlessExitCode`. Overlap with exit codes is intentional — this is a second line of defense in case worker exit isn't mapped.
  - `validateState(state)` — shape check on state.json (required fields present, enum values valid). If corrupted → halt with a diagnostic dump, exit code 2.
- `.gsd-t/unattended-config.json` — NEW (optional per-project config file). Documented defaults. Fields: `protectedBranches[]`, `dirtyTreeWhitelist[]`, `maxIterations`, `hours`, `gutterNoProgressIters`. Supervisor reads if present; falls back to hardcoded defaults.
- `test/unattended-safety.test.js` — NEW. Unit tests per check function: branch whitelist/blacklist, dirty-tree whitelist behavior, gutter detection for each of 3 patterns, state-validation happy/sad paths, blocker sentinel matching.

## NOT Owned (do not modify)

- `bin/gsd-t-unattended.js` (the main loop) — owned by m36-supervisor-core. Safety rails are called FROM the loop; they don't live in it.
- `bin/gsd-t.js` `mapHeadlessExitCode` — Phase 0 already extended. Safety rails OVERLAP with it defensively but never modify it.
- `.gsd-t/progress.md` parsing for milestone-complete detection — supervisor-core owns that.
- Notifications on halt — cross-platform domain dispatches them; safety rails returns the halt reason and the loop emits the notify call.
- Watch-loop display of gutter warnings — deferred to v2; safety rails only sets halt state.
- Handoff-lock.js — that's m36-m35-gap-fixes' primitive for M35's existing headless path. Safety rails does NOT depend on it for v1.

## Dependencies

- **Depends on**: m36-supervisor-core (state.json schema, how the loop calls safety checks, where run.log lives)
- **Depends on**: `unattended-supervisor-contract.md` v1.0.0 (defines the exit-code table, the whitelist, the config file format)
- **Depended on by**: m36-supervisor-core (main loop imports and calls the check functions)
- **Depended on by**: m36-m35-gap-fixes (gap-fixes' `bin/handoff-lock.js` may reuse `validateState` shape conventions)

## Contract Additions

`unattended-supervisor-contract.md` v1.0.0 must include:
- **Exit code table** expanded with: 6 = gutter-detected (safety halt), 2 = state corruption, 7 = protected branch refusal, 8 = dirty tree refusal (or fold 7/8 into 2 as "preflight-failed"). Final numbering decided during contract authoring.
- **Dirty-tree whitelist** canonical list
- **Protected-branch** default list: `main`, `master`, `develop`, `trunk`, `release/*`, `hotfix/*`
- **Gutter detection thresholds** (default N=5 for no-progress, configurable)

## Out of Scope (v1)

- Rollback on gutter detection — v1 halts and reports; it does not auto-revert
- Self-healing (retry after a cool-off) — v1 is binary halt/continue
- Runtime adjustment of thresholds — config is read at supervisor start, not during the run
- Fault injection tests beyond unit level — deferred to integration testing
