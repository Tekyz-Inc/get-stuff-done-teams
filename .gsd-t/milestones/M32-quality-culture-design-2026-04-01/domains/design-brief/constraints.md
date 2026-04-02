# Constraints: design-brief

## Must Follow
- Design brief is only generated when UI/frontend domains are detected (React, Vue, Svelte, Flutter in stack; component files in scope; CSS/styling files present)
- Detection uses existing stack signals from package.json (react, vue, svelte), pubspec.yaml (flutter), and file extensions (.css, .scss, .jsx, .tsx, .svelte, .vue)
- Design brief is stored at `.gsd-t/contracts/design-brief.md` — no other location
- If no UI domains detected, the step is skipped entirely (zero overhead for non-UI projects)
- Design brief is derived from existing project signals in priority order:
  1. Existing Tailwind config (tailwind.config.js/ts) → extract color/spacing tokens
  2. Existing theme files (theme.ts, tokens.css, design-tokens.json) → extract design tokens
  3. Quality persona (if set) → use for tone/brand voice section
  4. Sensible defaults → if nothing found, generate a minimal brief with common web defaults
- Brief format must include: color palette, typography, spacing system, component patterns, layout principles, interaction patterns, tone/voice
- Command file edits follow existing GSD-T markdown step-numbered format
- Non-UI tasks skip design brief injection (only UI task descriptions reference it in plan)

## Must Not
- Modify files outside owned scope (execute, quick, integrate, debug, init)
- Create new npm dependencies
- Generate a design brief for non-UI projects
- Overwrite an existing `.gsd-t/contracts/design-brief.md` without checking if it exists first (preserve user-customized briefs)
- Store design tokens anywhere other than `.gsd-t/contracts/design-brief.md`

## Dependencies
- Depends on: quality-persona domain for tone/voice section (reads `## Quality North Star` from CLAUDE.md if present — optional dependency, graceful if absent)
- Depended on by: nothing in M32 (design brief injection into execute subagents is a future enhancement; M32 only creates the brief and references it in plan task descriptions)

## Must Read Before Using
- `commands/gsd-t-partition.md` — understand existing partition step flow before inserting design brief detection step
- `commands/gsd-t-plan.md` — understand existing plan step flow before inserting design brief reference note
- `commands/gsd-t-setup.md` — understand existing setup step flow before inserting design brief generation option
- `templates/CLAUDE-project.md` — understand if quality persona is available for tone derivation
