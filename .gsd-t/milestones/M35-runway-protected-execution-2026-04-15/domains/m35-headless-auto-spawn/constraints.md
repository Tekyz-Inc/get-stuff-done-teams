# Constraints: m35-headless-auto-spawn

## Hard constraints

1. **Interactive session never blocked**: Child process must be detached (`detached: true`, `stdio: 'ignore'`, `unref()`). The interactive session must immediately return control.
2. **User never sees `/clear`**: If this domain's implementation fails such that the only recovery is `/clear`, the failure is logged, surfaced loudly, and captured as a blocker — not treated as normal behavior. The one exception is a catastrophic auto-spawn failure where the fallback message is "headless auto-spawn failed, checkpointing — please run /clear and /user:gsd-t-resume." This is the ONLY place a `/clear` prompt is acceptable, and it means something is broken.
3. **State preservation on handoff**: Debug mid-loop handoff must preserve hypothesis, last fix, and last test output. Losing state is worse than not handing off.
4. **Graceful degradation on non-macOS**: Notification code must skip silently on Linux/Windows — no crash.
5. **No polling loops in interactive session**: The read-back banner fires on the next command invocation, not via a background polling loop.

## File boundaries

- **OWNED**: `bin/headless-auto-spawn.js`, `test/headless-auto-spawn.test.js`, `test/runway-debug-handoff.test.js`, `.gsd-t/contracts/headless-auto-spawn-contract.md`, `.gsd-t/headless-sessions/`
- **EDITED**: `commands/gsd-t-debug.md` (mid-loop handoff), `commands/gsd-t-resume.md` (read-back check), potentially `bin/check-headless-sessions.js` as a shared helper
- **READ ONLY**: `.gsd-t/debug-ledger.jsonl` (M29), `.gsd-t/.context-meter-state.json`
- **DO NOT TOUCH**: `bin/runway-estimator.js` (coordinates via contract)

## Testing

- ~13 new tests (8 auto-spawn + 5 debug handoff)
- Smoke test is the acceptance gate — if the end-to-end flow doesn't work, the domain is not done

## Quality gates that cannot be skipped

- Red Team on T1 (child process lifecycle is subtle — detach bugs are easy to miss and catastrophic)
- Red Team on T3 (state preservation across handoff — losing hypothesis context breaks M29 invariants)
- Red Team on T5 (end-to-end smoke — if this fails, M35 doesn't ship)
