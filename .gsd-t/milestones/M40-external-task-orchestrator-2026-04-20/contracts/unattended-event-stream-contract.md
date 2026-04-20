# Contract: unattended-event-stream-contract

**Version**: 1.0.0 (DRAFT — finalized end of Wave 2)
**Status**: PROPOSED — M38 Domain 3
**Owner**: m38-unattended-event-stream
**Consumers**: m38-cleanup-and-docs (Domain 5 — docs reference the new watch-tick format); the user-facing watch-tick output

**Related contracts**:
- `unattended-supervisor-contract.md` v1.1.0 (UPDATED by Domain 3) — supervisor adds event-emission requirement
- `event-schema-contract.md` (existing) — generic event-stream schema for `.gsd-t/events/*.jsonl` (M14 Execution Intelligence Layer); this contract specializes for unattended-supervisor consumption

---

## 1. Purpose

Replace the current "iter N, exit 0" metadata heartbeat in `commands/gsd-t-unattended-watch.md` with a **structured activity log** that surfaces what the supervisor's workers are actually doing. Workers emit structured events to `.gsd-t/events/YYYY-MM-DD.jsonl`; the 270s watch tick reads new events since last tick and formats a compact human-scannable log.

## 2. Event Schema

Workers append one JSON object per line to `.gsd-t/events/YYYY-MM-DD.jsonl`. All events share these required fields:

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO-8601 string | UTC timestamp |
| `iter` | integer | Supervisor iteration number (matches state.json) |
| `type` | string | One of the event types below |
| `source` | string | `worker`/`supervisor`/`subagent` |

Type-specific fields:

| Type | Required Fields |
|------|-----------------|
| `task_start` | `milestone`, `wave`, `task` |
| `task_complete` | `task`, `verdict` (`pass`/`fail`/`partial`), `duration_s` |
| `subagent_verdict` | `agent` (`qa`/`red_team`/`design_verify`/`doc_ripple`), `verdict`, `findings_count` |
| `file_changed` | `path`, `op` (`create`/`modify`/`delete`) |
| `test_result` | `suite` (`unit`/`e2e`/`integration`), `pass` (int), `fail` (int), `total` (int) |
| `error` | `error` (string), `recoverable` (bool) |
| `retry` | `attempt` (int), `reason` (string) |

Example events file (`.gsd-t/events/2026-04-16.jsonl`):

```jsonl
{"ts":"2026-04-16T14:32:01Z","iter":14,"type":"task_start","source":"worker","milestone":"M38","wave":"wave-1","task":"m38-h1-T3"}
{"ts":"2026-04-16T14:32:05Z","iter":14,"type":"file_changed","source":"worker","path":"commands/gsd-t-execute.md","op":"modify"}
{"ts":"2026-04-16T14:34:12Z","iter":14,"type":"test_result","source":"worker","suite":"unit","pass":1228,"fail":0,"total":1228}
{"ts":"2026-04-16T14:36:00Z","iter":14,"type":"subagent_verdict","source":"subagent","agent":"qa","verdict":"pass","findings_count":0}
{"ts":"2026-04-16T14:40:13Z","iter":14,"type":"task_complete","source":"worker","task":"m38-h1-T3","verdict":"pass","duration_s":492}
```

## 3. Cursor Mechanism

Watch tick tracks last-read offset in `.gsd-t/.unattended/event-cursor` (one file, JSON):

```json
{
  "fileDate": "2026-04-16",
  "offset": 1247
}
```

- `fileDate`: which dated file the cursor is in
- `offset`: byte offset within that file (next read starts here)

### Day-Boundary Handling

When the date rolls over:
1. Watch tick reads remaining events from `{fileDate}.jsonl` from `offset` to EOF
2. Watch tick opens `{today}.jsonl` and reads from byte 0 to EOF
3. Cursor advances to `{fileDate: today, offset: <new EOF>}`
4. Yesterday's file is left intact (event-stream-contract retention rules apply)

### Initial Cursor

If `event-cursor` does not exist, watch tick creates it pointing to today's file at the current EOF (does not surface backlog of pre-existing events; that's the supervisor launch handshake's job).

## 4. Watch Tick Output Format

Replaces the M36 metadata heartbeat. Format:

```
[unattended supervisor — iter 14, +9m elapsed]
  ▶  task: m38-h1-T3 (wave 1, domain m38-headless-spawn-default)
  📝 6 files modified (commands/gsd-t-execute.md, gsd-t-wave.md, gsd-t-quick.md, ...)
  ✅  test_result: unit 1228/1228 pass
  ✅  test_result: e2e 4/4 pass
  ✅  subagent_verdict: QA pass | Red Team grudging-pass | Design Verify N/A
  ⏱  duration: 8m 12s | next: m38-h1-T4
```

Rules:
- Apply markdown emoji-spacing (one extra space after emoji)
- Group events by iteration; show one block per iteration in the tick window
- Show last 5 file paths inline; "and N more" if more
- If no new events since last tick: show `[unattended supervisor — iter N, +Tm elapsed] (no new activity since last tick)`
- If supervisor reached terminal status (`done`/`failed`/`stopped`/`crashed`): show terminal block and don't reschedule

## 5. Worker Emission API

`bin/event-stream.cjs` exposes:

```js
const { appendEvent, readSinceCursor, advanceCursor } = require('./bin/event-stream.cjs');

// Worker side
appendEvent('.', { type: 'task_start', iter: 14, source: 'worker', milestone: 'M38', wave: 'wave-1', task: 'm38-h1-T3' });

// Watch tick side
const { events, newCursor } = readSinceCursor('.');
// ... format and print events ...
advanceCursor('.', newCursor);
```

### appendEvent Guarantees

- **Atomic**: write to tmp + rename; never partial line
- **Non-blocking**: failure logged, never thrown to caller
- **Auto-create**: missing directory or file is created
- **`ts` auto-set** if not provided

### readSinceCursor Guarantees

- Returns `{events: [...], newCursor: {fileDate, offset}}`
- Tolerates malformed JSON lines: skips silently with stderr log
- Handles day-boundary per §3
- Returns `{events: [], newCursor: <unchanged>}` if events file missing

## 6. Supervisor Integration

`bin/gsd-t-unattended.cjs` calls `appendEvent` at:

| Event | When |
|-------|------|
| `task_start` | Before spawning each worker |
| `task_complete` | After worker exits |
| `error` | On non-zero worker exit |
| `retry` | On retry within iteration cap |

Workers spawned via `claude -p` may also emit events directly if they detect file changes / test results / subagent verdicts. Worker-side emission is **encouraged but not required** for milestone shipping (degradation: watch tick falls back to supervisor-emitted events only).

## 7. Test Coverage

- `test/event-stream.test.js` — NEW — appendEvent atomicity, readSinceCursor (empty file, partial last-line, malformed line skip, day boundary, missing file), advanceCursor
- `test/unattended-supervisor.test.js` — extend with event-emission assertions
- `test/unattended-watch.test.js` — NEW — watch tick output format snapshot

## Version History

- **1.0.0** (M38, target v3.12.10) — NEW.
