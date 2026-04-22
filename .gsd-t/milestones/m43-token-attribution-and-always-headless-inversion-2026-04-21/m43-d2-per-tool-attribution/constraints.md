# Constraints: m43-d2-per-tool-attribution

## Must Follow

- Zero external runtime deps.
- Streaming read for events JSONL (do NOT load 19k+ lines into memory).
- The attribution algorithm MUST be deterministic — same input, same output. Any tie-breaker that involves randomness is forbidden; document the deterministic rule in the contract.
- Output `—` for tools with no `tool_result` bytes and no matching usage — never `0` without a reason documented in the row.
- CLI perf gate: `gsd-t tool-cost` on ~30 days of events + turns completes in < 3s (same spirit as M41 D4's 500ms gate — D2 is scan-once CLI, so the budget is looser).

## Must Not

- Modify events JSONL files (read-only).
- Write to token-log.md (D3's surface).
- Add a network server — this is CLI-only (M40 D5 + D6 own the web UIs).
- Attempt to attribute tokens across turns — attribution is within-turn only. Cross-turn analysis belongs in the dashboard layer.

## Must Read Before Using

- `scripts/gsd-t-event-writer.js` — understand the event record shape. What fields carry `turn_id`? What does a `tool_result` record look like? (The joiner depends on these.)
- `scripts/hooks/` — the PostToolUse heartbeat hook. Know which events it emits vs the event-writer. This determines whether D1's hook needs to also write a turn-boundary event.
- `.gsd-t/events/2026-04-21.jsonl` (or any recent day) — read ~20 lines to confirm the real shape matches documented assumptions. **This step is MANDATORY per Category 3 Black Box.**
- M40 D4 aggregator `scripts/gsd-t-token-aggregator.js` — how it groups by `workerPid, taskId`. D2's attribution uses `turn_id, tool_use_id` instead (finer grain).
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 — frame types (tool_use, tool_result, result, assistant).

## Algorithm Details (to be formalized in tool-attribution-contract.md)

Given one turn with N tool calls:

1. Sum the byte length of each `tool_result.content` (JSON-stringified).
2. If total > 0: each tool's share = `tool_result_bytes / total_bytes`. Attributed tokens = turn_output_tokens * share.
3. If total == 0 (no tool_result bytes, e.g., pure reasoning turn): equal split across all tool calls. If zero tool calls: attribute all tokens to `none` (special pseudo-tool for reasoning-only turns).
4. Tool calls whose `tool_result` never arrived (worker crashed mid-call) are recorded with `bytes_attributed: 0, share: 0` and a `missing_tool_result: true` flag — they contribute 0 to the turn's byte total and 0 to the attribution.
5. Turns where `turn_output_tokens` is `null` (D1 wrote `—` for missing usage): attribution is computed but marked `tokens_attributed: null` on every row — we know the byte split, we just don't know the absolute count.

## Dependencies

- **D2 → D1**: D2 consumes D1's per-turn usage JSONL. Does not start before D1 lands at Wave 1 CP.
- **D2 → D3**: D2 writes rows in D3's schema v2 row format (`tool_attribution: [{tool_name, bytes_attributed, tokens_attributed, share, missing_tool_result?}]`). Schema version lives in D3.
- **D2 || D4, D5, D6**: parallel in Wave 2 — independent once D1 + D3 land.

## Acceptance

- `gsd-t tool-cost --group-by tool` on the current repo's last 30 days of events shows **non-zero attribution for at least Bash, Read, Edit, Grep, Task**.
- `gsd-t tool-cost --group-by command --milestone M43` isolates M43-only rows.
- `--format json` emits one JSON object per group row, suitable for piping into `jq`.
- Unit tests cover: simple 2-tool turn, tie-breaker (zero-byte), missing tool_result, multiple turns in a session, multiple sessions filtered by `--since`.
