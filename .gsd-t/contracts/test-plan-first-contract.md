# Test-Plan-First Contract

**Version:** 1.0.0 STABLE (frozen by `enumerator-core` 2026-09-03 — A1 blind replay passed cold)
**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Source of truth:** `.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md`
**Owner:** `enumerator-core` (Wave 1). Every other domain is a CONSUMER and may not change this file.

This contract exists so Wave 2 and Wave 3 can build against a frozen interface without
reading each other's code. It fixes three things and nothing else: the **row schema**
(what a plan row is), the **gate exit codes** (how a gate reports), and the
**field names** for self-answered rows and their evidence.

---

## 1. Status and freeze rule

| State | When | What consumers may assume |
|---|---|---|
| DRAFT | While Wave 1 runs | Nothing. Do not build against it. |
| STABLE | The moment A1's blind replay passes | Every name below is fixed for the milestone. |

`enumerator-core` sets STABLE by editing the Version line and recording the flip in
`.gsd-t/progress.md`. If A1 FAILS, this contract is deleted along with the domain and the
milestone halts for premise re-examination — nothing downstream was built against it yet.
That quarantine is the entire reason Wave 1 runs alone.

**Flipped STABLE 2026-09-03.** A1's cold replay (`test/m115-a1-blind-replay.test.js`)
passed on the first run against `requirements-before-review.md` alone, surfacing all three
answer-key gaps (month close + reopen, the wrong permission model, the owner-deactivation
refusal). The row schema below needed NO changes from what the replay actually produced —
all six columns and all three row states (including `GAP:CONTRADICTION`) were exercised
exactly as specified. Wave 2 and Wave 3 may start.

---

## 2. The row schema (§2.1 — frozen)

A test plan is a Markdown document containing one or more **sequence tables**. A row is one
enumerated case. The column set is fixed and ordered:

| Column | Header text (exact) | Meaning |
|---|---|---|
| 1 | `Seq` | The order this case happens in, within its table. An integer, or an integer plus a letter for a sub-step (`3a`). |
| 2 | `Setup / date` | The state the system is in, and the date the action carries, before the action. |
| 3 | `Action` | The one thing done. |
| 4 | `Expected result` | What the system must do, stated so a test can fail it. |
| 5 | `Effect on saved data` | What this does to data already stored. Never blank — `none` is a real answer and must be written. |
| 6 | `Source` | Where the answer came from, or the gap marker. See §2.2. |

**Row states.** Every row is in exactly one of three states, and the state is read from
column 6 alone:

| State | Column 6 contains | Meaning |
|---|---|---|
| `sourced` | A citation — a file path, a contract name plus section, or a standing-rule id | Answered, and something we already hold says so. |
| `self-answered` | The literal marker `DECIDED-WITHOUT-YOU` followed by the evidence used | Answered, but only after deciding something nobody wrote down. Must ALSO appear under the §3 heading. |
| `open` | The literal marker `GAP` followed by why it could not be filled | A missing or wrong requirement. Not answered. Never filled with something plausible. |

A row whose column 6 is empty is a violation, not a fourth state. This is the structural
form of the one thing that must never happen (`[RULE] unfillable-row-is-a-gap`).

### 2.2 Markers (frozen literals)

| Marker | Literal | Used in |
|---|---|---|
| Self-answered | `DECIDED-WITHOUT-YOU` | Column 6, and the §3 group |
| Gap | `GAP` | Column 6 |
| Contradiction | `GAP:CONTRADICTION` | Column 6, when two rules disagree rather than neither answering |

Markers are matched case-sensitively so a prose mention of the phrase in ordinary text
cannot be mistaken for a marker.

---

## 3. Self-answered visibility (frozen)

Every `self-answered` row appears TWICE: once in its own sequence table in document order,
and once under a single heading at the top of the document.

- Heading text, exact: `## Decided without you`
- Position: before the first sequence table.
- Each entry names the row (`table name` + `Seq`) and its evidence.
- A `self-answered` row that appears in a table but NOT under the heading is a violation.
- The heading is present even when empty, carrying the line `None — every row is sourced.`

Rationale: one glance must be enough to overrule any of them
(`[RULE] self-answered-stays-visible`).

---

## 4. Gate exit codes (frozen)

Every deterministic gate in this milestone uses the exit triple already proven by
`bin/gsd-t-pseudocode-style.cjs`, and never throws:

| Exit | Meaning |
|---|---|
| `0` | Clean — checked, nothing wrong. |
| `4` | Violations found. |
| `64` | Bad input — could not read the file, missing required argument. NOT a pass. |

**Envelope.** Every gate writes one JSON object to stdout:

```
{ "ok": <bool>, "exitCode": <0|4|64>, "violations": [ { "kind": <string>, "detail": <string> } ] }
```

`ok` is `true` only when `exitCode` is `0`. A gate that cannot decide exits `64` and says
why in `reason` — it never exits `0` by default. This is the No-Fallback rule in exit-code
form: a gate that cannot check must HALT, never pass.

**Module shape.** Each gate is a `bin/*.cjs` file with `module.exports` plus a
`require.main === module` CLI entry, so it is runnable as `node bin/<tool>.cjs` by its own
test without going through `bin/gsd-t.js`. This is what lets Wave 2 and Wave 3 test their
gates before `front-door-wiring` registers them.

---

## 5. Named gate verbs (frozen — `front-door-wiring` registers exactly these)

| Verb | File | Owner |
|---|---|---|
| `testplan-lint` | `bin/gsd-t-testplan-lint.cjs` | `deterministic-gates` |
| `testplan-halt` | `bin/gsd-t-testplan-halt.cjs` | `halt-convergence` |

These names are fixed here so `front-door-wiring` can register them in both bin-tool
registries and in the CLI dispatch WITHOUT waiting for the producing domain to finish.
A tool present on disk but absent from `PROJECT_BIN_TOOLS` / `GLOBAL_BIN_TOOLS` ships DEAD
in every project — that failure has occurred four times in this repo's history, so the
registration is a mechanical assertion in A8, not a checklist item.

---

## 6. Loop-ledger reuse (READ-ONLY)

`halt-convergence` consumes `bin/gsd-t-loop-ledger.cjs` through its existing exported
interface — `appendCycle`, `readExitState`, `computeSignature` — and does NOT modify that
file. The mapping from an enumeration round to a ledger cycle lives in
`bin/gsd-t-testplan-halt.cjs`. Keeping the ledger outside every owned file set is what
makes it reusable rather than forked.

---

## 7. Traceability widening (additive only)

`bin/gsd-t-traceability-gate.cjs` currently clears an acceptance line via a **Files** path
plus a named **Test**. This milestone widens `assessTask` to ALSO accept a **plan-row**
binding. Additive is load-bearing:

- A milestone with no test plan keeps its current verdict, byte for byte.
- Proof of preservation is that `test/m83-traceability-gate.test.js` and the M87 gate tests
  remain unmodified and passing. No domain may edit those files.

---

## 8. What this contract does NOT fix

The enumeration protocol's own wording, the mold's prose, and the command's phrasing are
owned by their domains and are deliberately out of scope here. Freezing them would couple
the domains for no gain.

---

## 9. The case-space bound (settled — evidence, not assumption)

**Bound: 94 cases per enumeration run.** Evidenced by
`test/fixtures/m115-blind-replay/test-plan-final.md` — the answer key's own finished plan
for the rate-ledger-and-deactivation feature area enumerates 94 cases from a 571-line
requirements document. That is the observed scale a completed plan of this kind reaches,
so it is the number used rather than an invented round figure.

**At the bound: HALT, never a silent truncation.** On reaching case 94 within a single run
without finishing the requirements area, the enumerator STOPS writing rows and instead
names which feature or rule (E1–E8) was left un-enumerated, with an estimate of the further
cases that region implies. This mirrors the milestone's own three-round question-loop halt
(`[RULE] enumeration-loop-cap-three`) applied to volume instead of rounds: a plan that
silently stops at 94 rows and reads as complete is a missing requirement wearing the shape
of a finished plan — the one outcome this whole contract exists to prevent.

Full rule text, including the worked reasoning: `templates/prompts/test-plan-enumerator-subagent.md`
§"The case-space bound".
