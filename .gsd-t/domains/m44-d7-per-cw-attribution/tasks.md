# Tasks: m44-d7-per-cw-attribution

## Wave 1 — Foundation

### M44-D7-T1 — Contract skeletons: metrics-schema v2.1.0 + compaction-events v1.1.0
- **Status**: [x] done (2026-04-22 · commit `7c3e571`)
- **Dependencies**: none (D7 is Wave 1, no upstream M44 deps)
- **Acceptance criteria**:
  - `.gsd-t/contracts/metrics-schema-contract.md` bumped to v2.1.0 with `cw_id: string (optional)` field added to the token-usage row schema section
  - `.gsd-t/contracts/compaction-events-contract.md` bumped to v1.1.0 with `compaction_post_spawn` calibration event type added (schema: `{type, cw_id, task_id, spawn_id, estimatedCwPct, actualCwPct, ts}`)
  - Both contract versions reflect the bump date and M44-D7 as the owning domain
- **Files touched**: `.gsd-t/contracts/metrics-schema-contract.md`, `.gsd-t/contracts/compaction-events-contract.md`

### M44-D7-T2 — `cw_id` pass-through in token-capture
- **Status**: [x] done (2026-04-22 · commit `3d784ed`)
- **Dependencies**: M44-D7-T1
- **Acceptance criteria**:
  - `bin/gsd-t-token-capture.cjs` `recordSpawnRow` (and `captureSpawn`) accept an optional `cw_id` field in the row options object
  - When `cw_id` is provided, it is written to the JSONL row; when absent, field is omitted (not null)
  - All existing callers (no `cw_id` arg) continue to work and produce identical output to pre-D7 (backward-compatible)
  - Existing test suite passes without modification
- **Files touched**: `bin/gsd-t-token-capture.cjs`

### M44-D7-T3 — Calibration hook: compact-detector → supervisor signal
- **Status**: [x] done (2026-04-22 · commit `64301ed`)
- **Dependencies**: M44-D7-T2
- **Acceptance criteria**:
  - `scripts/gsd-t-calibration-hook.js` exists as a SessionStart hook handler
  - On `source=compact`, the hook: reads active spawn context (if any) from `.gsd-t/.unattended/state.json`; derives `actualCwPct` from the compaction event's `input_tokens` vs CW ceiling; appends a `compaction_post_spawn` calibration event to `.gsd-t/metrics/compactions.jsonl`
  - When no active unattended spawn is found, hook exits with code 0 and writes nothing (silent no-op)
  - Hook is safe to register alongside `scripts/gsd-t-compact-detector.js` (both fire on SessionStart; independent; no conflicts)
- **Files touched**: `scripts/gsd-t-calibration-hook.js` (new)

### M44-D7-T4 — Unit test suite
- **Status**: [x] done (2026-04-22 · 19/19 pass isolated)
- **Dependencies**: M44-D7-T3
- **Acceptance criteria**:
  - `test/m44-cw-attribution.test.js` covers: `recordSpawnRow` with `cw_id` present (field in row), `recordSpawnRow` without `cw_id` (field absent, other fields unchanged), calibration hook with active spawn (calibration event written), calibration hook without active spawn (no-op, no file written)
  - All tests pass via `npm test`
- **Files touched**: `test/m44-cw-attribution.test.js` (new)

### M44-D7-T5 — Doc-ripple + tests-pass commit
- **Status**: [x] done (2026-04-22 · this commit)
- **Dependencies**: M44-D7-T4
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 Per-CW Attribution" requirement entry
  - `docs/architecture.md` updated to reflect `scripts/gsd-t-calibration-hook.js` and the `cw_id` field in token-capture
  - All existing tests still pass; Wave 1 D7 gate met (`cw_id` field confirmed in new token-capture rows)
  - `.gsd-t/progress.md` decision log entry added for D7 Wave 1 foundation complete
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `.gsd-t/progress.md`
