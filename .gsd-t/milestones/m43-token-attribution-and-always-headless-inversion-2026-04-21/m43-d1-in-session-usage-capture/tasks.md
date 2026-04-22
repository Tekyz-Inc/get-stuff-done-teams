# Tasks: m43-d1-in-session-usage-capture

(Task-level decomposition will be refined in `/gsd-t-plan` M43. Skeleton below.)

## Wave 1 — Foundation

### D1-T1 — Branch spike + decision lock — **DONE** (2026-04-21)

**Status**: BRANCH B LOCKED (transcript-sourced). Hook payloads contain no `usage`, but they do carry `transcript_path` pointing at the Claude Code jsonl transcript (`~/.claude/projects/-.../{sessionId}.jsonl`) which contains full `message.usage` envelopes per assistant turn (412 such lines observed in one 23m session).

**Branch decision** (evidence on disk in `.gsd-t/.hook-probe/`):
- Stop payload keys: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`. **No `usage`.**
- SessionEnd payload keys: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `reason`. **No `usage`.**
- PostToolUse payload keys: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id`. **No `usage`.**
- `transcript_path` jsonl rows contain `message.usage` with `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `total_cost_usd`, plus `model` and `id` — same shape M40 D4 aggregator expects.

**Hybrid chosen**: Stop hook = trigger, transcript = data source. Writes as **Branch B** shape (sessionType `in-session`, one row per assistant turn with usage in transcript since last row).

- [x] Probe script shipped: `scripts/hooks/gsd-t-in-session-probe.js` (+ `~/.claude/scripts/gsd-t-in-session-probe.js`). Captures raw hook payload to `.gsd-t/.hook-probe/{event}-{ts}-{sid}.json`. 5/5 unit tests.
- [x] Probe directory created at `.gsd-t/.hook-probe/` (creating/deleting this directory is the on/off switch).
- [x] Hooks wired up (user wired Stop, SessionEnd, PostToolUse before supervisor relaunch).
- [x] Real payloads inspected — 10 Stop, 4 SessionEnd, 10 PostToolUse captured (supervisor-2026-04-21-2320 session). No `usage` in any payload; every payload carries `transcript_path`.
- [x] Branch B locked (transcript-sourced, Stop-hook-triggered).
- [x] Decision recorded in `.gsd-t/progress.md` Decision Log 2026-04-21 23:30 + field-name evidence above.
- [ ] Delete `.gsd-t/.hook-probe/` directory once D1-T2 ships — leaves script in place for future re-enablement. (Deferred to D1-T3 completion so raw payloads remain available for the integration-test golden fixtures.)

### D1-T2 — Implement capture entry-point — **DONE** (2026-04-21, commit 6d40e1c)
- [x] Branch B shipped (chosen): `bin/gsd-t-in-session-usage.cjs` exports `captureInSessionUsage({projectDir, sessionId, turnId, usage, model, command?, ts?})` and `processHookPayload({projectDir, payload})`. Appends v2-schema JSONL rows to `.gsd-t/metrics/token-usage.jsonl`. Idempotent via transcript-line cursor. `skipMarkdownLog=true` — per-turn rows do **not** touch `.gsd-t/token-log.md` (that file is a regenerated view per D3).
- [x] Hook shim shipped: `scripts/hooks/gsd-t-in-session-usage-hook.js` — reads stdin JSON, delegates to `processHookPayload`. ~50 lines, no external deps.
- [x] Unit tests: `test/m43-in-session-usage.test.js` — 10/10 pass. Covers one-turn, multi-turn, idempotent replay, appended-turn delta, missing usage, non-assistant lines, missing transcript, non-existent transcript, null-usage direct call, JSONL-only emission, real-probe-shaped payload.
- [x] `recordSpawnRow` extended with `skipMarkdownLog` option (backward compatible — existing callers unchanged).
- Branch A skipped: hook payloads carry no `usage` (evidenced in D1-T1), so the hook-only path is not viable; the Branch B hybrid (Stop hook as trigger, transcript as data source) replaces it.
- Install-flag wiring in `bin/gsd-t.js` deferred: the hook is a user-owned `~/.claude/settings.json` entry, not something the installer should write. Documented in D1-T4.

### D1-T3 — Integration test (one-turn + multi-turn) — **DONE** (2026-04-21)
- [x] Unit suite in `test/m43-in-session-usage.test.js` covers all three fabricated scenarios (one-turn, three-turn distinct `turn_id`, null-usage direct call writes `hasUsage=false`).
- [x] **Live end-to-end**: real Stop payload `Stop-2026-04-21T23-24-30-274Z-a5ee3b8e-1a7.json` processed against live Claude Code transcript (2184 lines). Result: 522 rows emitted on first fire, 1 row + 521 skipped on replay (idempotent via cursor). Sink landed at 523 v2-schema rows, all with `sessionType: "in-session"`, distinct `turn_id`, parsed `inputTokens`/`outputTokens`/`cacheReadInputTokens`, `model: claude-opus-4-7`.
- [x] `gsd-t tokens --regenerate-log` against the populated sink produces 527 lines (verified end-to-end D1↔D3 integration, then reverted — see D1-T4 note on hand-maintained log preservation).
- [x] Full suite: 1588/1590 pass; the 2 fails (`buildEventStreamEntry`, `writer_shim_safe_empty_agent_id_auto_mints_id`) are pre-existing and unrelated to M43 (same fails observed before D3 landed).

### D1-T4 — Documentation — **DONE** (2026-04-21)
- [x] `docs/requirements.md` §"M43 Universal Token Attribution" updated with Branch B lock + live-validation evidence.
- [x] `bin/gsd-t.js --help`: no flag added (install-flag wiring deferred per D1-T2 note — hook belongs in user settings, not installer).
- [x] `.gsd-t/progress.md` Decision Log entry: 2026-04-21 16:35 — Wave 1 gate achieved.
- [x] Hand-maintained `.gsd-t/token-log.md` preserved (`git checkout` after verification regen). D3-T4.1 backfill parser extension is the path to make the full regen reproduce historical spawn rows; until then, the hand-maintained file stays authoritative for pre-M43 spawn history.
