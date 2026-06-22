# Domain Tasks: m90-d-arch-trigger-response

> Shape D — `### Mxx-Dx-Tx`, each task carries a `**Touches**:` line. Validate at end of
> plan with `gsd-t parallel --dry-run`.

## Files Owned
- `bin/gsd-t-architectural-trigger.cjs`
- `templates/prompts/blind-adversary-subagent.md`
- `test/m90-architectural-trigger.test.js`
- `test/fixtures/m90-arch-divergence-corpus.json`

## Wave 1 — prove-or-kill (parallel with m90-d-loop-ledger-halt)

### M90-DA-T1 — Divergence-sampling trigger core (R-ARCH-1)
Build `bin/gsd-t-architectural-trigger.cjs`: given N fresh-context answers to the same
approach question, compute a divergence measure and return the house-style envelope naming
the basis being challenged. Deterministic: same answers → byte-identical envelope.
**Touches**: `bin/gsd-t-architectural-trigger.cjs`

### M90-DA-T2 — Protocol-class trigger on extend-existing-code (R-ARCH-2)
Add the protocol-class fire path: extending existing code is itself an approach decision →
trigger fires. Distinct envelope reason from the divergence path.
**Touches**: `bin/gsd-t-architectural-trigger.cjs`

### M90-DA-T3 — Response interface: blind-adversary + spike fallback (R-ARCH-3..6)
Define (interface only, no agent() wiring) the response modes the resolver returns:
`spike` (PREFERRED) with forced fallback to `adversary-only`; spike-fails→stop;
spike-infeasible→logged-skip + adversary MANDATORY; proven-by-adversary-only → a flag
surfaced for verify. Author `templates/prompts/blind-adversary-subagent.md` (separate
context/model = fable; extends M83 pre-mortem + Red-Team-on-fable).
**Touches**: `bin/gsd-t-architectural-trigger.cjs`, `templates/prompts/blind-adversary-subagent.md`

### M90-DA-T4 — Measurement-sink instrumentation
Emit fire-rate + catch-quality to a measurement sink. The module NEVER asserts it works —
it emits data only.
**Touches**: `bin/gsd-t-architectural-trigger.cjs`

### M90-DA-T5 — CLI subcommand + stable resolver export
Expose a CLI subcommand signature + `module.exports` resolver D-CONTRACT will wire at
integrate. Bad input → `{ok:false}` + non-zero exit. Freeze this signature after Wave 1.
**Touches**: `bin/gsd-t-architectural-trigger.cjs`

### M90-DA-T6 — The killing test (R1 exit) [HEADLINE]
`test/m90-architectural-trigger.test.js` drives the fixture corpus: asserts the trigger
FIRES deterministically on divergent fresh-context answers and stays SILENT on convergent
ones; asserts the extend-existing-code path fires; asserts bad input → `{ok:false}`.
If the trigger cannot fire deterministically, the test FAILS and the milestone HALTS for
R1 re-scope DOWN to factual-only.
**Touches**: `test/m90-architectural-trigger.test.js`, `test/fixtures/m90-arch-divergence-corpus.json`

## Dependency / gating
- No intra-domain serial gates; T1→T6 build the same module, write in order.
- **Gates the milestone:** M90-DA-T6 is the prove-or-kill. If RED, HALT (do not fund Wave 3 wiring of this trigger).
- File-disjoint from m90-d-loop-ledger-halt (zero shared files) → fully concurrent.
