# Domain: m38-router-conversational

## Responsibility

Add an **intent classifier** to the Smart Router (`commands/gsd.md`) that distinguishes workflow intent from conversational intent. Delete the standalone conversational commands (`gsd-t-prompt`, `gsd-t-brainstorm`, `gsd-t-discuss`) — the router now handles their use cases inline.

## Owned Files/Directories

- `commands/gsd.md` — add intent classifier section (Step 2.5 between continuation check and semantic evaluation)
- `commands/gsd-t-prompt.md` — DELETE
- `commands/gsd-t-brainstorm.md` — DELETE
- `commands/gsd-t-discuss.md` — DELETE
- `commands/gsd-t-help.md` — REMOVE entries for the 3 deleted commands; ADD documentation for the new conversational mode in the router (Domain 5 also touches help.md for other deletions; coordinate)
- Test files: extend `test/filesystem.test.js` (command count drops by 3); add `test/router-intent.test.js` for classifier behavior; existing `test/command-files-stop-message-audit.test.js` should still pass

## Intent Classifier Design

Three categories, evaluated in this order:

1. **Continuation** (existing Step 2a) — already implemented; not changed
2. **Workflow intent** — request matches a GSD-T command (existing semantic evaluation in Step 2)
3. **Conversational intent** — request is exploration, ideation, brainstorming, design discussion, or a question. No command matches. Router responds directly without spawning a subagent.

**Default when ambiguous**: conversational. Router responds, user can re-invoke with explicit slash command if they wanted workflow.

**Trigger phrases for conversational**:
- "what do you think about…"
- "let's brainstorm…"
- "I'm exploring…"
- "help me think through…"
- Open-ended questions ending with "?"
- Anything that previously routed to gsd-t-prompt / gsd-t-brainstorm / gsd-t-discuss

Router output format for conversational:
```
→ Conversational mode (no command spawn)
{conversational response}
```

## NOT Owned (do not modify)

- All headless / spawn / meter / event-stream files (Domains 1, 2, 3)
- All other command files (`gsd-t-execute.md`, `wave.md`, `quick.md`, etc.) — Domain 1 owns spawn pattern edits
- Self-improvement command deletions (Domain 5)
- Templates, README, GSD-T-README, CHANGELOG (Domain 5)
- `commands/gsd-t-help.md` SECTIONS for non-Domain-4 deletions (coordinate; Domain 4 only edits the prompt/brainstorm/discuss entries)
