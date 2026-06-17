# Tasks: traceability-section-coverage (M87 D2 — Wave 2)

## Files Owned
- `bin/gsd-t-traceability-gate.cjs`
- `test/m87-traceability-section-coverage.test.js`

---

### M87-D2-T1 — Document the competition-altitude design decision (Wave 1 contribution)
**Touches**: `.gsd-t/domains/traceability-section-coverage/scope.md`
**PseudoCode-Section**: PseudoCode-Extension#one-breath
Record (in scope.md §"Design decision") the M82-competition-altitude-shift
interaction: gate stays altitude-agnostic; the shift is D3's workflow change
wired at integrate-time. (DONE at partition — this is the wave-1 contribution.)
**Acceptance criteria**: the interaction is SPECIFIED before build, not discovered at integrate.
**Files**: scope.md (this domain).

### M87-D2-T2 — Extend the gate with section-citation coverage
**Touches**: `bin/gsd-t-traceability-gate.cjs`
**PseudoCode-Section**: PseudoCode-Extension#guard-map
Parse `**PseudoCode-Section**: <Title>#<anchor>` from task blocks (path-as-path,
emphasis-stripped via existing `_bare`). When a `PseudoCode-[Title].md` is in
scope, build the set of its sections and the set of cited sections; report any
section with zero citing tasks as an uncovered structural gap. Preserve ALL
existing M83 behavior + exit codes.
**Acceptance criteria**: SC2 — extended not replaced; structural parse; existing M83 tests stay green.
**Files**: `bin/gsd-t-traceability-gate.cjs`.
**Test**: M87-D2-T3.
**Headline**: true

### M87-D2-T3 — A2 planted-gap test
**Touches**: `test/m87-traceability-section-coverage.test.js`
**PseudoCode-Section**: PseudoCode-Extension#guard-map
Feed a tasks.md that omits a task for one section of a binvoice exemplar (read
D1's fixtures read-only) → the gate reports that exact section as an uncovered
gap, path-as-path. Faithful corpus (every section cited) → no gap. Add a
substring-trap negative: a task mentioning the section NAME in prose but NOT
citing it structurally must STILL be reported as a gap.
**Acceptance criteria**: A2 — planted gap detected structurally; substring mention does not satisfy coverage.
**Files**: `test/m87-traceability-section-coverage.test.js`.
**Test**: this IS the test.
**Headline**: true

---

**DEPENDENCY:** Wave 2. Build M87-D2-T2/T3 only after D1's A1 passes.
M87-D2-T1 (design note) is the wave-1 contribution, complete at partition.
