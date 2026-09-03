# Tasks: deterministic-gates

**Wave:** 3 — concurrent with `front-door-wiring`. Starts when Wave 2 is green.

---

### M115-D4-T1 — The A2 shape gate

**Touches**: `bin/gsd-t-testplan-lint.cjs`
**Depends on**: M115-D2-T2 (the A3 rule set), M115-D2-T1 (the mold)
**Files**: `bin/gsd-t-testplan-lint.cjs`
**Test**: `test/m115-a2-testplan-lint.test.js`

Write the shape gate, modelled on `bin/gsd-t-pseudocode-style.cjs`. Read that file first for
the proven shape — argument parsing, the envelope, the exit triple, the never-throws wrapper.

What it checks, all structurally:

- The required section set from `templates/TestPlan-spec.md` is present and in order.
- Every sequence table carries the contract §2 six-column header, exactly.
- Every row is in exactly one of the three row states, read from column 6.
- Column 5 (`Effect on saved data`) is never blank — `none` is required, blank is a violation.
- Column 6 is never blank; there is no empty fourth state.
- The A3 rules: `## Decided without you` present, before the first table, its entries
  exactly matching the set of `DECIDED-WITHOUT-YOU` rows, each naming its evidence.
- Markers matched case-sensitively and exactly.

Accepts `--doc <file>` and `--dir <dir>` like the pseudocode gate. Ships `module.exports`
plus a `require.main === module` entry.

**Acceptance criteria**: Exit `0` on a well-formed plan, `4` on any violation above, `64` on
unreadable input or a missing argument; one JSON envelope on stdout; never throws; no
`text.includes` check anywhere.

---

### M115-D4-T2 — The mandatory negative test

**Touches**: `test/m115-a2-testplan-lint.test.js`
**Depends on**: M115-D4-T1
**Files**: `test/m115-a2-testplan-lint.test.js`
**Test**: `test/m115-a2-testplan-lint.test.js`

Prove the gate actually FAILS a malformed plan rather than passing vacuously. Run the tool
as a real subprocess so the asserted exit codes are the ones a caller sees.

Cases, each asserting exit `4`:

- Empty file.
- Right headings, no tables.
- Right column count, wrong headers.
- A row with a blank `Effect on saved data`.
- A row with a blank `Source`.
- A self-answered row with no entry under `## Decided without you`.
- An entry under that heading naming no evidence.
- `## Decided without you` mentioned only inside a sentence, not as a heading — the
  substring trap.

Plus exit `0` on the mold's own filled example, and exit `64` on a missing file.

**Acceptance criteria**: Every case asserts the exit code from a real subprocess; the whole
file would FAIL if the lint were stubbed to always return clean — verify that by actually
stubbing it once and confirming red.

---

### M115-D4-T3 — A7: widen `assessTask` additively

**Touches**: `bin/gsd-t-traceability-gate.cjs`
**Depends on**: M115-D1-T4 (contract STABLE)
**Files**: `bin/gsd-t-traceability-gate.cjs`
**Test**: `test/m115-a7-traceability-plan-row.test.js`

`assessTask` currently clears an acceptance line via a **Files** implementing path plus a
named **Test**. Widen it so an acceptance line may ALSO clear by binding to a plan row.

At the existing per-task seam. Additive only:

- The old binding is untouched and still clears exactly what it clears today.
- The new arm fires only when a plan row is actually cited — never as a fallback the old
  path drops into when it fails.
- Existing violation `kind` strings are unchanged.
- A milestone with no test plan takes exactly its current path.

Recognize a plan-row citation by the contract §2 row identity: the plan document plus a table
name plus `Seq`.

**Acceptance criteria**: An AC bound to a plan row clears; an AC bound to neither still
raises the existing violation with the same `kind`; no existing code path is reordered or
loosened.

---

### M115-D4-T4 — Prove A7, and prove preservation

**Touches**: `test/m115-a7-traceability-plan-row.test.js`
**Depends on**: M115-D4-T3
**Files**: `test/m115-a7-traceability-plan-row.test.js`
**Test**: `test/m115-a7-traceability-plan-row.test.js`

Two halves.

**The new behavior**: an AC citing a plan row clears; a citation to a plan row that does not
exist does NOT clear; a malformed citation does NOT clear.

**The preservation** — the load-bearing half:

- A milestone with no test plan produces the identical verdict, violation list and exit code
  as before the change.
- `test/m83-traceability-gate.test.js` and every `test/m87-*.test.js` are byte-identical —
  assert this mechanically (hash or `git diff --stat`), do not merely claim it.
- Those suites pass, unmodified.

**Acceptance criteria**: Both halves asserted; the byte-identity check is mechanical and
fails if any of those files were edited; the no-plan verdict comparison is against real
recorded output, not an assumption.

---

### M115-D4-T5 — Hand the verb names to the wiring domain

**Touches**: `bin/gsd-t-testplan-lint.cjs`
**Depends on**: M115-D4-T2, M115-D4-T4
**Files**: `bin/gsd-t-testplan-lint.cjs`
**Test**: `test/m115-a2-testplan-lint.test.js`

Confirm the shipped tool matches contract §5 exactly: file at `bin/gsd-t-testplan-lint.cjs`,
verb `testplan-lint`, runnable as `node bin/gsd-t-testplan-lint.cjs --help` without going
through `bin/gsd-t.js`.

`front-door-wiring` registers it in both registries and the verify workflow. A mismatch
between the shipped filename and the registered one ships the tool DEAD in every project —
that has happened four times in this repo's history, so confirm the name rather than
assuming it.

Register nothing here.

**Acceptance criteria**: Filename and verb match contract §5; `--help` works standalone;
no registry, router, workflow or doc file was touched by this domain.
