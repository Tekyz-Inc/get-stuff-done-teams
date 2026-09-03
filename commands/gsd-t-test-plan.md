# GSD-T: Test-Plan-First — Enumerate the Case Space Before Tests Exist

You run the M115 test-plan-first interrogation, in-session, as the lead agent — the same
pattern as `/gsd-t-architect`. There is no separate Workflow phase script for this command:
every deliverable it orchestrates is a deterministic gate (`bin/gsd-t-testplan-lint.cjs`,
`bin/gsd-t-testplan-halt.cjs`) or a subagent protocol file you Read and follow directly, per
`.gsd-t/contracts/test-plan-first-contract.md`.

**Why this exists.** Every check GSD-T runs today reads something that already exists (code,
a plan) and can only judge what was built. This runs BEFORE any code exists: it enumerates
every case the requirements already imply, so a missing or wrong requirement is caught as a
gap in a row, not as a bug found later.

## Argument Parsing

Parse `$ARGUMENTS`:
- **No flag (before-mode, default)** — enumerate from what is already held (requirements,
  architecture, contracts, standing rules, any code that exists), before tests are written.
- **`--after`** — the same enumeration run against already-built code: run the plan's rows
  as tests, classify each failure by cited evidence.
- **First positional** (either mode) — the requirements document or feature-area slice to
  enumerate. Defaults to `docs/requirements.md`.

## Before-mode (default)

1. **Read the enumeration protocol.** `Read templates/prompts/test-plan-enumerator-subagent.md`
   in full — the E1-E8 rules that define the case space. Do not restate it here; follow it.
2. **Read the mold.** `Read templates/TestPlan-spec.md` — the section set and six-column
   row schema a plan must have (frozen shape: `.gsd-t/contracts/test-plan-first-contract.md`
   §2-§3).
3. **Enumerate.** Apply E1-E8 to the target requirements document. Fill each row from named
   evidence (`sourced`), or mark it `DECIDED-WITHOUT-YOU` (self-answered — also grouped
   under `## Decided without you`), or leave it `GAP`/`GAP:CONTRADICTION` (open). Never fill
   an unanswerable row with something plausible — that is the one failure this command
   exists to prevent.
4. **Batch every open row into ONE question round (A4).** Collect every `GAP`/
   `GAP:CONTRADICTION` row from every table, ask them together in a single round, fold the
   answers in together, then re-enumerate to confirm closure. **Never ask one question at a
   time as each answer arrives — a drip defeats the batching the reviewer's attention
   depends on.**
5. **Round cap.** After folding each round's answers, re-enumerate and run
   `gsd-t testplan-halt check --doc <plan path> --round <n>` (falls back to
   `node bin/gsd-t-testplan-halt.cjs check ...` locally). If it reports `halted: true` —
   either the third round still has open rows, or the same failure signature has recurred
   across two consecutive rounds — STOP: hand back `blocked-needs-human` naming every row
   the tool lists as never settled, rather than continuing with anything left open. A
   repeated symptom means the belief behind an earlier answer is wrong, not that the row
   needs a third try.
6. **Fold closed answers into `docs/requirements.md`.**
7. **Gate for shape.** Run `gsd-t testplan-lint --doc <plan path> --json` (falls back to
   `node bin/gsd-t-testplan-lint.cjs --doc <plan path> --json` locally). A non-zero exit
   means the plan is malformed — fix it before presenting; never present a plan that fails
   its own gate.
8. **Present for sign-off.** Show the plan (or a summary with the file path) and stop for
   the user's review. **Tests are generated from the rows only after sign-off** — this
   command does not write tests itself.

## `--after` mode

1. Read the same enumerator protocol and re-enumerate against the requirements as they
   stand today, against the built code.
2. Run the resulting rows as tests against the code.
3. For each failure, `Read templates/prompts/test-plan-evidence-classifier.md` and follow it
   to classify the failure as code-bug or wrong-requirement, from cited evidence only —
   never a default arm.
4. Fix code-bugs directly (small, local). A wider refactor a classification surfaces is
   spilled to `.gsd-t/techdebt.md` rather than done in this pass.
5. Re-run `gsd-t testplan-lint --doc <plan path> --json` on the updated plan before
   presenting the result.

## Document Ripple

Fold closed answers into `docs/requirements.md`. Log a Decision Log entry in
`.gsd-t/progress.md` for the enumeration round(s) run and their outcome. A wider refactor
found in `--after` mode goes to `.gsd-t/techdebt.md`, not into this pass's diff.

## Next Up

`/gsd-t-plan` — turn the signed-off plan's rows into tasks.

**Also available:**
- `/gsd-t-execute` — when run in `--after` mode against a milestone already mid-build.
