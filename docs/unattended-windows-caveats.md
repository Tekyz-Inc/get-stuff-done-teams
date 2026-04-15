# Unattended Supervisor — Windows Caveats (v1.0.0)

**Status**: Windows support is **shipping but caveated** in v1.0.0.

**Contract reference**: `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0
**Platform module**: `bin/gsd-t-unattended-platform.js`

---

## 1. Overview

The GSD-T unattended supervisor (M36) ships cross-platform. All core supervisor
mechanics — the watch loop, state-file lifecycle, worker spawning, stop
sentinel, and safety rails — run unchanged on Windows. The darwin and linux
code paths are runtime-tested; the win32 code paths are
**implementation-complete but not runtime-tested on the dev host (macOS)**.

Three OS-integration surfaces have known limitations on Windows:

1. **Sleep prevention** — no stock `caffeinate` equivalent ships with Windows.
2. **Notifications** — `msg.exe` is a minimal fire-and-forget shim with real
   delivery restrictions.
3. **Process detach** — `spawn(..., { detached: true })` behaves differently
   from POSIX and is not a true daemonization primitive.

This document covers what works, what doesn't, the Spike C disposition, and
the recommended usage pattern. Everything below applies to `win32` only;
darwin and linux are unaffected.

---

## 2. Known Gaps

### 2.1 Sleep prevention (no-op on win32)

`preventSleep(reason)` in `bin/gsd-t-unattended-platform.js` explicitly
**returns `null` on win32** and writes a one-line notice to stderr:

```
[platform] sleep prevention not implemented on win32 (see docs/unattended-windows-caveats.md)
```

Windows has no stock command-line equivalent of macOS `caffeinate`. The
native API (`SetThreadExecutionState`) requires a C binding, which violates
the GSD-T zero-external-dependency constraint for `bin/`. `releaseSleep(null)`
is a safe no-op, so the supervisor still shuts down cleanly.

**Consequence**: if a Windows machine is configured to sleep on its default
power schedule, a long unattended run will pause (or outright fail) when the
machine sleeps. The supervisor has no way to prevent this.

**Workaround (v1)**: the user must configure Windows power settings manually
to keep the machine awake for the duration of the run. Microsoft's official
guidance covers both GUI and command-line approaches:

- [powercfg command-line options](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/powercfg-command-line-options)
- [Change power plan settings](https://support.microsoft.com/en-us/windows/change-power-mode-for-your-windows-pc-c2aff038-22f9-f46a-8ca1-ba5be2b6a7b9)

Useful examples:

```powershell
# Disable sleep while on AC power (requires admin)
powercfg /change standby-timeout-ac 0

# Disable sleep while on battery (requires admin)
powercfg /change standby-timeout-dc 0
```

### 2.2 Notifications (`msg.exe`, interactive-session only)

`notify(title, message, level)` in `bin/gsd-t-unattended-platform.js` uses
`msg.exe * "title: message"` on win32 with `windowsHide: true`. This is a
deliberate minimal fire-and-forget dependency: `msg.exe` ships with Windows
and has zero install cost.

**Restrictions**:

- `msg.exe` only delivers to **interactive Windows sessions**. If the
  supervisor is launched under a Windows Service, a non-interactive ssh
  session, or any other session without a desktop attached, `msg.exe` will
  silently drop the notification (or fail with an access error). The
  supervisor core is unaffected — the `child.on('error', ...)` handler logs
  the failure to stderr and the relay loop continues.
- `msg.exe` is not a true toast / Action Center notification. It pops a
  blocking message-box dialog into the active session. This is visible and
  audible but is not the modern Windows notification experience.

**Recommended v2 enhancement**: integrate a real toast API such as
[`BurntToast`](https://github.com/Windos/BurntToast) (a PowerShell module).
`BurntToast` requires an opt-in install, so it will remain behind a capability
check; stock installs will fall back to `msg.exe`.

### 2.3 Process detach (`detached: true` is not full daemonization)

`spawnSupervisor({ binPath, args, cwd })` uses
`spawn('node', [...], { detached: true, stdio: 'ignore', windowsHide: true })`
followed by `child.unref()`. On **POSIX** (darwin / linux) this makes the
child a new process-group leader and the supervisor survives the parent
terminal closing. On **win32** the same options produce a separate process
tree but do **not** fully detach the child from the launching console:

- Closing the launching terminal window may still deliver a console
  `CTRL_CLOSE_EVENT` to the child and terminate the supervisor.
- Signing out of the user session will terminate the child along with every
  other user process.
- There is no equivalent of POSIX `setsid()` purely from Node's `spawn`
  options.

**Workarounds**:

- Use `start /B` via a shell wrapper to launch the supervisor in a fully
  background-detached process on the current session.
- For truly-outlive-the-session runs, register the supervisor as a **Windows
  Task Scheduler** task. Task Scheduler manages its own process lifetime
  independent of the interactive session.
- Run inside **WSL2** (see §5) to get POSIX detach semantics end-to-end.

---

## 3. Spike C Disposition — Sleep Prevention Alternatives

Spike C was an exploratory investigation of Windows-native alternatives to
`caffeinate`. The question: can we keep the zero-dependency constraint and
still prevent sleep?

Three candidates were evaluated:

| Option | Mechanism | Verdict |
|--------|-----------|---------|
| `SetThreadExecutionState` Win32 API via `ffi` | Native API, exactly what caffeinate maps to. | **Reject.** Requires `ffi-napi` or equivalent — a C binding and a compiled native dep. Violates the zero-external-dependency constraint for `bin/`. |
| `powercfg` toggle | CLI that ships with Windows. `powercfg /change standby-timeout-ac 0` before run, restore after. | **Reject.** Requires administrator privileges. Persists across runs if the supervisor crashes mid-run, leaving the machine in a modified power state. Hard to guarantee restoration. |
| Task Scheduler "wake to run" / wake events | Scheduled task can force the machine to wake at interval. | **Defer.** Best user-space path but adds non-trivial scheduler management code (create task, tear down on exit, handle orphaned tasks). |

**Verdict**: **defer to v2.** v1.0.0 ships with the `null`-handle + documentation
approach described in §2.1. v2 will consider Task Scheduler integration as the
primary path, since it is the only candidate that is both user-space and
compatible with the zero-dependency constraint.

---

## 4. What Works Today on Windows

All of the following run on Windows with no caveats (pending runtime testing
on a real Windows host; implementation is complete):

- **Core supervisor process** — runs to completion, observes the state file,
  dispatches workers, honours the watch-loop cadence, and exits cleanly.
- **State file lifecycle** — atomic write, lockfile, heartbeat updates, and
  teardown all use Node built-ins and behave identically on win32.
- **Worker spawning** — `spawnWorker(projectDir, timeoutMs)` uses `claude.cmd`
  via `resolveClaudePath()` with `shell: false` and `windowsHide: true`, which
  avoids the Spike C PowerShell quoting hazard.
- **Stop sentinel** — sentinel-file detection is filesystem-based and is
  cross-platform by construction.
- **Safety rails** — `isAlive(pid)` uses Node's `process.kill(pid, 0)`, which
  implements POSIX signal-0 semantics on Windows. Liveness checks, watchdog
  timers, and stuck-worker detection all work unchanged.

Exit code table (contract §5), heartbeat contract, and the launch-handshake
file contract are all platform-agnostic and fully honoured on win32.

---

## 5. Recommended Usage Pattern on Windows

Given the gaps above, the recommended way to run the unattended supervisor on
Windows for v1.0.0 is:

1. **Run on a desktop that never sleeps.** Configure Windows power settings so
   the machine will not sleep, hibernate, or turn off the display for the
   expected duration of the run. Use `powercfg` or the Settings UI (see §2.1).
2. **Launch from an interactive PowerShell session** (not a Windows Service,
   not a non-interactive ssh session). This ensures `msg.exe` notifications
   can be delivered and that the supervisor's stderr diagnostics are visible.
3. **Monitor via the watch-tick command from the same interactive session.**
   Do not close the launching terminal until the supervisor exits — see §2.3
   for why.
4. **Consider running inside WSL2** instead of native Windows. WSL2 provides a
   full Linux userland where `bin/gsd-t-unattended-platform.js` takes the
   `linux` branch everywhere: `isAlive`, `spawnWorker`, `spawnSupervisor`, and
   `notify` all behave with POSIX semantics end-to-end. The only remaining gap
   in WSL2 is sleep prevention (linux also returns `null` from `preventSleep`
   in v1.0.0), which is still governed by the host Windows machine's power
   settings. WSL2 is currently the closest thing to the full darwin / linux
   feature set on a Windows box.

---

## 6. Summary Matrix

| Feature                  | darwin    | linux     | win32                                          |
|--------------------------|-----------|-----------|------------------------------------------------|
| `resolveClaudePath`      | `claude`  | `claude`  | `claude.cmd`                                   |
| `isAlive(pid)`           | works     | works     | works (POSIX signal-0 semantics)               |
| `spawnWorker`            | works     | works     | implementation-complete, untested on real host |
| `spawnSupervisor` detach | full      | full      | partial — console-close may kill child         |
| `preventSleep`           | works     | null (v1) | null (v1) — see §2.1 and §3                    |
| `releaseSleep`           | works     | no-op     | no-op                                          |
| `notify`                 | works     | works     | works only in interactive sessions (§2.2)      |

**v2 roadmap (non-binding)**:
- Linux: opt-in `systemd-inhibit` for sleep prevention.
- Windows: Task Scheduler integration for sleep prevention; `BurntToast`
  capability check for real toast notifications; optional Task-Scheduler-based
  daemonization path for true detachment.
