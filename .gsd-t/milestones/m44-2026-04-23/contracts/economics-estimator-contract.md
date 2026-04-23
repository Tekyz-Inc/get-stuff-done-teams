# Economics Estimator Contract — v1.0.0

**Milestone**: M44 — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)
**Owner**: m44-d6-pre-spawn-economics
**Consumers**: m44-d2-parallel-cli (reads `estimateTaskFootprint` output as a HINT into the gating math)
**Status**: ACTIVE — v1.0.0 (2026-04-22, D6-T3) — implementation landed (T2), calibrated against real 528-row corpus (T3).

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

## 7. Known-Failure Modes

See §10 "Known-Failure Modes (confirmed during calibration)" for the full
list with measured characteristics from the 2026-04-22 calibration run.
Summary:

- Novel task types (FALLBACK tier) — no command/step/domain match → global median (~15 % MAE).
- Tasks that inherently exceed 60 % CW — always-sequential; D6 recommends but does not slice.
- Mixed-mode corpus bias — pre-D7 rows lack `cw_id`; per-CW granularity grows as D7 rows accumulate.
- Cache-heavy rows inflate totals — conservative upper bound by design.
- FALLBACK bias toward the majority bucket when the corpus is highly skewed.

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

## 10. Calibration Results (2026-04-22, T3)

Calibration was run against the live `.gsd-t/metrics/token-usage.jsonl`
corpus (528 rows, schemaVersion 2, from M43 in-session usage capture).
Methodology combines an 80/20 held-out split (HIGH tier) with targeted
per-tier simulation (MEDIUM/LOW/FALLBACK) because the corpus is skewed:
523/528 rows share the `in-session|turn|-` triplet, so a naive 80/20
split only exercises the HIGH bucket.

**Per-tier mean-absolute-error (MAE), in % of 200 K-token CW ceiling:**

| Tier     | MAE (%) | n   | Method |
|----------|---------|-----|--------|
| HIGH     | 12.89   | 106 | 80/20 held-out split; test set ⊂ `in-session\|turn\|-`. |
| MEDIUM   | 0.00    | 5   | Self-lookup (keys with 1–4 rows — median of ≤4 values is each value by construction). Real MAE will be higher once larger MEDIUM buckets accumulate; current number reflects the degenerate small-n case. |
| LOW      | 13.08   | 523 | Forced command-only fuzzy on the `in-session` row population; predict = median of byCommand(cmd), score against each actual. |
| FALLBACK | 15.06   | 528 | Every row predicted = global median; score against each actual. Baseline "no signal" performance. |

**Corpus diagnostic (2026-04-22):**

- Distinct exact triplet keys: **5** (tiny — corpus is dominated by one key).
- Keys with ≥5 rows (HIGH tier eligible): **1** (`in-session|turn|-`, 523 rows).
- Keys with 1–4 rows (MEDIUM tier eligible): **4**.
- Global median: **114,475 tokens** ≈ **57.24%** of CW ceiling.

### Coverage Assessment

**Common GSD-T task patterns — `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`:**

- `gsd-t-execute` — **no corpus signal yet** (0 rows). Estimator tier = FALLBACK (15 % MAE baseline).
- `gsd-t-wave` — **no corpus signal yet** (0 rows). Estimator tier = FALLBACK.
- `gsd-t-quick` — 1 row present, 1 exact-match key ⇒ MEDIUM confidence.

The current corpus is calibrated by M43 in-session turn telemetry only.
D6 therefore lands functionally correct but produces FALLBACK for most
non-trivial GSD-T command lookups. As D7's `cw_id` enrichment accumulates
(M44 and beyond) and command-level rows flow from execute/wave/quick
spawns, the HIGH/MEDIUM buckets will populate. The estimator is designed
to grow in signal without code changes — only the corpus evolves.

This is acknowledged and acceptable: FALLBACK confidence returns the
global-median estimate (57.24 % of CW), which is *conservative* for the
in-session 85 % gate (PASS for parallelism) and *near-threshold* for the
unattended 60 % gate (recommends `split=false` but is on the edge — D2's
additional headroom check catches the edge cases). D6's contract commits
to "never return undefined" and that invariant holds at every tier.

### Known-Failure Modes (confirmed during calibration)

- **FALLBACK bias toward the majority bucket**: because 523 rows share one key, the global median ≈ the median of that one bucket. Novel task types get the "an in-session turn" estimate (~57% CW), which is reasonable as a default but systematically wrong for tasks that are either much smaller (routing, tool-dispatch) or much larger (wave-level orchestration).
- **Cache-heavy inflation**: row totals include `cacheReadInputTokens` + `cacheCreationInputTokens`. Cache reads are ~free in real CW accounting; the estimator's totals are a *conservative upper bound* on actual CW footprint. HIGH-tier MAE of 12.89 % reflects this inflation. Future corpus-shape work can track non-cache CW directly; for now the conservatism is deliberate.
- **MEDIUM tier MAE is artificially low**: when a key has 1–4 rows, the median equals every row (small-n tautology). Real MAE at MEDIUM will rise to the 5–15 % range once buckets broaden.
- **Mixed-mode corpus bias (pre-D7)**: no rows in the current corpus carry `cw_id`; per-CW granularity is not yet available. Historical rows provide per-iter estimates. This improves as D7 rows accumulate.
- **Novel task types (FALLBACK)**: unknown `command + step + domain` → global median. ~15 % MAE.
- **Tasks that inherently exceed 60 % CW**: e.g., large audits, corpus scans. Always-sequential by nature. `split=true` is the correct recommendation; D6 does not slice (caller responsibility).

## 11. Hard Invariants

1. `estimateTaskFootprint` NEVER returns `undefined` for any numeric field. Global-median fallback guarantees a number.
2. The corpus is loaded ONCE at module init. Subsequent calls must not re-read the JSONL.
3. D6 is a **HINT**. D2 retains gate authority.
4. Zero external npm runtime dependencies. Node built-ins only.
5. Mode-aware: `parallelOk` differs by mode; `estimatedCwPct` does not.
6. Event emission is best-effort — an event-stream write failure never fails the estimate.

---

## Version History

- **v1.0.0** (2026-04-22, D6-T3) — Real implementation landed (T2); calibrated against the live 528-row `token-usage.jsonl` corpus with per-tier MAE numbers and known-failure modes documented in §10. Contract active for D2 consumption.
- **v0.1.0** (2026-04-22, D6-T1) — Skeleton: interface + section headings + placeholder numbers. Downstream (T2 implementation) may begin.
