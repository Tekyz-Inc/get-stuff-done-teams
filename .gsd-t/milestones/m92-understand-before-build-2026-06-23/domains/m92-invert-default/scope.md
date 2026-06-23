# Scope: m92-invert-default (M92 D3 — move 3)

## Mission
Flip GSD-T's default altitude from "build a ship" to "three boards." Today minimality is a single toothless prose line (`gsd-t-quick.workflow.js:186` "SIMPLICITY ABOVE ALL — minimal change") the model overrides, and the milestone/quick framing presents ceremony (plan→execute, partition, competition) as the path. BinVoice's GSD-T recommended the heaviest option EVERY turn; the user had to drag it down manually — and autonomous runs have no one to drag. This domain inverts the default so the **smallest change that hits the crux is the recommendation**, and ceremony is **opt-in, justified by the crux**.

## What "invert the default" means concretely (NOT a new gate — a framing flip)
- **`commands/gsd-t-milestone.md`** + **`commands/gsd-t-quick.md`**: where the prompt/Next-Up framing implies "bigger is more rigorous," reframe so the FIRST option offered is the smallest-altitude one ("do it directly / one-file change"), and plan→execute/partition is presented as the opt-in escalation when the crux genuinely needs it — not the default "Recommended."
- **`templates/workflows/gsd-t-quick.workflow.js`**: upgrade the lone `- SIMPLICITY ABOVE ALL — minimal change` line into a forcing, FIRST-CLASS instruction block (crux-first: "what's the crux? what already exists? what's the SMALLEST change that hits it? edit inward at the source, not outward at consumers") — prose, but structured + leading, not a buried adjective.

## Files Owned
- `commands/gsd-t-milestone.md`
- `commands/gsd-t-quick.md`
- `templates/workflows/gsd-t-quick.workflow.js`
- `test/m92-invert-default.test.js` (new)

## Out of scope
- The arch-trigger ladder (D1) and the verify shrink-verdict (D2). This is a PROSE/FRAMING flip in the quick + milestone surfaces only — no new CLI, no new gate, no new subsystem.
- `gsd-t-phase.workflow.js` (the milestone-phase framing) — D3 does NOT edit it (it's the integrate-seam surface D1's ladder wires into; touching it here would collide). The milestone COMMAND prompt (`commands/gsd-t-milestone.md`) is D3's; the milestone WORKFLOW (`gsd-t-phase.workflow.js`) is integrate-seam.

## Deterministic-gate bar (adapted — this is prose)
The test is structural/positional (the smallest-option framing PRECEDES the ceremony framing; the crux-first block is present + leading in quick.workflow), not a runtime gate. Per M91 D3's precedent (structural assertions over command/workflow text, index-comparison not bare substring).
