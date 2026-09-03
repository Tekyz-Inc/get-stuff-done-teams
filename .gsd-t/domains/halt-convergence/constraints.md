# Constraints: halt-convergence

## The loop ledger is READ-ONLY

`bin/gsd-t-loop-ledger.cjs` is consumed through its existing exports and never modified:
`appendCycle`, `readExitState`, `computeSignature`. Its `module.exports` block is marked a
stable interface in the file itself.

- Do NOT edit it, even by one line.
- Do NOT copy its signature logic into this domain — a fork drifts, and then two halts
  disagree about what "the same symptom" means.
- If it genuinely cannot express what A5 needs, that is a HALT and a message up, not a
  local patch. The milestone definition says "called, not re-implemented".

Proof of preservation: `git diff bin/gsd-t-loop-ledger.cjs` is empty at hand-off.

## A halt, never a fallback

Per the No-Fallback-Ever Doctrine, this domain contains no branch that continues past a
failure. On non-convergence the tool refuses to continue. There is no "carry on with the
open rows filled in", no "best effort", no partial plan emitted with a warning.

The halt IS the feature. A run that ends short with a loud, specific message is a success
of this domain; one that ends complete-looking after giving up is its total failure.

## The halt message names what never settled

`blocked-needs-human` with no detail is unactionable and reads as a crash. Every halt names:

- **Round cap** — every row still open, identified by table and `Seq`, and how many rounds
  ran.
- **Repeated symptom** — the signature that repeated, both cycles it appeared in, and the
  instruction to re-examine the belief behind the fix rather than attempt a third.

## The caps must not fire early

A run converging on round 2 is a NORMAL run and must not be halted. An over-eager cap is as
damaging as an absent one: it turns ordinary work into false blockage and trains everyone to
ignore the halt. Both the fires-when-it-should and the does-not-fire-when-it-should-not
cases are proven.

## Contract §4 shape, exactly

Exit `0` clean, `4` violations, `64` bad input. JSON envelope on stdout. **Never throws** —
an uncaught exception is neither a pass nor a legible failure. Wrap the entry point so any
internal error becomes `exitCode: 64` with a reason.

`64` is not a pass. A tool that cannot check must say so and be treated as a failure by its
caller.

## Self-contained and runnable

`module.exports` plus a `require.main === module` CLI entry, runnable as
`node bin/gsd-t-testplan-halt.cjs` by its own test. It must not depend on being registered
in `bin/gsd-t.js` — that registration is `front-door-wiring`'s and lands in a later wave.

## Register nothing

Do not touch `bin/gsd-t.js`, either registry, the router, the verify workflow, or any doc.
Every shared file in this milestone is quarantined into `front-door-wiring` by design. The
verb name `testplan-halt` is already fixed in contract §5, so that domain can register it
without waiting.

## Plain language in messages

The halt message is read by a human deciding what to do next. Plain words, no bare
identifiers, no jargon unglossed. "The same failure has appeared twice, so the belief behind
the fix is likely wrong" beats a signature hash alone.
