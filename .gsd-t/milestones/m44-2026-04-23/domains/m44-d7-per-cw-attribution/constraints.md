# Constraints: m44-d7-per-cw-attribution

## Hard Rules

1. The `cw_id` field addition to `bin/gsd-t-token-capture.cjs` MUST be backward-compatible. All existing callers that do not pass `cw_id` continue to work unchanged; `cw_id` defaults to `undefined` / omitted from the row (not `null`, not `""`).
2. The calibration hook (`gsd-t-calibration-hook.js`) MUST silently no-op when it cannot correlate a compaction event with an active spawn. The supervisor may not be running when a manual session compacts — this is expected and must not produce errors.
3. Zero external runtime dependencies (same as all GSD-T modules).
4. The calibration event written by D7 must include `estimatedCwPct` (what D6 predicted before spawn) alongside `actualCwPct` (derived from the compaction event). This pairing is what makes the calibration feedback actionable.
5. Contract bumps (metrics-schema v2.1.0 and compaction-events v1.1.0) MUST happen in D7's commit, not in a later wave. D6 and D2 read these contracts and must see the `cw_id` field documented before they start Wave 2/3 work.
6. D7 does NOT modify `scripts/gsd-t-compact-detector.js`. It adds a companion hook that reads the same event payload. The detector is a M44 pre-req and is already shipped — touching it risks regressions.

## Mode Awareness

**[in-session]**:
- `cw_id` tag in token-usage rows is useful for analysis but not a gate. In-session mode may compact (that's accepted); the `cw_id` field lets us analyze how close we got to the ceiling.

**[unattended]**:
- `cw_id` tag is critical for the per-worker CW attribution. Each `claude -p` worker has its own clean CW; every row emitted by that worker must carry the same `cw_id` (derived from `spawn_id` + session start time).
- The calibration loop is primarily valuable for [unattended] runs because: (a) compaction means we failed the zero-compaction contract, and (b) the feedback directly improves the D6 estimator for future unattended runs.

## Tradeoffs Acknowledged

- `cw_id` derivation for [unattended] workers is straightforward (each `claude -p` spawn is one CW). For [in-session] sessions with compaction, the `cw_id` increments each time Claude Code fires `SessionStart source=compact`. D7 handles this via the calibration hook's `source=compact` trigger. The derivation is slightly more complex for in-session but remains deterministic.
- Historical corpus rows (pre-D7) will not have `cw_id`. D6's calibration for those rows falls back to per-iter median. This is accepted; accuracy improves as post-D7 rows accumulate.

## Out-of-scope clarifications

- D7 does NOT add `cw_id` to any events in `.gsd-t/events/*.jsonl` (that is the unattended-event-stream-contract's domain). Only token-usage rows gain `cw_id`.
- D7 does NOT implement a CW boundary detection algorithm. `cw_id` for unattended workers is simply `spawn_id` (one spawn = one CW). For in-session, it is `session_id + ":" + compaction_index` (incremented by the calibration hook on each `source=compact` fire).
