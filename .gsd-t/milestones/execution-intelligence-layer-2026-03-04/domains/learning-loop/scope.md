# Domain: learning-loop

## Responsibility
Implement the Reflexion-pattern learning loop in the command files that execute tasks.
This includes:
1. Outcome tagging — all Decision Log entries written by execute, debug, and wave now use
   `[success]`/`[failure]`/`[learning]`/`[deferred]` prefixes
2. Pre-task experience retrieval — execute and debug grep Decision Log for `[failure]`/`[learning]`
   entries matching the current domain/task before spawning subagents; inject relevant past failures
   as a warning block into the subagent prompt
3. Phase transition events — wave writes a `phase_transition` event to `.gsd-t/events/` at every
   phase handoff, capturing the rationale for advancing or retrying

## Owned Files/Directories
- `commands/gsd-t-execute.md` — add outcome tagging + pre-task retrieval step
- `commands/gsd-t-debug.md` — add outcome tagging + pre-task retrieval step
- `commands/gsd-t-wave.md` — add phase transition event writes at each phase handoff

## NOT Owned (do not modify)
- `scripts/gsd-t-event-writer.js` — event-stream domain
- `scripts/gsd-t-heartbeat.js` — event-stream domain
- `bin/gsd-t.js` — event-stream domain
- `commands/gsd-t-complete-milestone.md` — reflect domain
- `commands/gsd-t-reflect.md` — reflect domain
