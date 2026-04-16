# Tasks: m38-unattended-event-stream (ES)

## Summary

Reform the unattended watch tick from a "iter N, exit 0" metadata heartbeat to a structured activity log. Workers append events to `.gsd-t/events/YYYY-MM-DD.jsonl`. Watch tick reads new events since cursor and formats human-scannable output. Update `unattended-supervisor-contract.md` to v1.1.0.

## Tasks

### Task ES-T1: Build bin/event-stream.cjs library + unit tests
- **Files**: NEW `bin/event-stream.cjs`, NEW `test/event-stream.test.js`; read existing `.gsd-t/events/2026-04-16.jsonl` to confirm format compatibility
- **Contract refs**: unattended-event-stream-contract.md v1.0.0 §3 (cursor mechanism), §5 (worker emission API)
- **Dependencies**: BLOCKED by MR-T8 (M38-CP2 / Wave 1 complete)
- **Acceptance criteria**:
  - Exports: `appendEvent(projectDir, eventObj)`, `readSinceCursor(projectDir)`, `advanceCursor(projectDir, newCursor)`
  - `appendEvent` is atomic (write-tmp + rename), non-blocking, auto-creates `.gsd-t/events/` and dated file, auto-sets `ts` if missing
  - `readSinceCursor` returns `{events, newCursor}`; tolerates malformed JSON lines (skip silently with stderr log); handles day-boundary per contract §3; returns `{events: [], newCursor: <unchanged>}` if events file missing
  - Cursor file at `.gsd-t/.unattended/event-cursor` (JSON: `{fileDate, offset}`); creates pointing to today's EOF if missing
  - 12+ unit tests in `test/event-stream.test.js`: appendEvent atomicity, appendEvent auto-create dir/file, ts auto-set, readSinceCursor empty file, partial-last-line handling, malformed-line skip, day boundary, missing file, advanceCursor round-trip, cursor file initial-create
  - All tests green

### Task ES-T2: Wire supervisor event emission in bin/gsd-t-unattended.cjs
- **Files**: `bin/gsd-t-unattended.cjs`, `test/unattended-supervisor.test.js` (extend)
- **Contract refs**: unattended-event-stream-contract.md v1.0.0 §6 (supervisor integration); unattended-supervisor-contract.md v1.1.0 (added in ES-T4)
- **Dependencies**: BLOCKED by ES-T1
- **Acceptance criteria**:
  - Supervisor calls `appendEvent` at: before each worker spawn (`task_start`), after worker exit (`task_complete`), on non-zero exit (`error`), on retry (`retry`)
  - Event payloads include all required fields per contract Event Schema table (§2)
  - Supervisor failure to emit (file write error) is logged but does NOT halt the loop
  - `test/unattended-supervisor.test.js` extends with 4+ assertions: each event type fires at the right moment with right shape
  - Existing supervisor tests still pass

### Task ES-T3: Reform commands/gsd-t-unattended-watch.md tick output
- **Files**: `commands/gsd-t-unattended-watch.md`, NEW `test/unattended-watch.test.js`
- **Contract refs**: unattended-event-stream-contract.md v1.0.0 §4 (watch tick output format)
- **Dependencies**: BLOCKED by ES-T1; can run in parallel with ES-T2
- **Acceptance criteria**:
  - Watch tick reads via `readSinceCursor` and formats events grouped by iteration; output matches contract §4 example block (▶ task / 📝 files / ✅ test_result / ✅ subagent_verdict / ⏱ duration)
  - Apply markdown emoji-spacing rule (one extra space after each emoji per CLAUDE-global.md)
  - "no new activity since last tick" message when zero events in window
  - Terminal-status block when supervisor reached `done`/`failed`/`stopped`/`crashed` — does NOT reschedule another `ScheduleWakeup`
  - The existing 270s `ScheduleWakeup` cadence preserved
  - `test/unattended-watch.test.js` snapshots the formatter against fixture event arrays (3+ snapshot cases: active iteration, no-activity, terminal status)

### Task ES-T4: Update unattended-supervisor-contract.md to v1.1.0
- **Files**: `.gsd-t/contracts/unattended-supervisor-contract.md`
- **Contract refs**: unattended-event-stream-contract.md v1.0.0 (referenced); unattended-supervisor-contract.md (this task bumps to v1.1.0)
- **Dependencies**: BLOCKED by ES-T2 (supervisor emission live)
- **Acceptance criteria**:
  - Version history adds `1.1.0 (M38)`: "Added event-stream emission requirement at phase boundaries; references unattended-event-stream-contract.md v1.0.0"
  - New section in supervisor contract: "Event Emission" — pointers to event-stream-contract for schema; lists 4 mandatory emission points (task_start, task_complete, error, retry)
  - State.json schema unchanged (event stream is additive)
  - Status enum unchanged
  - Exit code table unchanged

### Task ES-T5: Test suite green + commit ES domain
- **Files**: run `npm test`; if pass, commit
- **Contract refs**: M38-CP3
- **Dependencies**: BLOCKED by ES-T1 through ES-T4
- **Acceptance criteria**:
  - `npm test` green; new tests added: ~12 (event-stream) + 4 (supervisor extends) + 3 (watch snapshots) = ~19 new
  - Commit message: `feat(M38-ES): unattended event stream + watch tick reform`
  - Decision Log entry: "M38-CP3 reached — ES domain complete; event stream live; watch tick reformed; supervisor v1.1.0"

## Execution Estimate

- Total tasks: 5
- Independent tasks within domain: 1 (T1)
- Blocked tasks within domain: 4 (T2 through T5)
- Cross-domain blockers: 1 (BLOCKED by MR-T8 / M38-CP2)
- Estimated checkpoints: 1 (M38-CP3)
- Parallel-safe sub-groups: T2 + T3 can run in parallel after T1
- Wave 2 parallel-safe with RC + CD (with CD running last)
