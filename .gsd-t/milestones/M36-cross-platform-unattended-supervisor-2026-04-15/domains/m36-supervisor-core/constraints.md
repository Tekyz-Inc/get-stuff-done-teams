# Constraints: m36-supervisor-core

## Must Follow

- **Zero external npm deps.** Stay consistent with `bin/gsd-t.js` policy — Node built-ins only (`child_process`, `fs`, `path`, `os`). The installer is zero-dep and the supervisor must be too.
- **Synchronous fs** where `bin/gsd-t.js` uses it, for consistency with the rest of the CLI surface.
- **Use `spawnSync`, not `spawn`**, for worker invocation. Spike D confirmed `spawnSync` captures exit code + stdout cleanly, and the supervisor's outer loop is inherently serial — one worker at a time, each worker runs to completion before the next spawns. Async spawn adds complexity without benefit.
- **Always scan worker stdout for sentinels.** Exit code alone is insufficient — Spike D proved unknown slash commands exit 0 with error text in stdout. Route all worker results through `mapHeadlessExitCode()` from `bin/gsd-t.js` (already extended in Phase 0 to catch `Unknown command:` → exit 5).
- **State file writes are atomic.** Write to `state.json.tmp` then `fs.renameSync` over `state.json`. Any reader (watch loop, status command, health check) must tolerate transient absence of `state.json` during a rename and retry once.
- **PID file lifecycle is strict.** Write PID file ONLY after state.json is initialized. Remove PID file in a `process.on('exit', …)` handler AND in explicit terminal-state branches (done/failed/stopped). Never leave a stale PID file pointing at a dead process — watch loop uses `kill -0` to detect crashes and a stale PID creates false positives.
- **Log sensibly.** Append every worker's stdout+stderr to `.gsd-t/.unattended/run.log` with an `--- ITER {n} @ {ISO8601} exit={code} ---` header line. No truncation. Rotation deferred to v2.
- **Honor `stop` sentinel file between workers.** Check `fs.existsSync('.gsd-t/.unattended/stop')` AFTER every worker returns and BEFORE the next `spawnSync`. If present, set `state.status = 'stopped'`, finalize, and exit 0.
- **Resume contract**: workers always invoke `/gsd-t-resume` (bare form, NOT `/user:gsd-t-resume` — Phase 0 confirmed the prefix breaks non-interactive dispatch). The supervisor does not issue any other slash command directly — it trusts `/gsd-t-resume` to continue the milestone.
- **Worker timeout**: each `spawnSync` call must have a hard `timeout` option (default 1 hour per iteration, configurable via CLI flag). A timeout kills the worker and counts as iter complete with exit code 124 (timeout). Safety rails domain adds higher-level iteration-count and wall-clock caps on top.
- **Log every loop decision to `state.json`** — the watch loop is blind without it. At minimum write: `iter`, `status`, `last_exit`, `last_elapsed_ms`, `last_worker_started_at`, `last_worker_finished_at`, `started_at`, `milestone`, `wave`, `task`.
- **Read milestone progress from `.gsd-t/progress.md`** to populate state.json — use the existing parse helpers or a grep-based approach. Do not invent a new progress format.

## Must Not

- **Modify `bin/gsd-t.js` `buildHeadlessCmd()` or `mapHeadlessExitCode()`**. Phase 0 already fixed them. Import, do not re-edit.
- **Modify `commands/gsd-t-resume.md`**. Watch-loop domain owns the Step 0 auto-reattach block.
- **Modify `bin/headless-auto-spawn.js`**. The M35 single-shot headless path is orthogonal; m36-m35-gap-fixes domain owns its further changes.
- **Add safety rails inline.** Gutter detection, git branch isolation, blocker sentinels — these are separate composable functions imported from the safety-rails domain. Keep this domain's code as thin as possible around the loop.
- **Fork on platform inside the main loop.** Cross-platform branches (Windows `.cmd`, notification commands) must be isolated into `bin/gsd-t-unattended-platform.js` (or similar) owned by m36-cross-platform. The main loop calls platform-agnostic wrappers.
- **Assume the in-session Claude is listening.** The supervisor runs detached. It never writes to stdin of the launching process, never prints to its terminal, never expects acknowledgement. All state flows through files.
- **Block the launching Claude session.** Launch must return immediately after the supervisor is PID-confirmed alive. The launching slash command calls `spawn` with `detached: true, stdio: 'ignore'` and `ref()` off, or uses `nohup`-equivalent. Watch-loop domain owns the launch handshake; this domain owns the supervisor-side readiness signal.
- **Persist secrets in state.json or run.log**. If environment variables leak into worker output, the log is already sensitive — but don't make it worse by echoing env.

## Must Read Before Using

### `bin/gsd-t.js` (existing, v2.76.10 + Phase 0 fix)
- `buildHeadlessCmd(command, cmdArgs)` (line ~2596) — returns `/gsd-t-${command}${argStr}` as of Phase 0. Supervisor does NOT call this directly; it invokes `claude -p '/gsd-t-resume'` with a hardcoded string. Awareness only.
- `mapHeadlessExitCode(rawOutput, processExit)` (line ~2605) — returns 0 (success), 4 (unrecoverable), 5 (command-dispatch-failed, NEW in Phase 0), plus existing sentinels (verify-failed, context-budget-exceeded, blocker). Supervisor MUST pipe every worker's raw output and `res.status` through this function.
- Exit-code semantics: 0 success, 1 generic worker failure, 2 config/pre-flight error, 3 timeout hit, 4 unrecoverable error (2-attempt fix + debug-loop both failed), 5 command-dispatch-failed (NEW), 6 reserved for safety-rails gutter detection, 124 process timeout. Supervisor must match this table.

### `bin/headless-auto-spawn.js` (existing, M35)
- `makeSessionId()`, `writeSessionFile()`, `markSessionCompleted()` — patterns for writing per-session JSON state files. Supervisor's `.gsd-t/.unattended/state.json` is similar in shape but singleton (one supervisor per project at a time).
- `writeContinueHereFile()` (line ~140) — how M35 emits resume-handoff files. The supervisor does NOT write continue-here files directly — it relies on workers doing that themselves via `/gsd-t-pause` (called internally by `/gsd-t-resume` when runway is tight).

### `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 (NEW — authored during partition)
- **state.json schema** — authoritative. Supervisor must conform exactly.
- **PID file lifecycle** — authoritative. Race conditions defined here.
- **Sentinel file semantics** — `stop` behavior, `run.log` append contract, resume auto-reattach handshake.
- **Exit-code table** — must match `bin/gsd-t.js` `mapHeadlessExitCode` semantics.

## Dependencies

- **Depends on**: `bin/gsd-t.js` (Phase 0 fixed), `unattended-supervisor-contract.md` v1.0.0
- **Depended on by**: m36-watch-loop (reads state.json + PID), m36-safety-rails (layers checks onto loop), m36-cross-platform (wraps spawn), m36-m35-gap-fixes (shares handoff-lock primitive), m36-docs-and-tests (documents the binary)
