# Domain: m43-d4-default-headless-inversion

> **Revised 2026-04-21**: Original scope was "headless unless `--in-session` OR low-water mark." User direction collapsed this: **the dialog channel is reserved for human↔Claude conversation; everything else spawns. No flag, no threshold.** D4 now strips the conditional logic entirely rather than inverting it.

## Responsibility

Strip the spawn-mode conditional logic from the GSD-T command surface so that **every command spawns, unconditionally**. There is no `--in-session` flag, no `--headless` flag, no context-meter-driven branching at spawn time. The only thing that runs in the dialog channel is the `/gsd` router itself, which always spawns the actual command.

D4 is the *act* half of M43 Part B: D1/D2/D3 (Part A) measure cost; D4 removes the choice surface that produced the bee-poc compaction pathology.

## Owned Files/Directories

- `commands/gsd-t-execute.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-complete-milestone.md`
- `commands/gsd-t-test-sync.md`
- `commands/gsd-t-scan.md`
- `commands/gsd-t-gap-analysis.md`
- `commands/gsd-t-populate.md`
- `commands/gsd-t-feature.md`
- `commands/gsd-t-project.md`
- `commands/gsd-t-partition.md`
- `commands/gsd.md` (router — clarify that the router always spawns; no inverse hint, no `--headless` flag)
- `.gsd-t/contracts/headless-default-contract.md` — BUMP v1.0.0 → v2.0.0. Document:
  - **Channel-separation invariant**: dialog channel runs the router only; commands always spawn.
  - **Deletes** `--in-session` opt-out from the v1 spec (was never shipped, is now explicitly out of scope).
  - **Deletes** low-water-mark bypass from the v1 spec.
  - Heartbeat compatibility unchanged: `.gsd-t/events/*.jsonl` writer is untouched.
  - Migration note for any external consumer that may have built on the v1 flag surface (none known in this repo).
- `bin/headless-auto-spawn.cjs` — EDIT. Simplify `shouldSpawnHeadless` to `() => true`, or inline the spawn at every call site and delete the helper. Pick whichever produces the smaller diff. The function exists today as a context-meter-aware branch; under v2.0.0 the branch has one outcome.
- `test/m43-headless-default-inversion.test.js` — NEW. Negative-flag tests:
  - 14 command files × default invocation → spawns. (Replaces the original 14 × 3-flag matrix; only one mode now.)
  - Grep assertion: `--in-session` and `--headless` appear in zero command files (post-D4).
  - Router test: `/gsd` always invokes via `Task(...)` / spawn, never inline.

## NOT Owned

- Token capture wrapper — D3.
- In-session usage capture entry-point — D1 (the dialog channel itself still gets per-turn capture).
- Transcript viewer URL printing — D6.
- Dialog meter (was the compaction-pressure circuit breaker) — D5.

## Contract Surface

- `headless-default-contract.md` v2.0.0 is the single source of truth for spawn-mode behavior. The contract is now one sentence long in spirit: "every command spawns."
- Every edited command file references v2.0.0 in its doc-ripple.

## Consumers

- Router `/gsd` is the primary end-user entry point.
- Every command file listed above.
- `bin/headless-auto-spawn.cjs::autoSpawnHeadless` is the single code path; the branching disappears.

## Dependencies

- **D4 MUST land in the FINAL wave, alone.** Reason: D4 deletes spawn-mode branching from the very command files the orchestrator routes work through. If D4 lands mid-run, every subsequent spawn changes shape under the running orchestrator. Sequencing D4 last guarantees a stable spawn surface for all preceding waves.
- D4 is otherwise independent of D1/D3 (schema-blind) — the "final wave alone" constraint is purely about runtime spawn stability, not data flow.

## Tradeoff

Spawning even tiny work (single Read, one Bash) has overhead — orchestrator startup, transcript file, dashboard registration. Acknowledged and accepted. If overhead bites, the answer is to make the spawn faster (M40-style fast spawn), not to re-introduce a threshold.
