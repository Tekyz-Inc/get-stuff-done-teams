# Tasks: m43-d5-compaction-pressure-circuit-breaker

## Wave 2 — Parallel with D2, D4, D6

### D5-T1 — Author `compaction-pressure-contract.md` v1.0.0
- Algorithm: last K turns, linear regression slope on `input_tokens`.
- Threshold: `predicted_turns_to_compact < 3` OR `score >= 0.85`.
- Override: `--force-in-session` + event log entry.
- Link back to M43 rationale + bee-poc incident.

### D5-T2 — Implement `bin/gsd-t-compaction-pressure.cjs`
- `computeTrajectory({sessionId, k, usageJsonlPath}) → {slope, intercept, latest_input_tokens}`.
- `predictTurnsToCompact({trajectory, modelContextCap}) → number`.
- `evaluate({sessionId, ...}) → {triggered, predicted_turns_to_compact, score, reason}`.
- Zero deps. Guard against <3-turn history.

### D5-T3 — Wire into `bin/headless-auto-spawn.cjs`
- Call `evaluate()` at spawn decision time (after the static context-band check).
- If triggered: force headless, emit banner, write event.
- Respect `--force-in-session` override.

### D5-T4 — `gsd-t status` integration
- Print current trajectory score + predicted compact horizon in status output.

### D5-T5 — Fixture tests `test/m43-compaction-pressure.test.js`
- Flat, steep, outlier-resistant (median), insufficient-history.
- Integration test: spawn decision under triggered signal.

### D5-T6 — Doc ripple
- Update `CLAUDE.md` (global + project) with the circuit breaker concept.
- Update `docs/architecture.md` "Token Pipeline" section (M43 additions).
- Progress Decision Log.
