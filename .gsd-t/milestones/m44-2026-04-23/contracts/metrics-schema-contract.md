# Metrics Schema Contract

## Version
- **v2.1.0** (2026-04-22, M44 D7) — `.gsd-t/metrics/token-usage.jsonl` adds optional `cw_id: string` field for per-Context-Window attribution. Backward-compatible (every v2 row is a valid v2.1.0 row; absent `cw_id` is omitted from the row, not `null`). See §Token-Usage JSONL Schema v2.1.0 below.
- **v2** (2026-04-21, M43 D3) — `.gsd-t/metrics/token-usage.jsonl` schema bumped from v1 → v2. Adds `turn_id`, `session_id`, `sessionType`, `tool_attribution[]`, `compaction_pressure{}`. All fields optional on read; producers are partitioned by ownership (see §Token-Usage JSONL Schema v2 below).
- **v1** (2026-04-20, M40 D4) — first `.gsd-t/metrics/token-usage.jsonl` schema, per-spawn rows.
- (pre-v1, M25) — `task-metrics.jsonl` + `rollup.jsonl` schemas documented below (unchanged).

## Overview
Defines the canonical schemas for:
- **M25 telemetry**: `task-metrics.jsonl` + `rollup.jsonl` (unchanged — see original sections below)
- **M40+ token telemetry**: `token-usage.jsonl` schema — v1 (M40 D4) → v2 (M43 D3)

All are append-only JSONL (one JSON object per line).

**Owner**: metrics-collection domain (task-metrics), metrics-rollup domain (rollup), M43 D3 sink-unification-backfill (token-usage schema v2)
**Consumers**: metrics-dashboard domain, metrics-commands domain, M43 D1/D2/D5/D6 (token-usage)

---

## File Locations

```
.gsd-t/metrics/
  task-metrics.jsonl    -- per-task telemetry (written by metrics-collector.js)
  rollup.jsonl          -- per-milestone aggregation (written by metrics-rollup.js)
```

The `.gsd-t/metrics/` directory is created on first write if it does not exist.

---

## task-metrics.jsonl Schema

Each line is a JSON object representing one completed task:

```json
{
  "ts":            "string -- ISO 8601 UTC timestamp of task completion",
  "milestone":     "string -- milestone ID (e.g., 'M25')",
  "domain":        "string -- domain name (e.g., 'metrics-collection')",
  "task":          "string -- task identifier (e.g., 'task-1')",
  "command":       "string -- originating command (execute, quick, debug)",
  "duration_s":    "number -- wall-clock duration in seconds",
  "tokens_used":   "number -- context tokens consumed by this task (estimated)",
  "context_pct":   "number -- context window utilization at task end (0-100)",
  "pass":          "boolean -- true if task passed QA on this attempt",
  "fix_cycles":    "number -- count of rework cycles before pass (0 = first-pass success)",
  "signal_type":   "string -- one of: pass-through, fix-cycle, debug-invoked, user-correction, phase-skip",
  "signal_weight": "number -- weighted score: +1.0, -0.5, -0.8, -1.0, +0.3 (matches signal_type)",
  "notes":         "string|null -- optional brief description"
}
```

### Signal Type Taxonomy

| signal_type       | Weight | When Applied                                    |
|-------------------|--------|-------------------------------------------------|
| `pass-through`    | +1.0   | Task passed QA, next task proceeded             |
| `fix-cycle`       | -0.5   | Task required rework before passing             |
| `debug-invoked`   | -0.8   | User ran /debug immediately after task          |
| `user-correction` | -1.0   | User manually intervened/corrected              |
| `phase-skip`      | +0.3   | Phase was clean enough to skip                  |

### Rules
- All fields required except `notes` (nullable)
- `signal_type` must be one of the 5 values above
- `signal_weight` must match the weight for the given `signal_type`
- `fix_cycles` >= 0 (0 = first-pass success)
- `context_pct` range: 0-100
- `duration_s` >= 0

---

## rollup.jsonl Schema

Each line is a JSON object representing one milestone's aggregated metrics:

```json
{
  "ts":                   "string -- ISO 8601 UTC timestamp of rollup generation",
  "milestone":            "string -- milestone ID (e.g., 'M25')",
  "version":              "string -- project version at milestone completion",
  "total_tasks":          "number -- total tasks in milestone",
  "first_pass_rate":      "number -- fraction of tasks passing on first attempt (0.0-1.0)",
  "avg_duration_s":       "number -- average task duration in seconds",
  "avg_context_pct":      "number -- average context utilization (0-100)",
  "total_fix_cycles":     "number -- sum of all fix cycles across tasks",
  "total_tokens":         "number -- sum of tokens used across all tasks",
  "elo_before":           "number -- process ELO score before this milestone",
  "elo_after":            "number -- process ELO score after this milestone",
  "elo_delta":            "number -- elo_after - elo_before",
  "signal_distribution":  "object -- count per signal_type: { pass-through: N, fix-cycle: N, ... }",
  "domain_breakdown":     "array -- per-domain summary: [{ domain, tasks, first_pass_rate, avg_duration_s }]",
  "trend_delta":          "object|null -- comparison to previous milestone: { first_pass_rate_delta, avg_duration_delta, elo_delta }",
  "heuristic_flags":      "array -- anomalies detected: [{ heuristic, severity, description }]"
}
```

### Heuristic Types

| Heuristic                     | Trigger                                                  | Severity |
|-------------------------------|----------------------------------------------------------|----------|
| `first-pass-failure-spike`    | First-pass rate drops >15% vs previous milestone         | HIGH     |
| `rework-rate-anomaly`         | Fix cycle count > 2x previous milestone average          | MEDIUM   |
| `context-overflow-correlation` | >30% of failed tasks had context_pct > 80%              | MEDIUM   |
| `duration-regression`         | Average duration > 2x previous milestone                 | LOW      |

### Rules
- All fields required except `trend_delta` (null for first milestone)
- `first_pass_rate` range: 0.0-1.0
- `elo_before` defaults to 1000 for first milestone (no prior data)
- `heuristic_flags` may be empty array (no anomalies)

---

## Process ELO Computation

- Starting ELO: 1000 (first milestone with no prior data)
- K-factor: 32 (standard)
- Per-milestone update: weighted sum of all task signal_weights normalized to [0,1]
  - `actual_score = (sum of signal_weights + total_tasks) / (2 * total_tasks)`
  - `expected_score = 1 / (1 + 10^((1000 - elo_before) / 400))` (simplified: expected vs baseline)
  - `elo_after = elo_before + K * (actual_score - expected_score)`
- ELO is stored in rollup.jsonl (elo_before, elo_after, elo_delta)
- Displayed by gsd-t-status and gsd-t-metrics commands

---

## Pre-Flight Intelligence Check

Before dispatching a task in execute, read `task-metrics.jsonl` and check:
1. Filter records matching current domain
2. If domain's first_pass_rate < 0.6 over last 10 tasks → warn: "Domain {name} has {rate}% first-pass rate. Consider splitting tasks."
3. If domain's avg fix_cycles > 2.0 → warn: "Domain {name} averaging {N} fix cycles. Review constraints."
4. Warning is displayed inline (not blocking) — execution proceeds

---

## Integration Notes

- metrics-collection writes task-metrics.jsonl, does NOT read rollup.jsonl
- metrics-rollup reads task-metrics.jsonl, writes rollup.jsonl
- metrics-dashboard reads both JSONL files via GET /metrics endpoint (read-only)
- metrics-commands reads both JSONL files directly from disk (read-only)

---

## Token-Usage JSONL Schema (v1 — M40 D4)

Produced by `scripts/gsd-t-token-aggregator.js` (worker stream) and `bin/gsd-t-token-capture.cjs` (`recordSpawnRow`/`captureSpawn`). Appended to `.gsd-t/metrics/token-usage.jsonl`.

Each line is a JSON object representing one spawn or one aggregated worker/task:

```json
{
  "schemaVersion": 1,
  "ts":             "string -- ISO 8601 UTC, when this row was written",
  "source":         "string -- 'live' | 'backfill'",
  "command":        "string -- e.g. 'gsd-t-execute', 'gsd-t-wave'",
  "step":           "string -- e.g. 'Step 4'",
  "model":          "string -- 'opus' | 'sonnet' | 'haiku' | exact model id",
  "startedAt":      "string -- 'YYYY-MM-DD HH:MM' (local)",
  "endedAt":        "string -- 'YYYY-MM-DD HH:MM' (local)",
  "durationMs":     "number -- wall-clock",
  "inputTokens":              "number",
  "outputTokens":             "number",
  "cacheReadInputTokens":     "number",
  "cacheCreationInputTokens": "number",
  "costUSD":        "number|null",
  "domain":         "string|null",
  "task":           "string|null",
  "milestone":      "string|null -- e.g. 'M40'",
  "ctxPct":         "number|null -- 0-100",
  "notes":          "string|null",
  "hasUsage":       "boolean -- true if upstream envelope carried a usage field"
}
```

### v1 Rules
- All numeric token fields default to `0` when `usage` is absent; `hasUsage=false` distinguishes "measured zero" from "missing envelope."
- `costUSD=null` ONLY when upstream envelope omits both `total_cost_usd` and `cost_usd`.
- Rows are append-only. Regeneration of `.gsd-t/token-log.md` from this file is deterministic (M43 D3).

---

## Token-Usage JSONL Schema (v2 — M43 D3)

v2 extends v1 additively. **Every v1 row is a valid v2 row** (new fields are optional). No existing consumer breaks on a v1-shaped row.

```json
{
  "schemaVersion": 2,

  // --- all v1 fields (unchanged) ---
  "ts": "...", "source": "...", "command": "...", "step": "...", "model": "...",
  "startedAt": "...", "endedAt": "...", "durationMs": 0,
  "inputTokens": 0, "outputTokens": 0,
  "cacheReadInputTokens": 0, "cacheCreationInputTokens": 0,
  "costUSD": null, "domain": null, "task": null, "milestone": null,
  "ctxPct": null, "notes": null, "hasUsage": false,

  // --- v2 additions ---
  "session_id":  "string|null -- stable session identifier (in-session: Claude Code session id; headless: spawn id)",
  "turn_id":     "string|null -- stable per-turn identifier within session_id (monotonic, usually int as string)",
  "sessionType": "'in-session' | 'headless' | null",
  "tool_attribution": [
    {
      "tool_name":         "string -- e.g. 'Bash', 'Read', 'Edit', 'Grep', 'Task'",
      "bytes_attributed":  "number -- bytes of tool_result output attributed to this tool in this row/turn",
      "tokens_attributed": "number -- tokens attributed by output-byte ratio (see tool-attribution-contract)",
      "share":             "number -- 0.0-1.0, fraction of row's output tokens attributed to this tool",
      "missing_tool_result": "boolean -- optional; true if the tool_use had no matched tool_result"
    }
  ],
  "compaction_pressure": {
    "predicted_turns_to_compact": "number|null -- estimated turns until next /compact",
    "score":                      "number -- 0.0-1.0, higher = closer to compact",
    "tripped":                    "boolean -- true when score ≥ circuit-breaker threshold"
  }
}
```

### v2 Field Ownership (Producer Partitioning)

Each v2 field has exactly one producer domain. Other domains READ but do not WRITE.

| Field                         | Producer Domain                       | Notes |
|-------------------------------|---------------------------------------|-------|
| `session_id`, `turn_id`, `sessionType` | M43 D1 in-session usage capture | Headless rows continue to use spawn id as `session_id`; `turn_id` derived from stream-json turn count. |
| `tool_attribution[]`          | M43 D2 per-tool attribution (`bin/gsd-t-tool-attribution.cjs`) | Written as a **join-result row** keyed by `(session_id, turn_id)` — does NOT mutate prior rows. |
| `compaction_pressure{}`       | M43 D5 compaction-pressure circuit breaker (`bin/runway-estimator.cjs` ext) | Written at the moment the estimator samples trajectory. Absent on rows produced before D5 lands. |

`recordSpawnRow` / `captureSpawn` / `gsd-t-token-aggregator.js` continue to write the v1 subset and MAY pass through `session_id` / `turn_id` / `sessionType` when the caller supplies them (D3-T2 extends the signature additively).

### v2 Rules

1. **Backward compatibility**: a row with `schemaVersion: 1` is read correctly by all v2 consumers. A row with `schemaVersion: 2` but only v1 fields is semantically identical to a v1 row.
2. **Optional fields**: every v2 addition defaults to `null` (objects) or `[]` (arrays) on read. Readers MUST handle missing fields.
3. **No mutation**: v2 never rewrites historical rows. Backfill (D3-T4) APPENDS recovered rows with `source: "backfill"`.
4. **Deterministic ordering for regeneration**: `startedAt` asc → `session_id` asc → `turn_id` asc (numeric if all numeric, else lexicographic). `.gsd-t/token-log.md` regeneration (D3-T3) uses this sort.
5. **Tool attribution writes a separate row**: D2's joiner writes its own row (`command: "tool-attribution-join"` or similar marker) rather than mutating D1's row, so the append-only invariant holds.
6. **Compaction pressure writes on sample**: D5 writes a row (possibly with zero `inputTokens`/`outputTokens`) every time it samples, OR inline on a spawn row when D5 is called synchronously from the spawn path. Readers group by `session_id`+`turn_id` to merge.

### v2 Derived Artifact: `.gsd-t/token-log.md`

Post-v2, `.gsd-t/token-log.md` is a **regenerated view** (`gsd-t tokens --regenerate-log`), not a hand-maintained table. The wrapper's append path is preserved for real-time visibility (existing behavior). Canonical store is the JSONL.

### v2 Changelog

- 2026-04-21 (M43 D3-T1): initial v2 definition. Contract committed BEFORE D1/D2/D5 begin writing new fields so implementers can code against a fixed schema.

---

## Token-Usage JSONL Schema (v2.1.0 — M44 D7)

v2.1.0 extends v2 additively with one optional field: `cw_id`. **Every v2 row is a valid v2.1.0 row** — `cw_id` is omitted from rows produced by callers that do not supply it. No existing consumer breaks on a v2-shaped row.

```json
{
  "schemaVersion": 2,

  // --- all v2 fields (unchanged) ---
  "ts": "...", "source": "...", "command": "...", "step": "...", "model": "...",
  "startedAt": "...", "endedAt": "...", "durationMs": 0,
  "inputTokens": 0, "outputTokens": 0,
  "cacheReadInputTokens": 0, "cacheCreationInputTokens": 0,
  "costUSD": null, "domain": null, "task": null, "milestone": null,
  "ctxPct": null, "notes": null, "hasUsage": false,
  "session_id": "...", "turn_id": "...", "sessionType": "...",
  "tool_attribution": [], "compaction_pressure": {},

  // --- v2.1.0 addition (optional) ---
  "cw_id": "string -- per-Context-Window attribution key. Omitted from row when caller does not supply it (NOT null, NOT empty string)."
}
```

### v2.1.0 Field Ownership

| Field    | Producer Domain         | Notes |
|----------|-------------------------|-------|
| `cw_id`  | M44 D7 per-CW attribution | Pass-through field. Callers (orchestrator, supervisor, in-session driver) compute and supply the value. The wrapper does not derive it. |

### v2.1.0 `cw_id` Derivation

| Mode          | Derivation                                                                 |
|---------------|----------------------------------------------------------------------------|
| `unattended`  | `cw_id` equals the `spawn_id` (one detached `claude -p` worker = one CW).  |
| `in-session`  | `cw_id` = `session_id + ":" + compaction_index` (compaction_index increments on each `SessionStart source=compact` fire; tracked by the calibration hook). |

### v2.1.0 Rules

1. **Backward compatibility**: every v2 row is a valid v2.1.0 row. Readers MUST treat `cw_id` as optional.
2. **Absent ≠ null**: when a caller does not supply `cw_id`, the field is OMITTED from the JSONL row entirely. Writers MUST NOT serialize `cw_id: null` or `cw_id: ""`.
3. **Pass-through only**: `bin/gsd-t-token-capture.cjs` does not derive `cw_id`; it only forwards what the caller supplies.
4. **Backfill scope**: historical token-usage.jsonl rows (pre-D7) are NOT backfilled with `cw_id`. Consumers fall back to per-iter median for those rows.

### v2.1.0 Changelog

- 2026-04-22 (M44 D7-T1): added optional `cw_id` field. Contract bumped before D6 / D2 begin reading per-CW rollups so they can code against the fixed schema.

---

## Integration Notes (v2)

- M43 D1 writes `session_id` + `turn_id` + `sessionType` on every per-turn in-session row.
- M43 D2 reads `session_id` + `turn_id` across the events stream and the token-usage JSONL, joins by those two keys, writes back one attribution row per matched turn.
- M43 D5 reads the rolling trajectory of `inputTokens` + `outputTokens` per `session_id` and writes `compaction_pressure` on the next sampled row.
- M43 D6 surfaces `tool_attribution[]` and `compaction_pressure` in the transcript viewer sidebar.
- M41 wrapper (`bin/gsd-t-token-capture.cjs`) remains the canonical write entrypoint for spawn rows. Signature extension (D3-T2) is additive — existing callers unchanged.
- M44 D7 extends the M41 wrapper signature additively (`recordSpawnRow`/`captureSpawn` accept optional `cw_id`). Existing callers continue to work unchanged; rows produced without a `cw_id` argument are byte-identical to pre-D7 v2 rows.
