# Domain: event-stream

## Responsibility
Define and implement the JSONL event schema. Create the zero-dependency `gsd-t-event-writer.js`
helper CLI. Update `bin/gsd-t.js` to install the new script. Update `gsd-t-init.md` to create the
`events/` directory on project init. Enrich `gsd-t-heartbeat.js` to write enriched events to
`.gsd-t/events/YYYY-MM-DD.jsonl` in addition to the existing heartbeat JSONL.

## Owned Files/Directories
- `scripts/gsd-t-event-writer.js` — new file: zero-dep CLI for structured JSONL event appends
- `scripts/gsd-t-heartbeat.js` — enrichment: write to events/ on SubagentStart/Stop/PostToolUse
- `bin/gsd-t.js` — addition: `installEventWriter()` function + call from `doInstall()/doUpdate()`
- `commands/gsd-t-init.md` — addition: create `.gsd-t/events/` directory during project init

## NOT Owned (do not modify)
- `commands/gsd-t-execute.md` — learning-loop domain
- `commands/gsd-t-debug.md` — learning-loop domain
- `commands/gsd-t-wave.md` — learning-loop domain
- `commands/gsd-t-complete-milestone.md` — reflect domain
- `commands/gsd-t-reflect.md` — reflect domain (new file)
