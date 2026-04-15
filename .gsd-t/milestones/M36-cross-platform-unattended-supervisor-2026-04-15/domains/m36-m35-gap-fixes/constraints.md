# Constraints: m36-m35-gap-fixes

## Must Follow

- **Surgical edits only.** Each of the 5 command-file modifications is a local replacement of the STOP block with an `autoSpawnHeadless()` call. Do NOT refactor surrounding steps, re-number sections, or re-order commands.
- **Grep before editing.** Before any command-file edit, `grep -n "Run /clear"` the file — the exact wording may differ from the historical notes. Edit only the lines that actually contain the STOP pattern.
- **Handoff-lock is fail-safe.** If the lock file exists and is not expired, `acquireHandoffLock` fails cleanly with an actionable error — never overwrites, never force-takes. Child side's `waitForLockRelease` has a timeout (default 30s) and fails loudly if exceeded.
- **Lock files live under `.gsd-t/.handoff/`** — a new hidden subdirectory, created on first use. Matches the `.gsd-t/.unattended/` convention. Include the lock directory in the dirty-tree whitelist that m36-safety-rails owns.
- **Lock file format is minimal JSON**: `{ sessionId, parentPid, acquiredAt, releaseBy }`. Stale detection = `Date.now() > releaseBy + {grace}`. `cleanStaleLocks` removes any lock older than `maxAgeMs`.
- **Append-only tests.** The new `test/handoff-lock.test.js` and the command-file stop-message-audit test must pass alongside all existing tests (1083/1083 baseline as of Phase 0). No test removal except where a test explicitly asserted the old "Run /clear" STOP behavior — in which case the replacement is: delete the old assertion, add a new assertion for `autoSpawnHeadless` being called.
- **Pre-Commit Gate honored** — each command file edit is a doc-ripple target: update `docs/GSD-T-README.md` if the command reference advertises STOP behavior, update `CHANGELOG.md` with the M35 gap-fix section.

## Must Not

- **Touch `bin/gsd-t.js`.** Phase 0 is done.
- **Touch M35 contracts** (`headless-auto-spawn-contract.md`, `token-budget-contract.md`, etc.) except for a v1.1.0 bump ONLY if the handoff-lock primitive requires documenting new fields — and that bump belongs to m36-docs-and-tests anyway.
- **Change `autoSpawnHeadless()`'s public API.** Only wire the lock primitives around it internally. If external callers depend on the function shape, they must continue to work unchanged.
- **Rename any command file.** Command renames ripple into 4+ reference files (README, GSD-T-README, CLAUDE-global template, gsd-t-help) per CLAUDE.md pre-commit gate. Don't open that can.
- **Assume the command files still say exactly "Run /clear then /user:gsd-t-resume".** Grep first. M35 may have already softened some of these; the audit test will catch any remaining.
- **Leave dead exit codes behind.** If a command file's STOP block had `exit 11` before and the replacement uses autoSpawnHeadless without a custom exit code, remove the exit-11 branch from downstream handlers too.

## Must Read Before Using

### `bin/headless-auto-spawn.js` (M35 v2.76.10, post-Phase-0)
- `autoSpawnHeadless({ command, args, projectDir })` — signature, return value, what it writes to `.gsd-t/headless-sessions/`. THIS is the function the 5 command files will call instead of the STOP block.
- `writeContinueHereFile()` — emits the handoff file the child reads via `/gsd-t-resume`.
- `makeSessionId()` — id format that goes into the lock file.
- `markSessionCompleted()` — used by the child on completion; the lock wiring must not interfere with this.

### `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 (M35)
- Authoritative definition of the headless handoff contract. The lock wiring is an IMPLEMENTATION detail inside this contract — it does not require a new contract version unless the file format changes.

### Each of the 5 command files — grep pattern
- `grep -n "Run /clear\|/user:gsd-t-resume\|exit 11\|context runway" commands/gsd-t-{execute,wave,quick,integrate,debug}.md`
- The replacement sites are wherever a STOP message tells the user to `/clear` and invoke resume manually.

### Spike findings for context
- `.gsd-t/M36-spike-findings.md` — the "Why This Wasn't Caught" section explains why `autoSpawnHeadless` has been silently broken. Post-Phase-0 it works, so Phase 4's replacement is now safe to ship.

## Dependencies

- **Depends on**: m36-supervisor-core only for convention alignment (lock file location, state conventions). No code dependency.
- **Depends on**: m36-safety-rails for whitelist extension (include `.gsd-t/.handoff/*` in the dirty-tree whitelist — coordinate via contract).
- **Depended on by**: m36-docs-and-tests (CHANGELOG + GSD-T-README mention the seamless relay + lock primitive)
