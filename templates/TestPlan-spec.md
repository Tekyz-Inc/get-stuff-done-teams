# TestPlan-{Title}

**Project:** {Project Name} · **Date:** {Date}

One sentence: what feature area this plan enumerates, and which requirements document it
was enumerated from.

---

<!--
  ─────────────────────────────────────────────────────────────────────────────
  HOW TO WRITE THIS  (delete this comment block in the real instance)
  ─────────────────────────────────────────────────────────────────────────────

  This is the blank mold every test plan (a document that enumerates every
  case a feature area implies, so a reviewer approves DIRECTION before
  TESTS exist) is filled from. It is the sibling of `PseudoCode-spec.md` —
  same job, one section earlier in the pipeline: PseudoCode maps intended
  BEHAVIOR before code; this maps intended CASES before tests.

  Full row schema, marker literals, and self-answered-visibility rule:
  `.gsd-t/contracts/test-plan-first-contract.md` §2–§3 (frozen — do not
  restate or diverge from it here; this file shows the shape in place).

  Section order below is FIXED. A plan missing any of the five, or with
  them out of order, does not satisfy the contract's row schema.

  Name the real file `TestPlan-[FeatureArea].md` — never a milestone id —
  the way a PseudoCode doc is named for its subject, not its milestone.
  ─────────────────────────────────────────────────────────────────────────────
-->

## Decided without you

Every row anywhere in this document whose `Source` column carries the marker
`DECIDED-WITHOUT-YOU` is copied here a second time, so a reviewer can overrule any of them
by reading this one group and nowhere else. Present always — even with nothing under it.

- `{table name}` Seq `{n}` — {the decision made} — evidence: {what was used to decide it}

When there are none:

> None — every row is sourced.

---

## Table: {Feature or Capability Name}

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | {system state and date before the action} | {the one thing done} | {what must happen, stated so a test can fail it} | {what changes in data already stored — `none` is a real, written answer} | `docs/requirements.md#{anchor}` |
| 2 | {system state and date before the action} | {the one thing done} | {what must happen} | {effect, or `none`} | DECIDED-WITHOUT-YOU — {evidence used} |
| 3 | {system state and date before the action} | {the one thing done} | {what must happen} | {effect, or `none`} | GAP — {why it could not be filled} |

Add one `## Table:` section per coherent sub-area within this feature. Each keeps its own
`Seq` numbering starting at 1.

---

## Open gaps

Every `GAP` (and `GAP:CONTRADICTION`) row across every table, collected here in one list.
This is what the single question round is built from — a reviewer answers this list, not
the tables.

- `{table name}` Seq `{n}` — {why it could not be filled}

When there are none:

> None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| {name} | {Date} |
