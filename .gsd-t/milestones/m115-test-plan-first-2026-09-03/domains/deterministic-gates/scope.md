# Domain: deterministic-gates

**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Wave:** 3 — concurrent with `front-door-wiring`
**Acceptance carried:** A2 (the test-plan shape gate) + A7 (traceability plan-row binding)

## Purpose

Both deterministic exit-code gates, in one domain because they share one gate shape.

**A2 — the test-plan shape gate.** A new binary modelled on the existing pseudocode-style
gate's proven shape: 0 clean, 4 violations, 64 bad input, JSON envelope, never throws. It
checks the plan for shape BEFORE the reviewer ever sees it
(`[RULE] plan-gated-before-presentation`), and ships with the mandatory negative test
proving a malformed plan actually FAILS rather than passing vacuously.

**A7 — traceability widened.** `bin/gsd-t-traceability-gate.cjs` gains a plan-row binding at
its stable per-task assessment seam, so an acceptance line may bind to a plan row in
addition to the file-plus-killing-test binding it accepts today. **Additive is
load-bearing**: every milestone with no test plan must keep its current verdict unchanged.
This widens what is accepted rather than replacing it.

This domain touches no shared registry and no reference doc — all wiring is deferred to
`front-door-wiring`, which is what keeps the two Wave 3 domains concurrent.

## Files Owned

| File | New/Edit | What |
|---|---|---|
| `bin/gsd-t-testplan-lint.cjs` | new | The A2 shape gate |
| `bin/gsd-t-traceability-gate.cjs` | edit | A7 — widen `assessTask` additively |
| `test/m115-a2-testplan-lint.test.js` | new | A2 proof, incl. the mandatory negative test |
| `test/m115-a7-traceability-plan-row.test.js` | new | A7 proof, incl. preservation |
| `.gsd-t/domains/deterministic-gates/{scope,constraints,tasks}.md` | new | This domain's own files |

This is the ONLY domain that edits a pre-existing `bin/` file.

## Not Owned — read only, never write

- **`test/m83-traceability-gate.test.js` and every `test/m87-*.test.js` — FORBIDDEN to edit.**
  Their remaining byte-identical AND passing is the proof that A7 is additive. Changing a
  test to accommodate a change is how "additive" quietly becomes "replacing".
- `bin/gsd-t-pseudocode-style.cjs` — read for the proven gate shape. Model on it; do not
  modify it.
- `templates/TestPlan-spec.md` and `templates/prompts/test-plan-evidence-classifier.md` —
  owned by `plan-visibility`. The A2 lint IMPLEMENTS the rules that domain defined; it does
  not redefine them.
- `bin/gsd-t-testplan-halt.cjs` — owned by `halt-convergence`.
- `bin/gsd-t.js`, `commands/`, `templates/workflows/`, `README.md`, `GSD-T-README.md`,
  `templates/CLAUDE-global.md` — all `front-door-wiring`'s.
- `.gsd-t/contracts/test-plan-first-contract.md` — read §2 and §4; owned by `enumerator-core`.

## Deliverables

1. **`bin/gsd-t-testplan-lint.cjs`** — checks a plan against the contract's row schema and
   the A3 rule set: six-column tables, three row states, no empty column 5 or 6, the
   `## Decided without you` group present and exactly matching the self-answered rows.
2. **The mandatory negative test** — a malformed plan exits `4`. A gate never proven to fail
   is not known to work.
3. **A7's plan-row binding** in `assessTask`, additive at the existing seam.
4. **Preservation proof** — M83 and M87 tests unmodified and green.

## Interfaces Published

The verb `testplan-lint`, fixed in contract §5. `front-door-wiring` registers it in both
bin-tool registries, the CLI dispatch, and the verify workflow as a FAIL-blocking gate. This
domain ships it runnable as `node bin/gsd-t-testplan-lint.cjs`.

## Definition of Done

- A well-formed plan exits `0`; a malformed one exits `4`; bad input exits `64`; never throws.
- The negative test would fail if the lint were stubbed to always return clean.
- A milestone with no test plan gets exactly the verdict it gets today.
- An acceptance line bound to a plan row clears.
- `git diff test/m83-traceability-gate.test.js test/m87-*.test.js` is empty, and they pass.
