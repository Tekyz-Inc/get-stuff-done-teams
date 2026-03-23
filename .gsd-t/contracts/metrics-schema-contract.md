# Metrics Schema Contract

## Overview
Defines the canonical schemas for M25 telemetry files: `task-metrics.jsonl` and `rollup.jsonl`.
Both files are append-only JSONL (one JSON object per line).

**Owner**: metrics-collection domain (task-metrics), metrics-rollup domain (rollup)
**Consumers**: metrics-dashboard domain, metrics-commands domain

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
