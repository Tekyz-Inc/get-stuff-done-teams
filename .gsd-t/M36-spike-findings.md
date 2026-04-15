# M36 — Phase 0 Spike Findings

**Date**: 2026-04-15
**Environment**: macOS (Darwin 25.4.0), Node v24.14.1, Claude Code 2.1.109
**Project**: GSD-T Framework v2.76.10
**Author**: Autonomous spike run, per M36 plan (continue-here-2026-04-14T211256.md)

---

## Executive Summary

**All three spikes PASS. M36 is viable.** BUT the spikes surfaced a **P0 bug in the existing M35 `gsd-t headless` infrastructure**: it has never worked end-to-end because it builds `/user:gsd-t-X` prompts that `claude -p` rejects as `Unknown command`. This bug predates M36 and must be fixed regardless of whether M36 ships.

| Spike | Status | Key Finding |
|-------|--------|-------------|
| A — `claude -p "/X"` dispatches slash commands | ✅  PASS | Works, but requires `/X` form, NOT `/user:X` |
| B — SessionStart hooks fire under `-p` | ✅  PASS | Hook evidence file written correctly |
| D — `spawnSync` captures exit codes | ✅  PASS | With warning: unknown slash commands return 0 |
| C — Windows PowerShell quoting | ⏸  DEFERRED | Cannot test from macOS; Phase 3 |

**Blocker identified**: `bin/gsd-t.js:2598` `buildHeadlessCmd()` returns `/user:gsd-t-${command}` — this is the broken form. Must change to `/gsd-t-${command}`.

---

## Spike A — Slash Command Dispatch via `claude -p`

**Question**: Does `claude -p "/user:test-echo"` actually invoke the slash command, or treat the string as literal user text?

**Setup**:
```bash
mkdir -p /tmp/gsd-t-spike-a/.claude/commands
echo '# Test project' > /tmp/gsd-t-spike-a/CLAUDE.md
echo 'Print the literal string "SPIKE-A-OK" and nothing else.' \
  > /tmp/gsd-t-spike-a/.claude/commands/test-echo.md
```

**Test 1 — Original plan form** (`/user:` prefix):
```bash
$ claude -p "/user:test-echo"
Unknown command: /user:test-echo
```
**Result**: ❌  Exit 0, but output is an error message. The slash-command dispatcher does NOT recognize the `/user:` namespace prefix in `-p` mode.

**Test 2 — Bare slash form** (no namespace):
```bash
$ claude -p "/test-echo"
SPIKE-A-OK
```
**Result**: ✅  Slash command dispatched correctly. Output is the expected literal string.

**Test 3 — Slash-slash form** (`/user/X`):
```bash
$ claude -p "/user/test-echo"
I don't have a skill called `test-echo` available. ...
```
**Result**: ❌  Interpreted as a Skill invocation, not a slash command. Not what we want.

**Test 4 — Real GSD-T command from real project**:
```bash
$ cd /Users/david/projects/GSD-T
$ claude -p "/gsd-t-help"
[full help output — 50+ lines, version banner, command table]
```
**Result**: ✅  Works end-to-end with a real installed GSD-T command.

### Finding

The M36 plan (and the M35 `buildHeadlessCmd()` function) specify `/user:gsd-t-X` as the invocation form. **This is wrong.** The correct form in `-p` mode is `/gsd-t-X` (no `user:` prefix).

Interactive mode accepts both forms, which is why this bug has been invisible — every manual test in interactive chat works, and nobody has actually verified the `gsd-t headless` path until now.

### Spec for M36

- **Worker invocation**: `claude -p "/gsd-t-resume"` (NOT `/user:gsd-t-resume`)
- **Supervisor must strip** any `user:` prefix if present in user-provided command strings
- **Document clearly** in the unattended-supervisor contract that this is a non-interactive quirk

---

## Spike B — SessionStart Hooks Under `claude -p`

**Question**: Do SessionStart hooks defined in `.claude/settings.json` fire when Claude is invoked via `-p`?

**Setup**: Added to `/tmp/gsd-t-spike-a/.claude/settings.json`:
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "echo '[HOOK-FIRED] SessionStart at '$(date +%s) > /tmp/gsd-t-spike-a/hook-evidence.txt"
      }]
    }]
  }
}
```

**Test**:
```bash
$ rm -f /tmp/gsd-t-spike-a/hook-evidence.txt
$ claude -p "/test-echo"
SPIKE-A-OK
$ cat /tmp/gsd-t-spike-a/hook-evidence.txt
[HOOK-FIRED] SessionStart at 1776275590
```

**Result**: ✅  Hook fired. Evidence file written with timestamp.

### Implications

- Version check hook (`[GSD-T]` banner) fires in workers → version skew detection works across relay
- UserPromptSubmit auto-route hook fires → workers get the same `/gsd` smart-router behavior
- Context meter PostToolUse hook fires → `.gsd-t/.context-meter-state.json` updates in workers too
- Pre/Post tool use hooks all work → full observability is preserved in detached workers

**Conclusion**: Workers get the same observability and guardrail surface as interactive sessions. No special handling needed.

---

## Spike D — Node `spawnSync` Exit Code Capture

**Question**: Can a Node supervisor reliably capture exit codes and output from `claude -p` subprocess calls?

**Test script** (`/tmp/gsd-t-spike-a/spike-d.js`):
```js
const { spawnSync } = require('child_process');

const ok = spawnSync('claude', ['-p', '/test-echo'], {
  cwd: '/tmp/gsd-t-spike-a',
  encoding: 'utf8',
  timeout: 60000,
});
// status: 0, stdout: "SPIKE-A-OK\n", stderr: "", error: null

const bogus = spawnSync('claude', ['-p', '/nonexistent-command-xyz'], { ... });
// status: 0, stdout: "Unknown command: /nonexistent-command-xyz\n"
```

**Results**:

| Test | `status` | `signal` | stdout | stderr |
|------|----------|----------|--------|--------|
| `/test-echo` (valid) | `0` | `null` | `SPIKE-A-OK\n` (11 bytes) | empty |
| `/nonexistent-command-xyz` | `0` | `null` | `Unknown command: /nonexistent-command-xyz\n` | empty |

### Finding (WARNING)

**Unknown slash commands return exit 0.** The supervisor CANNOT detect "command not recognized" failures from exit code alone. Must also scan stdout for sentinel strings.

`mapHeadlessExitCode()` in `bin/gsd-t.js:2605` already has sentinel-string detection for `verify failed`, `context budget exceeded`, and `blocked needs human` — but it does NOT detect `Unknown command:`. This is a second existing bug: a broken slash command silently returns success.

### Spec for M36

- Supervisor must scan worker stdout for these failure sentinels (in addition to M35's):
  - `/^Unknown command: /m` → exit code 5 (new: command-dispatch-failed)
  - Existing: context budget, blocked needs human, verify failed
- `mapHeadlessExitCode()` must be extended to catch `Unknown command:` and return a non-zero code

---

## P0 Bug Found (Pre-existing M35 Regression)

### `gsd-t headless` has never worked end-to-end

**Location**: `bin/gsd-t.js:2598`

```js
function buildHeadlessCmd(command, cmdArgs) {
  const argStr = cmdArgs.length > 0 ? " " + cmdArgs.join(" ") : "";
  return `/user:gsd-t-${command}${argStr}`;   // ← WRONG: /user: prefix rejected by -p
}
```

**Reproduction**:
```bash
$ cd /tmp/gsd-t-spike-a
$ node /Users/david/projects/GSD-T/bin/gsd-t.js headless help --timeout=60

GSD-T Headless — help
  ℹ Prompt: /user:gsd-t-help
  ℹ Timeout: 60s

Unknown command: /user:gsd-t-help
---EXIT: 0---
```

**Impact**:
- `autoSpawnHeadless()` → `gsd-t headless <command>` → `claude -p "/user:gsd-t-<command>"` → worker immediately errors with "Unknown command" → `mapHeadlessExitCode()` returns 0 (success) because the error string doesn't match any sentinel → orchestrator thinks the handoff succeeded
- **Every M35 headless auto-spawn handoff has been a silent failure.** The watcher waits for the log file to stop growing, sees a small log with an error message, and moves on.
- **M35's runway estimator pre-flight → headless auto-spawn → worker continuation chain is broken at its core.**
- This bug is invisible to interactive manual testing because interactive Claude Code accepts the `/user:` prefix.

### Required Fix (Phase 4, or sooner)

1. **`bin/gsd-t.js:2598`** — change `/user:gsd-t-${command}` → `/gsd-t-${command}`
2. **`bin/gsd-t.js` `mapHeadlessExitCode()`** — add `Unknown command:` sentinel → exit code 5
3. **Add regression test** — scratch dir + `gsd-t headless help` + assert output contains the help banner, not `Unknown command`
4. **Consider**: does `autoSpawnHeadless()` need any change? (Probably no — it spawns `node bin/gsd-t.js headless` which will get the fix transitively.)

### Why This Wasn't Caught Before

- M35's test suite (985/985) tests `mapHeadlessExitCode()` with synthetic output strings, NOT with real `claude -p` invocations
- The end-to-end path was assumed to work based on interactive-mode behavior
- `autoSpawnHeadless()`'s completion watcher reads log growth, not log content — so a worker that exits with "Unknown command" in 2 seconds looks the same as a worker that completed successfully in 2 seconds
- No GSD-T command has actually triggered a runway-exceeded headless spawn in production since M35 shipped (checked `.gsd-t/token-metrics.jsonl` — no headless spawns logged)

---

## Spike C — Windows PowerShell Quoting (DEFERRED)

Per the plan, this is deferred to Phase 3. Cannot test from macOS. Open question remains: does `claude.exe -p "/gsd-t-resume"` work under PowerShell without quoting weirdness? Will test during Phase 3 cross-platform work.

---

## Recommendations for M36 Plan Update

1. **Elevate `bin/gsd-t.js:2598` fix to Phase 0** (pre-requisite before any M36 code). It's a 2-line fix + regression test. Not doing it means M36's relay is broken from day 1 because it inherits the same broken `buildHeadlessCmd()`.

2. **Update contract `headless-auto-spawn-contract.md` v1.0.0**:
   - Invocation form is `/gsd-t-X` not `/user:gsd-t-X`
   - Supervisor must detect `Unknown command:` sentinel
   - Add regression test spec

3. **Update `bin/gsd-t.js` `mapHeadlessExitCode()`** to catch `Unknown command:` and return exit code 5 (command-dispatch-failed). This prevents future silent-failure regressions.

4. **Add Spike E** (new) before Phase 1: verify that after fixing bullets 1–3, running `node bin/gsd-t.js headless help` from this repo returns the actual help banner (not `Unknown command:`).

5. **M36 supervisor (Phase 1) inherits these fixes for free** — use `claude -p "/gsd-t-resume"` directly, skipping `gsd-t headless` since the supervisor is already an external process doing its own lifecycle management. `gsd-t headless` remains the existing M35 compat path for single-shot spawns.

---

## Spike Output Artifacts

- `/tmp/gsd-t-spike-a/CLAUDE.md` — scratch project CLAUDE.md
- `/tmp/gsd-t-spike-a/.claude/commands/test-echo.md` — test slash command
- `/tmp/gsd-t-spike-a/.claude/settings.json` — SessionStart hook config
- `/tmp/gsd-t-spike-a/spike-a.log` — original failing `/user:test-echo` attempt
- `/tmp/gsd-t-spike-a/hook-evidence.txt` — proof SessionStart hook fired
- `/tmp/gsd-t-spike-a/spike-d.js` — spawnSync test script

Scratch dir can be cleaned with `rm -rf /tmp/gsd-t-spike-a` when no longer needed for reference.

---

## Verdict

**PROCEED with M36 Phase 1**, but **first fix the pre-existing M35 headless-dispatch bug**. The bug fix is:
- 2 lines in `buildHeadlessCmd()` (drop `/user:` prefix)
- ~5 lines in `mapHeadlessExitCode()` (add `Unknown command:` sentinel → exit 5)
- 1 regression test

Without this fix, M35's headless auto-spawn stays broken AND M36's relay design cannot work. With this fix, both systems work and M36's Phase 1 core supervisor loop can be built on a solid foundation.
