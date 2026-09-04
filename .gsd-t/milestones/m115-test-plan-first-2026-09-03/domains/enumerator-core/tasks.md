# Tasks: enumerator-core

**Wave:** 1 — runs alone. Wave 2 starts only when T4 reports the contract STABLE.

---

### M115-D1-T1 — Author the enumeration protocol (E1-E8)

**Touches**: `templates/prompts/test-plan-enumerator-subagent.md`
**Depends on**: none
**Files**: `templates/prompts/test-plan-enumerator-subagent.md`
**Test**: `test/m115-a1-blind-replay.test.js` (the protocol is exercised by T3's cold run)

Write the eight enumeration rules from `.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md`
§"The enumeration rules (the engine)" as a protocol an agent executes. Match the shape of the
existing `templates/prompts/*-subagent.md` files: what you are, what you read, what you
produce, how you decide, what makes you stop.

Each rule gets: what it means in plain words, what it makes you look for, and a worked
example of a case it catches that a code-first reader would miss.

- **E1** more than one of everything — never stop at the first example of a kind
- **E2** every ordering that could happen — insert-before, same-date-as-existing,
  future-dated-then-changed-before-it-starts
- **E3** every row states its effect on data already saved
- **E4** who is allowed to do it — once per screen AND once per endpoint
- **E5** follow the whole chain end to end, not one screen alone
- **E6** for every state a thing enters, the way out AND the way back in
- **E7** say out loud whether a boundary counts as inside or outside — never assume
- **E8** the cases where the system must refuse

The output shape is the row schema in the contract §2 — six columns, three row states.
Read `templates/prompts/keep-or-supersede-subagent.md` for the verdict-table shape.

**Acceptance criteria**: All eight rules present, each with a plain-words meaning and a
worked example. Output shape matches contract §2. No jargon unglossed on first use.

**MUST NOT read**: `test-plan-final.md`, `requirements-review-delta.diff`,
`requirements-after-review.md`.

---

### M115-D1-T2 — Settle the case-space bound

**Touches**: `templates/prompts/test-plan-enumerator-subagent.md`
**Depends on**: M115-D1-T1
**Files**: `templates/prompts/test-plan-enumerator-subagent.md`
**Test**: `test/m115-a1-blind-replay.test.js`

The pseudocode's risk answer defers this bound to partition: more-than-one-of-everything
crossed with a per-endpoint permission matrix grows fast, and an unbounded run is a real
failure mode.

Settle it using the fixture's observed scale as evidence — 94 cases for a milestone of that
size, from a 571-line requirements document. Record the number, the evidence it rests on,
and the rule for what happens at the bound.

**What happens at the bound is a HALT**, naming the region left un-enumerated. Never a
silent truncation — a truncated plan looks complete and ships a missing requirement as a
passing test, which is the one thing that must never happen.

**Also settle here, before any cold run exists (pre-mortem PM-2)**: the three per-gap hit
conditions T3 will be scored against. Writing them down while no output exists is what keeps
A1 falsifiable — a criterion authored after seeing the result cannot fail. Each condition is
structural (a row's cells, a named gap's subject), never a substring search for a word.

**Acceptance criteria**: A stated bound with the fixture's observed scale cited as its
evidence, and an explicit HALT-at-the-bound rule. No round-number guess. The three per-gap
hit conditions are recorded here, before T3 runs, and are structural rather than substring.

---

### M115-D1-T3 — The A1 blind replay, cold

**Touches**: `test/m115-a1-blind-replay.test.js`
**Depends on**: M115-D1-T2
**Headline**: true
**Files**: `templates/prompts/test-plan-enumerator-subagent.md`, `test/m115-a1-blind-replay.test.js`
**Test**: `test/m115-a1-blind-replay.test.js`

This is the milestone's HEADLINE capability. The whole of M115 rests on one unproven bet:
that a cold enumeration driven by fixed rules reproduces what a human review found. The
implementing path is the E1-E8 protocol authored in T1/T2; the killing test is the cold
replay scored against the held-out answer key. If this task's test does not exercise the
protocol end to end against the real fixture, the milestone's reason to exist is unproven
and nothing downstream should be built.

Run the T1/T2 protocol cold against `test/fixtures/m115-blind-replay/requirements-before-review.md`
plus the project's architecture and contracts as they stood. Write the enumeration output to
disk BEFORE opening any held-out file.

Then score it against the answer key. A1 passes only when the cold run surfaced ALL THREE:

1. **Month close + reopen** — a missing feature (`tb_closed_months`, the close/reopen
   endpoints, and where reopen is offered from).
2. **The wrong permission model** — the permission grid as written did not match what the
   rules imply.
3. **"The owner cannot be deactivated"** — an unwritten business rule.

The test asserts on the recorded cold-run output, so it is reproducible rather than a
one-time claim. It must FAIL if any single gap goes unsurfaced — verify that by checking
the assertions are per-gap, not a count or a threshold.

**What "surfaced" means — decide this BEFORE the run, never after (pre-mortem PM-2).**
Scoring a run against a criterion invented once the output is in hand is not a falsification
test; it is a rationalisation. So commit the per-gap hit condition to disk as part of T2,
before any cold output exists:

- A gap counts as surfaced when the cold run produced a row (or a named open gap) whose
  subject is that gap — the closed-month state and its reopen path, the permission grid
  disagreeing with the rules, the owner being undeactivatable.
- Each condition is a structural check against the recorded output — a row's cells and a
  gap entry's subject — never a substring search for a word, and never a judgement made
  after the fact.
- **Near-misses count as misses.** A run that gestures at a neighbouring case without
  producing the gap does not pass. The bet is that the rules find these, not that a reader
  can see them in hindsight.

Write the cold-run output to disk BEFORE the held-out files are opened, and have the scoring
read that recorded file. The run and the scoring are separate steps against a frozen
artifact, so the same reasoning cannot both produce and grade the answer.

**Acceptance criteria**: All three gaps surfaced from the before-review input alone; the
per-gap hit conditions were written down before the cold run and are structural, not
substring; the test fails if any one gap is removed from the recorded output; scoring reads
the recorded artifact rather than re-running the enumeration; the fixture is byte-identical
(`git diff --stat test/fixtures/m115-blind-replay/` is empty).

**On failure**: fix the protocol, re-run, at most twice. Third miss, or the same gap missed
twice running → HALT `blocked-needs-human` naming the gap. Do NOT weaken the criterion and
do NOT start Wave 2.

---

### M115-D1-T4 — Freeze the cross-domain contract

**Touches**: `.gsd-t/contracts/test-plan-first-contract.md`
**Depends on**: M115-D1-T3
**Files**: `.gsd-t/contracts/test-plan-first-contract.md`
**Test**: `test/m115-a1-blind-replay.test.js`

Only after A1 passes. Fill §2's row schema with anything the replay showed the schema
actually needs, record the T2 bound, then flip the Version line from
`1.0.0 DRAFT` to `1.0.0 STABLE`.

That flip is the signal Wave 2 and Wave 3 may start. Log it in `.gsd-t/progress.md` with a
live-clock timestamp.

**Acceptance criteria**: Contract reads `1.0.0 STABLE`; the row schema, exit codes, marker
literals and gate verb names are all fixed; `.gsd-t/progress.md` carries the Decision Log
entry. If A1 failed, this task does NOT run — the contract is deleted with the domain.
