# GSD-T: Metrics — View Task Telemetry and Process Health

You are displaying metrics data from the GSD-T telemetry system. Read JSONL files directly — no module imports needed.

## Step 1: Load Metrics Data

Read:
1. `.gsd-t/metrics/task-metrics.jsonl` — per-task telemetry records
2. `.gsd-t/metrics/rollup.jsonl` — per-milestone aggregation with ELO and heuristics
3. `.gsd-t/progress.md` — current milestone ID (for default filter)

If neither file exists: display "No metrics data yet. Metrics are collected automatically during execute, quick, and debug commands." and stop.

If `$ARGUMENTS` contains a milestone ID (e.g., "M25"), use that as the filter. Otherwise, use the current active milestone from progress.md.

## Step 2: Display Milestone Summary

From `rollup.jsonl`, find the entry matching the target milestone. Display:

```
## Metrics — {milestone}

| Metric              | Value                          |
|---------------------|--------------------------------|
| Tasks               | {total_tasks}                  |
| First-pass rate     | {first_pass_rate * 100}%       |
| Avg duration        | {avg_duration_s}s              |
| Avg context         | {avg_context_pct}%             |
| Total fix cycles    | {total_fix_cycles}             |
| Total tokens        | {total_tokens}                 |
```

If no rollup entry exists for the milestone, compute summary directly from task-metrics.jsonl records.

## Step 3: Display Process ELO

```
## Process ELO

{elo_after} ({elo_delta > 0 ? '↑' : '↓'} {elo_delta} from {elo_before})
```

If no previous milestone, show: `{elo_after} (baseline — first milestone)`

## Step 4: Display Signal Distribution

From rollup `signal_distribution` or computed from task-metrics:

```
## Signal Distribution

| Signal Type      | Count |
|------------------|-------|
| pass-through     | {N}   |
| fix-cycle        | {N}   |
| debug-invoked    | {N}   |
| user-correction  | {N}   |
| phase-skip       | {N}   |
```

## Step 5: Display Domain Breakdown

From rollup `domain_breakdown`:

```
## Domain Breakdown

| Domain            | Tasks | Pass% | Avg Duration |
|-------------------|-------|-------|--------------|
| {domain}          | {N}   | {N}%  | {N}s         |
```

## Step 6: Display Trend Comparison

If `trend_delta` exists (previous milestone data available):

```
## Trend vs Previous Milestone

| Metric          | Delta                    |
|-----------------|--------------------------|
| First-pass rate | {delta > 0 ? '↑' : '↓'} {delta}% |
| Avg duration    | {delta > 0 ? '↑' : '↓'} {delta}s |
| ELO             | {delta > 0 ? '↑' : '↓'} {delta}  |
```

If no previous milestone: "First milestone — no trend data yet."

## Step 7: Display Heuristic Anomalies

If `heuristic_flags` has entries:

```
## Anomaly Detection

| Heuristic                     | Severity | Description              |
|-------------------------------|----------|--------------------------|
| {heuristic}                   | {sev}    | {description}            |
```

If no anomalies: "No anomalies detected."

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
