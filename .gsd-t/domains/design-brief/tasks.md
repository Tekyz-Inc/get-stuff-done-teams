# Domain: design-brief — Tasks

## Task 1: Add design brief detection and generation to partition, plan, and setup commands
**Files**: `commands/gsd-t-partition.md`, `commands/gsd-t-plan.md`, `commands/gsd-t-setup.md`
**Scope**:
1. In gsd-t-partition.md, add a step that detects UI-heavy domains (React/Vue/Svelte/Flutter in stack, component files in scope, CSS/styling files). If detected, generate `.gsd-t/contracts/design-brief.md` with: color palette, typography, spacing system, component patterns, layout principles, interaction patterns, tone.
2. In gsd-t-plan.md, add a note that UI task descriptions should reference the design brief.
3. In gsd-t-setup.md, add design brief generation option for existing projects.
**Contract**: Design brief is stored at `.gsd-t/contracts/design-brief.md`. If file doesn't exist, injection skips silently.
