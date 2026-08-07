# M106 — Fallback Gate

**Status:** spec · **Date:** 2026-08-06

---

A fallback cannot be written unless David asked for it by name.

## The flow

```
Something is about to be written — code, a plan, or a contract
  Does it contain a branch that continues after a failure:
    No:  Nothing happens
    Yes: Did David approve this exact one:
      Yes: Let it through
      No:  Ask the judge — is it genuinely needed:
        Clearly not:      Stop. Show David what it is and the halt that replaces it
        Genuinely needed: Stop. Show David the case for it and ask
        Cannot tell:      Stop. Say what could not be decided
```

David is the only one who can approve. The judge only sorts what he sees first.

## What counts as a fallback

Flagged:

- A `catch` that does not rethrow, exit, or return a failure
- `|| default` or `?? default` where the left side can fail
- A substituted value when a lookup finds nothing
- A partial result returned when part of the work failed
- A trace or log written, then execution continues
- A retry that gives up and proceeds
- `|| true` in a shell command

Not flagged:

- A `catch` that rethrows, exits, or returns a failure — that is a halt
- A default for an optional input that was never a failure
- Cleanup in a `finally` block

## Where it runs

| Trigger | Catches |
|---|---|
| Write or Edit | A fallback added while chasing a bug |
| Plan or contract review | A fallback buried in a long plan |
| Before commit | Anything the first two missed |
| On demand | Fallbacks already in a project today |

## The approval file

`.gsd-t/fallbacks.json` — one entry per approved fallback:

| Field | Holds |
|---|---|
| `id` | A short name |
| `location` | File and function |
| `whatFails` | The failure, in plain words |
| `howLikely` | Evidence it happens |
| `whyNotHalt` | Why stopping is worse |
| `whatItDoesInstead` | The correct handling — never a guessed value |
| `approvedBy` | David, with a date |

Matched by location and shape, not line number. An empty file is the normal state.

## The judge

Runs only on unapproved ones. Checks three things:

1. Is the outside condition likely, not just possible?
2. Is its cause outside our control?
3. Does it have a correct alternate handling — not a guess, not a partial result?

Returns `REJECT`, `ESCALATE`, or `UNDECIDABLE`. All three stop and ask David.

## Settings

`.gsd-t/fallback-gate.json` — `enabled`, on by default.

## When the detector fails

It stops. It never allows on error.

## Proving it works

1. Rebuild the Marla case — the write must be denied. If it misses this, the gate is worthless.
2. Rebuild the PayPal case — a partial invoice with a trace must be flagged.
3. Run on-demand mode across 3 projects. Count wrong flags. Over 1 in 5 means the patterns are too broad.
4. After 10 milestones the approval file should still be nearly empty.

## Build order

1. The detector — finds them, checks approval
2. The wiring — four trigger points
3. The judge and on-demand mode

Three domains. One wave.
