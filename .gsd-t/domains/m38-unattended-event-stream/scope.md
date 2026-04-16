# Domain: m38-unattended-event-stream

## Responsibility

Reform the unattended watch tick from a "iter N, exit 0" metadata heartbeat to a **structured activity log** that surfaces real worker activity in the interactive chat. Workers emit structured events to `.gsd-t/events/YYYY-MM-DD.jsonl`; the 270s watch tick reads new events since last tick and formats a compact human-scannable log.

This addresses user feedback that the watch tick gave no visibility into what the supervisor was actually doing.

## Owned Files/Directories

- `bin/gsd-t-unattended.cjs` — supervisor loop emits or coordinates event emission per worker phase boundary
- `bin/gsd-t-unattended-platform.js` (and `.cjs` if exists) — REVIEW; platform shims may need event-emission helpers
- `commands/gsd-t-unattended-watch.md` — watch tick reads `.gsd-t/events/YYYY-MM-DD.jsonl` since last tick, formats activity log
- `bin/event-stream.cjs` — NEW; small library for append + read-since-cursor on `.gsd-t/events/YYYY-MM-DD.jsonl` (atomic append, JSONL parse, cursor file at `.gsd-t/.unattended/event-cursor`)
- `.gsd-t/contracts/unattended-event-stream-contract.md` — NEW; formalizes worker event emission and watch tick consumption format
- `.gsd-t/contracts/unattended-supervisor-contract.md` — UPDATE to reference event-stream emission requirement
- Test files: new `test/event-stream.test.js`, extend `test/unattended-supervisor.test.js` for event emission

## Event Schema (preview — finalized in unattended-event-stream-contract.md)

Workers emit events to `.gsd-t/events/YYYY-MM-DD.jsonl`, one JSON per line:

| Event Type | Emitted When | Required Fields |
|------------|--------------|-----------------|
| `task_start` | Worker starts a task | `ts`, `iter`, `milestone`, `wave`, `task` |
| `task_complete` | Worker finishes a task | `ts`, `iter`, `task`, `verdict`, `duration_s` |
| `subagent_verdict` | QA / Red Team / Design Verify reports | `ts`, `iter`, `agent`, `verdict`, `findings_count` |
| `file_changed` | Worker edits a file | `ts`, `iter`, `path`, `op` (`create`/`modify`/`delete`) |
| `test_result` | Test suite run reports | `ts`, `iter`, `suite`, `pass`, `fail`, `total` |
| `error` | Worker hits an error | `ts`, `iter`, `error`, `recoverable` |
| `retry` | Worker retries after error | `ts`, `iter`, `attempt`, `reason` |

Watch tick output format (replaces `iter N, exit 0`):

```
[unattended supervisor — iter 14, +9m elapsed]
  ▶ task: m38-h1-T3 (wave 1, domain m38-headless-spawn-default)
  📝 6 files modified (commands/gsd-t-execute.md, ...)
  ✅ test_result: unit 1228/1228 pass
  ✅ test_result: e2e 4/4 pass
  ✅ subagent_verdict: QA pass | Red Team grudging-pass | Design Verify N/A
  ⏱  duration: 8m 12s | next: m38-h1-T4
```

## NOT Owned (do not modify)

- `bin/headless-auto-spawn.cjs`, headless plumbing (Domain 1)
- Meter machinery (Domain 2)
- `commands/gsd.md` and conversational commands (Domain 4)
- Self-improvement deletions, doc ripple (Domain 5)
- `commands/gsd-t-unattended.md` launch command itself — UNLESS the launch handshake needs to bootstrap the event cursor file (in which case minimal edit acceptable, coordinate with Wave 1 changes)
