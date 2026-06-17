# Domain: milestone-two-altitude-flow

**Milestone**: M87 — Intention-First PseudoCode as Source-of-Truth
**Wave**: 2 (starts only after D1's A1 passes)
**Risk**: LOW — known GSD-T patterns (`/gsd-t-milestone` + phase-workflow +
a sign-off checkpoint + a prompt protocol).
**Risk isolation**: owns the milestone command, the phase-workflow milestone
branch, and the keep-or-supersede prompt — disjoint from the bin modules (D1/D2)
and from D4's template/contract/doc-ripple.

## Thesis (R3 + R4)

The two-altitude intention-first authoring flow plus the sign-off gate plus the
keep-or-supersede protocol:

1. High-level approach pseudocode (what/why/when, actors, one-breath summary)
   → user signs off the APPROACH →
2. Detailed decomposition to `PseudoCode-[Title].md` at exemplar granularity →
3. Milestone reaches **DEFINED only after the detailed doc is signed off**.
   Default-ON; skip is a LOGGED decision, never a silent default-off
   (`feedback_no_silent_degradation`).

Per inherited-from-shipped-code model, the agent asks **keep-or-supersede**;
each supersede emits a `⚠ Divergence` flag in the doc (§4 of the
source-of-truth contract). This bakes in the exact PayPal stored-draft
over-trust rescue.

## Deliverables

- `commands/gsd-t-milestone.md` — the two-altitude flow + sign-off gate steps.
- `templates/workflows/gsd-t-phase.workflow.js` — the `"milestone"` phase branch
  carrying the two-altitude flow + sign-off state transition. ALSO owns the
  integrate-time wiring of D2's documented competition-altitude shift (the
  solution-space probe shifting UP to the high-level-approach altitude).
- `templates/prompts/keep-or-supersede-subagent.md` — the forcing keep-or-supersede
  prompt protocol that emits `⚠ Divergence` flags.
- A3 sign-off-gate tests.

## Files Owned

- `commands/gsd-t-milestone.md`
- `templates/workflows/gsd-t-phase.workflow.js`
- `templates/prompts/keep-or-supersede-subagent.md`
- `test/m87-milestone-signoff-flow.test.js`
- `.gsd-t/domains/milestone-two-altitude-flow/{scope,constraints,tasks}.md`

## Acceptance Criteria

- **A3:** a milestone defined with the detailed doc UNSIGNED is reported NOT
  "DEFINED"; signing flips the state. Skip emits a logged decision (assertable
  in progress.md), never silent default-off.
- **SC3:** `/gsd-t-milestone` runs the two-altitude flow, DEFINED only after
  detailed-doc sign-off, default-ON, skip logged.
- **SC4:** keep-or-supersede asked per inherited model; each supersede emits a
  `⚠ Divergence` flag captured in the doc.

## Boundaries (NOT owned)
- Does NOT edit the bin modules (D1/D2) or `bin/gsd-t.js`.
- Does NOT author `templates/PseudoCode-spec.md`, the contract, or doc-ripple (D4).
- Does NOT edit the verify triad prompts (A5 integrate seam).
- Workflow edits stay M71 sandbox-clean (no require/fs/process) and M85
  tier-policy-conformant (A6).
