# Milestone Complete: M38 — Headless-by-Default + Meter Reduction

**Completed**: 2026-04-17
**Duration**: 2026-04-16 → 2026-04-17
**Status**: VERIFIED-WITH-WARNINGS (1 pre-existing test failure, unrelated to M38 scope)
**Version**: 3.11.12 → 3.12.10

## What Was Built

Headless spawning is now the default subagent spawn path across all 7 primary command files (execute, wave, integrate, quick, debug, scan, verify). The context meter has been reduced to its irreducible core. The unattended watch tick now surfaces real worker activity via structured JSONL events. Seven commands deleted. Five contracts folded or deleted. Net result: same "work never stops" UX achieved by structure instead of instrumentation, with ~10,374 lines deleted.

## Domains

| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| H1: Headless Spawn Default  | T1–T6 | autoSpawnHeadless promoted to default across 7 command files; --watch flag; bin/headless-auto-spawn.cjs conversion map; headless-default-contract.md v1.0.0 |
| MR: Meter Reduction         | T1–T8 | bin/runway-estimator.cjs + bin/token-telemetry.cjs deleted; three-band stripped; dead-meter detection removed; per-spawn token brackets gone; context-meter-contract.md v1.3.0 |
| ES: Unattended Event Stream | T1–T8 | bin/event-stream.cjs NEW; supervisor emits JSONL to .gsd-t/events/YYYY-MM-DD.jsonl; 270s watch tick reformed; unattended-event-stream-contract.md v1.0.0 |
| RC: Router Conversational   | T1–T5 | commands/gsd.md intent classifier; gsd-t-prompt, gsd-t-brainstorm, gsd-t-discuss deleted |
| CD: Cleanup + Docs          | T1–T10 | 4 self-improvement commands deleted; qa-calibrator.js + token-optimizer.js deleted; 9-doc living-doc ripple; CHANGELOG v3.12.10 |

## Contracts

- headless-default-contract.md v1.0.0 — NEW
- unattended-event-stream-contract.md v1.0.0 — NEW
- context-meter-contract.md v1.3.0 — UPDATED (drops three-band, dead-meter, Universal Auto-Pause)
- unattended-supervisor-contract.md v1.1.0 — UPDATED (event-stream emission §9)
- runway-estimator-contract.md — DELETED (folded)
- token-telemetry-contract.md — DELETED (folded)
- headless-auto-spawn-contract.md — DELETED (superseded)
- qa-calibration-contract.md — DELETED
- harness-audit-contract.md — DELETED

## Key Decisions

- M37 MANDATORY STOP banner fixed the symptom but not the cause. M38 fixes cause: spawn headless.
- Universal Auto-Pause Rule removed from CLAUDE-global.md and 5 loop commands.
- Command count: 61 → 54.
- scan.test.js:287 pre-existing failure accepted — tracked for M39/M40.

## Test Coverage

- 1176/1177 pass (1 pre-existing failure)
- Tests added: headless-default.test.js (11), event-stream.test.js, unattended-watch.test.js, router-intent.test.js
- Tests deleted: runway-estimator.test.js, token-telemetry.test.js, qa-calibrator.test.js, token-optimizer.test.js

## Git Tag

v3.12.10

## Files Changed

+7,446 / -10,374 across 122 files (net -2,928 lines)
