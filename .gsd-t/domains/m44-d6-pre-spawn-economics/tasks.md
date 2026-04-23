# Tasks: m44-d6-pre-spawn-economics

## Wave 2 — Gates

### M44-D6-T1 — Contract skeleton + estimator module scaffold
- **Status**: [x] done (2026-04-22 · commit `pending`)
- **Dependencies**: M44-D1-T5 (D1 complete), M44-D7-T5 (D7 complete — `cw_id` enrichment must be landing in new rows before calibration)
- **Acceptance criteria**:
  - `.gsd-t/contracts/economics-estimator-contract.md` exists with algorithm description, confidence tiers, known-failure modes placeholder, mode-specific threshold table (v0.1.0 skeleton)
  - `bin/gsd-t-economics.cjs` file exists and exports `estimateTaskFootprint` stub
- **Files touched**: `.gsd-t/contracts/economics-estimator-contract.md` (new), `bin/gsd-t-economics.cjs` (new)

### M44-D6-T2 — Core estimator implementation
- **Status**: [ ] pending
- **Dependencies**: M44-D6-T1
- **Acceptance criteria**:
  - `estimateTaskFootprint({taskNode, mode, projectDir})` returns `{estimatedCwPct, parallelOk, split, workerCount, matchedRows, confidence}` with correct values for a test lookup against the real corpus
  - Exact-match lookup by `command + step + domain` triplet; fuzzy-match fallback (domain only or command only); global median final fallback
  - Confidence tiers (HIGH/MEDIUM/LOW/FALLBACK) applied correctly
  - Mode-aware `parallelOk` (85% in-session threshold, 60% unattended threshold)
  - `economics_decision` event appended to `.gsd-t/events/YYYY-MM-DD.jsonl`
- **Files touched**: `bin/gsd-t-economics.cjs`

### M44-D6-T3 — Calibrate estimator against the existing 525-row token-usage.jsonl + 72-event compactions.jsonl corpus
- **Status**: [ ] pending
- **Dependencies**: M44-D6-T2
- **Acceptance criteria**:
  - Accuracy documented in `.gsd-t/contracts/economics-estimator-contract.md`: for each confidence tier, report mean-absolute-error % vs actual CW usage on a held-out subset of the corpus
  - Known-failure modes documented: at minimum "novel task type (FALLBACK tier)", "tasks that inherently exceed 60% CW (always sequential)", "mixed-mode corpus bias (pre-D7 rows lack cw_id)"
  - Contract updated to v1.0.0
  - The calibration confirms the corpus has sufficient coverage for HIGH or MEDIUM confidence on common GSD-T task patterns (execute, wave, quick domains)
- **Files touched**: `.gsd-t/contracts/economics-estimator-contract.md`

### M44-D6-T4 — Unit test suite
- **Status**: [ ] pending
- **Dependencies**: M44-D6-T3
- **Acceptance criteria**:
  - `test/m44-economics.test.js` covers: exact-match returns HIGH confidence + plausible CwPct, no-match returns FALLBACK + global median, in-session mode uses 85% threshold for parallelOk, unattended mode uses 60% threshold, economics_decision event written to event stream
  - All tests pass via `npm test`
- **Files touched**: `test/m44-economics.test.js` (new)

### M44-D6-T5 — Doc-ripple + tests-pass commit
- **Status**: [ ] pending
- **Dependencies**: M44-D6-T4
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 Pre-Spawn Economics Estimator" requirement entry
  - `docs/architecture.md` updated to reflect `bin/gsd-t-economics.cjs` as a pre-spawn gate component and calibration corpus references
  - All existing tests still pass; Wave 2 D6 gate met (estimator produces a valid decision from real corpus slice)
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `.gsd-t/progress.md`
