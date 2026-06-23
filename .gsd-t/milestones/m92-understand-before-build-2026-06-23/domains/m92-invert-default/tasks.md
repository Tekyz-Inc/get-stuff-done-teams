# Tasks: m92-invert-default (M92 D3 — move 3)

## Files Owned
- `commands/gsd-t-milestone.md`
- `commands/gsd-t-quick.md`
- `templates/workflows/gsd-t-quick.workflow.js`
- `test/m92-invert-default.test.js`

---

### M92-D3-T1 — Crux-first / smallest-default block in the quick workflow
**Touches**: `templates/workflows/gsd-t-quick.workflow.js`
**PseudoCode-Section**: (n/a)
Replace the lone buried `- SIMPLICITY ABOVE ALL — minimal change` constraint line with a
LEADING, structured crux-first block at the TOP of the task framing (before the other
constraints), instructing the worker: (1) state the CRUX of the ask in one line; (2) grep/read
what ALREADY exists before choosing scope; (3) propose the SMALLEST change that hits the crux —
edit inward at the source, not outward at the N consumers; (4) escalate to ceremony only if the
crux genuinely needs it. M71 sandbox-clean (prose only — no require/fs added); M85 tier literals
unchanged.
**Acceptance criteria**: the crux-first block is PRESENT and PRECEDES the other constraints in the framing (positional, not just present); the "smallest change / edit inward at the source" directive is explicit; M71 + M85 lints stay green.
**Files**: `templates/workflows/gsd-t-quick.workflow.js`.
**Test**: M92-D3-T3.
**Headline**: true

### M92-D3-T2 — Invert the ceremony default in the milestone + quick command prompts
**Touches**: `commands/gsd-t-milestone.md`, `commands/gsd-t-quick.md`
**PseudoCode-Section**: (n/a)
In both command files, reframe so the SMALLEST-altitude path is the default/first recommendation
and ceremony (plan→execute, partition, competition) is the OPT-IN escalation justified by the crux
— not the implied-default "Recommended." Concretely: where the command guides the user/agent on
how to proceed, lead with "smallest change that hits the crux (do it directly)" and present
plan/partition as "escalate to this when the crux needs cross-domain coordination / real
uncertainty." Keep all existing functional steps; this is a FRAMING flip, not a step removal.
**Acceptance criteria**: both command files lead with the smallest-option framing; ceremony is presented as crux-justified opt-in; no functional step removed (the commands still work end-to-end); doc-ripple — if either command's interface text changes materially, note it for the GSD-T-README/README pass at integrate.
**Files**: `commands/gsd-t-milestone.md`, `commands/gsd-t-quick.md`.
**Test**: M92-D3-T3.

### M92-D3-T3 — Structural test for the inverted default
**Touches**: `test/m92-invert-default.test.js`
**PseudoCode-Section**: (n/a)
Structural/positional assertions (M91-D3 precedent — index-comparison, not bare substring):
- `gsd-t-quick.workflow.js`: the crux-first block exists AND its position INDEX precedes the
  general constraints (a workflow where the smallest/crux framing is absent or buried BELOW the
  old constraint line FAILS — non-vacuous);
- `commands/gsd-t-milestone.md` + `commands/gsd-t-quick.md`: the smallest-option framing appears
  BEFORE the ceremony/plan→execute framing (positional), proving the default was inverted, not
  just a new sentence appended after the old default;
- regression: the existing functional anchors (the commands' core step structure) are still present.
**Acceptance criteria**: crux-first block precedes constraints in quick.workflow; smallest-framing precedes ceremony-framing in both command files; existing functional step anchors preserved; a file where the old heavy-default ordering remains FAILS.
**Files**: `test/m92-invert-default.test.js`.
**Test**: this IS the test.
