# Domain Tasks: m90-d-loop-ledger-halt

> Shape D — `### Mxx-Dx-Tx`, each task carries a `**Touches**:` line. Validate at end of
> plan with `gsd-t parallel --dry-run`.

## Files Owned
- `bin/gsd-t-loop-ledger.cjs`
- `test/m90-loop-ledger-halt.test.js`

## Wave 1 — prove-or-kill (parallel with m90-d-arch-trigger-response)

### M90-DL-T1 — Computed symptom-signature
Build `bin/gsd-t-loop-ledger.cjs`: compute a deterministic signature key from the failing
assertion / surface / file-class — NOT the agent's prose label. Identical failure
surface → identical key.
**Touches**: `bin/gsd-t-loop-ledger.cjs`

### M90-DL-T2 — Append-cycle ledger (R-LOOP-1)
Append a cycle each call keyed by computed signature. A fix that closes signature A but
opens signature B still increments (variant-spawning IS the pathology, not progress).
**Touches**: `bin/gsd-t-loop-ledger.cjs`

### M90-DL-T3 — Hard-halt exit-state (R-LOOP-2) [HEADLINE]
On the 3rd cycle of the SAME computed signature, the ledger exit-state HARD-HALTS the patch
path. The halt is a returned ledger fact; the agent cannot dispatch another variant.
**Touches**: `bin/gsd-t-loop-ledger.cjs`

### M90-DL-T4 — Premise-re-examination directive (R-LOOP-3) + fail-closed state (R-FAIL-3)
On halt, emit a premise-re-examination directive routing to the architectural hook
(D-ARCH). Expose a `halted-but-no-re-examination` state for D-CONTRACT's fail-closed gate.
**Touches**: `bin/gsd-t-loop-ledger.cjs`

### M90-DL-T5 — CLI subcommand + stable export
CLI subcommand + `module.exports` (append-cycle → ledger fact + halt decision; read
exit-state). Bad input → `{ok:false}` + non-zero exit. Freeze signature after Wave 1 for
D-CONTRACT to wire.
**Touches**: `bin/gsd-t-loop-ledger.cjs`

### M90-DL-T6 — The killing test (must FIRE not narrate) [HEADLINE]
`test/m90-loop-ledger-halt.test.js`: drive 3 same-signature cycles → assert HARD-HALT
exit-state fires deterministically; assert a signature-B-opening fix still increments;
assert the premise-re-examination directive is emitted on halt; assert
`halted-but-no-re-examination` is exposed; bad input → `{ok:false}`.
**Touches**: `test/m90-loop-ledger-halt.test.js`

## Dependency / gating
- T1→T6 build the same module; write in order, no intra-domain serial gate.
- **Gates the milestone:** M90-DL-T6 is prove-or-kill. RED → escalate (non-converging halt = design defect).
- File-disjoint from m90-d-arch-trigger-response (zero shared files) → fully concurrent.
