# Domain: plan-visibility

**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Wave:** 2 — concurrent with `halt-convergence`
**Acceptance carried:** A3 (self-answer visibility) + A6 (evidence-or-halt classifier)

## Purpose

Two of the three silent-corruption surfaces, both about what the finished plan must SHOW
the reviewer.

**A3 — self-answered rows stay visible.** A row answered by deciding something nobody ever
wrote down is grouped at the top of the document and individually sourced, so one glance is
enough to overrule any of them. The guard is against a decided-without-you answer sinking
into the body unnoticed, where it reads exactly like a sourced one.

**A6 — evidence or halt.** Every row is filled from named evidence or left open as a gap.
A failing test is classified code-bug versus wrong-requirement only from cited evidence,
never by guess and never by a default branch. This structurally prevents the one thing that
must never happen: a row nobody could really answer being quietly filled with something
plausible, shipping a missing requirement as a passing test.

This domain owns the blank mold and the machine-checkable rule set for both surfaces. It
writes NO gate binary — the rules it defines are consumed by the lint in
`deterministic-gates` (Wave 3), which is exactly why the interface is frozen in Wave 1.

## Files Owned

| File | New/Edit | What |
|---|---|---|
| `templates/TestPlan-spec.md` | new | The blank mold — the section set a plan must have |
| `templates/prompts/test-plan-evidence-classifier.md` | new | The A6 classifier protocol |
| `test/m115-a3-self-answer-visibility.test.js` | new | A3 proof |
| `test/m115-a6-evidence-or-halt.test.js` | new | A6 proof |
| `.gsd-t/domains/plan-visibility/{scope,constraints,tasks}.md` | new | This domain's own files |

## Not Owned — read only, never write

- `.gsd-t/contracts/test-plan-first-contract.md` — read §2 (row schema), §3 (self-answered
  heading and marker literals). Owned by `enumerator-core`; consume it, never edit it.
- `bin/gsd-t-testplan-lint.cjs` — owned by `deterministic-gates`. This domain defines the
  rules; that domain implements the checker.
- `bin/gsd-t-testplan-halt.cjs` — owned by `halt-convergence`.
- `commands/`, `bin/gsd-t.js`, `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`,
  `templates/workflows/` — every shared surface belongs to `front-door-wiring`.
- `templates/prompts/qa-subagent.md` — reused unchanged. The QA protocol keeps its job.

## Deliverables

1. **`templates/TestPlan-spec.md`** — the blank mold: the required section set, the six-column
   sequence table, the `## Decided without you` heading, and the marker literals, each shown
   in place with a filled example row.
2. **The A3 rule set** — machine-checkable statements of what makes a self-answered row
   visible: grouped under the exact heading, present in both places, individually sourced.
   Written so `deterministic-gates` can implement them without interpretation.
3. **`templates/prompts/test-plan-evidence-classifier.md`** — the A6 protocol: given a failing
   test, decide code-is-wrong versus rule-is-wrong from cited evidence, or escalate to the
   question round. No default branch.
4. **Two tests** proving both surfaces, each failing when the guard is removed.

## Interfaces Published

The mold's section set and the A3 rule set are what `bin/gsd-t-testplan-lint.cjs` checks.
Both are expressed against the contract's frozen names, so the lint author needs this
domain's output but not its reasoning.

## Definition of Done

- The mold exists, and a plan written from it satisfies the contract's row schema.
- A self-answered row present in a table but missing from the `## Decided without you`
  group is detectably wrong, and `test/m115-a3-self-answer-visibility.test.js` proves it.
- An unsourced fill is detectably wrong, and an unclassifiable failure escalates rather than
  defaulting — `test/m115-a6-evidence-or-halt.test.js` proves both.
- Both tests fail if their guard is removed.
