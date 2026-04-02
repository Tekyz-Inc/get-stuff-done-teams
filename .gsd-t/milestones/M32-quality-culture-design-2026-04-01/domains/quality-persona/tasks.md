# Tasks: quality-persona

## Summary
Adds the Quality North Star persona system to the GSD-T framework: a `## Quality North Star` section in the CLAUDE-project template with preset options, a detection/selection step in gsd-t-init, and a persona configuration option in gsd-t-setup. When complete, every new or existing project can adopt a quality identity that is prepended to all subagent prompts at execute time.

## Tasks

### Task 1: Add Quality North Star section to CLAUDE-project template and init/setup commands
- **Files**:
  - `templates/CLAUDE-project.md` — add `## Quality North Star` section with placeholder text and 3 preset examples (library, web-app, CLI tool) plus custom option
  - `commands/gsd-t-init.md` — add persona detection/selection step: auto-detect project type from package.json (`bin` → cli, `react`/`next`/`vue` in deps → web-app, `main` + no `scripts.dev` → library), prompt user if no signal, write selected preset to CLAUDE.md
  - `commands/gsd-t-setup.md` — add persona configuration option: ask user if they want to set or update a Quality North Star; present 3 presets + custom; write to project CLAUDE.md under `## Quality North Star`
- **Contract refs**: `quality-persona-contract.md` — storage location (project CLAUDE.md `## Quality North Star`), preset IDs (library/web-app/cli/custom), injection protocol (skip silently if section absent), backward compatibility rule
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `templates/CLAUDE-project.md` contains a `## Quality North Star` section with placeholder text and all 3 preset examples shown as comments or options
  - `commands/gsd-t-init.md` contains a step that reads `package.json` to detect project type and selects a persona preset, or offers choice to user
  - `commands/gsd-t-setup.md` contains a persona config option that writes to project CLAUDE.md
  - If `## Quality North Star` section is absent from a project CLAUDE.md, injection must skip silently (no error path introduced)
  - All edits follow the existing GSD-T step-numbered markdown format; no new JS modules created
  - No files outside owned scope are modified (execute/quick/integrate/debug/partition/plan remain untouched)

## Execution Estimate
- Total tasks: 1
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0 (single-task domain, completes when Task 1 criteria pass)
