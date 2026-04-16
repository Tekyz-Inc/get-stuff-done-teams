# Contract: Token Telemetry

## Version: 1.0.0
## Status: ACTIVE
## Owner: m35-token-telemetry
## Consumers: `bin/token-telemetry.js`, `bin/runway-estimator.js` (M35 Wave 3, pending), `bin/token-optimizer.js` (M35 Wave 4, pending), `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-doc-ripple.md`, `bin/gsd-t.js` (`metrics --tokens`, `metrics --halts`, `metrics --tokens --context-window`)

---

## Purpose

Define the **per-subagent-spawn granular token telemetry** artifact — `.gsd-t/token-metrics.jsonl` — and the minimal helper API (`bin/token-telemetry.js`) that command files use to record one record per spawn. This data feeds:

1. **`bin/runway-estimator.js`** (M35 Wave 3): per-phase historical cost averages for pre-flight runway projection.
2. **`bin/token-optimizer.js`** (M35 Wave 4): retrospective detection of model-tier miscalibration (opus phases with 100% success → sonnet candidates; sonnet phases with high fix-cycle counts → opus candidates).
3. **`gsd-t metrics --tokens [--by ...]`** CLI: user-facing slice/dice of the telemetry data.
4. **`gsd-t metrics --halts`** CLI: halt-type breakdown for validating that the v3.0.0 three-band stop threshold is actually preventing native runtime compaction.

---

## Core Principles

1. **Append-only, frozen schema.** Once a field is defined, it cannot be removed or renamed in v1.x. New fields can be added. Breaking changes require a v2.0.0 bump.
2. **Zero cost at the write site.** `recordSpawn()` is a single synchronous `fs.appendFileSync` call. No lockfile. No network. No API call. Single-writer assumption (Claude Code runs one turn at a time per session, and subagents log through their parent session).
3. **Graceful on missing dependencies.** If `.gsd-t/.context-meter-state.json` (the M34 data source) is absent or stale, the token-bracket still records with `context_window_pct_before: 0` and `context_window_pct_after: 0` — telemetry is never blocked by hook absence.
4. **No double-counting.** Each subagent spawn produces exactly one record. The token bracket must wrap the spawn, not individual tool calls inside it.
5. **JSONL — one record per line.** No trailing commas. No nested arrays at the top level. Makes the file safe to `tail -f`, `wc -l`, and `jq -c '.field'`.

---

## Filepath Convention

`.gsd-t/token-metrics.jsonl` — project-local, git-tracked by convention (projects may `.gitignore` if they prefer).

The file is created on first write by `recordSpawn()`. Parent directories are created as needed. The file has no header row — each line is a complete JSON object.

---

## Record Schema (frozen for v1.x)

Each line of `.gsd-t/token-metrics.jsonl` is a single JSON object with the following fields. Field order within the line is NOT significant (consumers parse by key name).

```json
{
  "timestamp": "2026-04-14T22:45:12Z",
  "milestone": "M35",
  "command": "gsd-t-execute",
  "phase": "execute",
  "step": "Step 2",
  "domain": "m35-token-telemetry",
  "domain_type": "bin-script",
  "task": "task-2",
  "model": "sonnet",
  "duration_s": 47,
  "input_tokens_before": 43210,
  "input_tokens_after": 51890,
  "tokens_consumed": 8680,
  "context_window_pct_before": 21.6,
  "context_window_pct_after": 25.9,
  "outcome": "success",
  "halt_type": null,
  "escalated_via_advisor": false
}
```

### Field Definitions

| Field | Type | Nullable | Semantics |
|---|---|---|---|
| `timestamp` | string (ISO 8601 UTC) | no | Wall-clock start time of the spawn, `new Date().toISOString()`. Used as the primary key for time-series queries. |
| `milestone` | string | no | Milestone identifier (e.g., `"M35"`). Joined against `task-metrics.jsonl` for outcome signals in `bin/token-optimizer.js`. |
| `command` | string | no | The invoking slash command file basename without extension, e.g., `"gsd-t-execute"`, `"gsd-t-wave"`, `"gsd-t-quick"`. |
| `phase` | string | no | The logical phase within the command, e.g., `"execute"`, `"qa"`, `"red-team"`, `"test-runner"`, `"doc-ripple"`. Used for cross-command aggregation. |
| `step` | string | no | The command-file step number + optional name, e.g., `"Step 2"`, `"Step 5.5 (Red Team)"`. Used for fine-grained blame. |
| `domain` | string or "" | no (use `""` if N/A) | The domain name when the spawn is domain-scoped, e.g., `"m35-token-telemetry"`. Empty string when not applicable (e.g., top-level wave steps). |
| `domain_type` | string or "" | no (use `""` if N/A) | Broad category, e.g., `"bin-script"`, `"frontend-ui"`, `"backend-api"`, `"contract"`, `"docs"`, `"tests"`. Enables sharper runway-estimator queries (a `frontend-ui` execute burns different tokens than a `contract` execute). Empty string when not applicable. |
| `task` | string or "" | no (use `""` if N/A) | The task identifier when the spawn is task-scoped, e.g., `"task-3"`, `"T1"`. Empty string when not applicable. |
| `model` | enum `"haiku"\|"sonnet"\|"opus"` | no | The model tier the subagent ran on. Matches the `## Model Assignment` block in the command file. |
| `duration_s` | integer (seconds) | no | Wall-clock duration from spawn-start to spawn-return. `(T_END - T_START)` in the bash bracket. |
| `input_tokens_before` | integer | no | `inputTokens` field from `.gsd-t/.context-meter-state.json` read immediately BEFORE the spawn. `0` if the state file is missing/stale. |
| `input_tokens_after` | integer | no | `inputTokens` field from the same file read immediately AFTER the spawn. `0` if missing/stale. |
| `tokens_consumed` | integer | no | `input_tokens_after - input_tokens_before`. Can be `0` when the state file is missing on either side. Can be negative in pathological cases (state file stomped mid-bracket) — consumers should treat negative as `0`. |
| `context_window_pct_before` | number (0.0-100.0+) | no | `pct` field from `.gsd-t/.context-meter-state.json` read BEFORE the spawn. `0` if missing. |
| `context_window_pct_after` | number (0.0-100.0+) | no | `pct` field AFTER the spawn. `0` if missing. |
| `outcome` | enum `"success"\|"failure"\|"blocked"\|"escalated"` | no | Reason the spawn ended. `success` = normal return. `failure` = subagent reported error. `blocked` = caller refused to proceed (e.g., runway refusal). `escalated` = subagent invoked `/advisor` and re-ran. |
| `halt_type` | enum or null | yes | `null` for normal spawns. One of `"clean"` (GSD-T halted at `stop` band), `"runway-refusal"` (runway estimator refused to start), `"headless-handoff"` (auto-spawned headless continuation), `"native-compact"` (runtime compacted — defect signal). See `gsd-t metrics --halts`. |
| `escalated_via_advisor` | boolean | no | `true` if the subagent invoked `/advisor` during execution (per `model-selection-contract.md` v1.0.0). `false` otherwise. Cross-references to the escalation-miss log in `.gsd-t/token-log.md`. |

### Required Fields

All 18 fields above are **required**. `recordSpawn()` MUST reject any record missing a required field — this is the frozen-schema guarantee. The only fields that accept `null` are `halt_type`; all other fields use `""` or `0` / `false` as their "N/A" sentinel.

### Adding Fields (v1.x minor bumps)

New fields may be appended in v1.x minor bumps (v1.1.0, v1.2.0, ...). Consumers that read the file MUST tolerate unknown fields (ignore on parse). Schema-validation in `recordSpawn()` may warn on unknown fields but MUST NOT reject them.

### Removing or Renaming Fields

Forbidden in v1.x. Requires a v2.0.0 bump and a migration path for any existing `.gsd-t/token-metrics.jsonl` data.

---

## Example Record (realistic)

```json
{"timestamp":"2026-04-14T23:07:45Z","milestone":"M35","command":"gsd-t-execute","phase":"execute","step":"Step 2","domain":"m35-model-selector-advisor","domain_type":"bin-script","task":"T2","model":"sonnet","duration_s":63,"input_tokens_before":38412,"input_tokens_after":47821,"tokens_consumed":9409,"context_window_pct_before":19.2,"context_window_pct_after":23.9,"outcome":"success","halt_type":null,"escalated_via_advisor":false}
```

---

## `bin/token-telemetry.js` API

Exported from `bin/token-telemetry.js` via `module.exports`:

### `recordSpawn(record)` → `void`

**Behavior**:
1. Validates that all 18 required fields are present and of the correct type. Throws a descriptive `Error` on validation failure (the caller is expected to be a bash shim — a thrown error surfaces as a non-zero exit in the `node -e ...` invocation).
2. Ensures `.gsd-t/` directory exists (create if missing).
3. Serializes the record as JSON without pretty-printing (single line, no indentation, no trailing newline inside the JSON).
4. Appends `${line}\n` to `.gsd-t/token-metrics.jsonl` via a single `fs.appendFileSync` call.

**Atomicity**: single-writer assumption. No lockfile. Concurrent writes from parallel bash shims in the same session are extremely rare (Claude Code runs one turn at a time), and the underlying `appendFileSync` on POSIX is atomic for writes under `PIPE_BUF` (4096 bytes on most systems) — a single record is well under this limit.

**Error paths**:
- Missing required field → `Error("recordSpawn: missing required field: ${name}")`
- Wrong type on required field → `Error("recordSpawn: field ${name} has wrong type: expected ${type}, got ${actualType}")`
- Parent directory creation failure → propagated from `fs.mkdirSync`
- Append failure → propagated from `fs.appendFileSync`

### `readAll(projectDir?)` → `Array<Record>`

**Behavior**:
1. Reads `.gsd-t/token-metrics.jsonl` from `projectDir || process.cwd()`.
2. Returns `[]` if the file does not exist.
3. Splits on newline, filters empty lines, parses each line as JSON, returns the array.
4. Malformed lines are silently skipped with a console.warn (does not abort the read).

### `aggregate(records, options)` → `Array<Group>`

**Behavior**:
Groups `records` by the fields listed in `options.by` (an array of field names like `["model", "command"]`) and computes per-group statistics:
- `count` — number of records in the group
- `total_tokens` — sum of `tokens_consumed`
- `mean` — mean `tokens_consumed` across the group
- `median` — median `tokens_consumed`
- `p95` — 95th percentile of `tokens_consumed`

Returns an array of `{key, count, total_tokens, mean, median, p95}` objects, one per group. `key` is an object whose fields are the grouping dimensions.

Empty `records` → returns `[]`. Unknown `by` fields → empty string values in the group key.

### `recordSpawn` does NOT make API calls

Critical: `bin/token-telemetry.js` MUST NOT call `count_tokens`, MUST NOT open any network socket, MUST NOT spawn any child process. It reads the state file that M34's PostToolUse hook already maintains. This guarantees telemetry has effectively zero runtime cost.

---

## Token Bracket Pattern (bash shim for command files)

Every Task subagent spawn in M35 command files is wrapped in a token bracket that records one telemetry record. The shim is placed around the existing OBSERVABILITY LOGGING block — both artifacts (`.gsd-t/token-log.md` markdown table AND `.gsd-t/token-metrics.jsonl` per-spawn records) are written per spawn.

**Canonical bash shim** (copy-paste template for M35 Wave 2 Task 3):

```bash
# ── Token bracket — BEFORE spawn ──
T_START=$(date +%s)
T0_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T0_PCT=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).pct||0))}catch(_){process.stdout.write('0')}")

# ── Spawn subagent (existing logic unchanged) ──
# ... Task tool / TeamCreate / etc ...

# ── Token bracket — AFTER spawn ──
T_END=$(date +%s)
DURATION=$((T_END - T_START))
T1_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T1_PCT=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).pct||0))}catch(_){process.stdout.write('0')}")

# ── Record telemetry ──
node -e "require('./bin/token-telemetry.js').recordSpawn({timestamp:new Date().toISOString(),milestone:'M35',command:'gsd-t-execute',phase:'execute',step:'Step 2',domain:'{DOMAIN}',domain_type:'{DOMAIN_TYPE}',task:'{TASK}',model:'sonnet',duration_s:${DURATION},input_tokens_before:${T0_TOKENS},input_tokens_after:${T1_TOKENS},tokens_consumed:${T1_TOKENS}-${T0_TOKENS},context_window_pct_before:${T0_PCT},context_window_pct_after:${T1_PCT},outcome:'success',halt_type:null,escalated_via_advisor:false})"
```

Command files substitute `{DOMAIN}`, `{DOMAIN_TYPE}`, `{TASK}`, the command name, the phase, and the step at their specific spawn site. Wave 2 Task 3 (`m35-token-telemetry` T3) is responsible for wiring this into all 6 command files.

**Preserving existing OBSERVABILITY LOGGING**: the token bracket is ADDITIVE. The existing `.gsd-t/token-log.md` markdown table append block stays unchanged — both artifacts are written per spawn so that markdown tooling (`gsd-t status`, `gsd-t-reflect`) keeps working while the new JSONL feeds runway-estimator / token-optimizer.

---

## Query CLI Contract

The `bin/gsd-t.js` CLI exposes three new subcommands under `gsd-t metrics`:

### `gsd-t metrics --tokens [--by <field>,<field>...]`

Reads `.gsd-t/token-metrics.jsonl`, calls `aggregate()`, prints a plain-text aligned table.

**Flags**:
- `--by model` — group by model tier
- `--by command` — group by command name
- `--by phase` — group by phase
- `--by milestone` — group by milestone
- `--by domain` — group by domain
- `--by domain_type` — group by domain_type
- Combinations: `--by model,command` groups by both (fields comma-separated, no spaces)

**Output**: a plain-text aligned table with columns:
```
{group-key(s)}  count  total_tokens  mean  median  p95
```

**Empty data path**: when `.gsd-t/token-metrics.jsonl` is absent or empty:
```
No token-metrics.jsonl records yet — run a command first.
```

### `gsd-t metrics --halts`

Reads all records' `halt_type` field and prints a breakdown:

```
Halt type breakdown (last 1000 records)

  null (normal spawn):      842
  clean (stop at warn):       12
  runway-refusal:              3
  headless-handoff:            7
  native-compact:              0
```

If `native-compact > 0`, a warning line is appended:

```
⚠ N native-compact halt(s) detected — this is a defect signal. The v3.0.0 thresholds may need re-tuning or the runway estimator is under-predicting.
```

### `gsd-t metrics --tokens --context-window`

Same as `--tokens`, but buckets records by `context_window_pct_before` in 10% increments (`[0-10%)`, `[10-20%)`, ..., `[90-100%)`, `[100%+)`). For each bucket, prints the record count and mean `tokens_consumed`. Useful for detecting whether spawns near the stop threshold consume more tokens than baseline spawns — a signal that the threshold needs tightening.

---

## Integration Points

| Consumer | Uses | Purpose |
|---|---|---|
| `bin/runway-estimator.js` (M35 Wave 3) | `readAll()` + query by `{command, domain_type}` | Computes historical per-phase mean `tokens_consumed` as the basis for runway projection |
| `bin/token-optimizer.js` (M35 Wave 4) | `readAll()` joined with `task-metrics.jsonl` on `{milestone, task}` | Detects model-tier miscalibration (opus phases with 100% success → sonnet candidates) |
| `commands/gsd-t-execute.md` Step 2 | bash shim calling `recordSpawn()` | Per-subagent telemetry for domain execution |
| `commands/gsd-t-wave.md` each phase | bash shim calling `recordSpawn()` | Per-phase telemetry for wave orchestration |
| `commands/gsd-t-quick.md` | bash shim calling `recordSpawn()` | Per-quick-task telemetry |
| `commands/gsd-t-integrate.md` | bash shim calling `recordSpawn()` | Per-integration-spawn telemetry |
| `commands/gsd-t-debug.md` each iteration | bash shim calling `recordSpawn()` | Per-debug-iteration telemetry |
| `commands/gsd-t-doc-ripple.md` | bash shim calling `recordSpawn()` | Per-doc-update telemetry |
| `bin/gsd-t.js metrics --tokens / --halts / --tokens --context-window` | `readAll()` + `aggregate()` | User-facing slice/dice CLI |

---

## Relationship to Existing Artifacts

| Artifact | Relationship |
|---|---|
| `.gsd-t/token-log.md` (M31 markdown table) | **Coexists.** Both artifacts are written per spawn. `token-log.md` remains the human-readable view consumed by `gsd-t status` and reflect; `token-metrics.jsonl` is the machine-readable feed for runway-estimator / token-optimizer. |
| `.gsd-t/task-metrics.jsonl` (M25 task-level telemetry) | **Joined, not replaced.** `task-metrics.jsonl` records one entry per task (outcome, duration, fix-cycle count). `token-metrics.jsonl` records one entry per *subagent spawn* within a task. Join on `{milestone, task}` for full context. |
| `.gsd-t/.context-meter-state.json` (M34 hook state) | **Read-only data source.** The token bracket reads `inputTokens` and `pct` from this file. If the file is missing/stale, the bracket still records with `0` values — telemetry is never blocked. |

---

## Schema Freeze Policy

- The 18 required fields listed above are **frozen for v1.x**. They cannot be removed or renamed.
- Additive fields are allowed in v1.x minor bumps (v1.1.0, v1.2.0, ...). Consumers MUST tolerate unknown fields.
- The file path `.gsd-t/token-metrics.jsonl` is frozen for v1.x.
- The `gsd-t metrics --tokens`, `--halts`, `--tokens --context-window` CLI subcommand names are frozen for v1.x.
- The `recordSpawn` / `readAll` / `aggregate` API shapes are frozen for v1.x.

Any breaking change (field removal, file-path move, API rename) requires a v2.0.0 bump and a migration path for existing `.gsd-t/token-metrics.jsonl` data in downstream projects.

---

## Test Coverage (pending — M35 Wave 2 T2 + T4)

- `test/token-telemetry.test.js` — initial 8 tests in Wave 2 T2 (schema validation, readAll, aggregate by model, aggregate by command, file creation, append-only). Remainder (~7 more, total ~15) in T4.
- Fixtures: tempdir with pre-seeded `.gsd-t/token-metrics.jsonl` records.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | M35 / 2026-04-14 | Initial contract. Frozen 18-field schema for `.gsd-t/token-metrics.jsonl`, `bin/token-telemetry.js` API (`recordSpawn`, `readAll`, `aggregate`), canonical bash token-bracket shim, `gsd-t metrics --tokens/--halts/--tokens --context-window` CLI contract, integration points with runway-estimator (Wave 3) and token-optimizer (Wave 4). |
