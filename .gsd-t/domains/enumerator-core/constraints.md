# Constraints: enumerator-core

## The blind replay must stay blind

The single way this domain can fail dishonestly is by looking at the answer key while
authoring the protocol, then reporting a pass. Two files are HELD OUT and must NOT be read
while the protocol is being written or while the cold run executes:

- `test/fixtures/m115-blind-replay/test-plan-final.md`
- `test/fixtures/m115-blind-replay/requirements-review-delta.diff`
- `test/fixtures/m115-blind-replay/requirements-after-review.md`

The cold run's INPUT is `requirements-before-review.md` plus the project's architecture and
contracts as they stood. The held-out files are opened only AFTERWARDS, to score the run.

Write the enumeration output to disk BEFORE opening the answer key, so the ordering is
evidenced rather than asserted. A protocol authored while reading the answers proves
nothing about a milestone where no answers exist — which is every real use.

## Never edit the fixture

`test/fixtures/m115-blind-replay/**` is read-only for every domain, permanently. If the
cold run misses a gap, the protocol is wrong. Adjusting the fixture so the run matches is
the exact failure this criterion exists to catch. The fixture's README says
"Do not edit these files" — that is binding.

## A1 failure is a HALT, not a retry-forever

If the cold run misses a gap: fix the protocol and re-run, at most twice. On a third miss,
STOP and hand back `blocked-needs-human` naming which gap never surfaced. Do not weaken the
criterion to three-out-of-three-ish, do not accept two of three, and do not proceed to
Wave 2. This mirrors `[RULE] enumeration-loop-cap-three` — the milestone's own halt rule
applied to the milestone itself.

The same-symptom rule applies too: if the SAME gap is missed twice running, the belief
behind the fix is wrong. Re-examine the premise rather than attempting a third variation.

## No fallback

Per the No-Fallback-Ever Doctrine: no "if the enumeration comes up short, fall back to X"
branch anywhere in this domain. A short enumeration HALTS and says so. A fallback here
would hide precisely the signal the wave exists to produce.

## Ship nothing but the protocol and the proof

No command file, no mold, no lint binary, no CLI registration, no router case, no doc
ripple beyond this domain's own files and the contract. The quarantine is the deliverable's
shape: if A1 fails, deleting this domain's four files must leave the repo exactly as it was.
Anything wired into a shared file breaks that property.

## The case-space bound is settled from evidence

The pseudocode names unbounded combinatorics as the real failure mode and defers the bound
to partition. Settle it from what the fixture actually shows — its observed 94-case scale
for a milestone of that size — and cite that. Do not pick a round number and call it a
budget. State what happens when the bound is reached: a HALT naming the un-enumerated
region, never a silent truncation that would ship a missing requirement as a complete plan.

## The protocol is a protocol, not a program

`templates/prompts/test-plan-enumerator-subagent.md` is prose an agent reads, in the shape
of the existing `templates/prompts/*-subagent.md` files. It is not JavaScript and does not
belong in `bin/`.

## Plain language

The protocol and the contract are read by David as the senior reviewer. Gloss every
technical term in plain words on first use per the Simply Stated Doctrine. A protocol that
needs decoding cannot be overruled at a glance, which is the whole point of the review.
