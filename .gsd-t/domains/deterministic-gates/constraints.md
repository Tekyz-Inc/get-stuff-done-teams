# Constraints: deterministic-gates

## Additive means the old verdict is byte-for-byte unchanged

A7 widens `assessTask` to ALSO accept a plan-row binding. It does not alter, reorder or
loosen the existing Files-plus-killing-test binding.

- A milestone with no test plan gets **exactly** the verdict it gets today.
- The new arm is reached only when a plan row is actually cited. It is never a fallback the
  old path drops into.
- Exit codes, envelope shape and violation `kind` strings for the existing violations stay
  identical. A downstream reader keying on `ac-without-path` or `ac-without-test` must not
  notice this milestone happened.

## FORBIDDEN to edit the M83 and M87 tests

`test/m83-traceability-gate.test.js` and every `test/m87-*.test.js` stay byte-identical.
Their remaining unmodified AND passing is the entire proof that A7 is additive.

If one of them fails, the change is not additive — fix the change, never the test. Editing a
preservation test to accommodate a change destroys the only evidence that the change was
safe. Assert their byte-identity mechanically in `test/m115-a7-traceability-plan-row.test.js`.

New behavior gets a NEW test file. Never extend an existing gate test to cover it.

## Reuse the proven gate shape; do not fork it

`bin/gsd-t-pseudocode-style.cjs` already ships the 0/4/64 triple, the JSON envelope and the
never-throws guarantee. Follow that shape closely enough that a reader of one recognizes the
other. Read it; do not modify it; do not copy wholesale what can be followed as a pattern.

## The negative test is mandatory, not optional

A gate that has never been seen to FAIL is not known to work — it may be passing vacuously.
`test/m115-a2-testplan-lint.test.js` must contain a case where a malformed plan exits `4`,
and that case must fail if the lint were stubbed to always return clean.

Cover the vacuous-pass shapes specifically: an empty file, a file with the right headings
but no tables, a table with the right column count but wrong headers, and a plan that only
mentions `## Decided without you` inside a sentence.

## Structural checks, never substring

Parse the document structurally — headings as headings, tables as tables, columns as
columns. Never `text.includes(...)`. A substring check passes on a document that merely
mentions the heading, which is a vacuous pass and a known failure class in this repo.

Marker matching (`DECIDED-WITHOUT-YOU`, `GAP`, `GAP:CONTRADICTION`) is case-SENSITIVE and
exact, per contract §2.2 — the one place the repo's case-insensitive default does not apply,
because the case is the data.

## `64` is a failure, and never throws

Bad input exits `64`, never `0`. A gate that cannot read its input must not report clean —
that is a silent pass on an unchecked artifact. Wrap the entry so any internal error becomes
`exitCode: 64` with a reason rather than a stack trace.

No fallback anywhere: nothing in either gate continues past a failure.

## Implement the rules; do not redefine them

The A3 rule set and the mold's section set come from `plan-visibility`. This domain
implements the checker. If a rule cannot be implemented mechanically, that is a message to
that domain, not a local reinterpretation — two definitions of the same rule is how a gate
and its mold drift apart.

## Register nothing

Do not touch `bin/gsd-t.js`, either bin-tool registry, the router, the verify workflow, or
any reference doc. Every shared file is quarantined into `front-door-wiring`. The verb name
`testplan-lint` is fixed in contract §5, so that domain registers it without waiting for this
one to finish.

## Both tools runnable directly

`module.exports` plus a `require.main === module` CLI entry, runnable as
`node bin/<tool>.cjs` by their own tests. Run them as real subprocesses in tests so the exit
codes asserted are the ones a caller actually sees.
