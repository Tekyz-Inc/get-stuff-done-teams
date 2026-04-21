# Domain: m43-d5-compaction-pressure-circuit-breaker

## Responsibility

Close the loophole where the per-call context meter looks fine at any individual turn but the **turn-over-turn growth trajectory** predicts the next `/compact` within N turns. D5 ships a **compaction-pressure signal** that tracks per-turn usage growth and fires when the next compaction is predicted within a configurable window. When the signal is tripped, in-session command starts are **refused** and auto-routed to headless, with a clear operator message explaining why.

The bee-poc pathology (3 compactions in one day; interval collapsing 51min → 11min) is the canonical failure mode this domain exists to prevent.

## Owned Files/Directories

- `bin/gsd-t-compaction-pressure.cjs` — NEW. Pure library that:
  - Reads the last K per-turn rows from `.gsd-t/metrics/token-usage.jsonl` for the current session.
  - Computes linear regression slope of `input_tokens` over turn index.
  - Predicts turns-to-next-compact given the current growth rate + the model's context cap.
  - Returns `{triggered: boolean, predicted_turns_to_compact: number, score: 0..1, reason: string}`.
- Patch `bin/headless-auto-spawn.cjs` to consult `compaction-pressure` signal alongside the static context-meter band. If `triggered === true` → force headless regardless of `--in-session`, emit a clear banner.
- `.gsd-t/contracts/compaction-pressure-contract.md` — NEW v1.0.0. Documents the algorithm, threshold, window (default K=10 turns), and user-override mechanism.
- `test/m43-compaction-pressure.test.js` — NEW. Fixture tests:
  - Flat trajectory → not triggered.
  - Steep positive slope + short horizon → triggered.
  - Mixed session with one outlier turn → uses median slope, not single-point outlier.
  - Triggered signal forces headless even with `--in-session` and emits the banner.
- `scripts/gsd-t-event-writer.js` — verify only (read-only). D5 doesn't emit events, but the trajectory data must come from a complete event + token-usage stream.

## NOT Owned

- Context meter itself (`scripts/gsd-t-context-meter.js`) — owned by M34 code, read-only here.
- Command file edits — D4.
- Transcript viewer URL — D6.

## Contract Surface

- New: `compaction-pressure-contract.md` v1.0.0 — formalizes the circuit breaker.
- References: `metrics-schema-contract.md` v2 (`compaction_pressure` optional field on rows when computed proactively).

## Consumers

- `bin/headless-auto-spawn.cjs::shouldSpawnHeadless` (D4 edits; D5 provides the signal).
- `gsd-t status` — print the current score.

## Dependencies

- **D5 → D1**: reads D1's per-turn usage rows. D1 lands first (Wave 1).
- **D5 → D3**: needs schema v2 `session_id` + `turn_id` to pick out the session. D3 lands first (Wave 1).
- **D5 || D2, D4, D6**: parallel in Wave 2.
