# Constraints: m36-watch-loop

## Must Follow

- **Watch ticks are stateless.** Every firing of `/user:gsd-t-unattended-watch` re-reads `state.json` + PID from disk. Zero in-memory state between ticks. A ScheduleWakeup re-fire is equivalent to a user manually invoking the command. This makes `/clear`, `/compact`, and cross-session resumes transparent.
- **Tick cadence = 270s.** Hard-coded. Do not parameterize in v1. Rationale in scope.md.
- **Bare slash form for ScheduleWakeup**: pass `/user:gsd-t-unattended-watch` to ScheduleWakeup's `prompt` field — in-session dynamic loop, NOT the `<<autonomous-loop-dynamic>>` sentinel. The loop is user-invoked (via `/user:gsd-t-unattended`), so it's driven by a real user prompt.
- **Auto-reattach block goes at the top of `gsd-t-resume.md`**. BEFORE Step 0 (headless read-back banner) or as a new Step 0. Rationale: if the supervisor is live, everything the normal resume does is redundant — we just want to jump back into the watch loop.
- **Launch command must return within ~5 seconds.** Pre-flight + spawn + liveness check + initial status block + ScheduleWakeup call = done. If anything takes longer, something is wrong.
- **Launch is idempotent-on-detect**: if `supervisor.pid` already exists AND `kill -0` confirms alive, the launch command MUST NOT spawn a second supervisor. Print "Supervisor already running (PID X, iter N, started Y ago). Reattaching…" and schedule a watch tick instead. Singleton per project.
- **Stop command is trivial**: create the `.gsd-t/.unattended/stop` sentinel file and print one line. That's the full contract. Do not try to `kill` the supervisor directly — the sentinel is race-free and gives the supervisor a chance to finish the current worker cleanly.
- **Watch display max 6 lines** in v1 (matching the continue-here design addendum template). Keep it visually scannable across many ticks.
- **Read `run.log` tail efficiently** — last ~1KB or last 3 non-empty lines, whichever is shorter. Do not `fs.readFileSync` the entire log (could be megabytes after hours).
- **Display format uses emoji + spacing pattern from CLAUDE.md markdown table rules** — one extra space after emoji in any table cells.
- **Preserve the existing `gsd-t-resume.md` Step 0–5 sequence.** The auto-reattach block is ADDITIVE — inserted before the existing content, not replacing it. If supervisor detected → skip to watch tick. If not → normal resume flow (unchanged).

## Must Not

- **Modify `bin/gsd-t-unattended.js`**. Read-only relationship with supervisor-core files.
- **Modify `.gsd-t/.unattended/state.json`**. Read-only. Write is exclusive to supervisor-core.
- **Touch `/user:gsd-t-status` beyond a documentation mention.** Status-supervisor cross-reference is deferred to v2 or to m36-docs-and-tests if trivial.
- **Call `Bash` to run `kill`, `ps`, or other process ops directly inside the command markdown** — use the command file's existing shell-shim convention (single `bash` block with `node -e` for the dangerous bits so the operations are inline and reviewable).
- **Inline platform detection.** If a watch tick needs to distinguish macOS vs Linux vs Windows (for `kill -0` behavior, notification dispatch), it calls a helper from m36-cross-platform, not a direct `process.platform` check.
- **Spawn the supervisor via a shell one-liner that depends on shell-specific syntax** (e.g., `nohup ... &`). Use Node's `spawn` with `detached: true, stdio: 'ignore'` and `.unref()`. This works identically on macOS and Linux and is what m36-cross-platform adapts for Windows.
- **Rely on environment variables to pass state into the supervisor.** Use CLI args only. The supervisor must be reproducible from the `.gsd-t/.unattended/state.json` alone after launch.
- **Display the supervisor PID to the user prominently.** Memory `feedback_detached_servers` applies: don't silently detach a server and leave the user with a bare PID. The watch loop IS the user's visibility surface — emphasize the watch block and the stop command, not the PID.

## Must Read Before Using

### `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0
- state.json schema (status enum, field names, units) — watch display parses this
- Terminal status values (`done`, `failed`, `stopped`, `running`) — decision tree depends on them
- Resume auto-reattach handshake specification — the contract defines exactly what "live supervisor" means

### `commands/gsd-t-resume.md` (current)
- Step 0 (Headless Read-Back Banner) — the auto-reattach block must be positioned so it runs BEFORE the banner scan (if supervisor is live, we don't need the banner; if not, banner is still useful).
- Step 5 (Auto-Advance Through End of Milestone) — must NOT interfere with the auto-reattach path. Auto-advance is for in-session chained execution, not for unattended relay.

### `bin/headless-auto-spawn.js` (M35, reference only)
- `checkCompletedSessions()` pattern — the watch loop's "is there a completed session to surface?" logic is analogous in shape (scan a directory, filter by status), though watch-loop uses a singleton state file instead.

### ScheduleWakeup semantics
- Delay clamp [60, 3600] — 270s is comfortably inside the valid range
- `prompt` must be a self-contained re-invocation of the tick command, verbatim
- `reason` is one short sentence for telemetry — use "unattended tick {iter}" so logs are searchable

## Dependencies

- **Depends on**: m36-supervisor-core (state.json schema, PID/sentinel paths, run.log format)
- **Depends on**: unattended-supervisor-contract.md v1.0.0
- **Depends on**: Claude Code harness ScheduleWakeup (dynamic /loop mode)
- **Depended on by**: m36-cross-platform (launch command's spawn helper is platform-swapped there; watch block may call notify() on terminal conditions)
- **Depended on by**: m36-docs-and-tests (the 3 slash commands are the primary user-facing surface — README, CLAUDE-global template, help command, CHANGELOG all reference them)
