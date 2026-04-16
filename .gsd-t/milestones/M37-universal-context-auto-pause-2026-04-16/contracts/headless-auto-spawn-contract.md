# Contract: Headless Auto-Spawn

## Version: 1.0.0
## Status: ACTIVE
## Owner: m35-headless-auto-spawn
## Consumers: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-resume.md`, `commands/gsd-t-status.md`, `bin/runway-estimator.js` (conceptual — handoff target), `bin/check-headless-sessions.js` (M35 Wave 4)

---

## Purpose

`bin/headless-auto-spawn.js` is the **detached headless continuation launcher** for GSD-T. When the runway estimator refuses a run (projected context ≥ 85%), the calling command invokes `autoSpawnHeadless()` to spawn a detached child process running `gsd-t headless {command} --log`. The interactive session never blocks on the child — `child.unref()` ensures the terminal is returned to the user immediately.

On child completion, a macOS notification fires (T2) and the session file is updated to `status: "completed"`. The next invocation of `gsd-t-resume` or `gsd-t-status` surfaces the completed session via a read-back banner (T4).

**M35's load-bearing guarantee**: **the user is never asked to `/clear` or `/compact`.** When runway is exhausted, work pivots to headless silently and transparently. The interactive session remains idle for other work.

---

## Core Principles

1. **Interactive session is never blocked.** `child.unref()` + `detached: true` + `stdio: ['ignore', fd, fd]` guarantee the parent can return immediately.
2. **Zero prompts.** No interactive dialogs, no `readline`, no `/clear` suggestion. On refusal the caller prints a ⛔ banner and the headless child takes over.
3. **Session discoverability.** Every spawn writes a JSON file to `.gsd-t/headless-sessions/{id}.json` so the read-back banner can surface completed runs.
4. **macOS-first notifications with graceful degradation.** `osascript` fires on darwin; on other platforms the notification path is a no-op, not a crash.
5. **Zero external dependencies.** Node.js built-ins only (`fs`, `path`, `child_process`).

---

## API

### `autoSpawnHeadless(opts)` → `{id, pid, logPath, timestamp}`

**Input**:

```typescript
{
  command: string,            // GSD-T command (with or without gsd-t- prefix)
  args?: string[],            // additional args passed to the headless command
  continue_from?: string,     // path hint for the child to resume from (default ".")
  projectDir?: string,        // defaults to process.cwd()
  context?: object            // optional pre-built context snapshot for continue-here
}
```

**Behavior**:

1. Generates a session id: `gsd-t-{command-basename}-{YYYY-MM-DD}-{HH-MM-SS}`.
2. Ensures `.gsd-t/headless-sessions/` and `.gsd-t/` exist.
3. Opens a log file at `.gsd-t/headless-{id}.log` and passes the fd to the child's stdout and stderr.
4. Spawns `node bin/gsd-t.js headless {command-basename} [args...] --log` with `detached: true` and `child.unref()`.
5. Writes the session JSON file and a context snapshot JSON file.
6. Installs a poll-based completion watcher (T2) that fires a macOS notification and updates the session file when the child exits.
7. Returns the session descriptor immediately. The parent process is free to continue or exit.

**Return**:

```typescript
{
  id: string,         // e.g., "gsd-t-execute-2026-04-15-01-23-45"
  pid: number,        // detached child PID (0 if spawn failed)
  logPath: string,    // relative path to .gsd-t/headless-{id}.log
  timestamp: string   // ISO 8601 spawn time
}
```

**Errors**: throws only on invalid `command` (missing or not a string). Everything else is best-effort — spawn failures return `pid: 0`.

### `makeSessionId(command, [now])` → `string`

Pure helper exported for tests. Strips the `gsd-t-` prefix if present and appends a date-time stamp.

### `writeSessionFile(projectDir, session)` → `string` (path)

Writes the session JSON file for a given session object. Used by `autoSpawnHeadless` and by tests.

### `writeContinueHereFile(projectDir, id, [context])` → `string` (path)

Writes the `{id}-context.json` snapshot used by the headless child to resume state.

### `markSessionCompleted(projectDir, id, {exitCode, endTimestamp})` → `void`

T2 completion hook. Updates the session file in place to `status: "completed"` and records `exitCode` + `endTimestamp`. Idempotent.

---

## Session File Schema

`.gsd-t/headless-sessions/{id}.json` — pretty-printed JSON, one object per file:

```json
{
  "id": "gsd-t-execute-2026-04-15-01-23-45",
  "pid": 48123,
  "logPath": ".gsd-t/headless-gsd-t-execute-2026-04-15-01-23-45.log",
  "startTimestamp": "2026-04-15T01:23:45.000Z",
  "command": "gsd-t-execute",
  "args": [],
  "status": "running",
  "continueFromPath": ".",
  "surfaced": false
}
```

On completion (T2 watcher):

```json
{
  ...,
  "status": "completed",
  "exitCode": 0,
  "endTimestamp": "2026-04-15T02:07:12.000Z"
}
```

After the read-back banner surfaces the session (T4):

```json
{
  ...,
  "surfaced": true
}
```

| Field | Type | Nullable | Semantics |
|---|---|---|---|
| `id` | string | no | Slug — primary key. |
| `pid` | integer | no | Detached child PID. `0` if spawn failed. |
| `logPath` | string | no | Path to the headless log file, relative to `projectDir`. |
| `startTimestamp` | ISO 8601 | no | Spawn time. |
| `endTimestamp` | ISO 8601 | yes | Present only after the completion watcher fires. |
| `command` | string | no | Original command (may include `gsd-t-` prefix). |
| `args` | string[] | no | Additional args passed to the headless command. |
| `status` | enum `"running"\|"completed"\|"failed"` | no | Lifecycle state. |
| `exitCode` | integer | yes | Present only after completion. `0` on clean exit. |
| `continueFromPath` | string | no | Path hint used by the child to resume state. |
| `surfaced` | boolean | no | `false` until the read-back banner has shown this session; `true` afterwards. |

---

## Continue-Here Context Snapshot

`.gsd-t/headless-sessions/{id}-context.json` — best-effort snapshot of GSD-T state at handoff time:

```json
{
  "capturedAt": "2026-04-15T01:23:45.000Z",
  "progress": "# GSD-T Progress\n...",
  "currentDomain": null,
  "pendingTasks": [],
  "lastDecisionLogEntry": "- 2026-04-15 01:22: M35 Wave 3 RE-T1 complete",
  "currentWave": null
}
```

Callers MAY pass their own `context` object via `opts.context` to override the default snapshot with more precise state (e.g., the exact task list the headless child should execute).

---

## Notification Channel

**Platform**: macOS (`darwin`).

**Command**:

```bash
osascript -e 'display notification "GSD-T headless run complete: {id}" with title "GSD-T" subtitle "{command}"'
```

**Invocation**: `spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" })` followed by `child.unref()`.

**Graceful degradation**: on `process.platform !== "darwin"`, the notification call is a no-op. No crash, no warning — silent skip.

**Future platforms**: Linux (`notify-send`) and Windows (`msg`) are out of scope for v1.0.0. Adding them is a v1.1.0 minor bump, not a breaking change.

---

## Completion Watcher Mechanism

Because the child is `detached: true` + `unref()`, the parent cannot hold a reference to it. The watcher is therefore **poll-based**, using `process.kill(pid, 0)` as a liveness probe:

- Poll interval: **2 seconds**.
- Maximum wait: **1 hour** (safety cap — after that the watcher exits without firing a notification).
- On liveness probe failure (ESRCH / EPERM), the watcher reads the tail of the log file to guess the exit code and calls `markSessionCompleted()`.
- Exit code guessing is best-effort: looks for `exit code: N` or `exit code N` in the log. Defaults to `0` if not found.

The watcher timer is `unref()`ed so the parent process can exit without waiting.

**Known limitation**: PID reuse can theoretically cause a false positive ("process still alive") if the OS recycles the PID. In practice, the 2-second polling cadence and the monotonic nature of session IDs make this negligible.

---

## Handoff Protocol (from runway-estimator)

When `runway-estimator.estimateRunway()` returns `recommendation: "headless"`, the calling command file:

1. Prints the ⛔ banner (from `runway-estimator-contract.md` v1.0.0).
2. Calls `require('./bin/headless-auto-spawn.js').autoSpawnHeadless({ command, args, continue_from: '.' })`.
3. Substitutes the returned `id` and `logPath` into the final two lines of the ⛔ banner.
4. Exits cleanly (`process.exit(0)`).

The headless child continues in a fresh context, uses the continue-here context snapshot to resume state, and writes its output to the log file.

---

## Read-Back Banner (T4 — Wave 4)

`bin/check-headless-sessions.js` (M35 Wave 4) exports `checkCompletedSessions(projectDir)` → array of unsurfaced completed sessions. Called from:

- `commands/gsd-t-resume.md` Step 1 (first thing in a resume invocation)
- `commands/gsd-t-status.md` (before the main status table)

After surfacing, each listed session has `surfaced: true` written back to its JSON file so the banner does not re-appear.

**No polling loop** — the check fires only on command invocation.

---

## Never Prompts the User

This module guarantees zero interactive prompts. Specifically:

- `autoSpawnHeadless` returns synchronously after spawning.
- The completion watcher uses `setInterval` + `unref` — never blocks the parent.
- `osascript` is spawned `detached` + `stdio: "ignore"` — no TTY interaction.
- On spawn failure, `pid: 0` is returned and the caller can choose to fall back to `clear-and-resume` messaging — still no interactive prompt.

---

## Integration Points

| Consumer | Uses | Purpose |
|---|---|---|
| `commands/gsd-t-execute.md` Step 0 | `autoSpawnHeadless()` on runway refusal | Hand off execute to headless |
| `commands/gsd-t-wave.md` Step 0 | `autoSpawnHeadless()` on runway refusal | Hand off wave to headless |
| `commands/gsd-t-integrate.md` Step 0 | `autoSpawnHeadless()` on runway refusal | Hand off integrate to headless |
| `commands/gsd-t-quick.md` Step 0 | `autoSpawnHeadless()` on runway refusal | Hand off quick task to headless |
| `commands/gsd-t-debug.md` Step 0 + between-iteration | `autoSpawnHeadless()` on runway refusal | Mid-loop debug handoff with state persistence (HAS-T3) |
| `commands/gsd-t-resume.md` Step 1 | `checkCompletedSessions()` (Wave 4) | Read-back banner |
| `commands/gsd-t-status.md` | `checkCompletedSessions()` (Wave 4) | Read-back banner in status output |

---

## Relationship to Other Contracts

| Contract | Relationship |
|---|---|
| `headless-contract.md` (M23) | **Reuses headless invocation pattern.** `autoSpawnHeadless` invokes `gsd-t headless` via `node bin/gsd-t.js headless {command} --log` — the same entry point as interactive headless runs. Does not duplicate the CLI contract. |
| `runway-estimator-contract.md` v1.0.0 | **Handoff source.** The runway estimator's `recommendation: "headless"` path drives callers to invoke `autoSpawnHeadless`. |
| `token-budget-contract.md` v3.0.0 | **Indirect.** The stop band (85%) in token-budget triggers the runway refusal that invokes this module. |

---

## Frozen API for v1.x

- Function signature `autoSpawnHeadless(opts)` is frozen.
- Return shape `{id, pid, logPath, timestamp}` is frozen.
- Session file schema (10 fields) is frozen; new fields allowed in v1.x minor bumps.
- Session ID format `gsd-t-{command}-{YYYY-MM-DD}-{HH-MM-SS}` is frozen.
- macOS notification payload format is frozen; other platforms may be added in v1.1+.

Breaking changes (function rename, return shape change, session schema field removal) require a v2.0.0 bump.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | M35 / 2026-04-15 | Initial contract. Frozen `autoSpawnHeadless` API, session file schema, macOS notification channel, poll-based completion watcher (2s interval, 1h cap), handoff protocol from runway-estimator. T2 notification integration, T3 debug mid-loop handoff, and T4 read-back banner documented. |
