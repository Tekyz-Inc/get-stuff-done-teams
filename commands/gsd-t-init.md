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
├── backlog.md
├── backlog-settings.md
└── progress.md
```

## Step 2.5: Initialize Backlog

Create the backlog files from templates:
1. Copy `templates/backlog.md` → `.gsd-t/backlog.md`
2. Copy `templates/backlog-settings.md` → `.gsd-t/backlog-settings.md`

### Category Derivation

Read the project's `CLAUDE.md` (if it exists) to auto-populate backlog settings:

1. **Apps**: Scan for app names, service names, or product names (look for headings, "Tech Stack" sections, or named components). Populate the `## Apps` section in `backlog-settings.md` with discovered names (lowercase).
2. **Categories**: Scan for domain concepts, module names, and technical areas (e.g., "authentication", "payments", "api", "database"). Populate the `## Categories` section.
3. **Default App**: Set `**Default App:**` to the most prominent app found (the one mentioned most, or the first one). If only one app is found, use it.
4. **If nothing found**: Leave the placeholder values from the template — the user can configure later via `/user:gsd-t-backlog-settings`.

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

## Step 7.5: Document Ripple

After initialization, verify all created documentation is consistent:

### Always update:
1. **`.gsd-t/progress.md`** — Already created in Step 3, verify it's complete
2. **`CLAUDE.md`** — Already handled in Step 4, verify GSD-T section is present and references all docs

### Check if affected:
3. **`docs/requirements.md`** — If existing code was scanned (Step 7), verify requirements doc reflects discovered functionality
4. **`docs/architecture.md`** — If existing code was scanned, verify architecture doc reflects the actual system structure
5. **`README.md`** — Already handled in Step 6, verify it links to docs/ and reflects project state

### Skip what's not affected — init creates docs, so most ripple is about consistency verification.

## Step 7.6: Test Verification

After initialization:

1. **If existing code with tests**: Run the full test suite to establish a baseline. Document results in `.gsd-t/progress.md`
2. **If existing code without tests**: Note the absence — recommend test setup as part of the first milestone
3. **If greenfield**: No tests to run, but note that test infrastructure should be in Milestone 1
4. **Verify init outputs**: Confirm all created files exist and are non-empty

## Step 8: Report

Tell the user:
1. What was created (including backlog files: `.gsd-t/backlog.md` and `.gsd-t/backlog-settings.md`)
2. What they should fill in (CLAUDE.md details, requirements)
3. Backlog settings status: whether apps/categories were auto-derived from CLAUDE.md or need manual configuration via `/user:gsd-t-backlog-settings`
4. Recommended next step:
   - New project: "Define your milestone, then run /user:gsd-t-partition"
   - Existing code: "I've mapped the codebase. Ready for /user:gsd-t-partition {milestone}"

$ARGUMENTS
