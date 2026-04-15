# Domain: m36-supervisor-core

## Responsibility

Own the core detached supervisor process that spawns fresh `claude -p` workers in a relay to run the active milestone DEFINED → COMPLETED over 24h+ without human intervention. This is the long-running OS process that survives `/clear`, `/compact`, and terminal closes. It writes state files, reads sentinel files, and enforces the basic "while (!done) spawnWorker()" loop on the happy path only. Safety rails, cross-platform quirks, and user-facing UX are OTHER domains' responsibility — this domain delivers a supervisor that works end-to-end on macOS under healthy conditions and can be composed with the rest.

## Owned Files/Directories

- `bin/gsd-t-unattended.js` — NEW. Main supervisor binary. ~300-400 lines. Spawns workers via `spawnSync('claude', ['-p', '/gsd-t-resume'], …)`, loops until terminal condition, updates state file, handles PID lifecycle, writes `run.log`.
- `.gsd-t/.unattended/` — NEW state directory layout (created by supervisor on first run):
  - `supervisor.pid` — PID of the running supervisor process (integer, one line)
  - `state.json` — live state snapshot (schema defined in `unattended-supervisor-contract.md`): status, iter, last_exit, started_at, last_tick, milestone, wave, task, estimated_remaining, etc.
  - `run.log` — append-only worker output log (redirected stdout+stderr of every spawned worker, prefixed with iter/timestamp)
  - `stop` — sentinel file (touched by user via `/user:gsd-t-unattended-stop`; supervisor checks between workers)
- `test/unattended-supervisor.test.js` — NEW. Unit + smoke tests for the supervisor loop (see Testing Strategy in `unattended-supervisor-contract.md`). Exit code mapping, state file writes, PID lifecycle, stop-sentinel detection, happy-path smoke via shim worker.

## NOT Owned (do not modify)

- `commands/gsd-t-unattended*.md` — owned by **m36-watch-loop** domain
- `commands/gsd-t-resume.md` Step 0 auto-reattach block — owned by **m36-watch-loop** domain
- Git branch isolation, dirty-tree check, gutter detection, blocker sentinels, timeouts, corruption guards — owned by **m36-safety-rails** domain
- Windows `.cmd` detection, notification matrix, `caffeinate`, PowerShell quoting — owned by **m36-cross-platform** domain
- `bin/gsd-t.js:2596-2625` (`buildHeadlessCmd` / `mapHeadlessExitCode`) — already fixed in M36 Phase 0; supervisor may IMPORT them but must not re-edit them
- `bin/headless-auto-spawn.js` — owned by **m36-m35-gap-fixes** domain (Phase 4 adds `bin/handoff-lock.js` parent/child race guard here)
- `docs/*`, `README.md`, `CHANGELOG.md`, `package.json` version bump, `CLAUDE.md` — owned by **m36-docs-and-tests** domain

## Dependencies

- **Depends on**: M36 Phase 0 fix (`bin/gsd-t.js` `buildHeadlessCmd` dropping `/user:` prefix, `mapHeadlessExitCode` exit 5 sentinel) — already merged (commit 6bc2129). Imports `mapHeadlessExitCode` from `bin/gsd-t.js` to interpret worker exit codes consistently.
- **Depends on**: `unattended-supervisor-contract.md` v1.0.0 — must exist and be annotated before T1 begins (contract owner: shared across m36-supervisor-core and m36-watch-loop; author: partition phase)
- **Depended on by**: **m36-watch-loop** for state file schema (watch ticks read `state.json` + `supervisor.pid`), stop-sentinel path, and `run.log` tail location
- **Depended on by**: **m36-safety-rails** — safety rails layer onto the core loop as composable checks (`checkGitBranch()`, `checkGutter()`, etc. called from the supervisor's outer loop)
- **Depended on by**: **m36-cross-platform** — platform branches swap the `spawn` invocation and add `notify()` / `caffeinate` wrappers around the core loop
- **Depended on by**: **m36-m35-gap-fixes** Phase 4 shared lock-file primitives (`bin/handoff-lock.js`) are used here for PID lifecycle race-free-ness

## Canonical Happy-Path Loop (v1, macOS, no safety rails, no cross-platform)

```js
// bin/gsd-t-unattended.js — sketch, NOT final
const { spawnSync } = require('child_process');
const { mapHeadlessExitCode } = require('./gsd-t.js');
const state = initState();               // writes supervisor.pid, state.json
while (!isDone(state) && !stopRequested()) {
  state.iter++;
  writeState(state);
  const t0 = Date.now();
  const res = spawnSync('claude', ['-p', '/gsd-t-resume'], {
    cwd: state.projectDir, encoding: 'utf8', timeout: HOUR_MS,
  });
  appendRunLog(state, res);
  state.last_exit = mapHeadlessExitCode(res.stdout, res.status);
  state.last_elapsed = Date.now() - t0;
  if (state.last_exit === 0 && isMilestoneComplete(state)) { state.status = 'done'; break; }
  if (state.last_exit === 4) { state.status = 'failed'; break; }           // unrecoverable
  if (state.last_exit === 5) { state.status = 'failed'; break; }           // dispatch broken
  // else: loop — safety rails + gutter detection are separate domains
}
finalizeState(state);                     // removes PID file, leaves state.json terminal
```

## Out of Scope (v1)

- Multi-milestone chaining — supervisor targets one milestone at a time; done = milestone COMPLETED, not backlog empty
- AI-driven milestone selection or dynamic replanning — the supervisor executes `/gsd-t-resume` and trusts the milestone to drive itself
- Remote/cloud supervisor — strictly local OS process
- Windows-specific paths beyond the spawn invocation — isolated into m36-cross-platform
- Worker output pretty-printing, charts, TUI — watch loop domain owns UX
