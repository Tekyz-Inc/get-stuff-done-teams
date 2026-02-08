# GSD-T: Init — Initialize Project

You are setting up a new project (or converting an existing one) to use the GSD-T contract-driven workflow.

## Step 1: Assess Current State

Check what exists:
- `CLAUDE.md` — project instructions?
- `.gsd-t/` — already initialized?
- `.gsd/` — legacy GSD structure?
- `docs/` — existing documentation?
- `src/` — existing code?

### If `.gsd-t/` already exists:
Report current state and ask if user wants to reset or continue.

### If `.gsd/` exists (legacy GSD):
Offer to migrate: "Found legacy GSD structure. Want me to migrate to GSD-T?"
If yes, read `.gsd/` state and create equivalent `.gsd-t/` structure.

## Step 2: Create Directory Structure

```
.gsd-t/
├── contracts/
│   └── .gitkeep
├── domains/
│   └── .gitkeep
└── progress.md
```

## Step 3: Initialize Progress File

Create `.gsd-t/progress.md`:

```markdown
# GSD-T Progress

## Project: {name from CLAUDE.md or $ARGUMENTS}
## Version: 0.1.0
## Status: INITIALIZED
## Date: {today}

## Milestones
| # | Milestone | Status | Domains |
|---|-----------|--------|---------|
| 1 | {TBD} | not started | TBD |

## Domains
(populated during partition phase)

## Contracts
(populated during partition phase)

## Integration Checkpoints
(populated during plan phase)

## Decision Log
- {date}: Project initialized with GSD-T workflow
```

## Step 4: Ensure CLAUDE.md Exists

If no `CLAUDE.md`:
Create a starter template:

```markdown
# {Project Name}

## Overview
{Brief project description — fill this in}

## Tech Stack
{Languages, frameworks, services — fill this in}

## Documentation
- Requirements: docs/requirements.md
- Architecture: docs/architecture.md
- Workflows: docs/workflows.md
- Infrastructure: docs/infrastructure.md

## Branch Guard
**Expected branch**: {current branch from `git branch --show-current`}

## Conventions
- {Coding style, naming patterns — fill this in}

## GSD-T Workflow
This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/
```

If `CLAUDE.md` exists but doesn't reference GSD-T, append the GSD-T section.

## Step 5: Create docs/ if Needed

If no `docs/` directory, create it with all 4 living document templates.
For each file, skip if it already exists:

```
docs/
├── requirements.md    — Functional, technical, and non-functional requirements
├── architecture.md    — System design, components, data flow, design decisions
├── workflows.md       — User journeys, technical processes, API flows
└── infrastructure.md  — Dev setup, DB commands, cloud provisioning, deployment, credentials
```

These are the living documents that persist across milestones and keep institutional knowledge alive. The `infrastructure.md` is especially important — it captures the exact commands for provisioning cloud resources, setting up databases, managing secrets, and deploying, so this knowledge doesn't get lost between sessions.

## Step 6: Ensure README.md Exists

If no `README.md` exists, create one with:
- Project name and brief description
- Tech stack summary
- Getting started / setup instructions (from existing configs or placeholder)
- Link to `docs/` for detailed documentation

If `README.md` exists, leave it as-is — don't overwrite user content during init.

## Step 7: Map Existing Codebase (if code exists)

If there's existing source code:
1. Scan the codebase structure
2. Identify natural domain boundaries based on file organization
3. Note existing patterns and conventions
4. Add findings to CLAUDE.md
5. Log in progress.md: "Existing codebase analyzed — {summary}"

## Step 8: Report

Tell the user:
1. What was created
2. What they should fill in (CLAUDE.md details, requirements)
3. Recommended next step:
   - New project: "Define your milestone, then run /user:gsd-t-partition"
   - Existing code: "I've mapped the codebase. Ready for /user:gsd-t-partition {milestone}"

$ARGUMENTS
