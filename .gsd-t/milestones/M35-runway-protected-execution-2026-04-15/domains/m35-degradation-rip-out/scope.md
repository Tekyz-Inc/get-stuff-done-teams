# Domain: m35-degradation-rip-out

## Milestone: M35
## Status: DEFINED
## Wave: 1 (tasks 1-2), 2 (tasks 3-4)

## Purpose

Rip out the silent `downgrade` and `conserve` threshold bands from `bin/token-budget.js` entirely and replace the public API with a three-band model (`normal`/`warn`/`stop`). This is the foundational M35 change — every other domain builds on the new shape. Clean break, no compat shim (Option X).

## Why this domain exists

M31 introduced silent quality-degradation bands that swap models down (opus→sonnet→haiku) and skip Red Team / doc-ripple / Design Verify under context pressure. The user never agreed to this and it violates GSD-T's core principle of excellent, deeply-tested results. M34 preserved the bands byte-for-byte and made them MORE dangerous by feeding them real context measurement. M35 removes them at the source.

## Files in scope

- `bin/token-budget.js` — rewrite `getDegradationActions()`, delete `applyModelOverride()`, delete `skipPhases` constants, retune thresholds to warn@70%/stop@85%
- `.gsd-t/contracts/token-budget-contract.md` → v3.0.0 (clean break from v2.0.0)
- `test/token-budget.test.js` — delete `downgrade`/`conserve` tests, add new three-band tests
- `commands/gsd-t-execute.md` — replace "Token Budget Check" block
- `commands/gsd-t-wave.md` — replace "Token Budget Check" block
- `commands/gsd-t-quick.md` — replace "Token Budget Check" block
- `commands/gsd-t-integrate.md` — replace "Token Budget Check" block
- `commands/gsd-t-debug.md` — replace "Token Budget Check" block
- `commands/gsd-t-doc-ripple.md` — replace "Token Budget Check" block
- `docs/prd-harness-evolution.md` — §3.7 rewritten ("Pre-Flight Runway + Pause-Resume replaces Token-Aware Orchestration")
- `templates/CLAUDE-global.md` — remove `downgrade`/`conserve` references
- `templates/CLAUDE-project.md` — remove `downgrade`/`conserve` references

## Files NOT in scope

- `bin/runway-estimator.js` (new) — handled by m35-runway-estimator domain
- `bin/model-selector.js` (new) — handled by m35-model-selector-advisor domain
- Token telemetry writer — handled by m35-token-telemetry domain
- Historical prose references (M31 sections in progress-archive, CHANGELOG entries for M31-M34) — intentionally preserved

## Dependencies

- **Depends on**: Nothing (foundational)
- **Blocks**: Every other M35 domain — they all consume the new `{band: 'normal'|'warn'|'stop', pct, message}` shape

## Acceptance criteria

1. `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" bin/ commands/ docs/ templates/` returns zero hits outside historical prose (M31 archive, CHANGELOGs for v2.31-v2.75)
2. `bin/token-budget.js` `getDegradationActions()` returns `{band, pct, message}` — never a model override or skip list
3. Tightened thresholds: warn@70%, stop@85%
4. `test/token-budget.test.js` updated — `downgrade`/`conserve` branches deleted, new three-band tests added
5. Token-budget-contract.md at v3.0.0 with explicit Non-Goals section
6. All 6 consumer command files updated to the new handler
7. PRD §3.7 rewritten with explicit "M31 framing was wrong" call-out
8. Both CLAUDE templates updated
9. Full test suite green
