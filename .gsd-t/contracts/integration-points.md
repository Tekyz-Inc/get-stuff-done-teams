# M115 Integration Points — Test-Plan-First Requirements Interrogation

**Milestone:** M115 · **Domains:** 5 · **Waves:** 3 · **Tasks:** 25
**Partition commit:** `f7c5632` · **Plan pass:** 2026-09-03
**Source of truth:** `.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md`
**Frozen interface:** `.gsd-t/contracts/test-plan-first-contract.md` (DRAFT until A1 passes)

Simply stated: **one domain proves the idea works before anything else is built; one domain
owns every shared file so the rest cannot collide.**

---

## Wave Groupings

| Wave | Domains | Concurrency | Entry condition |
|---|---|---|---|
| **W1** | `enumerator-core` (D1) | **RUNS ALONE** | Milestone partitioned |
| **W2** | `plan-visibility` (D2) ∥ `halt-convergence` (D3) | Both concurrent | `test-plan-first-contract.md` reads `1.0.0 STABLE` |
| **W3** | `deterministic-gates` (D4) ∥ `front-door-wiring` (D5) | Both concurrent | Wave 2 green |

### W1 — the falsification gate (risk-first)

`enumerator-core` runs alone because the milestone's central bet is unproven: that a cold
enumeration driven by fixed rules reproduces what a human review found. It is tested FIRST,
against an answer key already on disk, before a command, a mold or a gate exists.

**If A1 fails**, the domain and its contract delete in one piece and the milestone halts for
premise re-examination — at the cost of one wave instead of five. That quarantine is the
entire reason this wave is serial.

**The gate out of W1 is a single machine-readable fact**: the Version line of
`test-plan-first-contract.md` reading `1.0.0 STABLE`. No downstream domain starts before it.

### W2 — the three silent-corruption surfaces

`plan-visibility` (A3 self-answer visibility + A6 evidence-or-halt) and `halt-convergence`
(A5 the two loop caps) share no file, which is what lets them run together. Both consume the
W1 contract; neither may edit it.

### W3 — the well-precedented remainder

`deterministic-gates` (A2 shape gate + A7 traceability widening) and `front-door-wiring`
(A8 front door + A4 one-round batching) run concurrently. `front-door-wiring` runs last in
dependency order because it wires up components that already exist and already passed their
own tests.

---

## File-disjointness verdict (re-validated this plan pass)

**Zero cross-domain write collisions.** Verified structurally, path-as-path, across all 21
distinct owned paths — every path appears in exactly one domain. `gsd-t parallel --dry-run`
parses all 25 tasks with `deps ok = yes` and no graph-BROKEN halt (graph live, 1,553 files).

| Domain | Owned write paths |
|---|---|
| `enumerator-core` (D1) | `templates/prompts/test-plan-enumerator-subagent.md` · `.gsd-t/contracts/test-plan-first-contract.md` · `test/m115-a1-blind-replay.test.js` |
| `plan-visibility` (D2) | `templates/TestPlan-spec.md` · `templates/prompts/test-plan-evidence-classifier.md` · `test/m115-a3-self-answer-visibility.test.js` · `test/m115-a6-evidence-or-halt.test.js` |
| `halt-convergence` (D3) | `bin/gsd-t-testplan-halt.cjs` · `test/m115-a5-non-convergence-halt.test.js` |
| `deterministic-gates` (D4) | `bin/gsd-t-testplan-lint.cjs` · `bin/gsd-t-traceability-gate.cjs` · `test/m115-a2-testplan-lint.test.js` · `test/m115-a7-traceability-plan-row.test.js` |
| `front-door-wiring` (D5) | `commands/gsd-t-test-plan.md` · `commands/gsd.md` · `bin/gsd-t.js` · `templates/workflows/gsd-t-verify.workflow.js` · `commands/gsd-t-help.md` · `GSD-T-README.md` · `README.md` · `templates/CLAUDE-global.md` · `test/m115-a8-front-door-test-plan.test.js` |

**The structural move:** every shared-file write in the milestone is quarantined into
`front-door-wiring`. Rather than negotiating who edits `bin/gsd-t.js`, exactly one domain
does — the collision is designed out rather than managed.

**Within a domain, tasks are serial** (each depends on its predecessor and they write the
same file). That is why `gsd-t parallel --dry-run` reports every task `sequential`: it is
intra-domain dep-chaining, not a cross-domain collision. Domain-level concurrency within a
wave is unaffected.

### Read-only files (touched by no domain — asserted, not assumed)

| File | Read by | Why it must not be written |
|---|---|---|
| `test/fixtures/m115-blind-replay/**` | D1 | The answer key. Editing it turns a falsifiable criterion unfalsifiable. Byte-identity is a Definition-of-Done item. |
| `bin/gsd-t-loop-ledger.cjs` | D3 | Consumed through frozen exports (`appendCycle`, `readExitState`, `computeSignature`). Reused, never forked. `git diff` empty is asserted. |
| `test/m83-traceability-gate.test.js`, `test/m87-*.test.js` | D4 | Their byte-identity AND passing IS the proof A7 is additive. Editing a test to accommodate a change is how "additive" becomes "replacing". |
| `bin/gsd-t-pseudocode-style.cjs` | D4 | Read for the proven gate shape. Modelled on, never modified. |
| `.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md` | all | Changing it to match the implementation inverts the relationship. |

---

## Cross-domain seams (contract-level — no shared file edits)

| Seam | Producer | Consumer(s) | Surface |
|---|---|---|---|
| Row schema (six columns, three row states) | D1 (T4) | D2 (mold), D4 (lint) | `test-plan-first-contract.md` §2 |
| Marker literals (`DECIDED-WITHOUT-YOU`, `GAP`, `GAP:CONTRADICTION`) | D1 (T4) | D2, D4 | §2.2 |
| Self-answered heading (`## Decided without you`) | D1 (T4) | D2 (T2 rule set), D4 (T1 lint) | §3 |
| Exit triple 0/4/64 + JSON envelope + module shape | D1 (T4) | D3, D4 | §4 |
| Gate verb names (`testplan-lint`, `testplan-halt`) | D1 (T4) | D4 (T5 confirms), D5 (T3 registers) | §5 |
| Loop-ledger reuse rule (READ-ONLY) | D1 (T4) | D3 | §6 |
| Traceability widening (additive only) | D1 (T4) | D4 (T3) | §7 |
| The A3 rule set | D2 (T2) | D4 (T1 implements it) | `templates/TestPlan-spec.md` |
| The enumeration protocol E1-E8 | D1 (T1/T2) | D5 (T1 points at it) | `templates/prompts/test-plan-enumerator-subagent.md` |
| The classifier protocol | D2 (T4) | D5 (T1 points at it) | `templates/prompts/test-plan-evidence-classifier.md` |
| Shipped tool → registration | D4 (T5), D3 (T4) | D5 (T3) | Filename + verb match, asserted mechanically in A8 |

**Why the verb names are frozen in W1**: `front-door-wiring` registers both tools without
waiting for the producing domain to finish. A tool present on disk but absent from
`PROJECT_BIN_TOOLS` / `GLOBAL_BIN_TOOLS` ships DEAD in every project — that has happened
five times in this repo's history, so the registration is a mechanical assertion in A8, not
a checklist item.

---

## Headline binding (M83 plan hardening)

| | |
|---|---|
| **Headline task** | `M115-D1-T3` — The A1 blind replay, cold |
| **Capability** | A cold enumeration from the rules alone reproduces what a human review found |
| **Implementing path** | `templates/prompts/test-plan-enumerator-subagent.md` (the E1-E8 protocol) |
| **Killing test** | `test/m115-a1-blind-replay.test.js` — runs the protocol cold against the real 571-line fixture and scores it per-gap against the held-out answer key |
| **Why it cannot be deferred** | It is the milestone's falsification gate. Deferring it means building five waves of machinery on an unproven bet — the exact NiceNote M5 dead-headline failure this rule exists to prevent. |

The test asserts **per gap, not on a count or a threshold**, so it fails if any single one of
the three known gaps goes unsurfaced.

---

## Acceptance-criteria map

| AC | Domain | Wave | Carrying task(s) |
|---|---|---|---|
| A1 — blind replay (HEADLINE) | `enumerator-core` | 1 | D1-T1, D1-T2, **D1-T3**, D1-T4 |
| A3 — self-answer visibility | `plan-visibility` | 2 | D2-T1, D2-T2, D2-T3 |
| A6 — evidence or halt | `plan-visibility` | 2 | D2-T4, D2-T5 |
| A5 — non-convergence halt | `halt-convergence` | 2 | D3-T1 … D3-T5 |
| A2 — test-plan shape gate | `deterministic-gates` | 3 | D4-T1, D4-T2, D4-T5 |
| A7 — traceability plan-row binding | `deterministic-gates` | 3 | D4-T3, D4-T4 |
| A8 — front-door test | `front-door-wiring` | 3 | D5-T3, D5-T4, D5-T5 |
| A4 — one-round batching | `front-door-wiring` | 3 | D5-T1, D5-T2 |

All eight acceptance criteria are carried inside M115. **None is deferred to a later
milestone.** Doc-First Enforcement is PARKED and is not an M115 acceptance criterion.

---

## Halt points (No-Fallback-Ever)

This plan designs in **no fallback**. Every place the straight line can fail is a HALT:

| Where | Condition | Behavior |
|---|---|---|
| W1 exit | A1 misses any of the three gaps, twice running | HALT `blocked-needs-human`, naming the gap. Do not weaken the criterion; do not start W2. |
| Enumeration bound | The case space reaches the settled bound | HALT naming the un-enumerated region. **Never a silent truncation** — a truncated plan looks complete and ships a missing requirement as a passing test. |
| Question rounds | Three rounds without closure | HALT naming every row that never settled. |
| Repeated symptom | The same failure signature twice running | HALT aimed at the premise, not at a third fix attempt. |
| Any gate | Cannot read its input / missing argument | Exit `64` — a failure, never a `0` pass. |
| Classifier | Evidence does not decide code-bug vs wrong-requirement | Escalate into the question round. No default branch, no fourth arm. |

`64` is a failure, not a pass. No gate in this milestone continues after a failure.
