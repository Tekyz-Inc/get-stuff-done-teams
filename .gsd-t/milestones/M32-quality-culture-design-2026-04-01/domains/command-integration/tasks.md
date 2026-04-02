# Domain: command-integration (M32) — Tasks

## Task 1: Wire quality persona injection into execute, quick, debug, integrate, wave
**Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-wave.md`
**Scope**: In each command's subagent spawn section, add quality persona injection. Read project CLAUDE.md for `## Quality North Star` section. If found, prepend it to the subagent prompt BEFORE stack rules and procedural checks. If section doesn't exist, skip silently. Max 5 lines added per command.
**Depends on**: quality-persona Task 1 (template must exist first)

## Task 2: Wire design brief injection into execute and quick for UI tasks
**Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`
**Scope**: In each command's subagent spawn section, add design brief injection for UI-related tasks. Check if `.gsd-t/contracts/design-brief.md` exists. If it does and the current task involves UI files (detected by file extensions: .tsx, .jsx, .vue, .svelte, .css, .scss), inject the design brief into the subagent prompt alongside contracts. Non-UI tasks skip it.
**Depends on**: design-brief Task 1 (partition must generate brief first)

## Task 3: Update documentation — templates, help, README
**Files**: `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`, `README.md`, `GSD-T-README.md`
**Scope**: Document Quality North Star, Design Brief, and Evaluator Interactivity in CLAUDE-global.md. Update feature sections in README and GSD-T-README. No new commands to add to help (these are injections into existing commands).
**Depends on**: Tasks 1-2
