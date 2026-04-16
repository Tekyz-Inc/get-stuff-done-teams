# Constraints: m38-meter-reduction

## Must Follow

- **Read every file before deleting it.** No file is removed without confirming what depends on it. M35 made this mistake silently with `task-counter.cjs` callers; do not repeat.
- **Single-band threshold model**: only `normal` (under threshold) and `threshold` (at/over). No `warn`, no `stop`, no `downgrade`, no `conserve`, no `dead-meter`, no `stale`.
- **Threshold-cross becomes a silent orchestrator action**: when measured context crosses threshold, the next subagent spawn auto-routes to headless. NO MANDATORY STOP banner. NO ceremony. The user sees activity continue via the read-back banner mechanism.
- **`getSessionStatus()` API stays** — it's the parent-context backstop other code depends on. Return shape simplifies: `{pct, threshold, deadReason: undefined}`. The `deadReason` field is dropped.
- The 7 stranded context-meter tests (TD-102) MUST be rewritten — not just deleted — to reflect the new single-band semantics. Success criterion #10 commits to this.
- Net LOC delta target: contribute meaningfully to the overall ≥5,000 line removal goal (success criterion #11).

## Must Not

- Delete `bin/headless-auto-spawn.cjs` (Domain 1 owns; this domain depends on it)
- Delete or rewrite `bin/check-headless-sessions.js` (read-back banner mechanism is core; Domain 1 depends on it)
- Modify the headless spawn pattern in command files (Domain 1 owns those edits)
- Touch the `--watch` flag (Domain 1)
- Touch `commands/gsd.md` (Domain 4)
- Modify `templates/CLAUDE-global.md` or project `CLAUDE.md` Universal Auto-Pause section (Domain 5 does the doc ripple after meter is reduced)
- Reintroduce env-var-based context checks (`CLAUDE_CONTEXT_TOKENS_USED` etc.) — historically dead, never works. Project CLAUDE.md prohibits this explicitly.
- Reintroduce the `task-counter.cjs` proxy — retired in M34, removed downstream

## Dependencies

- **Depends on**: Domain 1 (m38-headless-spawn-default) lands first within Wave 1. Domain 2 starts after Domain 1's command-file edits commit so the meter callsites are visibly orphaned.
- **Depended on by**:
  - Domain 3 (m38-unattended-event-stream) — Domain 3's event-stream worker emission is independent of meter, but its watch-tick reform may touch the supervisor in places Domain 2 also edits. Coordinate by running Domain 3 in Wave 2 (after Wave 1 atomically lands Domains 1+2).
  - Domain 5 (m38-cleanup-and-docs) — needs the final meter shape to update docs.

## Must Read Before Using

- `bin/token-budget.cjs` — full file. Owns: `getSessionStatus`, `bandFor`, `BANDS` constant. Three-band → single-band rewrite is the bulk of this domain.
- `bin/runway-estimator.cjs` — full file before deletion. Confirm callsites in `bin/gsd-t-unattended.cjs`, command files, and tests.
- `bin/token-telemetry.cjs` + `bin/token-telemetry.js` — full file before deletion. Confirm `recordSpawn` callsites in command files (the per-spawn token brackets) — those bash blocks must be removed atomically with the bin file delete.
- `scripts/gsd-t-context-meter.js` — full file. Owns: PostToolUse hook, `additionalContext` builder. Cut dead-meter / stale-band; keep measurement.
- `scripts/context-meter/threshold.js` — full file. Owns: `BANDS`, `bandFor`, `buildAdditionalContext`. Collapse to single-band; `buildAdditionalContext` returns the silent orchestrator signal (e.g., a small marker the orchestrator reads, not a MANDATORY STOP banner).
- `scripts/context-meter/transcript-parser.js` — confirm it stays (parses Claude transcript for token counts; independent of band model)
- `bin/gsd-t-unattended.cjs` — full file. Owns: supervisor loop, meter callsites. Find every place it reads token-budget / runway / telemetry, update or remove.
- `.gsd-t/contracts/context-meter-contract.md` v1.2.0 — current contract. Update to v1.3.0.
- `.gsd-t/contracts/runway-estimator-contract.md`, `token-telemetry-contract.md` — read both to confirm what gets folded vs. deleted (Domain 5 finalizes; Domain 2 confirms the deletions are safe).
- M37 `additionalContext` strengthening: read `templates/CLAUDE-global.md` Universal Auto-Pause Rule section. The strengthened text must be removed/softened by Domain 5; Domain 2 owns the matching code-side change in `buildAdditionalContext`.
