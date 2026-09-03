# Test-Plan-First Requirements Interrogation

Before we build, we write down every test the rules imply — and every row we cannot fill in is a requirement nobody wrote down.

```text
A milestone has been defined and we are about to build it
  Read everything we already hold: the requirements, the architecture,
    the agreed interfaces (contracts), the standing rules, and any code that exists
  Work out every case those rules imply, and write one row per case:
    the order it happens in, the setup or date, the action taken,
    the expected result, and what it does to data already saved
  Look at every row — can it be filled in with a definite answer:
    Yes, and nothing we already hold disagrees with it:
      Fill it in and record where the answer came from
    Yes, but only after deciding something nobody ever wrote down:
      Fill it in, mark it decided-without-you, and record the evidence used
    No, or two rules contradict each other:
      Leave it open — this is a missing or wrong requirement
  Are there open rows left:
    Yes: Put every one of them into a single round of questions, and ask once
      Fold the answers into the requirements document
      Work the cases out again from the updated requirements
      Did that close every open row:
        Yes: Carry on
        No:  Have we been round this loop three times:
          Yes: Stop and hand back "blocked, needs a human", naming what never settled
          No:  Ask the remaining ones in another single round
    No:  Carry on
  Show the finished plan to David, with every decided-without-you row grouped
    at the top so one glance is enough to overrule any of them
  Did he sign it off:
    Yes: Build the tests from the rows, tie each planned task to the rows it
      satisfies, and only then start building the thing
    No:  Take his corrections, work the cases out again, and show it again

The same command is pointed at something that is already built
  Work the cases out the same way, write the same plan, ask the same single round,
    and get the same sign-off
  Build the tests from the rows and run them
  For every test that fails, gather the evidence and decide which is true:
    The code is wrong — it disagrees with a rule we can point at:
      Fix the code
    The rule is wrong — it was never right in the first place:
      Change the rule, say so out loud, and rewrite the row
    We cannot tell from the evidence:
      Add it to the single round of questions — never guess
  Did the fix need the surrounding code reshaped:
    Only as far as the fix reaches: reshape it
    Wider than that: write it into the tech-debt register, and do not do it now
  Run the tests again
  Is the same failure showing up for the second time running:
    Yes: Stop and hand back "blocked, needs a human" — the belief behind the fix
      is wrong, so re-examine that belief instead of trying a third fix
    No:  Carry on until everything passes
```

---

## The enumeration rules (the engine)

These are what make the plan find things. The table shape is downstream of them.

```text
More than one of everything — never stop at the first example of a kind
Every ordering that could happen — put one in before an existing one,
  save a second on the same day as an existing one,
  save one dated in the future and then change it before it starts
Every row says what it does to data already saved
Who is allowed to do it — once for each screen, and again for each
  address the app calls (endpoint)
Follow the whole chain end to end, not one screen on its own
For every state a thing enters, work out the way out and the way back in
Say out loud whether a boundary counts as inside or outside — never assume
The cases where the system must refuse — what it has to decline to do
```

---

## What it does today

```text
Something has been built, and we want to know the tests are good
  Run the tests that exist and count them
  Look for tests that only check something appeared on screen
  Check each acceptance line is tied to a file and a killing test
  Attack the plan and predict how it fails
  # Every one of these reads code that already exists, so it can only ever
  # confirm what was built. Nothing asks what the rules imply before there
  # is any code to read.
```

## What changes

```text
Before there is any code
  Work out the whole case space from the rules alone
  Every case we cannot answer is a hole in the requirements, surfaced as a
    question rather than filled with something plausible
  David reads the filled-in plan and overrules anything he disagrees with
  The tests are built from the plan, not from the code

After the fact, on something already built
  The same case space is worked out, and the tests are run against it
  A failing test is judged against the evidence: the code is wrong, or the
    rule was wrong — and when we cannot tell, we ask instead of guessing
```

---

## The rules

```text
A row nobody can fill in is a missing requirement          [RULE] unfillable-row-is-a-gap
Two rows that contradict each other are a wrong requirement [RULE] contradiction-is-a-gap
Answers we decided alone stay visible, grouped, and sourced [RULE] self-answered-stays-visible
Questions go out in one round, never a drip                 [RULE] one-question-round
Three rounds without closure stops the work                 [RULE] enumeration-loop-cap-three
A failing test is never classified by guess                 [RULE] failure-classified-by-evidence
The same failure twice running stops the work               [RULE] same-symptom-twice-halts
Tests are generated from the rows, never the other way      [RULE] suite-derives-from-plan
Sign-off happens before any test or code is generated       [RULE] signoff-blocks-generation
The plan is checked for shape before David ever sees it     [RULE] plan-gated-before-presentation
```

The one thing that must never happen: a row that nobody could really answer
being quietly filled with something plausible, so a missing requirement ships
as a passing test. Every step here can be repeated harmlessly — working the
cases out again from the same rules gives the same rows, and stopping twice is
still just stopped.

---

## ⚠ Divergence

⚠ Divergence: The rules#suite-derives-from-plan — supersedes shipped behavior in
which the quality-assurance protocol is the sole owner of test completeness.
That protocol reads code that already exists, so it can only judge what was
built. Test completeness now has a second owner that runs before the build.
Reason: the code-first owner cannot see a case the code never encoded, which is
exactly the class of gap this exists to find. The existing protocol is unchanged
and keeps its job.

⚠ Divergence: Where it lives#traceability — supersedes shipped behavior in which
an acceptance line may bind only to a file plus a killing test. It may now also
bind to a plan row. Reason: a plan row is the more precise target when a plan
exists. The old binding keeps working unchanged for every milestone that has no
plan, so this widens what is accepted rather than replacing it.

⚠ Divergence: What it does today#blind-replay-scoring — supersedes the Wave-1
scoring of the third known gap. The first Wave-1 pass was not blind (its protocol
carried the answer key); the clean re-run found the gap behind "closing a month"
— that a rate change silently alters invoices already sent — but not the
closed-month feature built to fix it. The scoring condition now names the gap,
not the fix. Reason: a cold reader of the pre-review text cannot invent a state
the text never names; the claim under test is that the rules find what is
missing, not what was later built. Approved by David 2026-09-03; the plan's
pre-mortem rule against re-writing a criterion after seeing output was set aside
once, with this record.

Everything else inherited is kept as it is — the sign-off shape, the style-gate
shape, the loop halt, and the tech-debt register are all reused untouched.

---

## Why this shape

- **The objective** — reach, without David in the loop, the result his manual
  review reached: the tests enumerated completely, and the missing, wrong, and
  unwritten rules exposed as a byproduct of trying to fill in every row.
- **What it conflicts with** — nothing is taken away. The code-first checks all
  keep running unchanged; this sits upstream of them, the same way the
  plan-attacking review sits upstream of the code-attacking one.
- **What already exists that we reuse** — the sign-off shape, the shape of the
  readability gate, the loop that stops on a repeated symptom, the tech-debt
  register, the interview loop's three-cycle cap, and the plan-attacking review
  turned on the row set instead of the plan.
- **Why this is the simplest version** — the enumeration rules are the only
  genuinely new thinking. Everything else is a wire-up to something already
  shipped, and the riskiest piece is tested first against evidence that already
  exists, before a command, a mold, or a gate is written.
- **Will it be reused** — the enumerator is likely to be, because three other
  parts of GSD-T already want an enumerated case space, so it is built clean and
  extractable from the start. The document writer has one caller and one format,
  so it stays inline with no abstraction.
- **What could go wrong** — the case space explodes. More-than-one-of-everything
  crossed with a per-address permission grid grows fast on a large area, and an
  unbounded run is a real failure mode. The bound is settled at partition, not
  assumed here.

### Re-checked at plan (2026-09-03)

The same six questions, asked again now the work is broken into tasks. Each
answer rests on something checked this pass, not on the earlier reasoning.

- **The objective, unchanged** — find the missing, wrong and unwritten rules
  before anything is built. Everything already in place reads code that exists,
  so none of it can see a case the code never encoded.
- **What it conflicts with** — still nothing. Checked by listing every file each
  area writes: twenty-one paths, each written by exactly one area. The three
  things we borrow are read and never written, and each one being untouched is
  something the work has to prove rather than claim.
- **What we reuse rather than rebuild** — the readability gate's proven shape,
  the repeated-symptom stopper, and the acceptance-line checker, which is widened
  rather than replaced. The answer key is reused too: it already exists on disk,
  so the riskiest question is settled against real evidence rather than a
  freshly invented example.
- **Why this is the simplest version** — the risky part runs alone and first, and
  it is the smallest thing that can disprove the idea: the rules written down, and
  one cold run scored against an answer key. No command, no blank form, no gate
  is built until that run passes. If it fails, one area is deleted rather than five.
- **Will it be reused** — the rules themselves, very likely, so they are written
  as a document an agent reads rather than buried in one caller. The blank form
  and the two gates have one caller each, so they stay plain.
- **What could go wrong, and what we do about it** — the case space explodes on a
  large area. At the bound the work stops and names the part left out. It never
  quietly stops early, because a plan that looks finished and is not is the one
  thing this whole idea exists to prevent.
- **Anything that carries on after a failure** — nothing. Every place the straight
  line can break, the work stops and says so: the cold run missing a gap, the
  bound being reached, three rounds of questions settling nothing, the same
  failure twice running, a gate that cannot read what it was given, and a
  judgement the evidence does not settle. None of these picks something plausible
  and continues.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| The enumeration rules, as a protocol an agent reads | `templates/prompts/test-plan-enumerator-subagent.md` (new) |
| The command | `commands/gsd-t-test-plan.md` (new) |
| The plan's blank mold | `templates/TestPlan-spec.md` (new) |
| Where a finished plan is written, gated and cited from | `.gsd-t/test-plans/TestPlan-[FeatureArea].md` (contract §7.1) |
| The shape gate on the plan | `bin/gsd-t-testplan-lint.cjs` (new) |
| The shape gate it is modelled on | `bin/gsd-t-pseudocode-style.cjs` |
| Traceability, widened to accept a plan row | `bin/gsd-t-traceability-gate.cjs` |
| The repeated-symptom halt, reused as-is | `bin/gsd-t-loop-ledger.cjs` |
| Shallow-test detection on the generated suite | `templates/prompts/qa-subagent.md` |
| Where wider reshaping goes instead of being done | `.gsd-t/techdebt.md` |
