# Domain: m35-runway-estimator

## Milestone: M35
## Status: DEFINED
## Wave: 3

## Purpose

Pre-flight runway estimation. Before any long-running phase (wave, execute multi-task, debug-loop, integrate), estimate how much context will be consumed and refuse to start if the projected end would cross the `stop` threshold (85%). Auto-spawn headless instead of prompting the user.

## Why this domain exists

M35's structural elimination of native compact messages (Part D) depends on never reaching the 95% runtime compaction threshold. The runway estimator enforces this at the entry point of every long-running phase — if the projected run can't finish cleanly, it refuses to start and hands off to headless auto-spawn (m35-headless-auto-spawn). Conservative skew: when in doubt, over-estimate consumption.

## Files in scope

- `bin/runway-estimator.js` — NEW module
- `.gsd-t/contracts/runway-estimator-contract.md` → v1.0.0 NEW
- `test/runway-estimator.test.js` — NEW (~20 tests)
- Command file Step 0 wire-ups:
  - `commands/gsd-t-execute.md` Step 0
  - `commands/gsd-t-wave.md` Step 0
  - `commands/gsd-t-debug.md` Step 0 + between-iteration check
  - `commands/gsd-t-integrate.md` Step 0
  - `commands/gsd-t-quick.md` Step 0 (lightweight)

## Files NOT in scope

- `bin/headless-auto-spawn.js` — m35-headless-auto-spawn owns
- `bin/token-telemetry.js` — m35-token-telemetry owns (but runway-estimator READS `.gsd-t/token-metrics.jsonl`)
- Interactive read-back banner — m35-headless-auto-spawn

## Dependencies

- **Depends on**:
  - m35-degradation-rip-out (needs the new three-band shape — stop threshold at 85%)
  - m35-token-telemetry (Wave 2) for historical data source; graceful degradation to conservative constant (4%/task sonnet, 8%/task opus) when log is empty or <10 records
- **Blocks**: m35-headless-auto-spawn (the estimator is what triggers headless handoff)

## Acceptance criteria

1. `bin/runway-estimator.js` exists with `estimateRunway({command, domain_type, remaining_tasks, projectDir})` → `{can_start, current_pct, projected_end_pct, confidence, recommendation}`
2. Data sources: `.gsd-t/.context-meter-state.json` (current) + `.gsd-t/token-metrics.jsonl` (historical); fall back to conservative constant when history <10 records
3. Confidence grade: `high` ≥ 50 matching records, `medium` ≥ 10, `low` < 10
4. Conservative skew: over-estimate in doubt
5. Unit tests cover: empty history, insufficient history, sufficient history, over-estimate skew, refusal path, proceed path (~20 tests)
6. At least 5 command files call the estimator at Step 0
7. Debug has inter-iteration check (between fix-apply iterations)
8. Smoke test: manually set CTX_PCT to 80% via fixture, invoke a wave, confirm it refuses and triggers headless spawn
