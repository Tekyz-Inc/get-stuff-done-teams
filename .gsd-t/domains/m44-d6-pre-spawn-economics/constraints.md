# Constraints: m44-d6-pre-spawn-economics

## Hard Rules

1. The estimator is a HINT, not a hard veto. `estimateTaskFootprint` returns a decision recommendation; D2 makes the final call. D6 never blocks a spawn on its own.
2. Zero external runtime dependencies. All corpus parsing uses Node.js built-in `fs` and JSON parsing.
3. The calibration corpus is read once at module init (sync read, cached in memory). Do not re-read on every `estimateTaskFootprint` call — that would add ~50ms per task on large corpora.
4. When no match is found (unknown `command + step + domain` triplet), fall back to the global median of all rows in the corpus. Never return an undefined estimate.
5. Confidence tiers must be defined in the contract: HIGH (≥5 exact matches), MEDIUM (1-4 exact matches), LOW (fuzzy match only), FALLBACK (global median). The `parallelOk` recommendation should be more conservative at LOW and FALLBACK confidence.
6. D6 is mode-AWARE (unlike D1, D4, D5). The returned `estimatedCwPct` is the same for both modes, but `parallelOk` is computed differently: [in-session] uses 85% threshold (orchestrator CW), [unattended] uses 60% threshold (per-worker CW). The `mode` param must be passed by the caller.
7. `economics-estimator-contract.md` MUST document known-failure modes (e.g., tasks with no historical analogs, tasks that always compact because they're inherently large).

## Mode Awareness

**[in-session]**:
- CW threshold for `parallelOk=false`: `estimatedCwPct > 85` (approaching orchestrator CW ceiling accounting for summary envelope return)
- Even if `parallelOk=false`, D2 should still attempt with fewer workers (not refuse entirely)

**[unattended]**:
- CW threshold for `split=true`: `estimatedCwPct > 60` (per-worker CW, conservative to stay well under the ceiling)
- When `split=true`, D2 slices the task into multiple `claude -p` iters rather than one

## Tradeoffs Acknowledged

- The 525-row calibration corpus is derived from mixed-mode work (in-session + unattended). Per-CW granularity is only available for rows with `cw_id` (new post-D7 rows). Historical rows without `cw_id` provide per-iter estimates, which are less accurate for per-worker CW prediction. Accuracy will improve as D7-tagged rows accumulate.
- Global median fallback may substantially over- or under-estimate novel tasks. The `confidence: FALLBACK` signal gives the caller a way to add extra conservatism (e.g., D2 could reduce worker count by 50% for FALLBACK-confidence estimates).
- Reading the full corpus into memory at init is fine for the current corpus size (525 rows ≈ small). If the corpus grows past 50K rows, the init time and memory cost should be revisited.

## Out-of-scope clarifications

- D6 does NOT predict wall-clock duration (only CW token footprint).
- D6 does NOT update the corpus. It is read-only. Calibration rows accumulate passively as D7-tagged spawns happen.
- D6 does NOT handle multi-step tasks (tasks that span multiple `claude -p` iters by design). The estimator models single-iter cost only; the caller must sum for multi-iter plans.
