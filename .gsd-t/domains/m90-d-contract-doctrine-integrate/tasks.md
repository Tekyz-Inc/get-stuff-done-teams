# Domain Tasks: m90-d-contract-doctrine-integrate

> Shape D — `### Mxx-Dx-Tx`, each task carries a `**Touches**:` line. Wave 3, single-owner
> of all shared surfaces.

## Files Owned
- `.gsd-t/contracts/unproven-assumption-doctrine-contract.md`
- `.gsd-t/contracts/auto-research-contract.md`
- `templates/workflows/gsd-t-debug.workflow.js`
- `templates/workflows/gsd-t-execute.workflow.js`
- `templates/workflows/gsd-t-phase.workflow.js`
- `templates/workflows/gsd-t-quick.workflow.js`
- `templates/workflows/gsd-t-verify.workflow.js`
- `bin/gsd-t.js`
- `bin/gsd-t-model-tier-policy.cjs`
- `templates/prompts/red-team-subagent.md`
- `templates/prompts/qa-subagent.md`
- `templates/prompts/pre-mortem-subagent.md`
- `templates/CLAUDE-global.md`
- `docs/requirements.md`
- `commands/gsd-t-help.md`
- `README.md`
- `GSD-T-README.md`
- `package.json`
- `test/m90-guardmap-rule-traceability.test.js`
- `test/m90-tier-policy-lint.test.js`

## Wave 3 — integrate (after Waves 1–2 prove-or-kill GREEN)

### M90-DC-T1 — Doctrine contract (§4/§5/§6 + envelope pins) [HEADLINE]
Author `unproven-assumption-doctrine-contract.md` v1.0.0 STABLE absorbing
`auto-research-contract.md` v1.3.3; pin the JSON envelope shapes of all three mechanisms
(classifier, trigger, ledger); specify §4 fail-closed (R-FAIL-1/2/3), §5 self-obedience
(R-SELF-1), §6 guard map ([RULE]→enforcement). Leave an absorbed pointer in the old
contract + update its consumer refs.
**Touches**: `.gsd-t/contracts/unproven-assumption-doctrine-contract.md`, `.gsd-t/contracts/auto-research-contract.md`

### M90-DC-T2 — Dispatch + PROJECT_BIN_TOOLS + tier entry
Register `gsd-t-architectural-trigger.cjs` + `gsd-t-loop-ledger.cjs` dispatch cases +
PROJECT_BIN_TOOLS entries in `bin/gsd-t.js`; add the blind-adversary `fable` tier entry to
`bin/gsd-t-model-tier-policy.cjs` if a new stage label is introduced.
**Touches**: `bin/gsd-t.js`, `bin/gsd-t-model-tier-policy.cjs`

### M90-DC-T3 — Wire D-LOOP halt into debug workflow (runtime-native)
Add the loop-ledger halt seam to `gsd-t-debug.workflow.js` via the inline runCli helper.
RUN the workflow to completion (sandbox), not `node --check`.
**Touches**: `templates/workflows/gsd-t-debug.workflow.js`

### M90-DC-T4 — Wire D-ARCH trigger + D-FACTUAL classify into phase + worker workflows
Thread the architectural trigger + factual classifier into `gsd-t-phase`, `gsd-t-execute`,
`gsd-t-quick` via inline runCli helpers (only if Wave-1 trigger cleared prove-or-kill; else
factual-only). M71 lint stays green.
**Touches**: `templates/workflows/gsd-t-phase.workflow.js`, `templates/workflows/gsd-t-execute.workflow.js`, `templates/workflows/gsd-t-quick.workflow.js`

### M90-DC-T5 — Verify reads the flagged states (§4 fail-closed) [HEADLINE]
`gsd-t-verify.workflow.js` FAILS on: uncited external claim (R-FACT-4), unresolved
proven-by-adversary-only (R-ARCH-6), halted-but-no-re-examination (R-LOOP-3 / D-LOOP state).
Triad prompt touchpoints read these states.
**Touches**: `templates/workflows/gsd-t-verify.workflow.js`, `templates/prompts/red-team-subagent.md`, `templates/prompts/qa-subagent.md`, `templates/prompts/pre-mortem-subagent.md`

### M90-DC-T6 — Doc ripple (full blast radius, one pass)
Replace CLAUDE-global Research Policy prose with the doctrine; add the M90 requirement;
update help; README + GSD-T-README capability surface; bump `package.json` 4.6.11 → 4.7.10.
Live `~/.claude/CLAUDE.md` matched to the template.
**Touches**: `templates/CLAUDE-global.md`, `docs/requirements.md`, `commands/gsd-t-help.md`, `README.md`, `GSD-T-README.md`, `package.json`

### M90-DC-T7 — Guard-map traceability + tier-policy lint [HEADLINE]
`test/m90-guardmap-rule-traceability.test.js` traces each §6 [RULE] to its enforcement (the
Red Team menu) — an unenforced rule FAILS. `test/m90-tier-policy-lint.test.js` proves new
stages' `model:` literals match the policy; a drifted literal FAILS (mandatory negative test).
**Touches**: `test/m90-guardmap-rule-traceability.test.js`, `test/m90-tier-policy-lint.test.js`

## Dependency / gating
- **Gated on Waves 1 + 2** all GREEN. Wave 1 prove-or-kill governs whether the trigger is
  wired (M90-DC-T4) or skipped per R1 re-scope.
- Serial within the domain (shared-surface single-owner): T1→T2→{T3,T4}→T5→T6→T7.
- No parallel domain writes any file here.
