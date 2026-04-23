# Economics Estimator Contract — v0.1.0

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d6-pre-spawn-economics
**Consumers**: m44-d2-parallel-cli (reads `estimateTaskFootprint` output as a HINT into the gating math)
**Status**: SKELETON — v0.1.0 (T1) — fields and sections frozen; numbers filled in by T2/T3.

---

## 1. Purpose

Before any parallel spawn, the pre-spawn economics estimator predicts each candidate
task's **Context-Window (CW) footprint** and produces a mode-specific recommendation
to the parallel-CLI. The estimator is the single source of "how much CW will this
cost?" for D2's gating math.

The estimator is a **HINT, not a veto**. D2 owns the final gate decision. D6 never
blocks a spawn on its own authority.

## 2. Module Interface

```js
const { estimateTaskFootprint } = require('./bin/gsd-t-economics.cjs');

const estimate = estimateTaskFootprint({ taskNode, mode, projectDir });
// → { estimatedCwPct, parallelOk, split, workerCount, matchedRows, confidence }
```

`estimateTaskFootprint(opts)`:
- `opts.taskNode` (TaskNode, required) — from D1 task graph (`command`, `step`, `domain` triplet used for lookup; `id` used for event log).
- `opts.mode` (`'in-session' | 'unattended'`, required) — selects gate arithmetic.
- `opts.projectDir` (string, optional; default `process.cwd()`) — used to locate the corpus and the event stream.
- Returns the decision object described in §3. Never returns `undefined` for the numeric fields — global-median fallback guarantees a value.
- Synchronous. No network I/O. Corpus is loaded once on module init (sync read, cached in a module-level variable).

## 3. Return Shape

```
EstimateResult {
  estimatedCwPct: number,  // 0..100+ (can exceed 100 on novel/huge tasks)
  parallelOk:    boolean,  // mode-specific gate outcome (HINT)
  split:         boolean,  // unattended-only: split into multiple iters
  workerCount:   number,   // suggested worker count for this task (HINT)
  matchedRows:   number,   // how many corpus rows matched the lookup key
  confidence:    'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK'
}
```

`estimatedCwPct` is derived from row-level total tokens (input + output + cacheRead + cacheCreation) divided by the framework's effective CW ceiling (default **200,000 tokens**, mirroring `bin/token-budget.cjs`, `bin/context-meter-config.cjs`, and `bin/runway-estimator.cjs`).

## 4. Lookup + Fallback Algorithm

The estimator matches a task against the corpus via a three-tier lookup:

1. **Exact match** (`command + step + domain` triplet) — HIGH confidence when ≥5 rows match, MEDIUM when 1–4 rows match.
2. **Fuzzy match** (domain-only match, then command-only match) — LOW confidence.
3. **Global median fallback** — FALLBACK confidence; uses the median of every corpus row. Never returns undefined.

Nulls in the corpus (`domain: null`) are treated as the literal sentinel `'-'` for the triplet key so rows without domain attribution still form an exact-match bucket.

## 5. Confidence Tiers

| Tier     | Match quality                          | Consumer guidance |
|----------|----------------------------------------|-------------------|
| HIGH     | ≥5 exact triplet matches               | Use `parallelOk` as-is. |
| MEDIUM   | 1–4 exact triplet matches              | Use `parallelOk` as-is, monitor for drift. |
| LOW      | Fuzzy match (domain-only OR command-only) | Consider reducing `workerCount` by 1–2. |
| FALLBACK | Global median only (no signal)         | Consider halving `workerCount`; be conservative. |

## 6. Mode-Specific Threshold Table

| Mode         | `parallelOk` threshold | `split` threshold | Rationale |
|--------------|------------------------|-------------------|-----------|
| in-session   | `estimatedCwPct ≤ 85` → true | n/a (always false) | 85% matches the orchestrator-CW headroom check (D2). Above this, D2 still attempts with fewer workers. |
| unattended   | `estimatedCwPct ≤ 60` → true | `estimatedCwPct > 60` | 60% is the per-worker CW gate — tasks heavier than that are sliced into multiple `claude -p` iters. |

`split` is always `false` for in-session mode. `workerCount` defaults to `1` and is reduced when confidence is LOW/FALLBACK (§5 guidance), but the final-count decision belongs to D2.

## 7. Known-Failure Modes (placeholder — calibrated in T3)

- **Novel task types (FALLBACK tier)** — no command/step/domain match in corpus → global median. Large MAE expected.
- **Tasks that inherently exceed 60% CW** — always-sequential by nature (large audits, corpus scans). `split=true` is the correct recommendation but the caller must handle multi-iter planning; D6 does not slice.
- **Mixed-mode corpus bias (pre-D7 rows lack `cw_id`)** — per-CW granularity is only available on post-D7 rows; historical rows provide per-iter estimates, which over-estimate per-worker CW for in-session turns and under-estimate for long unattended iters.
- **Cache-heavy rows inflate total tokens** — cacheRead dominates many rows and is "free" in real CW accounting; the estimator uses raw totals as a conservative upper bound. Calibration (T3) documents the over-estimation bias.

## 8. Event Emission

Each `estimateTaskFootprint` call appends one row to `.gsd-t/events/YYYY-MM-DD.jsonl` (the standard event stream, written via `bin/event-stream.cjs` `appendEvent`):

```
{
  type:            'economics_decision',
  ts:              '<ISO 8601>',
  task_id:         '<TaskNode.id>',
  mode:            '<in-session | unattended>',
  estimatedCwPct:  <number>,
  parallelOk:      <boolean>,
  split:           <boolean>,
  confidence:      '<HIGH | MEDIUM | LOW | FALLBACK>',
  matchedRows:     <number>
}
```

## 9. Corpus Sources

- `.gsd-t/metrics/token-usage.jsonl` — the calibration corpus. Read once on module init. Schema: metrics-schema-contract v2.1.0 (optional `cw_id` field).
- `.gsd-t/metrics/compactions.jsonl` — the "we failed" signal corpus for T3 calibration accuracy assessment. Schema: compaction-events-contract v1.1.0.

Historical rows without `cw_id` are included in the per-iter-level median; post-D7 rows with `cw_id` populate the per-CW-level signal (once D7 rows accumulate).

## 10. Calibration Procedure (placeholder — filled in T3)

T3 will run an 80/20 held-out split against `token-usage.jsonl` and report
**mean-absolute-error (MAE) % vs observed CW usage** per confidence tier.

| Tier     | MAE (%) | n    | Notes |
|----------|---------|------|-------|
| HIGH     | _TBD_   | _TBD_ | _TBD_ |
| MEDIUM   | _TBD_   | _TBD_ | _TBD_ |
| LOW      | _TBD_   | _TBD_ | _TBD_ |
| FALLBACK | _TBD_   | _TBD_ | _TBD_ |

Coverage check: confirm corpus is sufficient to produce HIGH or MEDIUM confidence on common GSD-T patterns (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick` commands). Documented in T3.

## 11. Hard Invariants

1. `estimateTaskFootprint` NEVER returns `undefined` for any numeric field. Global-median fallback guarantees a number.
2. The corpus is loaded ONCE at module init. Subsequent calls must not re-read the JSONL.
3. D6 is a **HINT**. D2 retains gate authority.
4. Zero external npm runtime dependencies. Node built-ins only.
5. Mode-aware: `parallelOk` differs by mode; `estimatedCwPct` does not.
6. Event emission is best-effort — an event-stream write failure never fails the estimate.

---

## Version History

- **v0.1.0** (2026-04-22, D6-T1) — Skeleton: interface + section headings + placeholder numbers. Downstream (T2 implementation) may begin.
