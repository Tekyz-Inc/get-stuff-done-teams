# Tasks: event-stream

## Summary
Creates the JSONL event stream infrastructure: a zero-dependency event writer CLI (`scripts/gsd-t-event-writer.js`), heartbeat enrichment writing to `.gsd-t/events/`, installer support in `bin/gsd-t.js`, and `gsd-t-init.md` directory creation. When complete, every Claude Code session in a GSD-T project automatically captures structured events.

## Tasks

### Task 1: Create `scripts/gsd-t-event-writer.js`
- **Files**: `scripts/gsd-t-event-writer.js` (new)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` — implements the full event schema, CLI usage, exit codes, and file rotation spec
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File exists at `scripts/gsd-t-event-writer.js`
  - Exports functions via `module.exports` (validateEvent, resolveEventsFile, appendEvent) AND supports CLI via `require.main === module` guard
  - CLI accepts: `--type`, `--command`, `--phase`, `--reasoning`, `--outcome`, `--agent-id`, `--parent-id`, `--trace-id` flags
  - Validates all 9 required fields; exits 1 if any required field is missing or `event_type` is not in the allowed list
  - Resolves events dir from `$GSD_T_PROJECT_DIR` env var first, then `process.cwd()`
  - Creates `.gsd-t/events/` directory if missing (does NOT fail if already exists)
  - Appends single-line JSON to `.gsd-t/events/YYYY-MM-DD.jsonl` (UTC date)
  - Does NOT follow symlinks (lstatSync check before write)
  - All functions ≤ 30 lines; total file ≤ 200 lines
  - Exit 0 on success, 1 on validation error, 2 on filesystem error

### Task 2: Enrich `scripts/gsd-t-heartbeat.js` to write to events/
- **Files**: `scripts/gsd-t-heartbeat.js` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` — maps heartbeat events to events/ schema
- **Dependencies**: Requires Task 1 (event writer module available for import — OR implement the append logic inline in heartbeat to stay zero-dep)
- **Acceptance criteria**:
  - Read the FULL existing `scripts/gsd-t-heartbeat.js` before modifying — understand all functions
  - Add `buildEventStreamEntry(hook)` function that maps heartbeat hook events to events/ schema:
    - `SubagentStart` → `{ event_type: 'subagent_spawn', agent_id: hook.agent_id, parent_agent_id: hook.parent_agent_id || hook.session_id, reasoning: hook.agent_type || null, outcome: null }`
    - `SubagentStop` → `{ event_type: 'subagent_complete', agent_id: hook.agent_id, parent_agent_id: hook.parent_agent_id || hook.session_id, outcome: null }`
    - `PostToolUse` → `{ event_type: 'tool_call', agent_id: hook.agent_id || null, reasoning: hook.tool_name, outcome: null }`
    - All other events: return null (do not write to events/)
  - Add `appendToEventsFile(dir, entry)` function: resolves events/ path, creates if missing, appends JSON line (symlink-safe, silent failure on error)
  - Call both functions in the main stdin.on('end') handler, AFTER the existing heartbeat write
  - EXISTING heartbeat-{sid}.jsonl writes are COMPLETELY UNCHANGED — enrichment is additive only
  - All new functions ≤ 30 lines each
  - All existing tests still pass (module.exports unchanged, no existing function signatures changed)

### Task 3: Update `bin/gsd-t.js` — add event-writer to installer
- **Files**: `bin/gsd-t.js` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` — event-writer.js must be installed to `~/.claude/scripts/`
- **Dependencies**: Requires Task 1 (gsd-t-event-writer.js must exist in scripts/ for installer to copy)
- **Acceptance criteria**:
  - Read the FULL `installUtilityScripts()` function and `UTILITY_SCRIPTS` constant before modifying
  - Add `"gsd-t-event-writer.js"` to the `UTILITY_SCRIPTS` array (simplest approach — no new function needed)
  - `npm test` still passes — all 127+ tests pass after modification
  - Running `node bin/gsd-t.js status` still exits 0 without error

### Task 4: Update `commands/gsd-t-init.md` — create events/ on project init
- **Files**: `commands/gsd-t-init.md` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (events/ location spec)
- **Dependencies**: NONE (independent of Tasks 1-3)
- **Acceptance criteria**:
  - Read the FULL `commands/gsd-t-init.md` before modifying — understand the current directory creation step
  - Add `.gsd-t/events/` to the directory structure shown in Step 3 (`.gsd-t/` structure block)
  - Add `.gsd-t/events/` to the directory creation instructions (alongside contracts/ and domains/)
  - Step numbering remains integer-only (no fractional steps)
  - Existing init behavior is unchanged — addition only

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): Tasks 1, 4
- Blocked tasks (waiting): Task 2 (after Task 1 schema is clear — can proceed in parallel since schema is in contract), Task 3 (after Task 1 file exists)
- Estimated checkpoints: 1 (Checkpoint 1 from integration-points.md — after Task 1 completes)
