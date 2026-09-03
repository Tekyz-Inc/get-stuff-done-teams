# Tasks: halt-convergence

**Wave:** 2 — concurrent with `plan-visibility`. Starts when the contract reads STABLE.

---

### M115-D3-T1 — Map an enumeration round onto a ledger cycle

**Touches**: `bin/gsd-t-testplan-halt.cjs`
**Depends on**: M115-D1-T4 (contract STABLE)
**Files**: `bin/gsd-t-testplan-halt.cjs`
**Test**: `test/m115-a5-non-convergence-halt.test.js`

Read `bin/gsd-t-loop-ledger.cjs` to learn its exported shape — `appendCycle`,
`readExitState`, `computeSignature` — then write the mapping layer that expresses an
enumeration round as a ledger cycle. The ledger already knows how to spot a repeated
signature; this task teaches it what a round is, and nothing more.

What identifies a round: which rows are still open, and what the failing signature is when
running in `--after` mode.

The ledger is READ-ONLY. Import it; do not edit or copy it.

**Acceptance criteria**: The mapping calls the ledger's exported functions only;
`git diff bin/gsd-t-loop-ledger.cjs` is empty; no signature logic is reimplemented here.

---

### M115-D3-T2 — The round cap (three rounds without closure)

**Touches**: `bin/gsd-t-testplan-halt.cjs`
**Depends on**: M115-D3-T1
**Files**: `bin/gsd-t-testplan-halt.cjs`
**Test**: `test/m115-a5-non-convergence-halt.test.js`

Implement `[RULE] enumeration-loop-cap-three`. After three question rounds that have not
closed every open row, the tool HALTS and hands back `blocked-needs-human`.

The halt names what never settled: every still-open row by table and `Seq`, plus the round
count. A halt with no detail is unactionable.

A run that closes everything on round 1, 2 or 3 is NOT halted.

**Acceptance criteria**: Halts on the third unclosed round; the message names every
still-open row; converging runs pass through untouched; exit codes per contract §4.

---

### M115-D3-T3 — The repeated-symptom cap

**Touches**: `bin/gsd-t-testplan-halt.cjs`
**Depends on**: M115-D3-T1
**Files**: `bin/gsd-t-testplan-halt.cjs`
**Test**: `test/m115-a5-non-convergence-halt.test.js`

Implement `[RULE] same-symptom-twice-halts` by calling the ledger's `appendCycle` each
iteration and `readExitState` to detect the repeat.

When the same failure signature appears twice running, HALT. The message says plainly that
the belief behind the fix is wrong rather than the fix being insufficient, and that the
belief is what needs re-examining — not a third attempt at the same fix.

**Acceptance criteria**: Two identical signatures in a row → halt; two different signatures
→ no halt; the message directs at the premise, not at retrying; the ledger does the
signature work.

---

### M115-D3-T4 — Exit-code shape and the never-throws guarantee

**Touches**: `bin/gsd-t-testplan-halt.cjs`
**Depends on**: M115-D3-T2, M115-D3-T3
**Files**: `bin/gsd-t-testplan-halt.cjs`
**Test**: `test/m115-a5-non-convergence-halt.test.js`

Finish the tool to contract §4: exit `0` clean, `4` violations, `64` bad input; one JSON
envelope on stdout; never throws. Wrap the entry so any internal error becomes `exitCode: 64`
with a reason rather than a stack trace.

Ship `module.exports` plus a `require.main === module` CLI entry so it runs as
`node bin/gsd-t-testplan-halt.cjs` without needing registration.

`64` is a failure, not a pass. Nothing in this file continues after a failure.

**Acceptance criteria**: All three exit codes reachable and correct; a missing/unreadable
input yields `64` not `0`; a forced internal error yields `64` with a reason and no throw;
the file is runnable directly by node.

---

### M115-D3-T5 — Prove A5

**Touches**: `test/m115-a5-non-convergence-halt.test.js`
**Depends on**: M115-D3-T4
**Files**: `test/m115-a5-non-convergence-halt.test.js`
**Test**: `test/m115-a5-non-convergence-halt.test.js`

Prove both caps fire AND that neither fires early:

- Three rounds still open → halts, naming every open row.
- Converges on round 2 → does NOT halt.
- Same signature twice running → halts, message aimed at the premise.
- Two different signatures → does NOT halt.
- Unreadable input → exit `64`, not `0`.
- A forced internal error → exit `64`, no throw.
- `bin/gsd-t-loop-ledger.cjs` unmodified.

Run the tool as a real subprocess so the exit codes tested are the ones a caller sees, not
just a returned object.

**Acceptance criteria**: Every case above asserted; each halt test fails if its cap is
removed; each does-not-halt test fails if the cap is made over-eager; the ledger's
byte-identity is asserted mechanically.
