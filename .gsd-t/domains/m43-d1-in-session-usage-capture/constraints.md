# Constraints: m43-d1-in-session-usage-capture

## Must Follow

- Zero external runtime deps (GSD-T is a zero-dep installer — see project CLAUDE.md).
- Missing `usage` → write `—` (not `0`, not `N/A`). Locked by the M41 Intent Audit and carried forward in M43 D3 schema v2.
- If Branch A (hook-based): install path MUST be idempotent — `gsd-t install` / `gsd-t update` both call `installInSessionHook()`, which deduplicates by marker comment (e.g., `// GSD-T in-session usage hook`).
- If Branch B (transcript tee): tee must **not** interfere with the interactive terminal — write to the ndjson sink in a way that does not steal stdin/stdout from the user-facing session. Review how M42 D1 handles this for headless and mirror the approach.
- Every row written MUST include `session_id` and `turn_id` so D2's per-tool attribution can join cleanly.
- Row writes are atomic (append-only; tmp-file + rename is NOT required for append, but the line must be a complete JSON object on a single line).
- `captureInSessionUsage` silently no-ops when `usage` is missing from the payload (log a warning; do not throw — hook handlers are in the Claude Code critical path and must never crash the session).

## Must Not

- Modify `bin/gsd-t-token-capture.cjs` beyond adding new fields to the row object it already writes — schema changes are D3's job.
- Emit any content from the user's interactive transcript beyond the `usage` envelope + model + session metadata. No prompt text, no tool inputs, no tool outputs.
- Depend on Anthropic API inference — this is local measurement only.
- Couple to `bin/runway-estimator.cjs` — that file does not exist (retired M38).

## Must Read Before Using (Category 3 Black Box)

- `bin/gsd-t-token-capture.cjs` — `recordSpawnRow` is the row-writer for headless spawns. Understand the row object shape before adding new fields.
- `scripts/gsd-t-token-aggregator.js` — `processFrame` attribution logic. If Branch B, D1's tee output must feed this aggregator unmodified.
- Claude Code hook settings (`~/.claude/settings.json`) — Branch A MUST verify the hook event name (`Stop`, `SessionEnd`, `PostToolUse`, etc.) actually delivers `usage`. Do NOT assume; test with a fabricated one-turn session first.
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 §"Usage field propagation" — result-frame vs assistant-frame semantics are the same in-session as headless.
- `bin/headless-auto-spawn.cjs` — for the env-propagation pattern (`GSD_T_SESSION_ID`, `GSD_T_COMMAND`, `GSD_T_PROJECT_DIR`); D1's in-session capture must populate the same fields.

## Dependencies

- **D1 → D3**: D1 writes rows in schema v2 (new `session_id`/`turn_id`/`sessionType` fields). D3 owns the schema bump and must land first at CP1.
- **D2 depends on D1**: D2's per-tool attribution joins D1's per-turn rows against `.gsd-t/events/*.jsonl` by `turn_id`. No D2 work starts before D1's output is stable.
- **D5 depends on D1**: D5's compaction-pressure circuit breaker reads the per-turn usage trajectory written by D1. No D5 work starts before D1 ships in Wave 1.

## Acceptance

- A fabricated in-session one-turn session (integration test) results in exactly one JSONL line in `.gsd-t/metrics/token-usage.jsonl` with `session_id`, `turn_id`, `sessionType: "in-session"`, real `input_tokens`/`output_tokens` values parsed from the hook payload (or ndjson result frame).
- The same fabricated session at multi-turn count writes N rows, one per turn, each with distinct `turn_id`.
- Missing `usage` produces a row with `usage: null` (not `0`, not omitted).
- A session that crashes mid-turn still produces rows for completed turns (in Branch B, the aggregator runs on whatever ndjson landed).
