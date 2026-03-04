# Constraints: event-stream

## Must Follow
- Zero external npm dependencies — Node.js built-ins only (fs, path, os)
- All functions ≤ 30 lines (split if longer)
- Files ≤ 200 lines (create new modules if needed)
- Same pattern as existing scripts: validate inputs, exit non-zero on error, no console.error noise on success
- gsd-t-event-writer.js must export functions via `module.exports` AND support CLI invocation via `require.main === module` guard
- Follow installUtilityScripts() pattern in bin/gsd-t.js for installEventWriter()
- Cross-platform path handling (Windows backslash + forward slash)

## Must Not
- Modify any command file (commands/*.md) — that is learning-loop and reflect domain
- Add external dependencies
- Modify any test file — those get created by test-sync phase
- Break existing heartbeat behavior (heartbeat ALSO continues writing to existing heartbeat-{session}.jsonl)

## Must Read Before Using
- `scripts/gsd-t-heartbeat.js` — full file — before adding events/ write path
  - Functions to understand: `buildEvent()`, `summarize()`, `scrubSecrets()`, `appendToHeartbeat()`
  - Behavior to preserve: existing heartbeat-{session}.jsonl writes must continue unchanged
- `bin/gsd-t.js` — `installUtilityScripts()` function at lines ~1200+ — pattern to replicate for installEventWriter()
- `commands/gsd-t-init.md` — step that creates .gsd-t/ subdirectories — to add events/ creation

## External Reference Dispositions
- Reflexion pattern: INSPECT only — implementing the retrieve-before-act concept from scratch, not importing any library
- OpenTelemetry GenAI semantic conventions: INSPECT only — borrowing field naming conventions only (agent_id, parent_agent_id, trace_id), no SDK import

## Dependencies
- Depends on: nothing (foundational domain)
- Depended on by: learning-loop for event-writer.js CLI + events/ JSONL format
- Depended on by: reflect for events/ JSONL format to read/distill

## Event Schema (authoritative — see event-schema-contract.md)
Every event written to `.gsd-t/events/YYYY-MM-DD.jsonl` MUST conform exactly to:
```json
{
  "ts": "ISO8601 timestamp",
  "event_type": "phase_transition|subagent_spawn|subagent_complete|tool_call|experience_retrieval|outcome_tagged|distillation|command_invoked",
  "command": "gsd-t-execute (or null)",
  "phase": "execute (or null)",
  "agent_id": "string or null",
  "parent_agent_id": "string or null",
  "trace_id": "string or null",
  "reasoning": "string or null",
  "outcome": "success|failure|learning|deferred|null"
}
```
