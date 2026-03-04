# Constraints: learning-loop

## Must Follow
- Read each command file completely before modifying — understand the current step numbering
- Add new steps with integer numbers only — no fractional steps (e.g., if last step is 3, new step is 4 not 3.5)
- Outcome tagging applies to NEW entries written during execution only — do NOT retroactively tag existing Decision Log entries
- Experience retrieval is grep-based keyword matching (domain name + task subject) — NOT LLM/semantic matching
- The retrieval warning must be concise (≤ 5 lines) and appear as a clearly delimited block in the subagent prompt
- Phase transition events: write via `node ~/.claude/scripts/gsd-t-event-writer.js` (or inline Bash if event-writer not yet installed)
- Every change to a command file must maintain all existing behavior — additions only, no removals or rewrites

## Must Not
- Modify any script file (scripts/*.js) — event-stream domain owns those
- Modify `gsd-t-complete-milestone.md` — reflect domain owns it
- Make experience retrieval block execution (if grep returns nothing, proceed normally)
- Add new npm dependencies
- Create new files outside commands/

## Must Read Before Using
- `commands/gsd-t-execute.md` — full file — understand current step structure before adding steps
- `commands/gsd-t-debug.md` — full file — understand current step structure before adding steps
- `commands/gsd-t-wave.md` — full file — identify the exact phase handoff points to add transition events
- `.gsd-t/contracts/event-schema-contract.md` — required event fields for phase_transition and outcome_tagged events

## External Reference Dispositions
- Reflexion pattern: INSPECT only — implementing retrieve-before-act concept via grep
- Experience retrieval: grep command matching on domain name in `[failure]` and `[learning]` lines from `.gsd-t/progress.md` Decision Log

## Dependencies
- Depends on: event-stream for `gsd-t-event-writer.js` script and `event-schema-contract.md`
  - Integration checkpoint: event-stream Task 1 (schema contract) must complete before learning-loop starts
  - learning-loop can reference the event-writer CLI path knowing it will be installed to `~/.claude/scripts/`
- Depended on by: reflect for having [failure]/[learning] tagged data in the Decision Log
