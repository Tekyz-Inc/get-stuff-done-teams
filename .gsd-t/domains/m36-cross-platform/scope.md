# Domain: m36-cross-platform

## Responsibility

Own every part of the unattended supervisor that differs across macOS, Linux, and Windows. This domain isolates platform branches into a single module so that supervisor-core, safety-rails, and watch-loop can stay platform-agnostic. It delivers: platform-aware process spawning (`claude.cmd` on Windows), the desktop notification matrix (`osascript` / `notify-send` / `msg.exe`), sleep prevention (`caffeinate` on macOS; documented gap on Windows), and the closing loop on Spike C (PowerShell quoting for `claude -p "/gsd-t-X"`).

## Owned Files/Directories

- `bin/gsd-t-unattended-platform.js` — NEW. Module exporting:
  - `spawnWorker(projectDir, timeoutMs)` — invokes `claude` (or `claude.cmd` on Windows) with `-p '/gsd-t-resume'`, returns `{ status, stdout, stderr, signal }`. Uses `spawnSync`.
  - `spawnSupervisor(nodePath, supervisorScript, args, projectDir)` — the detached-launch primitive, with the right `detached: true, stdio: 'ignore'` recipe per platform.
  - `notify(title, message, level)` — dispatches `osascript -e 'display notification …'` on darwin, `notify-send` on linux, `msg.exe` or PowerShell toast on win32. Silently skips if the helper binary is missing.
  - `preventSleep()` / `releaseSleep()` — wraps `caffeinate -i` on darwin (returns a handle to kill later), no-op with warning on linux (documented limitation), no-op with warning on win32 (documented gap per Section 3 of the plan).
  - `resolveClaudePath()` — returns `'claude'` on unix, `'claude.cmd'` on win32 (or full path from PATH resolution).
  - `isAlive(pid)` — `process.kill(pid, 0)` with a try/catch; cross-platform.
- `test/unattended-platform.test.js` — NEW. Unit tests per exported function. Platform branches tested via `process.platform` stub (or test matrix with skip-if-not-applicable).
- `docs/unattended-windows-caveats.md` — NEW (or a section inside `docs/infrastructure.md`, per doc-ripple domain's call). Documents the Windows sleep-prevention gap, PowerShell quoting edge cases from Spike C, `claude.cmd` path detection, and the Task Scheduler alternative for v2.

## NOT Owned (do not modify)

- `bin/gsd-t-unattended.js` (main loop) — supervisor-core. This domain EXPORTS; it does not patch the loop.
- `bin/gsd-t-unattended-safety.js` (safety rails) — safety rails. If safety rails need platform-specific info, they call helpers from THIS domain.
- Slash command files (`commands/gsd-t-unattended*.md`) — watch-loop. If a command needs a platform branch (rare — launch detach syntax differs), it imports from this domain.
- Worker output parsing, exit-code mapping — handled by `mapHeadlessExitCode` in `bin/gsd-t.js`. This domain does NOT re-parse stdout.
- `bin/gsd-t.js` `detectPlatform`, `detectClaudeBin`, any existing platform utility — reuse where possible, but new platform logic belongs in `gsd-t-unattended-platform.js` to keep the unattended feature self-contained.

## Spike C Closure (Deferred from Phase 0)

Spike C is the Windows PowerShell quoting question: does `claude.cmd -p "/gsd-t-resume"` dispatch the slash command correctly, given PowerShell's quoting and .cmd shim behavior? Spike A proved the `-p` slash-command path works on macOS; C must confirm the same on Windows BEFORE Phase 3 shipping. This domain owns executing Spike C and folding its results into `spawnWorker()` and `docs/unattended-windows-caveats.md`.

Spike C cannot be executed on macOS — it requires a Windows test host. Execution will likely be remote (Windows VM or GitHub Actions `windows-latest` runner). If no Windows host is available at implementation time, this domain MUST document the assumption and flag it as a v1 shipping risk rather than silently skipping.

## Dependencies

- **Depends on**: m36-supervisor-core (the main loop imports `spawnWorker`, `spawnSupervisor`, `notify`, `preventSleep`/`releaseSleep`, `isAlive`)
- **Depends on**: unattended-supervisor-contract.md v1.0.0 (notification levels, sleep-prevention semantics documented there)
- **Depended on by**: m36-supervisor-core (imports all platform helpers)
- **Depended on by**: m36-watch-loop (launch command uses `spawnSupervisor`; watch ticks use `isAlive`)
- **Depended on by**: m36-docs-and-tests (Windows caveats doc is part of the final ripple)

## Out of Scope (v1)

- Windows Task Scheduler integration for long-horizon runs — documented as v2 option, not implemented
- WSL2 path translation — documented as supported via "run inside WSL, supervisor sees Linux"; no special code
- Linux systemd unit generation — documented, not generated
- macOS `launchd` plist generation — same
- Mobile notification delivery, Slack, email — out of v1; only desktop notifications
- GUI-based configuration — unattended is CLI-only
