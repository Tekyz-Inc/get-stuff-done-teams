# Constraints: plan-visibility

## Build against the frozen contract, never edit it

Do not start until `.gsd-t/contracts/test-plan-first-contract.md` reads `1.0.0 STABLE`.
Read §2 for the row schema, §3 for the self-answered heading and the marker literals. If
something the mold needs is missing from the contract, that is a HALT and a message to
`enumerator-core` — not a local edit. Two domains editing the frozen interface is how a
frozen interface stops being one.

## Write no gate binary

This domain defines rules; `deterministic-gates` implements the checker. Writing a
`bin/*.cjs` here would collide with a Wave 3 file and break concurrency. If a rule cannot be
stated so a checker can implement it without interpretation, the rule is not finished —
sharpen it rather than writing code to compensate.

## No default branch in the classifier (A6)

The classifier decides code-is-wrong or rule-is-wrong ONLY from cited evidence. There is no
third "probably X" arm and no default. An unclassifiable failure escalates into the single
question round.

A default branch here IS the silent corruption the milestone exists to prevent: it fills a
row nobody could really answer with something plausible, and a missing requirement then
ships as a passing test. Per the No-Fallback-Ever Doctrine this is a HALT, not a fallback —
if the evidence does not decide it, refuse to decide it.

Every classification cites its evidence. A classification with no citation is a violation of
the same weight as no classification at all.

## `none` is an answer; blank is a violation

Column 5 (`Effect on saved data`) is never blank. A case that changes nothing must say so.
Blank is indistinguishable from unconsidered, and the difference is the whole point.
Likewise column 6 has three states and no empty fourth.

## The self-answered group is present even when empty

`## Decided without you` appears in every plan, carrying `None — every row is sourced.`
when there is nothing under it. An absent heading and an empty one must not look alike: one
means nothing was decided alone, the other means nobody checked.

## Marker literals are exact and case-sensitive

`DECIDED-WITHOUT-YOU`, `GAP`, `GAP:CONTRADICTION` — exactly as the contract writes them.
Case-sensitive matching is deliberate so ordinary prose mentioning the phrase cannot be read
as a marker. This is the one place the global case-insensitive-comparison default does NOT
apply, because here the case IS the data.

## Structural checks, never substring

The A3 rules are stated structurally — a heading is a heading, a table row is a table row,
a column is a column. Never `text.includes(...)`. A substring check passes on a plan that
merely mentions the heading in a sentence, which is a vacuous pass and a known failure
class in this repo.

## The mold is a mold

`templates/TestPlan-spec.md` is blank — a section set with an example row, not a filled
plan. It uses the repo's existing `{Project Name}` / `{Date}` / `{description}` replacement
tokens. Model its shape on `templates/PseudoCode-spec.md`.

## Plain language

The mold and the classifier are read by David. Gloss every technical term in plain words on
first use. The document exists to be overruled at a glance; anything needing decoding has
already failed at its job.
