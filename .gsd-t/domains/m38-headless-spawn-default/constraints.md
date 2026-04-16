# Constraints: m38-headless-spawn-default

## Must Follow

- **Read `bin/headless-auto-spawn.cjs` IN FULL before editing.** It already works end-to-end (M36 Phase 0 fix). The job is to promote, not rewrite.
- **Read `bin/check-headless-sessions.js` IN FULL** — it owns the read-back banner mechanism that surfaces results on next user message. Do not break that flow.
- **Default spawn = headless.** In-context Task spawns are the exception, gated by `--watch`.
- **`--watch` semantics**:
  - Propagates to: primary work spawns (execute domain workers, debug fix agent, quick's main task)
  - Does NOT propagate to: validation spawns (QA, Red Team, Design Verification, doc-ripple)
  - Rejected by: unattended supervisor and its workers (detached by definition; passing `--watch` to unattended must error with clear message)
  - Default: off (all subagent spawns go headless)
- All command-file edits must preserve the existing OBSERVABILITY LOGGING block (project CLAUDE.md mandate)
- Atomic commits per command file — do not leave a command in a half-converted state
- Test additions cover the propagation rules table from the contract

## Must Not

- Modify `bin/token-budget.cjs` or any meter file (Domain 2 owns those)
- Delete or relocate `bin/headless-auto-spawn.cjs` (Domain 5 will fold the old contract into headless-default-contract.md, but keeps the bin file)
- Touch `commands/gsd.md` (Domain 4 owns the router)
- Touch `bin/gsd-t-unattended.cjs` event emission paths (Domain 3); however, you MAY touch unattended.cjs to add the `--watch` rejection
- Update docs (Domain 5 owns the doc ripple)

## Dependencies

- **Depends on**: nothing inside M38 (this is Wave 1 first-mover). Depends on the M36 `autoSpawnHeadless()` working end-to-end (already shipped v3.10.13+).
- **Depended on by**:
  - Domain 2 (m38-meter-reduction) — needs Domain 1's spawn pattern in place before deleting the meter machinery, so the meter's removal doesn't strand spawn callsites that still reference it.
  - Domain 3 (m38-unattended-event-stream) — independent of spawn changes, can land in parallel in Wave 2.
  - Domain 4 (m38-router-conversational) — independent.
  - Domain 5 (m38-cleanup-and-docs) — terminal; consumes Domain 1's contract and command-file shape.

## Must Read Before Using

- `bin/headless-auto-spawn.cjs` — full file. It owns: `autoSpawnHeadless({command, args, projectDir, sessionContext})`, `markSessionCompleted`, session-id slug format, running-session file shape.
- `bin/check-headless-sessions.js` — `checkCompletedSessions`, `markSurfaced`, `formatBanner`, `printBannerIfAny`. The read-back banner is how users see results on their next message.
- `bin/handoff-lock.cjs` — parent/child race guard. Lock is acquired in parent before child write; released after child reads. Must not break this flow when changing spawn primitives.
- `commands/gsd-t-execute.md` Step 2 — the canonical OBSERVABILITY LOGGING block to preserve.
- `.gsd-t/contracts/headless-auto-spawn-contract.md` — current contract. Folded into headless-default-contract.md by Domain 5.
- `commands/gsd-t-unattended.md` — to understand what the `--watch` rejection must look like.
