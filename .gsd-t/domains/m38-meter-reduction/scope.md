# Domain: m38-meter-reduction

## Responsibility

Strip the context meter to its **irreducible core**. Keep the local-estimator hook + one-band threshold + `getSessionStatus()` backstop. Delete everything else: runway estimator, token telemetry, three-band model, dead-meter detection, per-spawn token bracket bash blocks across all command files, the Universal Auto-Pause Rule's MANDATORY STOP banner.

This domain depends on Domain 1 landing first because the meter machinery only becomes safe to delete once headless-by-default has shifted the cause of context growth (parent context inflates from in-context subagent transcripts → headless workers run in their own context, the parent doesn't grow).

**CRITICAL**: This domain must update the unattended supervisor's own callsites to `bin/token-budget.cjs` and meter state in the same atomic change as the deletions. The supervisor must not reach for deleted machinery.

## Owned Files/Directories

- `bin/token-budget.cjs` — strip three-band model down to single-band (threshold/normal); remove `dead-meter` detection, `stale` band, downgrade/conserve historical references in code paths
- `bin/runway-estimator.cjs` — DELETE
- `bin/token-telemetry.cjs` + `bin/token-telemetry.js` — DELETE
- `bin/check-headless-sessions.js` (and `.cjs` if exists) — REVIEW, may stay (results-banner is independent of telemetry); cut any token-telemetry references
- `bin/model-selector.js` — REVIEW; keep model-selector itself (Domain 5 keeps surgical model assignment); cut any runway/telemetry coupling
- `bin/advisor-integration.js` — REVIEW; may stay (it appends `missed_escalation` to token-log, harmless; or delete if Domain 5 confirms cleanup scope)
- `scripts/gsd-t-context-meter.js` — keep core measurement; remove dead-meter / stale-band logic
- `scripts/context-meter/threshold.js` — collapse `BANDS` from three-band to single-band; `bandFor` returns `normal`/`threshold` only
- `scripts/context-meter/test-injector.js`, `count-tokens-client.js`, `count-tokens-client.test.js` — DELETE if confirmed unused (pending review; they're already in `git status` as deleted files)
- All command files with **per-spawn Token Bracket** bash blocks — strip them: `gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-doc-ripple.md`, `gsd-t-partition.md`, `gsd-t-discuss.md`, `gsd-t-plan.md`, `gsd-t-verify.md`, `gsd-t-test-sync.md` (~11 files based on M35 Wave 2 telemetry sweep)
- All command files with **Step 0 Runway Gate** bash blocks — strip them
- All command files with **Step 0.2 Auto-Pause** MANDATORY STOP language (added by M37) — soften to a silent orchestrator-triggered headless spawn at threshold
- `bin/gsd-t-unattended.cjs` — update meter callsites; remove any reference to deleted machinery
- `bin/gsd-t-unattended-safety.js` — same; safety checks may have meter references
- Test files: rewrite the **7 stranded context-meter tests** in `scripts/gsd-t-context-meter.test.js` (TD-102); delete `test/runway-estimator.test.js`, `test/token-telemetry.test.js`; rewrite `test/token-budget.test.js` for single-band
- `.gsd-t/contracts/context-meter-contract.md` v1.3.0 — drops three-band, dead-meter detection, Universal Auto-Pause elevation, dead-band gating from resume

## NOT Owned (do not modify)

- `bin/headless-auto-spawn.cjs` (Domain 1 owns)
- `commands/gsd.md` (Domain 4)
- `commands/gsd-t-prompt.md`, `gsd-t-brainstorm.md`, `gsd-t-discuss.md` (Domain 4 deletes)
- Self-improvement commands and `bin/qa-calibrator.js` (Domain 5 deletes)
- `bin/gsd-t-unattended.cjs` event emission (Domain 3); but Domain 2 MAY edit unattended.cjs to update meter callsites
- `templates/CLAUDE-global.md`, project `CLAUDE.md`, all `docs/`, `README.md`, `GSD-T-README.md`, `CHANGELOG.md` (Domain 5)
- `.gsd-t/contracts/headless-default-contract.md` (Domain 1 NEW)
- `.gsd-t/contracts/runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md` (Domain 5 folds them into headless-default-contract)

## Coordination with Domain 1

Domain 1 + 2 land in **Wave 1 atomically**. Sequence within the wave:

1. Domain 1 lands first (headless-by-default in command files; headless-default-contract.md NEW)
2. Domain 2 lands second, in the same wave, with Domain 1's spawn pattern as input — Domain 2 strips the now-unused meter callsites that Domain 1's command files no longer reference
