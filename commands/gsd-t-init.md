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

## Step 2: Copy Local Settings

1. **Ensure `~/.claude/settings.local` exists**:
   - If it does NOT exist, create it now with these default permissions:
     ```json
     {
       "permissions": {
         "allow": [
           "Edit",
           "Write",
           "Bash",
           "Read",
           "WebSearch",
           "WebFetch",
           "Skill"
         ]
       },
       "outputStyle": "default"
     }
     ```
     After creating it, log: "Created ~/.claude/settings.local with default permissions — update the allow list to match your security preferences."

2. **Copy to project**: If `.claude/settings.local.json` does NOT already exist in the project root:
   - Create the `.claude/` directory in the project root if it doesn't exist
   - Copy `~/.claude/settings.local` → `.claude/settings.local.json`

Skip the copy (step 2) silently if the target already exists.

## Step 3: Create Directory Structure

```
.gsd-t/
├── contracts/
│   └── .gitkeep
├── domains/
│   └── .gitkeep
├── backlog.md
├── backlog-settings.md
├── progress.md
├── token-log.md
└── qa-issues.md
```

Create `token-log.md` with header row:
```
| Date | Command | Step | Model | Duration(s) | Notes |
|------|---------|------|-------|-------------|-------|
```

Create `qa-issues.md` with header row:
```
| Date | Command | Step | Model | Duration(s) | Severity | Finding |
|------|---------|------|-------|-------------|----------|---------|
```

## Step 4: Initialize Backlog

Create the backlog files from templates:
1. Copy `templates/backlog.md` → `.gsd-t/backlog.md`
2. Copy `templates/backlog-settings.md` → `.gsd-t/backlog-settings.md`

### Category Derivation

Read the project's `CLAUDE.md` (if it exists) to auto-populate backlog settings:

1. **Apps**: Scan for app names, service names, or product names (look for headings, "Tech Stack" sections, or named components). Populate the `## Apps` section in `backlog-settings.md` with discovered names (lowercase).
2. **Categories**: Scan for domain concepts, module names, and technical areas (e.g., "authentication", "payments", "api", "database"). Populate the `## Categories` section.
3. **Default App**: Set `**Default App:**` to the most prominent app found (the one mentioned most, or the first one). If only one app is found, use it.
4. **If nothing found**: Leave the placeholder values from the template — the user can configure later via `/user:gsd-t-backlog-settings`.

## Step 5: Initialize Progress File

### Version Detection

Before creating the progress file, determine the starting version:

1. **Check for an existing version** in the project's manifest file (in this priority order):
   - `package.json` → `version` field
   - `pyproject.toml` → `[project] version` or `[tool.poetry] version`
   - `Cargo.toml` → `[package] version`
   - `setup.py` → `version=` argument
   - `build.gradle` / `build.gradle.kts` → `version = `
   - `.version` file → contents as-is
2. **If a version is found**: Use it as the starting GSD-T version (the project already has its own versioning history).
3. **If no version is found**: Use `0.1.00` — the standard GSD-T starting point for a brand-new project with no prior releases. The first `gsd-t-complete-milestone` will reset the patch to `0.1.10` (or bump minor/major per milestone scope).

Create `.gsd-t/progress.md`:

```markdown
# GSD-T Progress

## Project: {name from CLAUDE.md or $ARGUMENTS}
## Version: {detected version, or 0.1.00}
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

## Step 6: Ensure CLAUDE.md Exists

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

## Autonomy Level
**Level 3 — Full Auto** (only pause for blockers or completion)

## Branch Guard
**Expected branch**: {current branch from `git branch --show-current`}

## Conventions
- {Coding style, naming patterns — fill this in}

## Workflow Preferences
<!-- Override global defaults. Delete what you don't need to override. -->

## GSD-T Workflow
This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/
```

If `CLAUDE.md` exists but doesn't reference GSD-T, append the GSD-T section.

## Step 7: Create docs/ if Needed

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

## Step 8: Ensure README.md Exists

If no `README.md` exists, create one with:
- Project name and brief description
- Tech stack summary
- Getting started / setup instructions (from existing configs or placeholder)
- Link to `docs/` for detailed documentation

If `README.md` exists, leave it as-is — don't overwrite user content during init.

## Step 9: Map Existing Codebase (if code exists)

If there's existing source code:
1. Scan the codebase structure
2. Identify natural domain boundaries based on file organization
3. Note existing patterns and conventions
4. Add findings to CLAUDE.md
5. Log in progress.md: "Existing codebase analyzed — {summary}"

## Step 10: Document Ripple

After initialization, verify all created documentation is consistent:

### Always update:
1. **`.gsd-t/progress.md`** — Already created in Step 3, verify it's complete
2. **`CLAUDE.md`** — Already handled in Step 4, verify GSD-T section is present and references all docs

### Check if affected:
3. **`docs/requirements.md`** — If existing code was scanned (Step 7), verify requirements doc reflects discovered functionality
4. **`docs/architecture.md`** — If existing code was scanned, verify architecture doc reflects the actual system structure
5. **`README.md`** — Already handled in Step 6, verify it links to docs/ and reflects project state

### Skip what's not affected — init creates docs, so most ripple is about consistency verification.

## Step 11: Playwright Setup (MANDATORY)

Every GSD-T project must have Playwright ready for E2E testing. If `playwright.config.*` does not exist:

1. **Detect package manager**: Check for `bun.lockb` (bun), `yarn.lock` (yarn), `pnpm-lock.yaml` (pnpm), `package-lock.json` or `package.json` (npm), `requirements.txt`/`pyproject.toml` (Python)
2. **Install Playwright**:
   - bun: `bun add -d @playwright/test && bunx playwright install chromium`
   - npm: `npm install -D @playwright/test && npx playwright install chromium`
   - yarn: `yarn add -D @playwright/test && yarn playwright install chromium`
   - pnpm: `pnpm add -D @playwright/test && pnpm exec playwright install chromium`
   - Python: `pip install playwright && playwright install chromium`
   - No package manager detected: `npm init -y && npm install -D @playwright/test && npx playwright install chromium`
3. **Create `playwright.config.ts`** (or `.js` if not using TypeScript) with sensible defaults:
   - `testDir: './e2e'` (or `./tests/e2e`)
   - `use: { baseURL: 'http://localhost:3000' }` (adjust based on project)
   - Chromium only (keep it fast; user can add more browsers later)
   - Screenshot on failure enabled
4. **Create the E2E test directory** (`e2e/` or `tests/e2e/`) with a placeholder spec
5. **Add test script** to `package.json` if it exists: `"test:e2e": "playwright test"`

Skip silently if `playwright.config.*` already exists.

## Step 12: Test Verification

After initialization:

1. **If existing code with tests**: Run the full test suite to establish a baseline. Document results in `.gsd-t/progress.md`
2. **If existing code without tests**: Playwright is now set up (Step 7.6) — note unit test framework should be added as part of the first milestone
3. **If greenfield**: Playwright is ready. Note that unit test infrastructure should be added in Milestone 1
4. **Verify init outputs**: Confirm all created files exist and are non-empty

## Step 13: Report

Tell the user:
1. What was created (including backlog files: `.gsd-t/backlog.md` and `.gsd-t/backlog-settings.md`)
2. What they should fill in (CLAUDE.md details, requirements)
3. Backlog settings status: whether apps/categories were auto-derived from CLAUDE.md or need manual configuration via `/user:gsd-t-backlog-settings`
4. Recommended next step:
   - New project: "Define your milestone, then run /user:gsd-t-partition"
   - Existing code: "I've mapped the codebase. Ready for /user:gsd-t-partition {milestone}"

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
