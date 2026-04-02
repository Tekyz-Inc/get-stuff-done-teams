# Constraints: quality-persona

## Must Follow
- Persona is 1-3 sentences max — concise quality identity, not a wall of text
- Persona is prepended before procedural checks in subagent prompts
- Projects without a `## Quality North Star` section skip injection silently (backward compatible)
- Three preset personas must be offered: library/package, web application, CLI tool
- Custom option allows user-written persona
- Command file edits follow existing GSD-T markdown step-numbered format
- No new JS modules — this is a prompt engineering feature via command file edits only

## Must Not
- Modify files outside owned scope (execute, quick, integrate, debug, partition, plan)
- Create new npm dependencies
- Break backward compatibility for projects already initialized without a persona
- Store persona anywhere other than project CLAUDE.md under `## Quality North Star`
- Inject into the global ~/.claude/CLAUDE.md (project-level only)

## Dependencies
- Depends on: nothing (this domain is independent)
- Depended on by: nothing in M32 (persona injection at subagent spawn time is already described in progress.md; M32 just adds the template section and init/setup steps)

## Must Read Before Using
- `templates/CLAUDE-project.md` — understand existing template structure before adding new section
- `commands/gsd-t-init.md` — understand existing init step flow before inserting persona selection step
- `commands/gsd-t-setup.md` — understand existing setup step flow before inserting persona config option
