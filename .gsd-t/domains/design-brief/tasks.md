# Tasks: design-brief

## Summary
Adds design brief detection and generation to the GSD-T partition and setup phases. When UI/frontend signals are detected (React, Vue, Svelte, Flutter, CSS/SCSS files, or Tailwind config), gsd-t-partition generates a `.gsd-t/contracts/design-brief.md` artifact with color palette, typography, spacing, component patterns, layout principles, interaction patterns, and tone/voice. gsd-t-plan references the brief for UI task descriptions. gsd-t-setup provides an option to generate the brief for existing projects.

## Tasks

### Task 1: Add design brief detection and generation to partition, plan, and setup commands
- **Files**:
  - `commands/gsd-t-partition.md` — add a detection step after domain identification: scan for UI signals (react/vue/svelte/next in package.json deps, pubspec.yaml exists, .css/.scss/.jsx/.tsx/.svelte/.vue files in scope, tailwind.config.js/ts exists); if detected, generate `.gsd-t/contracts/design-brief.md` using the format defined in design-brief-contract.md; source priority: Tailwind config → theme files → Quality North Star for tone → sensible defaults; skip entirely if no UI signals; do NOT overwrite if file already exists
  - `commands/gsd-t-plan.md` — add a note in the Task Design Rules section (Step 2) instructing that UI task descriptions should reference `.gsd-t/contracts/design-brief.md` if it exists (one-line note, no new step required)
  - `commands/gsd-t-setup.md` — add design brief generation option: ask if project has UI/frontend domains; if yes, run UI detection logic and generate brief; skip if `.gsd-t/contracts/design-brief.md` already exists (preserve user-customized briefs)
- **Contract refs**:
  - `design-brief-contract.md` — trigger conditions, storage location, file format, source priority, preservation rule, non-UI skip behavior
  - `quality-persona-contract.md` — read-only: `## Quality North Star` from CLAUDE.md is used for the Tone & Voice section of the brief (optional, graceful if absent)
- **Dependencies**: NONE (quality-persona is an optional soft dependency; brief generation proceeds without persona)
- **Acceptance criteria**:
  - `commands/gsd-t-partition.md` contains a UI detection step that checks for React/Vue/Svelte/Flutter signals and CSS/component files
  - When UI signals present, the step generates `.gsd-t/contracts/design-brief.md` using the contract format (color palette, typography, spacing, component patterns, layout, interaction, tone)
  - When no UI signals, the step is skipped entirely (no artifact created, no visible step)
  - If `.gsd-t/contracts/design-brief.md` already exists, it is NOT overwritten (silent skip)
  - `commands/gsd-t-plan.md` contains a note directing agents to reference design-brief.md for UI task descriptions
  - `commands/gsd-t-setup.md` contains a design brief generation option for existing projects
  - All edits follow the existing GSD-T step-numbered markdown format; no new JS modules created
  - No files outside owned scope are modified (execute/quick/integrate/debug/init/templates remain untouched)

## Execution Estimate
- Total tasks: 1
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0 (single-task domain, completes when Task 1 criteria pass)
