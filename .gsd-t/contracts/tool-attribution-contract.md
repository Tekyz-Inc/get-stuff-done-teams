# Tool-Attribution Contract

## Version
- **1.0.0** (2026-04-21, M43 D2) — initial definition. Documents the output-byte ratio algorithm, tie-breakers, and canonical attribution row shape.

## Overview

Attributes a share of each per-turn usage row's tokens (input / output / cache-read / cache-creation / cost) across the tool calls that the assistant emitted in that turn. Output is the canonical `tool_attribution[]` array (defined by `metrics-schema-contract.md` v2) plus three ranker reductions (`by tool`, `by command`, `by domain`).

**Producer**: `bin/gsd-t-tool-attribution.cjs` (M43 D2).
**Consumers**: `gsd-t tool-cost` CLI (M43 D2), `gsd-t tokens --show-tool-costs` dashboard flag (D6 visibility), transcript viewer (D6 sidebar).

**Inputs**:
- Per-turn usage rows from `.gsd-t/metrics/token-usage.jsonl` (schema v2 — requires `session_id`, `turn_id`, `usage` on in-session rows; produced by M43 D1).
- Tool-call events from `.gsd-t/events/YYYY-MM-DD.jsonl` (`event_type: tool_call`, `agent_id = session_id`, `reasoning = tool_name` — produced by the PostToolUse heartbeat hook).

**Output**: Pure functions. The library does NOT write to the sinks — consumers (dashboard, CLI) format and print. If a producer later wants to persist attributions, it writes a SEPARATE row to `token-usage.jsonl` per schema v2 §5 (no mutation of historical rows).

---

## Attribution Algorithm — Output-Byte Ratio

For each turn we know the tokens consumed (from the per-turn v2 row). We attribute those tokens to the tool calls the assistant made during the turn in proportion to the byte size of each tool's result payload relative to the turn's total tool-result bytes.

### Canonical formulation

Let turn `T` carry `usage = { input_tokens, output_tokens, cache_read, cache_creation, cost_usd }` and contain tool calls `C = [c1, c2, …, cN]` where each `ci` has `bytes_i` (size of its `tool_result` payload).

For each `ci` the attribution share is:

```
share_i = bytes_i / Σ bytes_j       (when Σ bytes > 0)
```

Each token cell is split proportionally:

```
attr_i.input_tokens_share     = share_i × input_tokens
attr_i.output_tokens_share    = share_i × output_tokens
attr_i.cache_read_share       = share_i × cache_read
attr_i.cache_creation_share   = share_i × cache_creation
attr_i.cost_usd_share         = share_i × cost_usd          (or null if cost_usd is null)
```

Shares are floating-point; aggregation rounds on the final reduction, not per-row (keeps totals tight even when thousands of rows contribute fractions of a token).

### Byte source (v1.0.0)

The current event stream (`.gsd-t/events/*.jsonl`) records `tool_call` events with `reasoning = tool_name` but does **NOT** carry `tool_result` bytes. Until the event schema is extended to carry `bytes` (future work), `bytes_i = 0` for every call and the `Σ bytes = 0` tie-breaker fires (see below), producing an equal split. This is deliberate: the algorithm is defined over the full information state; the current event writer is a restricted producer. When a future event-schema extension supplies real byte counts, the ratio activates with no library change.

---

## Tie-Breakers

| Condition | Behavior |
|---|---|
| **Zero-byte turn** (`Σ bytes = 0`, N ≥ 1 calls) | Equal split — every call gets `share_i = 1/N`. |
| **Missing `tool_result`** for a specific call | That call contributes `bytes_i = 0` and `missing_tool_result: true` in its attribution row. If every call is missing, fall through to the equal-split rule above. |
| **No tool calls** (N = 0) for the turn | Single synthetic attribution: `{ tool_name: 'no-tool', share: 1.0, bytes_attributed: 0, missing_tool_result: false }`. All tokens flow to the `no-tool` bucket — useful for isolating pure-reasoning turns. |
| **Null turn tokens** (row has no `usage` or all four token fields are 0 AND `hasUsage=false`) | Row is **skipped** entirely. No attributions emitted. Callers must not assume every turn is represented in the output. |
| **Unmatched `turn_id`** (turn row with no events at all in any `.gsd-t/events/*.jsonl`) | Treated as `N = 0` (the "no tool calls" rule above). Attribution `no-tool` captures the tokens. |
| **Negative / non-finite bytes** | Clamped to 0 and logged to stderr as a data-integrity warning (library does not throw — analysis must not crash production queries). |

---

## Canonical Attribution Row Shape

Every `attributeTurn(turn)` result and every consumer-visible attribution row conforms to:

```json
{
  "turn_id":    "string — matches the source token-usage row",
  "session_id": "string — matches the source row",
  "command":    "string|null — carried from the source row for by-command aggregation",
  "domain":     "string|null — carried from the source row",
  "milestone":  "string|null — carried from the source row",
  "attributions": [
    {
      "tool_name":             "string — e.g. 'Bash', 'Read', 'Grep', 'Task', 'no-tool'",
      "bytes_attributed":      "number — bytes of tool_result output counted for this call",
      "share":                 "number — 0.0-1.0, fraction of turn's output tokens attributed",
      "input_tokens_share":    "number",
      "output_tokens_share":   "number",
      "cache_read_share":      "number",
      "cache_creation_share":  "number",
      "cost_usd_share":        "number|null",
      "missing_tool_result":   "boolean — optional; true if tool_use had no matching tool_result"
    }
  ]
}
```

### Ranker Row Shape (aggregator output)

`aggregateByTool` / `aggregateByCommand` / `aggregateByDomain` all return arrays sorted by `total_cost_usd` desc (ties broken by `total_output` desc, then `key` asc — deterministic):

```json
{
  "key":                   "string — tool name, command, or domain",
  "total_input":           "number",
  "total_output":          "number",
  "total_cache_read":      "number",
  "total_cache_creation":  "number",
  "total_cost_usd":        "number",
  "turn_count":            "number — distinct turns that contributed"
}
```

---

## Turn → Event Joining

### Keying

The canonical join key is `(session_id, turn_id)`. Per-turn usage rows always carry both. `tool_call` events carry `agent_id` = the session_id, but do NOT carry `turn_id` today — they carry `ts` (UTC ISO 8601).

### Turn-window matching

For each session, turns are ordered by `ts` (ascending). Tool calls are assigned to the most-recent turn whose `ts` is ≤ the tool call's `ts`. Equivalently: a tool_call emitted between assistant turn N (at `t_N`) and turn N+1 (at `t_{N+1}`) belongs to **turn N** — the assistant called the tool immediately after emitting its assistant message.

```
turn N     turn N+1     turn N+2
   │  tc1 tc2   │  tc3 tc4 │
   ▼          ▼          ▼
───────────────────────────────► time
tc1, tc2 → turn N
tc3, tc4 → turn N+1
```

### Edge cases

- Tool calls whose `ts` precedes the first turn in the session → dropped with a stderr warning (likely clock skew or out-of-order event write).
- Tool calls whose session is absent from the turn stream → kept as an `unmatched_session` bucket, not attributed to any turn.
- Tool calls with no matching session AT ALL → dropped with a stderr warning.

---

## `joinTurnsAndEvents` Return Shape

`joinTurnsAndEvents({ turnsPath, eventsGlob, since?, milestone? })` returns an array of:

```json
{
  "turn_id":    "string",
  "session_id": "string",
  "ts":         "ISO string — from the turn row's ts",
  "command":    "string|null",
  "domain":     "string|null",
  "milestone":  "string|null",
  "usage": {
    "input_tokens":    "number",
    "output_tokens":   "number",
    "cache_read":      "number",
    "cache_creation":  "number",
    "cost_usd":        "number|null"
  },
  "tool_calls": [
    { "tool_name": "string", "ts": "ISO string", "bytes": "number — 0 until event schema extension" }
  ]
}
```

Streaming is synchronous-only (zero-dep Node, `fs.readFileSync`). Real repo size at M43 launch: 523 turns × 21k events × 30 days — the joiner target is sub-second on a dev laptop. See D2-T7 for the perf gate.

### Filter semantics

- `since` — YYYY-MM-DD inclusive. Applied to the turn's `startedAt` (which is the canonical local-time stamp of the row). Events are read from file globs that match the date bucketed on or after that date.
- `milestone` — exact match against the turn row's `milestone` field. Events are NOT filtered by milestone (they lack the tag); attribution is driven by turns that survive the filter.

---

## Consumer Contract — `gsd-t tool-cost`

```
gsd-t tool-cost [--group-by tool|command|domain] [--since YYYY-MM-DD] [--milestone Mxx] [--format table|json]
```

Defaults: `--group-by tool --format table`.

- `table`: fixed-width, top 20 rows. Header: `Tool | Turns | Input | Output | CacheR | CacheC | Cost`.
- `json`: newline-delimited JSON, one ranker row per line, sorted by cost desc.
- `--group-by`: `tool` (default) aggregates on `tool_name`, `command` aggregates on the source row's `command` field, `domain` aggregates on the source row's `domain` field.

Exit codes: 0 success, 2 arg parse error, 3 data access error (unreadable JSONL, glob failure).

---

## Invariants

1. **Append-only semantics preserved**. The library reads — it does not mutate `token-usage.jsonl` or `events/*.jsonl`.
2. **Pure functions where possible**. `attributeTurn(turn)` is pure; `aggregateBy*(rows)` is pure. Only `joinTurnsAndEvents(opts)` touches the filesystem.
3. **Zero deps**. No `glob`, no `lodash`, no `readline` (uses `fs.readFileSync` + `split` — the JSONL files are bounded by disk, not stream cardinality, and sub-second over the real repo at M43 launch).
4. **Deterministic ordering**. `aggregateBy*` must return identical output for identical input — ordered by `(total_cost_usd desc, total_output desc, key asc)`. Downstream consumers (tests, diffs, reports) rely on this.
5. **No mutation of the input array** in any aggregator. Callers may reuse the joined array.

---

## Changelog

- 2026-04-21 (M43 D2-T1): 1.0.0 initial draft — algorithm, tie-breakers, canonical row, join semantics, consumer surface. Committed BEFORE the library + CLI + tests to lock the surface.
