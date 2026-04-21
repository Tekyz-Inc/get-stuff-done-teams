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

### D1-T2 — Implement capture entry-point
- Branch A: write `scripts/hooks/gsd-t-in-session-usage-hook.js` + wire install/update in `bin/gsd-t.js` (`install --install-in-session-hook` idempotent behavior).
- Branch B: write `scripts/transcript-tee-interactive.cjs` (reuse M42 D1 tee primitives; wrap `claude` or user shell invocation).
- Either branch: write `bin/gsd-t-in-session-usage.cjs` with `captureInSessionUsage({projectDir, sessionId, turnId, usage, model, command?, ts?})` that appends a JSONL line to `.gsd-t/metrics/token-usage.jsonl` conforming to D3's schema v2.
- Unit tests in `test/m43-in-session-usage.test.js`.

### D1-T3 — Integration test (one-turn + multi-turn)
- Fabricate an in-session session with 1 turn, assert 1 row in `.gsd-t/metrics/token-usage.jsonl`.
- Fabricate a 3-turn session, assert 3 rows with distinct `turn_id`.
- Fabricate a session with missing `usage`, assert row written with `usage: null`.
- Run the full suite (`npm test`), confirm no regressions.

### D1-T4 — Documentation
- Update `docs/requirements.md` §"M43 Universal Token Attribution" with the locked branch.
- Update `bin/gsd-t.js --help` if Branch A adds a new install subcommand flag.
- Append entry to `.gsd-t/progress.md` Decision Log.
