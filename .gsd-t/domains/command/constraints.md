# Constraints: command

## Must Follow
- `commands/gsd-t-visualize.md`: pure markdown, no frontmatter, ≤ 200 lines
- Step 0 self-spawn subagent pattern with OBSERVABILITY LOGGING (mandatory per CLAUDE.md — copy exact pattern from gsd-t-execute.md)
- Emoji table alignment: extra space after emoji in table cells (CLAUDE.md convention)
- Count change: all references to "47 commands" → "48 commands", "43 GSD-T" → "44 GSD-T"
- `bin/gsd-t.js`: zero external dependencies — add dashboard files to UTILITY_SCRIPTS array (same pattern as gsd-t-event-writer.js addition in M14)
- Server spawn: use `child_process.spawn()` with `detached: true` and `stdio: 'ignore'`; call `child.unref()` to allow parent process to exit; write PID to `.gsd-t/dashboard.pid`
- Browser open: `open` (macOS), `xdg-open` (Linux), `start` (Windows) — use `child_process.exec()` with platform detection; same pattern as any existing OS-detection in bin/gsd-t.js if present
- Write `command_invoked` event via gsd-t-event-writer.js (observability)

## Must Not
- Modify files outside owned scope (server.js and dashboard.html are owned by other domains)
- Add external npm dependencies to bin/gsd-t.js
- Create a command that blocks the calling agent (server must be detached)
- Exceed 200 lines in the command file

## Must Read Before Using
- `commands/gsd-t-execute.md` — OBSERVABILITY LOGGING block pattern to copy exactly
- `commands/gsd-t-health.md` — Step 0 self-spawn subagent pattern
- `bin/gsd-t.js` lines 520-540 — UTILITY_SCRIPTS array and installUtilityScripts() pattern
- `bin/gsd-t.js` — OS platform detection pattern (if any exists for open/start/xdg-open)
- `.gsd-t/contracts/dashboard-server-contract.md` — server flags and PID file location

## Dependencies
- Depends on: server domain (gsd-t-dashboard-server.js must exist before documenting it)
- Depends on: dashboard domain (gsd-t-dashboard.html must exist before documenting it)
- Depended on by: nothing (leaf domain)

## External References (locked dispositions)
- `scripts/gsd-t-dashboard-server.js` (from server domain) → USE (spawn it as child process)
- `scripts/gsd-t-dashboard.html` (from dashboard domain) → USE (installed alongside server)
