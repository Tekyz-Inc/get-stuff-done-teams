# Domain: m43-d3-sink-unification-backfill

## Responsibility

Unify the token-data landscape behind **one canonical schema (v2)** and **one canonical sink** (`.gsd-t/metrics/token-usage.jsonl`). Every producer — M36 heartbeat, M40 aggregator, M41 `recordSpawnRow`, M43 D1 in-session capture — writes into that sink. `.gsd-t/token-log.md` becomes a **regenerated view** (`gsd-t tokens --regenerate-log`), not a hand-maintained table.

Also: backfill the ~64 historical `Tokens=0` / `Tokens=—` rows from `.gsd-t/events/*.jsonl` + `.gsd-t/headless-*.log`. The M41 D3 backfiller was built but never run against the live log; D3 runs it and lands the results.

## Owned Files/Directories

- `.gsd-t/contracts/metrics-schema-contract.md` — BUMP v1 → v2. Adds:
  - `turn_id`, `session_id`, `sessionType: "in-session"|"headless"`
  - `tool_attribution: [{tool_name, bytes_attributed, tokens_attributed, share, missing_tool_result?}]` (optional; written by D2 joiner, not by row producers)
  - `compaction_pressure: {predicted_turns_to_compact, score}` (optional; written by D5)
- `bin/gsd-t-token-capture.cjs` — EDIT. Extend `recordSpawnRow` + `captureSpawn` to pass through the new schema-v2 fields without breaking existing callers. Detect old `.gsd-t/token-log.md` headers and upgrade in place (already implemented — verify + extend for v2 columns if we choose to surface any).
- `bin/gsd-t-token-regenerate-log.cjs` — NEW. Reads `.gsd-t/metrics/token-usage.jsonl` end-to-end and rewrites `.gsd-t/token-log.md` deterministically (stable sort: `startedAt` asc, `session_id` asc, `turn_id` asc).
- Patch `bin/gsd-t.js` to register `tokens --regenerate-log`.
- `bin/gsd-t-token-backfill.cjs` — EXISTS (M41 D3). Run it in dry-run, inspect, then commit the actual backfill JSONL. Fix any parser gaps discovered against the current fleet of `.gsd-t/events/*.jsonl` + `.gsd-t/headless-*.log` shapes.
- `scripts/gsd-t-token-aggregator.js` — VERIFY only (M40 D4). Ensure it still writes to `.gsd-t/metrics/token-usage.jsonl` in v2 shape; add the two new optional fields to its emit path.
- `test/m43-schema-v2.test.js` — NEW. Round-trip tests: (a) write a v2 row, read it back, all fields preserved; (b) delete `.gsd-t/token-log.md`, run `--regenerate-log`, byte-compare against the pre-delete snapshot modulo timestamp formatting; (c) the backfiller converts 10 fabricated headless-log entries into valid v2 rows.

## NOT Owned

- Command files (`commands/*.md`) — D4.
- Per-turn in-session capture entry-point (`bin/gsd-t-in-session-usage.cjs`) — D1.
- Per-tool attribution library (`bin/gsd-t-tool-attribution.cjs`) — D2.
- Runway estimator / compaction-pressure detector — D5.
- Dashboard server / transcript HTML — D6.

## Contract Surface

- `metrics-schema-contract.md` v2 is the single source of truth for every row that lands in `.gsd-t/metrics/token-usage.jsonl`.
- `.gsd-t/token-log.md` is a **derived artifact** post-v2 — do not hand-edit. The wrapper's append path is preserved for real-time visibility (existing behavior), but the canonical store is the JSONL.

## Consumers

- D1 (writes rows), D2 (joins by `turn_id`), D5 (reads trajectory), D6 (renders in transcript panel), `gsd-t tokens`, `gsd-t status`.

## Dependencies

- **D3 ships FIRST in Wave 1** alongside D1. D2, D5, D6 all take v2 as a precondition.
