# Tasks: plan-visibility

**Wave:** 2 — concurrent with `halt-convergence`. Starts when the contract reads STABLE.

---

### M115-D2-T1 — The blank mold

**Touches**: `templates/TestPlan-spec.md`
**Depends on**: M115-D1-T4 (contract STABLE)
**Files**: `templates/TestPlan-spec.md`
**Test**: `test/m115-a3-self-answer-visibility.test.js`

Write the blank mold every test plan is filled from, modelled on
`templates/PseudoCode-spec.md`. Required section set, in order:

1. Title plus one sentence of purpose.
2. `## Decided without you` — the self-answered group. Present always; carries
   `None — every row is sourced.` when empty.
3. One or more sequence tables, each with the contract §2 six-column header:
   `Seq · Setup / date · Action · Expected result · Effect on saved data · Source`.
4. `## Open gaps` — every `GAP` row collected, which is what the single question round is
   built from.
5. `## Sign-off` — who signed it and when.

Show one filled example row of each of the three row states (`sourced`, `self-answered`,
`open`) so the marker literals are unambiguous in place. Use the repo's `{Project Name}` /
`{Date}` replacement tokens.

**Acceptance criteria**: All five sections present in order; the six-column header matches
contract §2 exactly; one example row per row state; the three marker literals appear
verbatim. A plan written from this mold satisfies the contract's row schema.

---

### M115-D2-T2 — The A3 rule set (self-answered stays visible)

**Touches**: `templates/TestPlan-spec.md`
**Depends on**: M115-D2-T1
**Files**: `templates/TestPlan-spec.md`
**Test**: `test/m115-a3-self-answer-visibility.test.js`

State, machine-checkably, what makes a self-answered row visible. Each rule must be
implementable by `deterministic-gates` without interpretation:

- Every row whose `Source` column carries `DECIDED-WITHOUT-YOU` has a matching entry under
  `## Decided without you`, identified by table name plus `Seq`.
- Every entry under that heading names its evidence. An unsourced entry is a violation.
- The heading appears before the first sequence table.
- The heading is present even with nothing under it.
- Nothing under the heading that is not a self-answered row — the group is exactly the set.

Structural checks only: headings as headings, rows as rows, columns as columns. Never
substring matching.

**Acceptance criteria**: Five rules stated so a checker implements them mechanically; each
names what a violation looks like; none requires reading prose meaning.

---

### M115-D2-T3 — Prove A3

**Touches**: `test/m115-a3-self-answer-visibility.test.js`
**Depends on**: M115-D2-T2
**Files**: `test/m115-a3-self-answer-visibility.test.js`
**Test**: `test/m115-a3-self-answer-visibility.test.js`

Prove each A3 rule with a positive and a negative case. The negatives are the load-bearing
half — a rule that never fires is indistinguishable from no rule:

- A self-answered row in a table with NO entry under the heading → detectably wrong.
- An entry under the heading with no evidence named → detectably wrong.
- The heading placed after the first table → detectably wrong.
- The heading absent entirely → detectably wrong (distinct from present-and-empty).
- A well-formed plan → clean.

**Acceptance criteria**: Every rule has a negative case that fails when the guard is removed;
present-and-empty and absent are distinguished; no test passes on a document that merely
mentions the heading in prose.

---

### M115-D2-T4 — The A6 evidence-or-halt classifier

**Touches**: `templates/prompts/test-plan-evidence-classifier.md`
**Depends on**: M115-D1-T4 (contract STABLE)
**Files**: `templates/prompts/test-plan-evidence-classifier.md`
**Test**: `test/m115-a6-evidence-or-halt.test.js`

Write the classifier protocol in the shape of the existing
`templates/prompts/*-subagent.md` files. Given a failing test, it decides exactly one of:

- **The code is wrong** — it disagrees with a rule we can point at. Cite the rule.
- **The rule is wrong** — it was never right. Cite what shows that, and say so out loud.
- **We cannot tell from the evidence** — escalate into the single question round. Never guess.

There is NO default branch and no fourth arm. Every verdict cites its evidence; an uncited
verdict is as bad as none. The third arm is a HALT, not a fallback — it refuses to decide
rather than deciding badly.

Also state the row-filling half: a row is filled from named evidence, or marked
`DECIDED-WITHOUT-YOU` with the evidence used, or left `GAP`. Nothing else.

**Acceptance criteria**: Three arms, no default; every arm requires a citation; the
cannot-tell arm escalates rather than picking; the row-filling rule allows exactly the
contract's three row states.

---

### M115-D2-T5 — Prove A6

**Touches**: `test/m115-a6-evidence-or-halt.test.js`
**Depends on**: M115-D2-T4
**Files**: `test/m115-a6-evidence-or-halt.test.js`
**Test**: `test/m115-a6-evidence-or-halt.test.js`

Prove the classifier has no way to fill a row it cannot answer:

- A row filled with no `Source` → detectably wrong.
- A row filled with a `Source` that cites nothing real → detectably wrong.
- A failing case with evidence on both sides → escalates, does not pick.
- A failing case with no evidence either way → escalates, does not default.
- A properly cited code-is-wrong and rule-is-wrong verdict → clean.

**Acceptance criteria**: No input causes a verdict without a citation; the two escalation
cases escalate rather than defaulting; each test fails if the guard is removed.
