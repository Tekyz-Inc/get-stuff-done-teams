# Tasks: milestone-two-altitude-flow (M87 D3 — Wave 2)

## Files Owned
- `commands/gsd-t-milestone.md`
- `templates/workflows/gsd-t-phase.workflow.js`
- `templates/prompts/keep-or-supersede-subagent.md`
- `test/m87-milestone-signoff-flow.test.js`

---

### M87-D3-T1 — Two-altitude flow in /gsd-t-milestone
**Touches**: `commands/gsd-t-milestone.md`
**PseudoCode-Section**: PseudoCode-Extension#one-breath
Add steps: high-level approach pseudocode (what/why/when, actors, one-breath
summary) → user signs off APPROACH → detailed `PseudoCode-[Title].md` →
DEFINED only after detailed-doc sign-off. Default-ON; skip = logged decision.
Add Document Ripple section listing `PseudoCode-[Title].md`.
**Acceptance criteria**: SC3 — flow runs, DEFINED gated on sign-off, skip logged.
**Files**: `commands/gsd-t-milestone.md`.
**Test**: M87-D3-T4.
**Headline**: true

### M87-D3-T2 — Phase-workflow milestone branch + sign-off state + altitude shift
**Touches**: `templates/workflows/gsd-t-phase.workflow.js`
**PseudoCode-Section**: PseudoCode-Extension#mechanism
Implement the `"milestone"` phase two-altitude flow + sign-off state transition
(unsigned ≠ DEFINED). Wire D2's documented competition-altitude shift: the
solution-space probe shifts UP to the high-level-approach altitude when behavior
is spec'd. M71 sandbox-clean; M85 tier literals policy-conformant; M82 blindness
preserved (producers stay opus, judge differs).
**Acceptance criteria**: A6 — M71 + M85 lints stay green; A3 state transition correct.
**Files**: `templates/workflows/gsd-t-phase.workflow.js`.
**Test**: M87-D3-T4, plus existing `test/m71-...lint`, `test/m85-...lint` (stay green).
**Headline**: true

### M87-D3-T3 — Keep-or-supersede prompt protocol
**Touches**: `templates/prompts/keep-or-supersede-subagent.md`
**PseudoCode-Section**: PseudoCode-PayPal#divergence
Author the forcing keep-or-supersede protocol: per inherited shipped-code model,
ASK keep or supersede; each supersede emits a `⚠ Divergence` flag (§4 grammar)
into the doc. Bakes the PayPal stored-draft over-trust rescue into methodology.
**Acceptance criteria**: SC4 — supersede emits a Divergence flag.
**Files**: `templates/prompts/keep-or-supersede-subagent.md`.
**Test**: M87-D3-T4.

### M87-D3-T4 — A3 sign-off-gate tests
**Touches**: `test/m87-milestone-signoff-flow.test.js`
**PseudoCode-Section**: PseudoCode-Extension#mechanism
Negative test: unsigned detailed doc → NOT "DEFINED"; signing flips state.
Skip path → a logged decision assertable in progress.md (never silent
default-off). Assert a supersede in the flow emits a Divergence flag.
**Acceptance criteria**: A3 — unsigned ≠ DEFINED; sign flips; skip logged.
**Files**: `test/m87-milestone-signoff-flow.test.js`.
**Test**: this IS the test.
**Headline**: true

---

**DEPENDENCY:** Wave 2. Build only after D1's A1 passes.
