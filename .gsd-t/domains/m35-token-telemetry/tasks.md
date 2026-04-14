# Tasks: m35-token-telemetry

## T1 — Draft JSONL schema + contract v1.0.0 (Wave 1)
**File**: `.gsd-t/contracts/token-telemetry-contract.md`
**Acceptance**:
- Version 1.0.0, Status: ACTIVE
- Full record schema (18+ fields from scope.md)
- Field semantics documented, each field with type, nullability, and meaning
- Schema freeze policy: additions only, never removals or renames (breaking changes require contract version bump)
- Example record block
- Query CLI contract: `gsd-t metrics --tokens [--by <field>,<field>] [--context-window] [--halts]`
- Consumer list
- Filepath convention: `.gsd-t/token-metrics.jsonl`

## T2 — Implement `bin/token-telemetry.js` skeleton (Wave 1)
**File**: `bin/token-telemetry.js`
**Acceptance**:
- Exports `recordSpawn(record)` that validates against the schema and appends one JSON line to `.gsd-t/token-metrics.jsonl`
- Exports `readAll(projectDir)` that returns parsed records
- Exports `aggregate(records, {by: ['model', 'command']})` that groups and computes count/total/mean/median/p95
- File creation: first write creates the file; missing dir handled gracefully
- Atomic append (best effort — single-writer assumed, no lockfile needed at M35 scope)
- ~8 unit tests in this task (rest land in T4)

## T3 — Wire per-spawn bracket into 6 command files (Wave 2)
**Files**: 6 command files listed in scope.md
**Acceptance**:
- Every Task subagent spawn wrapped in a token bracket:
  ```
  Before spawn: t0_tokens = read(.gsd-t/.context-meter-state.json).inputTokens
  Spawn subagent
  After return: t1_tokens = read(.gsd-t/.context-meter-state.json).inputTokens
  node bin/token-telemetry.js recordSpawn '{...}'
  ```
- Bracket helper is a one-line bash shim (similar to the existing CTX_PCT shim)
- Existing OBSERVABILITY LOGGING blocks preserved — the token bracket is additive, not a replacement
- Grep confirms bracket appears in all 6 files

## T4 — Implement `gsd-t metrics --tokens` CLI (Wave 2)
**File**: `bin/gsd-t.js`
**Acceptance**:
- New subcommand: `gsd-t metrics --tokens [--by <field>[,<field>...]]`
- Flags supported: `--by model`, `--by command`, `--by phase`, `--by milestone`, `--by domain`, `--by domain_type`, combinable
- Output: plain-text table with count, total, mean, median, p95 per group
- Empty-data path: "No token-metrics.jsonl records yet — run a command first"
- ~5 unit tests covering each --by dimension

## T5 — Implement `gsd-t metrics --halts` CLI (Wave 2)
**File**: `bin/gsd-t.js`
**Acceptance**:
- New subcommand: `gsd-t metrics --halts`
- Reads `halt_type` field across `.gsd-t/token-metrics.jsonl`
- Outputs breakdown by type: clean, runway-refusal, headless-handoff, native-compact
- Any `native-compact` count > 0 surfaces a ⚠ warning line (defect signal)
- ~2 unit tests

## T6 — Implement `gsd-t metrics --tokens --context-window` CLI (Wave 2)
**File**: `bin/gsd-t.js`
**Acceptance**:
- Extends `metrics --tokens` with `--context-window` flag
- Buckets by `context_window_pct_before` in 10% increments (0-10%, 10-20%, ..., 90-100%)
- Shows tokens consumed per bucket
- Useful for detecting "spawns near stop threshold consume more than baseline" patterns
- ~2 unit tests
