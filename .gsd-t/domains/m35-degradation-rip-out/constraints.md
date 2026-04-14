# Constraints: m35-degradation-rip-out

## Hard constraints

1. **Option X (clean break)**: No compat shim for token-budget-contract v2.0.0. Callers updated in the same milestone.
2. **No model overrides ever**: `getDegradationActions()` and `getSessionStatus()` must never return a `modelOverride` field. This is enforced by the contract's Non-Goals section.
3. **No phase skipping ever**: No `skipPhases` list. Red Team, doc-ripple, Design Verify are always run — they are quality gates, not optional phases.
4. **Thresholds are tightened, not relaxed**: warn@70%, stop@85%. The runtime's native compact is ~95%, so stop@85% leaves a 10% buffer for the runway estimator (built in m35-runway-estimator) to refuse any run that would cross 85%.
5. **Historical prose preserved**: M31 references in `progress-archive/`, CHANGELOGs for v2.31-v2.75, and the methodology doc's historical narrative are PRESERVED. The rip-out is for live code paths only.

## File boundaries

- **OWNED**: `bin/token-budget.js`, `.gsd-t/contracts/token-budget-contract.md`, `test/token-budget.test.js`
- **EDITED (sweep)**: 6 command files, PRD §3.7, 2 templates — these must be coordinated so grep assertions pass
- **DO NOT TOUCH**: `bin/runway-estimator.js` (m35-runway-estimator), `bin/model-selector.js` (m35-model-selector-advisor), `bin/token-telemetry.js` (m35-token-telemetry)

## Testing

- Every change to `bin/token-budget.js` must be accompanied by updated tests in `test/token-budget.test.js`
- Full suite must remain green: 941 baseline → maintained after rip-out (some downgrade/conserve tests deleted, three-band tests added — net should land within ±5 of baseline by end of T2, then grow toward ~1030 across M35)

## Quality gates that cannot be skipped

- Red Team on every task that touches `bin/token-budget.js`
- Doc-ripple on T3 (sweeps 6 command files) and T4 (sweeps PRD + 2 templates)
