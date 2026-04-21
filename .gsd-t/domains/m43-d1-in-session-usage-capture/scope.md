# Domain: m43-d1-in-session-usage-capture

## Responsibility

Capture per-turn token usage for **in-session Claude Code sessions** (the interactive surface), so that every turn — not just headless `claude -p` spawns that M41 already covers — writes a row with parsed `usage` fields to `.gsd-t/metrics/token-usage.jsonl`.

Two implementation branches are viable; D1 picks one during Step 1 after a short spike:

- **Branch A — hook-based**: If Claude Code exposes a `Stop` or `SessionEnd` hook payload that includes `usage` (same shape as the `result` frame emitted by headless `claude -p`), register a hook at `~/.claude/settings.json` + install logic in `bin/gsd-t.js install/update`, and parse the payload into a token-usage row.
- **Branch B — transcript tee extension**: If no hook surface exists, extend the M42 `scripts/transcript-tee` / transcript-tee.cjs machinery from "write transcript ndjson during headless spawn" to "write transcript ndjson during interactive session too" (using the same `.gsd-t/transcripts/` sink), then run the M40 D4 aggregator (`scripts/gsd-t-token-aggregator.js`) against that stream with the same `processFrame` logic.

Branch selection is a locked decision — D1-T1 picks the branch and both following tasks take that path only.

## Owned Files/Directories

- `bin/gsd-t-in-session-usage.cjs` — NEW. Entry point for the hook-based path (Branch A) OR the interactive-tee orchestrator (Branch B). Exports `captureInSessionUsage({projectDir, sessionId, turnId, usage, model, command?, ts?})` that writes one row to `.gsd-t/metrics/token-usage.jsonl` + (if configured) appends to `.gsd-t/token-log.md` via `recordSpawnRow` from `bin/gsd-t-token-capture.cjs`.
- `scripts/hooks/gsd-t-in-session-usage-hook.js` — NEW. If Branch A, the hook handler mounted by `bin/gsd-t.js install/update`. Parses the hook payload, calls `captureInSessionUsage`.
- `scripts/transcript-tee-interactive.cjs` — NEW, Branch B only. Wrapper that starts a transcript tee around the current `claude` invocation (interactive mode) and routes the resulting ndjson through `scripts/gsd-t-token-aggregator.js` at session end.
- `test/m43-in-session-usage.test.js` — NEW. Unit tests for the chosen branch: hook payload parsing (fabricated Stop/SessionEnd payloads), or interactive-tee roundtrip (synthetic session → aggregator → expected row).
- `docs/requirements.md` — add §"M43 Per-Turn In-Session Usage Capture" with the chosen branch locked.

## NOT Owned (do not modify)

- `bin/gsd-t-token-capture.cjs` (owned by D3 for schema updates; D1 only calls `recordSpawnRow` as a consumer)
- `scripts/gsd-t-token-aggregator.js` (reused read-only; any schema extension is owned by D3)
- `.gsd-t/metrics/token-usage.jsonl` (format evolution is D3; D1 writes records conforming to the current schema)
- Command files `commands/*.md` (owned by D4)
- `scripts/gsd-t-context-meter.js` / `bin/context-meter-config.cjs` (owned by D5)
- `scripts/gsd-t-dashboard-server.js` / `scripts/gsd-t-transcript.html` (owned by D6)

## Contract Surface

- Reads from: the chosen Claude Code interface (hook payload OR interactive transcript ndjson) — **treat as black box per Assumption Audit Category 3 below.**
- Writes to: `.gsd-t/metrics/token-usage.jsonl` (schema v2 as defined by D3) + optional `.gsd-t/token-log.md` row.
- New optional fields added to schema v2 by D1's row format: `session_id`, `turn_id`, `sessionType: "in-session"|"headless"`. Formal schema change is owned by D3; D1 just writes into that shape.
