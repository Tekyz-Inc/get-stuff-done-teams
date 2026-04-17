# Constraints: m38-unattended-event-stream

## Must Follow

- **Append-only JSONL**. Never rewrite. Atomic append using the same primitive as `.gsd-t/token-metrics.jsonl` and other event streams.
- **One event per phase boundary**. Do not emit events on every internal step — keep volume manageable. Per the event schema table, only the listed event types fire.
- **Cursor file** at `.gsd-t/.unattended/event-cursor` tracks last-read offset by date file. Watch tick reads from cursor → EOF, then advances cursor.
- **Day-boundary handling**: events file is dated (YYYY-MM-DD.jsonl). When the date rolls over, watch tick reads remaining events from yesterday's file, then opens today's file and resets cursor.
- **Non-blocking**: event emission must NOT block the worker. If the events directory or file is missing, worker creates it; if write fails, worker logs and continues.
- **Survives `/clear` and `/compact`**: cursor lives in `.gsd-t/.unattended/`, not in conversation context.
- Watch tick output is **human-scannable**, not JSON. Use Unicode markers (▶ 📝 ✅ ❌ ⏱).
- Apply the markdown table emoji-spacing rule from CLAUDE-global.md (one extra space after emoji).

## Must Not

- Modify spawn primitives (Domain 1)
- Modify meter / token-budget / runway / telemetry (Domain 2)
- Touch `commands/gsd.md` (Domain 4)
- Delete optimization / reflect / audit / qa-calibrator commands (Domain 5)
- Touch docs (Domain 5)
- Replace the existing `.gsd-t/.unattended/state.json` schema — it stays. Event stream is additive, not a replacement.
- Use the same file as `.gsd-t/token-metrics.jsonl` — that's M35 token telemetry, being deleted by Domain 2. The event stream is a different concern.

## Dependencies

- **Depends on**: Wave 1 must complete first (Domain 1 + Domain 2). Domain 3 starts in Wave 2.
  - Reason for waiting: Domain 2 may edit `bin/gsd-t-unattended.cjs` to remove meter callsites. Domain 3 also edits unattended.cjs to add event emission. Sequencing prevents merge conflicts.
- **Depended on by**:
  - Domain 5 (m38-cleanup-and-docs) — docs reference the new watch tick format.

## Must Read Before Using

- `bin/gsd-t-unattended.cjs` — full file. Worker loop, phase boundaries (where `task_start` / `task_complete` fire), error / retry paths.
- `commands/gsd-t-unattended-watch.md` — current watch tick implementation (270s ScheduleWakeup, prints metadata heartbeat). The replacement.
- `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 — must not break the existing state.json schema, status enum, exit code contract.
- `bin/check-headless-sessions.js` — pattern for read-and-mark-surfaced. Cursor mechanism is similar.
- Existing `.gsd-t/events/2026-04-16.jsonl` — there's already an events directory in `git status`. Read what's there and the format used; reuse if compatible, otherwise the new contract supersedes.
- `commands/gsd-t-resume.md` Step 0 — auto-reattach handshake. Watch tick reform must not break this.
