# Constraints: m38-router-conversational

## Must Follow

- **Read `commands/gsd.md` IN FULL before editing.** It's the entry point for `[GSD-T AUTO-ROUTE]` plain-text routing — every plain message in a GSD-T project flows through it. A bug here breaks the whole user experience.
- **Preserve the existing format guarantees** in Step 3:
  - Continuation format: `→ /gsd ──▶ continue /user:gsd-t-{last-command}`
  - New request format: `→ Routing to /user:gsd-t-{command}: {brief reason}`
  - Conversational format: `→ Conversational mode (no command spawn)` (NEW)
- **Conversational mode does NOT spawn anything.** No Task subagent, no headless spawn, no nothing. The router itself responds.
- **Default to conversational when ambiguous** — explicit user feedback in the M38 scoping conversation. Better to under-route than over-route.
- **Delete the 3 commands cleanly**:
  - Remove the `.md` files
  - Remove from `commands/gsd-t-help.md`
  - Update `test/filesystem.test.js` command count (currently 56-61 depending on M37 state; subtract 3)
- The 3 deleted commands' use cases (idea formulation, creative exploration, multi-perspective design) are now served by the router's conversational mode. Document this transition in the router's intent classifier section.

## Must Not

- Modify any other command file (Domain 1 owns spawn pattern across the rest)
- Modify the headless spawn primitive (Domain 1)
- Modify the meter (Domain 2)
- Modify the event stream (Domain 3)
- Add a new flag to `commands/gsd.md` — keep the public surface stable
- Touch `commands/gsd-t-help.md` for non-Domain-4 entries (coordinate with Domain 5)

## Dependencies

- **Depends on**: nothing inside M38. Wave 2 parallel-safe.
- **Depended on by**:
  - Domain 5 (m38-cleanup-and-docs) — README / GSD-T-README / CLAUDE-global.md command tables drop the 3 deleted commands; help.md entries removed.

## Must Read Before Using

- `commands/gsd.md` — full file. Owns: continuation check, semantic evaluation, scope disambiguation, design pipeline routing, output format.
- `commands/gsd-t-prompt.md` — read before deleting; understand what use case it served
- `commands/gsd-t-brainstorm.md` — read before deleting
- `commands/gsd-t-discuss.md` — read before deleting
- `commands/gsd-t-help.md` — current command list and command-detail sections; identify the 3 entries to remove
- `test/filesystem.test.js` — current command count assertions
