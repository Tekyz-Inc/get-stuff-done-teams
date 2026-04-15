# Domain: m36-watch-loop

## Responsibility

Own the user-facing experience of the unattended supervisor: the 3 slash commands (`gsd-t-unattended`, `gsd-t-unattended-watch`, `gsd-t-unattended-stop`), the in-session `ScheduleWakeup` @ 270s watch loop, and the `/gsd-t-resume` Step 0 auto-reattach block. This is "everything the in-session Claude does to talk to and watch over the detached supervisor." The supervisor itself (the OS process, PID/state files) is m36-supervisor-core. This domain owns the glass — what the user sees and how the in-session conversation survives `/clear` + resume.

## Owned Files/Directories

- `commands/gsd-t-unattended.md` — NEW. Launch command. Pre-flights (reads project, detects already-running supervisor via PID check), spawns the detached supervisor via platform-appropriate invocation, verifies liveness (`kill -0` for 2s after spawn), displays initial status block, schedules first watch tick via `ScheduleWakeup(270, '/user:gsd-t-unattended-watch')`, returns.
- `commands/gsd-t-unattended-watch.md` — NEW. Watch-tick command. Stateless across firings. Reads `.gsd-t/.unattended/state.json` + `supervisor.pid`, checks liveness, renders watch block (elapsed, iter, milestone/wave/task, last exit, tail of run.log), applies terminal-condition decision tree (done/failed/stopped/crashed/else), and either prints final report OR calls `ScheduleWakeup(270, '/user:gsd-t-unattended-watch')` again.
- `commands/gsd-t-unattended-stop.md` — NEW. Stop command. Trivial — touches `.gsd-t/.unattended/stop` sentinel file, prints confirmation, returns. Supervisor picks it up between workers.
- `commands/gsd-t-resume.md` — MODIFIED. Adds Step 0 (before anything else) "Unattended Supervisor Auto-Reattach" block: if `.gsd-t/.unattended/supervisor.pid` exists AND `kill -0` succeeds AND `state.status` is not terminal, SKIP normal resume flow and invoke `/user:gsd-t-unattended-watch` directly. This is the magic that makes `/clear` + resume a no-op during a live unattended run.
- `templates/gsd-t-unattended-watch-block.md` — NEW (optional, may inline into the command file). Shared template for the 5-line watch display.

## NOT Owned (do not modify)

- `bin/gsd-t-unattended.js` — owned by **m36-supervisor-core** (this domain reads its state files but never writes to them)
- `.gsd-t/.unattended/state.json` structure / schema — defined in the contract, written by supervisor-core, read-only from here
- Safety rails (gutter detection, blocker sentinels) — gutter warnings in the watch display are fine (v2), but the DETECTION lives in **m36-safety-rails**
- Windows `.cmd` detection, notification dispatch — **m36-cross-platform** (the launch command calls a platform-agnostic spawn helper)
- Non-resume command files (status.md etc.) — this domain only touches `gsd-t-resume.md`. `/user:gsd-t-status` aware-of-supervisor behavior is deferred to v2 or handled by m36-docs-and-tests as a minor UX polish.

## Dependencies

- **Depends on**: **m36-supervisor-core** for `state.json` schema, `supervisor.pid` location, `run.log` path, `stop` sentinel path
- **Depends on**: `unattended-supervisor-contract.md` v1.0.0 (state schema authoritative)
- **Depends on**: `ScheduleWakeup` dynamic `/loop` mode availability in Claude Code harness (verified via user-confirmed design addendum, 2026-04-15)
- **Depended on by**: **m36-docs-and-tests** — the 3 slash commands are the primary user-facing documentation target (GSD-T-README, help.md, CLAUDE-global template, CHANGELOG)
- **Depended on by**: **m36-cross-platform** for `notify()` hook (called on terminal conditions inside the watch display)

## Tick Cadence (Locked)

**270 seconds** — stays inside the 5-minute Anthropic prompt cache TTL, so re-firing a watch tick reuses cached context. 300s would invalidate on every tick. Over a 24h run that's ~320 ticks. User confirmed 2026-04-15.

## Watch Tick Decision Tree (v1)

Each `/user:gsd-t-unattended-watch` firing, in order:

1. If `.gsd-t/.unattended/supervisor.pid` does NOT exist → supervisor cleanly exited. Read final `state.json`, print final report, STOP rescheduling.
2. Read PID. `kill -0 {pid}`:
   - fail → supervisor crashed unexpectedly. Print diagnostics (last run.log tail, state.json snapshot, "supervisor is no longer running"), STOP.
   - ok → proceed.
3. Read `state.json`:
   - `status === 'done'` → print final success report, STOP.
   - `status === 'failed'` → print failure summary + log path, STOP.
   - `status === 'stopped'` → print user-stop confirmation, STOP.
   - else → render watch block (Running state).
4. If Running: `ScheduleWakeup(270, '/user:gsd-t-unattended-watch', reason='unattended tick n')` and end turn.

## Canonical User Flow (from continue-here design addendum)

```
/user:gsd-t-prd          ← interactive
/user:gsd-t-feature      ← interactive
/user:gsd-t-milestone    ← interactive
/user:gsd-t-unattended   ← launches detached supervisor, starts watch loop
[walk away 24h; watch ticks every 4.5 min; /clear freely]
[notification fires on done]
/user:gsd-t-status       ← inspect completed run
```

## Out of Scope (v1)

- Rich TUI / dashboard — v1 prints plain text blocks, no ANSI animation
- Gutter-health display in watch block — detection lives in safety-rails; display hook is a v2 add-on
- Cost projection, runway estimation inside watch display — state.json carries the numbers (supplied by supervisor); watch just displays them
- `/user:gsd-t-status` aware-of-supervisor cross-reference — deferred to Phase 4 or a later patch
- Multi-supervisor visibility (one project, multiple runs) — v1 is singleton; PID file collision means "already running, refusing"
