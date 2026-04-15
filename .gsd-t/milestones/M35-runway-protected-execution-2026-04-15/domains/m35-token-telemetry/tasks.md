# Tasks: m35-token-telemetry

## Summary

Create the frozen JSONL schema and contract v1.0.0, implement `bin/token-telemetry.js` with record/aggregate API, wire per-spawn token brackets into 6 command files, and add three `gsd-t metrics` CLI subcommands (`--tokens`, `--halts`, `--context-window`). This domain feeds data to runway-estimator and optimization-backlog.

## Contract References

- `.gsd-t/contracts/token-telemetry-contract.md` — v1.0.0 (NEW, created in T1)
- `.gsd-t/contracts/context-meter-contract.md` — read-only (M34 — provides `.gsd-t/.context-meter-state.json` format)

---

## Tasks

### Task 1: Draft JSONL schema + `token-telemetry-contract.md` v1.0.0

- **Files**:
  - `.gsd-t/contracts/token-telemetry-contract.md` (create)
- **Contract refs**: `.gsd-t/contracts/context-meter-contract.md` (read-only — defines `.context-meter-state.json` field names used in token brackets)
- **Dependencies**: NONE (safe to run in Wave 1 parallel with degradation-rip-out T1/T2 and model-selector-advisor T1)
- **Acceptance criteria**:
  - Version `1.0.0`, Status: `ACTIVE`
  - Full record schema with all 18+ fields from M35-definition.md Part E §E.2 documented: `timestamp`, `milestone`, `command`, `phase`, `step`, `domain`, `domain_type`, `task`, `model`, `duration_s`, `input_tokens_before`, `input_tokens_after`, `tokens_consumed`, `context_window_pct_before`, `context_window_pct_after`, `outcome`, `halt_type`, `escalated_via_advisor`
  - Each field documented with: type, nullability, and semantic meaning
  - Schema freeze policy stated: additions only, never removals or renames; breaking changes require contract version bump
  - Example record block showing a realistic spawn record
  - Query CLI contract documented: `gsd-t metrics --tokens [--by <field>,<field>...]`, `gsd-t metrics --halts`, `gsd-t metrics --tokens --context-window`
  - Filepath convention: `.gsd-t/token-metrics.jsonl`
  - Consumer list: `bin/token-telemetry.js`, `bin/runway-estimator.js`, `bin/token-optimizer.js`, `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-doc-ripple.md`

### Task 2: Implement `bin/token-telemetry.js` skeleton

- **Files**:
  - `bin/token-telemetry.js` (create)
  - `test/token-telemetry.test.js` (create — initial 8 tests; remainder in T4)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (T1 output)
- **Dependencies**: Requires Task 1 (must implement exactly the schema documented in the contract)
- **Acceptance criteria**:
  - Exports `recordSpawn(record)`: validates required fields against T1 schema, appends one JSON line (no trailing comma) to `.gsd-t/token-metrics.jsonl`
  - Exports `readAll(projectDir)`: reads and parses all records from `.gsd-t/token-metrics.jsonl`, returns array; handles missing file (returns `[]`)
  - Exports `aggregate(records, {by: ['model', 'command']})`: groups by the specified fields and computes per-group: count, total tokens, mean, median, p95
  - First write creates `.gsd-t/token-metrics.jsonl` and any missing parent directories
  - Atomic append: single `fs.appendFileSync` call per record (single-writer assumption, no lockfile needed)
  - Does NOT make any `count_tokens` API calls — reads `.gsd-t/.context-meter-state.json` which M34's PostToolUse hook already maintains
  - Initial 8 unit tests in `test/token-telemetry.test.js`: recordSpawn writes a valid line, readAll parses records, readAll returns [] on missing file, aggregate by model, aggregate by command, schema validation rejects missing required fields, file creation on first write, append-only (no overwrite)

### Task 3: Wire per-spawn token bracket into 6 command files

- **Files**:
  - `commands/gsd-t-execute.md` (modify)
  - `commands/gsd-t-wave.md` (modify)
  - `commands/gsd-t-quick.md` (modify)
  - `commands/gsd-t-integrate.md` (modify)
  - `commands/gsd-t-debug.md` (modify)
  - `commands/gsd-t-doc-ripple.md` (modify)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (field names for the bash shim)
- **Dependencies**: Requires Task 2 (module must exist before command files call it)
- **BLOCKED BY**: m35-degradation-rip-out Task 3 (that task also modifies these 6 files — coordinate: degradation-rip-out T3 updates Token Budget Check blocks; T3 here adds token brackets around subagent spawns; these are distinct insertion points, but apply sequentially to avoid conflicts)
- **Acceptance criteria**:
  - Every Task subagent spawn in each of the 6 files wrapped in a token bracket bash shim:
    ```bash
    T0_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
    # ... spawn subagent ...
    T1_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
    node -e "require('./bin/token-telemetry.js').recordSpawn({timestamp:new Date().toISOString(),milestone:'M35',command:'gsd-t-{cmd}',phase:'{phase}',step:'Step N',domain:'{domain}',domain_type:'{type}',task:'{task}',model:'{model}',duration_s:${DURATION},input_tokens_before:${T0_TOKENS},input_tokens_after:${T1_TOKENS},tokens_consumed:${T1_TOKENS}-${T0_TOKENS},context_window_pct_before:0,context_window_pct_after:0,outcome:'success',halt_type:null,escalated_via_advisor:false})"
    ```
  - Bracket is additive — existing OBSERVABILITY LOGGING blocks (`.gsd-t/token-log.md` writes) are preserved unmodified alongside the new bracket
  - `grep -l "token-telemetry.js" commands/gsd-t-execute.md commands/gsd-t-wave.md commands/gsd-t-quick.md commands/gsd-t-integrate.md commands/gsd-t-debug.md commands/gsd-t-doc-ripple.md` returns all 6 files

### Task 4: Implement `gsd-t metrics --tokens` CLI + full test suite

- **Files**:
  - `bin/gsd-t.js` (modify — add metrics subcommand handler)
  - `test/token-telemetry.test.js` (modify — add remaining ~7 tests)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (output format spec)
- **Dependencies**: Requires Task 2 (calls `aggregate()` from token-telemetry.js)
- **Acceptance criteria**:
  - `gsd-t metrics --tokens` subcommand implemented in `bin/gsd-t.js`
  - Flags: `--by model`, `--by command`, `--by phase`, `--by milestone`, `--by domain`, `--by domain_type`; flags are combinable (e.g., `--by model,command` groups by both)
  - Output: plain-text aligned table with columns: group-key(s), count, total-tokens, mean, median, p95
  - Empty data path: "No token-metrics.jsonl records yet — run a command first"
  - `test/token-telemetry.test.js` final test count reaches ~15: add tests for `--by model` output, `--by command` output, `--by phase` output, `--by domain` output, combined `--by model,command` grouping, empty-data message, p95 calculation correctness

### Task 5: Implement `gsd-t metrics --halts` CLI

- **Files**:
  - `bin/gsd-t.js` (modify — add --halts flag to metrics handler)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (`halt_type` field semantics)
- **Dependencies**: Requires Task 4 (builds on the metrics subcommand infrastructure added in T4)
- **Acceptance criteria**:
  - `gsd-t metrics --halts` subcommand implemented
  - Reads `halt_type` field from all records in `.gsd-t/token-metrics.jsonl`
  - Outputs breakdown by halt type: `clean`, `runway-refusal`, `headless-handoff`, `native-compact` with counts
  - Any `native-compact` count > 0 surfaces a warning line: `⚠ {N} native-compact halt(s) detected — this is a defect signal; runway estimator thresholds may need re-tuning`
  - At least 2 unit tests: normal breakdown with multiple halt types, `native-compact` warning triggering

### Task 6: Implement `gsd-t metrics --tokens --context-window` CLI

- **Files**:
  - `bin/gsd-t.js` (modify — add --context-window flag to metrics --tokens handler)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (`context_window_pct_before` field)
- **Dependencies**: Requires Task 4 (extends `--tokens` handler)
- **Acceptance criteria**:
  - `gsd-t metrics --tokens --context-window` flag implemented
  - Buckets records by `context_window_pct_before` in 10% increments: `[0-10%)`, `[10-20%)`, ..., `[90-100%)`
  - For each bucket: shows record count and mean tokens consumed
  - Useful for detecting whether spawns near the stop threshold consume more tokens than baseline spawns
  - At least 2 unit tests: correct bucket assignment, empty bucket handling

---

## Execution Estimate

- Total tasks: 6
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 1 (Task 3 blocked by degradation-rip-out T3)
- Estimated checkpoints: 1 (T2 completion gates all Wave 2 work; T1+T2 together gate runway-estimator Wave 3)

## Wave Assignment

- **Wave 1**: Task 1, Task 2 (schema + skeleton — foundational for runway-estimator and optimization-backlog)
- **Wave 2**: Tasks 3, 4, 5, 6 (wiring + CLI — after degradation-rip-out Wave 2 clears the way for T3)
