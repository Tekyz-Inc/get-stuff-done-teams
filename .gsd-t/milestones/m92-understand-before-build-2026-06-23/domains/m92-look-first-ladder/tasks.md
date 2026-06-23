# Tasks: m92-look-first-ladder (M92 D1 — move 1)

## Files Owned
- `bin/gsd-t-architectural-trigger.cjs`
- `test/m92-look-first-ladder.test.js`

---

### M92-D1-T1 — Add the look→smallest→spike→defer ladder to `resolveResponseMode`
**Touches**: `bin/gsd-t-architectural-trigger.cjs`
**PseudoCode-Section**: (n/a — M92 has no PseudoCode doc; ladder spec is the brief §3)
Extend `resolveResponseMode({spikeFeasible, spikePassed, looked, smallestProposed})` so the
DEFAULT (no spike result yet) is **look-first**, not spike-preferred. The rung order:
- **look** (DEFAULT when nothing tried) → `mode:"look"`, `lookDirective:"grep/read the touched existing files; confirm what already exists before choosing scope"`, `stopDirective:false`. This is the cheap rung that kills most assumptions.
- **smallest** (when `looked===true`) → `mode:"smallest"`, `smallestDirective:"propose the smallest-altitude change that hits the crux; edit inward at the source, not outward at consumers"`, `stopDirective:false`.
- **spike** (when `looked && smallestProposed` AND `spikeFeasible!==false` — i.e. real uncertainty REMAINS after look+smallest) → existing `mode:"spike"` behavior. **DEMOTED** from default to here.
- **defer** (terminal, for discovered-warts) → `mode:"defer"`, `deferDirective:"a wart discovered mid-change is captured for later, never cleaned inline"`, `stopDirective:false`.
- PRESERVE existing R-ARCH-4 (spike failed → STOP) and R-ARCH-5 (`spikeFeasible===false` → adversary-only) EXACTLY — they still fire on their explicit inputs.
Pure, zero-dep, never-throws.
**Acceptance criteria**: default (no inputs) → `mode:"look"` (NOT spike); `looked` → `smallest`; `looked+smallestProposed` (uncertainty remains, spike feasible) → `spike`; spike-fail → STOP (R-ARCH-4 preserved); `spikeFeasible:false` → adversary-only (R-ARCH-5 preserved); all existing envelope keys (`stopDirective`, `provenByAdversaryOnly`, `adversaryMandatory`, `mode`) still emitted with unchanged semantics for the existing modes.
**Files**: `bin/gsd-t-architectural-trigger.cjs`.
**Test**: M92-D1-T2.
**Headline**: true

### M92-D1-T2 — Killing test for the ladder + backward-compat
**Touches**: `test/m92-look-first-ladder.test.js`
**PseudoCode-Section**: (n/a)
Assert the full rung table deterministically:
- no inputs → `mode:"look"` with a non-empty `lookDirective`, `stopDirective:false` (proves spike is NO LONGER the default — this is the move's whole point; a test that passes when default stays `spike` is vacuous);
- `{looked:true}` → `mode:"smallest"` with `smallestDirective`;
- `{looked:true, smallestProposed:true}` → `mode:"spike"` (uncertainty remains, default-feasible);
- `{looked:true, smallestProposed:true, spikeFeasible:false}` → `adversary-only` + `adversaryMandatory:true` (R-ARCH-5 preserved);
- `{spikePassed:false}` → `stopDirective:true` (R-ARCH-4 preserved);
- `{spikePassed:true}` → `mode:"spike"`, not stopped.
**BACKWARD-COMPAT (non-vacuous guard):** assert EVERY return shape still carries `stopDirective` (boolean), `mode` (string), `adversaryMandatory`, `provenByAdversaryOnly` — the keys `execute`/`quick`/`verify` read. A renamed/dropped key is a FAILURE (it would fail-OPEN those gates). Module never throws on garbage input.
**Acceptance criteria**: full rung table asserted (look default proven, not spike); R-ARCH-4/5 preserved; every envelope shape carries the 4 existing keys; never throws.
**Files**: `test/m92-look-first-ladder.test.js`.
**Test**: this IS the test.

---

**INTEGRATE-SEAM (serial, NOT this domain):** the 4 workflows that read the envelope surface the new `mode`/`lookDirective`/`smallestDirective`/`deferDirective` at integrate-time. Doctrine contract §2.2 rung-set update at integrate. M85 tier-policy / M71 sandbox lints stay green (this domain edits no workflow, so they're unaffected — verify at integrate).
