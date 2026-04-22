# Constraints: m43-d4-default-headless-inversion

## Must Follow

- The `--in-session` opt-out MUST round-trip: `/gsd --in-session ...` → command file → `autoSpawnHeadless({inSession: true})` → stays in-session.
- Low-water-mark bypass: when `ctxPct < 15`, stay in-session without requiring the flag. Document the 15% value in the contract; do not hard-code elsewhere.
- Every edited command file preserves its existing OBSERVABILITY LOGGING block and Document Ripple section. Only the spawn-mode decision text changes.
- Router banner text (`/gsd`) must surface the new default clearly so users aren't surprised.
- Backward-compat: existing `--headless` flag remains a no-op synonym for "stay with the default" (which is now headless). No operator needs to change their muscle memory.

## Must Not

- Remove the existing in-session escape hatch — `--in-session` must always work.
- Bypass the context meter: the low-water mark is additive, not a replacement for per-call metering.
- Invert spawn mode for router **conversational** turns (`/gsd` exploratory Q&A) — those stay in-session. Only spawned commands invert.
- Modify unattended/supervisor-spawned workers — they are already detached by construction.

## Must Read Before Using

- `bin/headless-auto-spawn.cjs` end-to-end (the single branch being inverted).
- `.gsd-t/contracts/headless-default-contract.md` v1.0.0 — current text, for the v2 delta.
- `.gsd-t/contracts/context-meter-contract.md` v1.3.0 — the 85% upper band is unchanged; only the default below 85% flips.
- `commands/gsd.md` Step 2.5 — router classifier; the inverse hint lives here.
- One sample command file, e.g., `commands/gsd-t-execute.md`, to understand the spawn-mode decision shim shape.

## Dependencies

- **D4 ↔ D6**: D6 wants the transcript URL printed at every spawn. D4's command-file edit is the natural place to print it; coordinate text with D6 via the contract.
- **D4 ↔ D5**: D5's compaction-pressure circuit breaker short-circuits D4's decision when tripped (forces headless regardless of flags). D5 defines the signal; D4 calls it.

## Acceptance

- All 14 command files invoked with no flags spawn detached.
- `--in-session` explicit flag keeps them in-session.
- `ctxPct < 15%` (low-water) keeps them in-session without the flag.
- Matrix test `test/m43-headless-default-inversion.test.js` green.
- `npm test` green overall.
- `headless-default-contract.md` v2.0.0 references the flip rationale + attribution data enabled by D1/D2.
