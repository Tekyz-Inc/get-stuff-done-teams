# Domain: m43-d2-per-tool-attribution

## Responsibility

Attribute the tokens consumed in each turn across the tools used in that turn. The input is two streams:

1. Per-turn usage rows from D1 (`.gsd-t/metrics/token-usage.jsonl`, schema v2, contains `turn_id`, `session_id`, `usage`).
2. Tool-call events from the existing event-stream (`.gsd-t/events/*.jsonl`, written by `scripts/gsd-t-event-writer.js` and the PostToolUse heartbeat hook).

The output is per-tool-call attribution: each tool call (Bash, Read, Edit, Grep, Task, WebFetch, …) gets credited a share of its turn's total tokens proportional to the byte size of its `tool_result` payload relative to the turn's total `tool_result` bytes. This is the "output-byte ratio" algorithm, formalized in a new contract.

Ships a CLI: `gsd-t tool-cost --group-by tool|command|domain [--since YYYY-MM-DD] [--milestone Mxx] [--format table|json]` that joins the streams, applies the attribution, and prints a ranked table.

## Owned Files/Directories

- `bin/gsd-t-tool-attribution.cjs` — NEW. Library that exports:
  - `joinTurnsAndEvents({turnsPath, eventsGlob, since?, milestone?}) → [{turn_id, session_id, toolCalls:[...]}]`
  - `attributeTurn(turn) → [{tool_name, tokens_attributed, bytes_attributed, share}]`
  - `aggregateByTool/Command/Domain(attributions) → rankedRows`
- `bin/gsd-t-tool-cost.cjs` — NEW. CLI entry point for `gsd-t tool-cost …`. Zero deps.
- Patch `bin/gsd-t.js` to register the `tool-cost` subcommand.
- `.gsd-t/contracts/tool-attribution-contract.md` — NEW. Documents the output-byte ratio algorithm, tie-breaker rules (e.g., multiple tool calls with zero `tool_result` bytes → equal split of 1% floor), missing-data handling (tool call with no matching tool_result → contributes 0 bytes; usage with no matching turn → dropped with warn), and the canonical row schema.
- `test/m43-tool-attribution.test.js` — NEW. Unit tests for `joinTurnsAndEvents`, `attributeTurn` (simple ratios, tie-breakers, zero-byte cases), and the three aggregations.
- `test/m43-tool-cost-cli.test.js` — NEW. CLI smoke tests: `--since`, `--milestone`, `--format table`, `--format json`, `--group-by` variants.

## NOT Owned

- `.gsd-t/events/*.jsonl` (owned by the event-writer / heartbeat path — read-only here).
- `.gsd-t/metrics/token-usage.jsonl` (owned by D1 for write, D3 for schema — read-only here).
- `.gsd-t/token-log.md` (owned by D3; D2 does not write to it).
- `scripts/gsd-t-token-aggregator.js` (M40 D4; read-only).
- `scripts/gsd-t-dashboard-server.js` (owned by D6; D2 does not add routes).

## Consumers

- `gsd-t tokens` CLI (M41 D4, owned externally) — adds a `--show-tool-costs` flag that internally calls D2's aggregator.
- `gsd-t status` — optionally includes top-N tools in its token block.
- D6's transcript viewer — may include a "tool cost" panel per spawn (D6 owns the UI decision; D2 provides the query).
