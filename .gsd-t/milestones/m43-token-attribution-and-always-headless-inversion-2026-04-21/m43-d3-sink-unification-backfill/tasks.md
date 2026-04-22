# Tasks: m43-d3-sink-unification-backfill

## Wave 1 — Foundation (concurrent with D1)

### D3-T1 — Author `metrics-schema-contract.md` v2 — **DONE** (2026-04-21)
- [x] Copy v1 header, bump version, predecessor link.
- [x] Document new optional fields: `turn_id`, `session_id`, `sessionType`, `tool_attribution[]`, `compaction_pressure{}`.
- [x] Document producer ownership: D1 writes session_id/turn_id/sessionType; D2 writes tool_attribution; D5 writes compaction_pressure.
- [x] Committed.

### D3-T2 — Extend `recordSpawnRow` / `captureSpawn` pass-through — **DONE** (2026-04-21)
- [x] Optional params added (`sessionId`/`turnId`/`sessionType`/`toolAttribution`/`compactionPressure`) — emit only when provided.
- [x] Existing callers unchanged (v1-shape call produces valid v2 row per contract §Backward compatibility).
- [x] `SCHEMA_VERSION` bumped 1 → 2; markdown tokens cell unchanged (JSONL-only extension).

### D3-T3 — Implement `bin/gsd-t-token-regenerate-log.cjs` — **DONE** (2026-04-21)
- [x] Streaming read of `.gsd-t/metrics/token-usage.jsonl`.
- [x] Deterministic sort: `startedAt` asc → `session_id` asc → `turn_id` asc (numeric when both parse, lex otherwise).
- [x] Writes `.gsd-t/token-log.md` with canonical header + rendered rows.
- [x] Registered as `gsd-t tokens --regenerate-log` in `bin/gsd-t.js` + help text.

### D3-T4 — Backfill run + commit — **PARTIAL** (2026-04-21)
- [x] Dry-run executed: 42 files scanned, **0 envelopes parsed**.
- [ ] **Parser gap surfaced**: shipped `.gsd-t/headless-*.log` files are pure human-readable Claude output; backfiller expects stream-json `result` frames. Parser needs extension before historical JSONL can be backfilled.
- [ ] Apply backfill — **BLOCKED** on parser extension (carried forward as D3-T4.1 follow-up).
- [ ] Regenerate `.gsd-t/token-log.md` from backfilled JSONL — **BLOCKED** on T4.1 (verified empirically: regenerating against the current 2-row JSONL would truncate the 434-line hand-maintained log; `git checkout HEAD` restored).

### D3-T5 — Tests — **DONE** (2026-04-21, 9/9 pass)
- [x] `test/m43-schema-v2.test.js` — 9 tests: backward-compat, v2 pass-through, tool_attribution/compaction_pressure pass-through, empty-array omission, regenerate idempotence, deterministic sort, missing-usage `—`, empty JSONL header-only, v1-row backward compat.
- [x] Token cluster: 60/60. Full suite: 1569/1571 (2 pre-existing fails unrelated).

### D3-T6 — Doc ripple — **DONE** (2026-04-21)
- [x] `docs/architecture.md`: added "Token Pipeline (M40 → M41 → M43 D3)" block under Context Observability.
- [x] `.gsd-t/progress.md` Decision Log: 2026-04-21 23:00 entry.
- [ ] `CLAUDE.md` Observability block: intentionally unchanged — wrapper signature additions are backward-compatible; existing Pattern A / Pattern B examples still correct.

## Follow-up (carried inside D3)

### D3-T4.1 — Backfill parser extension
- Extend `bin/gsd-t-token-backfill.cjs` to recognize pre-aggregator headless-log shapes (human-readable Claude output without stream-json `result` frames).
- Re-run dry-run after extension; expect non-zero envelopes against the 42 historical files.
- Then complete D3-T4 apply-path + regenerate.
