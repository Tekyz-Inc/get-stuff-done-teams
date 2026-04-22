# Constraints: m43-d5-compaction-pressure-circuit-breaker

## Must Follow

- Zero external runtime deps (pure JS regression math, no numpy-equivalent).
- Deterministic: same input → same output. Fixture tests pin this.
- User-overridable: operator can set `--force-in-session` to bypass the circuit breaker for one-off emergencies; the override is logged to `.gsd-t/events/*.jsonl` with `compaction_pressure_override: true` for postmortem.
- Default window K=10 turns, threshold `predicted_turns_to_compact < 3` OR `score >= 0.85`. Both tunable via env vars (`GSD_T_COMPACTION_PRESSURE_K`, `_TRIGGER`).
- Never silently downgrade models — this is an M35 invariant. Circuit breaker forces spawn-mode change only, never model change.
- Banner text must be explicit: "Compaction pressure detected (K turns, slope X, predicted compact in Y turns). Routing to headless. Override: --force-in-session."

## Must Not

- Poll continuously. Check is done once at command start (spawn-time decision), not every turn.
- Write to the events JSONL — read-only consumer.
- Modify the per-call context meter thresholds — M34/M37's single-band model is untouched.
- Fire on cold sessions (< 3 turns of history) — return `{triggered: false, reason: "insufficient-history"}`.

## Must Read Before Using

- `scripts/gsd-t-context-meter.js` — understand how `ctxPct` is computed today.
- M35 runway-estimator history (it was retired in M38 — check the contract file for what was kept vs dropped; per D1 constraints, `bin/runway-estimator.cjs` no longer exists).
- `.gsd-t/contracts/context-meter-contract.md` v1.3.0 — what the single-band model promises. D5 adds a *trajectory* signal alongside, not replacing.
- Example session: read 20 rows from `.gsd-t/metrics/token-usage.jsonl` filtered by one `session_id` to understand the real trajectory shape.

## Dependencies

- Hard deps: D1 (data), D3 (schema v2 shape with session_id/turn_id).
- Integration dep: D4 (consumes the signal at spawn time).

## Acceptance

- Fixture test: flat 10-turn trajectory → `triggered: false`.
- Fixture test: linear growth trajectory predicting compaction within 3 turns → `triggered: true` with correct `predicted_turns_to_compact`.
- Integration: `/gsd-t-execute --in-session` with a mocked trajectory that triggers → spawns headless anyway + banner printed + event emitted.
- `--force-in-session` overrides + logs `compaction_pressure_override: true`.
- `npm test` green.
