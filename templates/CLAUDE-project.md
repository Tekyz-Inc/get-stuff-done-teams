# {Project Name}

## Overview
{Brief project description — what problem does this solve and for whom?}

## Autonomy Level
**Level 2 — Standard** (pause at milestones)
<!-- Options: Level 1 (Supervised), Level 2 (Standard), Level 3 (Full Auto) -->

## Tech Stack
- **Language**: {e.g., Python 3.12}
- **Framework**: {e.g., FastAPI}
- **Database**: {e.g., PostgreSQL with SQLAlchemy async}
- **Frontend**: {e.g., Jinja2 templates, React, etc.}
- **Testing**: {e.g., Playwright}
- **Deployment**: {e.g., Google Cloud Run}

## Documentation
- Requirements: docs/requirements.md
- Architecture: docs/architecture.md
- Workflows: docs/workflows.md
- Infrastructure: docs/infrastructure.md

## Branch Guard
<!-- Declare which branch this terminal session should work on. -->
<!-- Claude will verify the branch before every commit. -->
**Expected branch**: {main | master | feature-branch-name}

<!-- For multi-branch parallel work (e.g., web + mobile in separate terminals), -->
<!-- each terminal's CLAUDE.md should declare its own expected branch. -->
<!-- Example: Web terminal → master, Mobile terminal → Mobile -->

## GSD-T Workflow
This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/

## Workflow Preferences
<!-- Override global defaults from ~/.claude/CLAUDE.md -->
<!-- Delete lines you don't need to override — globals apply automatically -->

### Research Policy
<!-- Example overrides: -->
<!-- "Always research — this project uses cutting-edge APIs" -->
<!-- "Skip research — well-understood CRUD app" -->

### Phase Flow
<!-- Example overrides: -->
<!-- "ALWAYS run Discussion — architecture decisions are critical" -->
<!-- "Skip discuss unless truly required" -->

## Project-Specific Conventions
<!-- Add conventions that override or extend the global CLAUDE.md -->

## Don't Do These Things
<!-- Add project-specific "never do" rules -->
- NEVER skip type hints to save time.
- NEVER mark a feature complete without tests.

## Current Status
See `.gsd-t/progress.md` for current milestone/phase state.

## Deployed URLs
- **Production**: {url}
- **Staging**: {url}
- **Local**: http://localhost:{port}
