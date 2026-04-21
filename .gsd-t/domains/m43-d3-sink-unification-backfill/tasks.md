# Tasks: m43-d3-sink-unification-backfill

## Wave 1 — Foundation (concurrent with D1)

### D3-T1 — Author `metrics-schema-contract.md` v2
- Copy v1 header, bump version, predecessor link.
- Document new optional fields: `turn_id`, `session_id`, `sessionType`, `tool_attribution[]`, `compaction_pressure{}`.
- Document producer ownership: D1 writes session_id/turn_id/sessionType; D2 writes tool_attribution; D5 writes compaction_pressure.
- Commit alone so D1 can pick up the field names.

### D3-T2 — Extend `recordSpawnRow` / `captureSpawn` pass-through
- Add optional params for the new fields.
- Verify existing callers unchanged (grep for every call site, no-op for them).
- Extend the tokens-cell renderer only if we surface the new fields in markdown (default: no — JSONL-only for now).

### D3-T3 — Implement `bin/gsd-t-token-regenerate-log.cjs`
- Stream-read `.gsd-t/metrics/token-usage.jsonl`.
- Deterministic sort (see constraints).
- Write `.gsd-t/token-log.md` with the canonical header + rendered rows.
- Register `tokens --regenerate-log` subcommand in `bin/gsd-t.js`.

### D3-T4 — Backfill run + commit
- Dry-run `bin/gsd-t-token-backfill.cjs` against repo state.
- Inspect proposed rows; fix any parser gap discovered.
- Apply and commit the backfilled JSONL rows.
- Regenerate `.gsd-t/token-log.md` from the new JSONL.

### D3-T5 — Tests
- `test/m43-schema-v2.test.js` covering (a) round-trip, (b) regenerate determinism, (c) backfill correctness.
- Full `npm test` green.

### D3-T6 — Doc ripple
- Update `CLAUDE.md` Observability Logging section if wrapper signature gained a param (keep API changes backward-compatible; probably no rewrite needed).
- Update `docs/architecture.md` "Token Pipeline" subsection with the v2 diagram (producers → JSONL → derived markdown).
- Append to `.gsd-t/progress.md` Decision Log.
