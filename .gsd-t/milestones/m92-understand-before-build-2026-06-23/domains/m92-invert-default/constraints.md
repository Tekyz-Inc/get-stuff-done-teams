# Constraints: m92-invert-default (M92 D3)

- FRAMING flip, not a gate or subsystem — prose/structure only. No new CLI, no new runtime dep.
- Do NOT remove existing functional steps from the command files — reorder/reframe the recommendation, keep the machinery.
- Do NOT edit `gsd-t-phase.workflow.js` (integrate-seam / D1's ladder-wiring surface) — D3's milestone surface is the COMMAND file, not the workflow.
- M71 sandbox: `gsd-t-quick.workflow.js` edit is prose-only — add no require/fs/path/child_process/process. M85 tier literals unchanged.
- Structural test per M91-D3 precedent: positional/index assertions, never bare substring presence.
- File-disjoint from D1 (arch-trigger) and D2 (verify.workflow + shrink-metric).
- Doc-ripple: a material change to a command's interface text → flag for GSD-T-README/README at integrate (Pre-Commit Gate).
