# Constraints: m36-cross-platform

## Must Follow

- **Zero npm deps.** Consistent with the rest of the CLI. Use only Node built-ins (`child_process`, `os`, `fs`, `path`) and spawned OS helpers (`osascript`, `notify-send`, `msg.exe`, `caffeinate`).
- **Fail gracefully on missing helpers.** If `notify-send` is not installed on a Linux host, `notify()` silently skips and returns `{ ok: false, reason: 'notify-send not found' }` — it does NOT throw. Same for every platform branch.
- **`process.platform` detection is centralized** inside this module. Every other M36 file imports `resolveClaudePath`, `notify`, etc. — they never check `process.platform` themselves.
- **Documented gaps are real code comments.** Windows sleep prevention gap, Spike C deferral, WSL2 expectations — each gets a JSDoc comment in the exported function AND a mention in the Windows caveats doc. A user reading the code must be able to find the caveat without reading the docs.
- **Test platform branches with stubs.** Unit tests substitute `process.platform` with darwin/linux/win32 and assert the right command gets assembled. Integration tests on the matching host are manual / CI-gated.
- **Keep the notification format SHORT.** One-line title + one-line message maximum. Long notifications get truncated unpredictably by OS notification centers.
- **Respect the existing `bin/gsd-t.js` style.** ANSI colors, synchronous APIs, zero dependencies, clear error messages. Match the tone.

## Must Not

- **Modify existing `bin/gsd-t.js` platform detection.** If the existing `detectPlatform()` / `detectClaudeBin()` helpers serve, import them read-only. New platform logic lives in `bin/gsd-t-unattended-platform.js`.
- **Install or require optional npm packages for notifications** (`node-notifier`, etc.). Spawning OS helpers is the contract — it stays zero-dep.
- **Assume Windows means PowerShell.** Some users will run from `cmd.exe` or Git Bash for Windows. The spawn recipe must work from any of them — use absolute paths and avoid shell-specific quoting where possible.
- **Block the supervisor on a notification failure.** Notifications are best-effort. The core loop keeps running even if `notify()` returns `{ ok: false }`.
- **Use `execSync` when `spawnSync` works.** `execSync` goes through a shell and introduces quoting hazards. `spawnSync` with an arg array is the default.
- **Hold `caffeinate` handles in the supervisor-core loop.** `preventSleep()` returns an opaque handle; supervisor-core stores it in state.json (or in-memory only), and calls `releaseSleep(handle)` on exit. This domain owns the lifecycle PRIMITIVE, not the storage.
- **Try to silence Windows UAC prompts.** If spawning detached requires elevated permissions on some Windows setups, document the requirement; do not work around it with silent UAC bypass.

## Must Read Before Using

### Node `child_process` cross-platform behavior
- `spawnSync` with `detached: true` on Windows: requires `windowsHide: true` and `stdio: 'ignore'` to truly detach without a console window. Without `windowsHide`, a cmd window flashes on launch.
- `detached: true` on Linux creates a process group leader — on SIGTERM the child continues unless the parent sends SIGTERM to the group (`process.kill(-pid)`). The supervisor is designed to OUTLIVE the parent, so this is desirable — but document it.
- `spawnSync` on Windows with `.cmd` files: must EITHER use `shell: true` OR name the `.cmd` file explicitly. Using `shell: true` re-introduces quoting hazards, so explicit `.cmd` resolution is preferred.

### Spike A + Spike D findings (.gsd-t/M36-spike-findings.md)
- Spike A confirmed `claude -p "/gsd-t-X"` works on macOS. Spike C is the Windows analog and is NOT yet executed.
- Spike D confirmed `spawnSync` captures stdout + exit code cleanly on macOS. Assume the same on Linux. Windows is the open question.

### Existing notification conventions in GSD-T
- Grep the codebase for any existing `notify-send` / `osascript` use — if none, this is the first notification surface and sets the pattern for future milestones.
- `bin/gsd-t.js` does NOT currently notify. This is new surface.

### `caffeinate` semantics
- `caffeinate -i` prevents idle sleep, `-s` prevents system sleep (requires A/C power), `-d` prevents display sleep, `-m` prevents disk sleep. For an unattended run we want `-i` at minimum (prevents idle sleep while the process runs).
- `caffeinate -w {pid}` ties caffeinate's lifetime to another PID. Use this with the supervisor PID so `caffeinate` auto-exits when the supervisor does, even if the supervisor crashes.

### `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0
- Notification level enum (`info`, `warn`, `done`, `failed`) — `notify()` maps these to platform-appropriate sound / icon
- Sleep-prevention lifecycle — who calls `preventSleep` and when

## Dependencies

- **Depends on**: m36-supervisor-core, unattended-supervisor-contract.md v1.0.0
- **Depended on by**: m36-supervisor-core (core loop imports all helpers), m36-watch-loop (launch command spawns via `spawnSupervisor`, watch uses `isAlive`), m36-docs-and-tests (Windows caveats doc owned here gets referenced from docs)
