# Domain: m36-m35-gap-fixes

## Responsibility

Close the two M35 gaps that the deep-research chain surfaced but M35 itself didn't fix: (a) replace hardcoded "Run /clear then /user:gsd-t-resume" STOP messages in command files with `autoSpawnHeadless()` invocations so the relay-of-fresh-sessions flow is seamless, and (b) add `bin/handoff-lock.js` — a mechanical sentinel primitive that prevents parent/child race conditions in M35's existing `headless-auto-spawn.js` path. These fixes are small in LOC but high in leverage: they complete M35's unattended story and make M36's supervisor interoperable with M35's single-shot headless path.

Phase 0 already fixed the other critical M35 gap (the `/user:` prefix bug). This domain owns the remaining two.

## Owned Files/Directories

- `bin/handoff-lock.js` — NEW. Tiny module (~100 lines) exporting:
  - `acquireHandoffLock(projectDir, sessionId)` — creates `.gsd-t/.handoff/lock-{sessionId}` with timestamp + parent PID. Returns a release handle. Fails if an unexpired lock already exists.
  - `releaseHandoffLock(handle)` — deletes the lock file.
  - `waitForLockRelease(projectDir, sessionId, timeoutMs)` — polling helper for the child side to confirm the parent has released before proceeding.
  - `cleanStaleLocks(projectDir, maxAgeMs)` — janitor for crashed sessions.
- `commands/gsd-t-execute.md` — MODIFIED. Step 706 area: current "Run /clear" STOP block → call `autoSpawnHeadless()` (M35 function in `bin/headless-auto-spawn.js`) with the continue-here file, return without the manual STOP. Exact line may have drifted since 2026-04-14; grep for "Run /clear" in the step text.
- `commands/gsd-t-wave.md` — MODIFIED. Same pattern — any "Run /clear" STOP block replaced.
- `commands/gsd-t-quick.md` — MODIFIED. Same.
- `commands/gsd-t-integrate.md` — MODIFIED. Same.
- `commands/gsd-t-debug.md` — MODIFIED. Same.
- `bin/headless-auto-spawn.js` — MODIFIED (minimal). Wire `acquireHandoffLock` / `releaseHandoffLock` into `autoSpawnHeadless()` around the parent-side write-continue-here → spawn-child transition. Child side's first action is `waitForLockRelease` then `acquireHandoffLock` to claim ownership. This prevents the race where the child starts reading a partially-written continue-here file.
- `test/handoff-lock.test.js` — NEW. Acquire/release/waitForRelease/cleanStale unit tests + a simulated parent-child race scenario using two timers.
- `test/command-files-stop-message-audit.test.js` — NEW (or append to `test/filesystem.test.js`). Grep-based test asserting that after this milestone, no command file in `commands/` contains the literal string `Run /clear` outside of historical-prose comments.

## NOT Owned (do not modify)

- `bin/gsd-t.js` — Phase 0 already fixed `buildHeadlessCmd` and `mapHeadlessExitCode`. Do not touch again.
- `bin/gsd-t-unattended.js` — m36-supervisor-core. The new supervisor uses its OWN direct `spawn` path, not `autoSpawnHeadless`. Handoff-lock may still be useful there for PID-file race-free-ness, but that's an import-and-reuse, not a scope change.
- `bin/model-selector.js`, `bin/runway-estimator.js`, `bin/token-telemetry.js`, `bin/token-optimizer.js` — M35 deliverables; untouched by this domain.
- `docs/*` — owned by m36-docs-and-tests. This domain flags doc-ripple targets in its completion notes but does not edit docs.

## Dependencies

- **Depends on**: M35's `bin/headless-auto-spawn.js` `autoSpawnHeadless()` function — already exists and works post-Phase 0 fix. This domain wires a lock primitive INTO it.
- **Depends on**: Phase 0 fix (`/gsd-t-X` form + `Unknown command:` sentinel) — already committed. Without it, `autoSpawnHeadless()` would still be silently broken.
- **Depended on by**: m36-supervisor-core (may import `handoff-lock.js` for its own PID lifecycle, optional)
- **Depended on by**: m36-docs-and-tests (docs must reference the new seamless relay behavior and the lock primitive)

## Scope of "Replace Run /clear"

The literal replacement pattern, per command file:

**Before** (current M35 post-Phase-0):
```
If runway is insufficient:
  1. Write continue-here file via writeContinueHereFile()
  2. Print: "⚠ Context runway exceeded. Run /clear then /user:gsd-t-resume to continue."
  3. Exit with code 11.
```

**After** (M36 Phase 4):
```
If runway is insufficient:
  1. Write continue-here file via writeContinueHereFile()
  2. Call autoSpawnHeadless({command, args, projectDir}) — spawns a fresh claude -p worker
     that auto-resumes via /gsd-t-resume in a new process. User never types /clear.
  3. Print: "⚠ Context runway exceeded — handing off to a fresh headless session (ID: {id})."
  4. Return cleanly (do NOT exit with a special code; the handoff is the success path).
```

The 5 affected command files may have drifted in exact wording since the research pass; the actual sweep MUST grep for the `Run /clear` string and replace each occurrence.

## Out of Scope

- Changing the M35 contract `headless-auto-spawn-contract.md` v1.0.0 — this domain implements against the existing contract, not a new version. If the lock primitive requires a contract amendment, it's a v1.1.0 bump documented in m36-docs-and-tests.
- Refactoring `bin/headless-auto-spawn.js` beyond the minimal lock wire-in — keep the change surgical.
- Merging M35's single-shot headless path into the M36 unattended supervisor — they remain separate paths serving different purposes (single-shot runway handoff vs. long-running relay).
