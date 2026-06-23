# Scope: m92-look-first-ladder (M92 D1 — move 1)

## Mission
Give M90's §2 architectural trigger a **cheaper-first response ladder** — **look → smallest → spike → defer** — instead of today's spike-first/spike-preferred default. The trigger already FIRES (R-ARCH-2, on a task whose `**Touches**` lists an existing file) and already has `resolveResponseMode({spikeFeasible, spikePassed})`, but that resolver only knows `spike` / `adversary-only`. This domain adds the cheap rungs the BinVoice evidence proves handle most cases: **LOOK** (grep/read what exists — nearly free, kills most assumptions) and **SMALLEST** (propose the smallest-altitude change that hits the crux) come BEFORE spike.

## Critical scope boundary (anti-over-scope — read this)
This domain does **NOT** build backlog #42's spike-feasibility DECIDER. #42 is a SEPARATE, EXPLICITLY EXPERIMENTAL milestone ("no published precedent for auto-deciding spike feasibility; expect prove-or-kill; gate it hard"). M92's thesis is that the **LOOK rung (grep-grounded, M90-§1-style) resolves most cases without ever needing the spike-feasibility decider.** So:
- ADD the `look` and `smallest` rungs to `resolveResponseMode` (and a `defer` terminal rung for discovered-warts).
- DEMOTE `spike` from the default to a later rung (only after look+smallest leave real uncertainty).
- LEAVE `spikeFeasible`-deciding to #42 (when no spike result is provided, the ladder now defaults to **look-first**, not spike-preferred).

## Files Owned
- `bin/gsd-t-architectural-trigger.cjs` (extend `resolveResponseMode`; preserve ALL existing R-ARCH-4/5/6 behavior + envelope keys other code reads)
- `test/m92-look-first-ladder.test.js` (new)

## Out of scope (integrate-time seam, NOT this domain)
- The 4 workflows that consume the envelope (`phase`/`execute`/`quick`/`verify` read `stopDirective`). The richer envelope (new `mode` values, a `lookDirective`) is read by them at INTEGRATE-time, serially. This domain ships the producer; it does NOT edit any `*.workflow.js`.
- The doctrine contract §2.2 update (response-mode rungs) — D-integrate / contract owner updates it; this domain implements to the new rung set and NOTES the contract delta for integrate.

## Backward-compat invariant (non-negotiable)
`execute.workflow.js:550`, `quick.workflow.js:381`, `verify.workflow.js` ALL read `triggerEnv.stopDirective` (and verify reads `provenByAdversaryOnly`). The extended resolver MUST keep emitting those keys with identical semantics for the existing modes — a missing/renamed key fails-OPEN those gates. ADD rungs; never break the existing envelope shape.

## Deterministic-gate bar
Pure, zero-dep, never-throws, killing test against the rung transitions. The ladder is a deterministic state function of its inputs — ZERO LLM.
