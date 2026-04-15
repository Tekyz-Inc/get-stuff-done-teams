# Domain: m35-token-telemetry

## Milestone: M35
## Status: DEFINED
## Wave: 1 (tasks 1-2 schema + skeleton), 2 (tasks 3-6 wiring + CLI)

## Purpose

Capture token usage at per-subagent-spawn granularity, aggregate on demand by any dimension, and write a frozen JSONL schema that runway-estimator and optimization-backlog both consume. The raw JSONL is always accessible; the CLI surface (`gsd-t metrics --tokens/--halts/--context-window`) provides convenient aggregation.

## Why this domain exists

M35's optimization loop depends on data. Without per-spawn capture, the optimization backlog (m35-optimization-backlog) can't detect demotion candidates, and the runway estimator (m35-runway-estimator) can't compute confidence-weighted projections. The existing `.gsd-t/token-log.md` is markdown-table-based and not aggregatable — this domain replaces it with JSONL.

## Files in scope

- `bin/token-telemetry.js` — NEW module exposing `recordSpawn({...})`
- `.gsd-t/token-metrics.jsonl` — NEW append-only file (created on first write)
- `.gsd-t/contracts/token-telemetry-contract.md` → v1.0.0 NEW
- `test/token-telemetry.test.js` — NEW (~15 tests)
- `bin/gsd-t.js` — add `metrics --tokens`, `metrics --halts`, `metrics --context-window` subcommands
- Command files — add per-spawn bracket around each Task subagent invocation:
  - `commands/gsd-t-execute.md`
  - `commands/gsd-t-wave.md`
  - `commands/gsd-t-quick.md`
  - `commands/gsd-t-integrate.md`
  - `commands/gsd-t-debug.md`
  - `commands/gsd-t-doc-ripple.md`

## Files NOT in scope

- `bin/token-optimizer.js` — m35-optimization-backlog owns (but reads this domain's JSONL)
- `bin/runway-estimator.js` — m35-runway-estimator owns (but reads this domain's JSONL)
- `.gsd-t/token-log.md` — legacy markdown table, preserved in parallel during M35 for historical continuity; deprecated at end of M35 via a follow-up decision (captured in docs)

## Dependencies

- **Depends on**: m35-degradation-rip-out (needs new contract's halt_type semantics)
- **Blocks**:
  - m35-runway-estimator (reads `.gsd-t/token-metrics.jsonl` for historical data)
  - m35-optimization-backlog (token-optimizer reads JSONL to detect recommendations)

## Acceptance criteria

1. `bin/token-telemetry.js` exists with `recordSpawn({...})` that appends a record to `.gsd-t/token-metrics.jsonl`
2. Schema documented in `token-telemetry-contract.md` v1.0.0 and frozen (additions only, never removals/renames)
3. `.gsd-t/token-metrics.jsonl` being written by at least 3 command files (execute, wave, debug)
4. `gsd-t metrics --tokens --by model,command` returns a non-empty aggregated table after spawns
5. `gsd-t metrics --halts` returns breakdown by halt_type
6. `gsd-t metrics --tokens --context-window` buckets by context_window_pct_before
7. Full schema includes: timestamp, milestone, command, phase, step, domain, domain_type, task, model, duration_s, input_tokens_before, input_tokens_after, tokens_consumed, context_window_pct_before, context_window_pct_after, outcome, halt_type, escalated_via_advisor
8. ~15 unit tests passing
