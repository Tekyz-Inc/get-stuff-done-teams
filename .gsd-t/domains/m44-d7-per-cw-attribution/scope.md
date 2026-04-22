# Domain: m44-d7-per-cw-attribution

## Responsibility

Ensure every spawn (parallel or sequential) tags its token-usage rows with a `cw_id` so the per-CW rollup (optimization report, D6 estimator calibration) keeps working post-M44.

Additionally, wire the existing `scripts/gsd-t-compact-detector.js` hook output into the supervisor's "we failed to prevent compaction" signal channel, so that [unattended] estimator calibration receives a post-spawn feedback signal for tasks that caused compaction despite the pre-spawn economics gate.

D7 is a Wave 1 foundation domain because D6's estimator quality depends on having `cw_id`-tagged corpus rows, and the post-spawn calibration loop needs the compaction signal wired before Wave 2 can validate D6's accuracy.

## Inputs

- `bin/gsd-t-token-capture.cjs` (M41 canonical row writer) — D7 adds optional `cw_id` pass-through
- `scripts/gsd-t-compact-detector.js` (M44 pre-req, shipped `940e5a8`) — existing SessionStart hook output
- `.gsd-t/metrics/compactions.jsonl` — "we failed" signal sink (read and written by D7 in calibration loop)
- `.gsd-t/.unattended/state.json` — supervisor state for worker correlation (read-only by D7 for CW boundary detection)

## Outputs

- Updated `bin/gsd-t-token-capture.cjs` with optional `cw_id` field in the row writer and pass-through
- Calibration loop hook: `scripts/gsd-t-calibration-hook.js` — on SessionStart with `source=compact`, appends a calibration event `{type: "compaction_post_spawn", cw_id, task_id, spawn_id, estimatedCwPct, actualCwPct, ts}` to `.gsd-t/metrics/compactions.jsonl`
- Updated `.gsd-t/contracts/metrics-schema-contract.md` v2 → v2.1.0 (adds optional `cw_id` field)
- Updated `.gsd-t/contracts/compaction-events-contract.md` v1.0.0 → v1.1.0 (adds calibration event type)

## Files Owned

- `bin/gsd-t-token-capture.cjs` — MODIFIED. Adds optional `cw_id` field (backward compatible — existing callers unchanged; new callers pass `cw_id` in the row options object).
- `scripts/gsd-t-calibration-hook.js` — NEW. Lightweight SessionStart hook handler that fires on `source=compact`, correlates with active spawn, and appends a calibration event.
- `.gsd-t/contracts/metrics-schema-contract.md` — MODIFIED. Bumped v2 → v2.1.0. Adds optional `cw_id: string` field to the token-usage row schema.
- `.gsd-t/contracts/compaction-events-contract.md` — MODIFIED. Bumped v1.0.0 → v1.1.0. Adds `compaction_post_spawn` calibration event type.

## Files Read-Only

- `scripts/gsd-t-compact-detector.js` — existing hook; D7 wires the calibration hook alongside it (does not modify the detector itself)
- `.gsd-t/.unattended/state.json` — read for active task/spawn correlation
- `.gsd-t/metrics/token-usage.jsonl` — read for existing row structure; D7 does not backfill historical rows with `cw_id` (backfill is out of scope)

## Out of Scope

- Backfilling historical token-usage.jsonl rows with `cw_id` (the 525 existing rows remain without `cw_id`; D6 uses per-iter median as fallback for these)
- Modifying `scripts/gsd-t-compact-detector.js` itself (only adding a companion hook)
- Any economics logic (D6)
- Any parallel dispatch logic (D2)
