# {Project Name}

## Overview
{Brief project description — what problem does this solve and for whom?}

## Autonomy Level
**Level 3 — Full Auto** (only pause for blockers or completion)
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

## Daily Token Budget (optional)
<!-- Set a session token ceiling for token-aware orchestration (bin/token-budget.js). -->
<!-- When the session approaches this ceiling, model assignments are downgraded and -->
<!-- non-essential operations are skipped to stay within budget. -->
<!-- Example: 1500000 (1.5M tokens) — omit this field to disable token-aware orchestration. -->
<!-- **Daily token budget**: {ceiling in tokens} -->

## Context Meter (M34)
<!-- The Context Meter is a PostToolUse hook that streams the current transcript -->
<!-- to Anthropic count_tokens and writes the real context % to -->
<!-- .gsd-t/.context-meter-state.json. bin/token-budget.js reads that file as the -->
<!-- authoritative session-stop signal — replacing the v2.74.12 task-counter proxy. -->
<!-- Requires ANTHROPIC_API_KEY in the shell environment. -->
<!-- Threshold bands (lower-bound inclusive): normal<60, warn≥60, downgrade≥70, conserve≥85, stop≥95. -->
<!-- Config: .gsd-t/context-meter-config.json — apiKeyEnvVar, modelWindowSize, thresholdPct, checkFrequency. -->
<!-- Verify: `npx @tekyzinc/gsd-t doctor` hard-gates on API key + hook + live count_tokens dry-run. -->
<!-- Historical: v2.74.12 used bin/task-counter.cjs (proxy); v2.74.11 and earlier used CLAUDE_CONTEXT_TOKENS_* env vars (never worked). Both retired in v2.75.10. -->

<!-- For multi-branch parallel work (e.g., web + mobile in separate terminals), -->
<!-- each terminal's CLAUDE.md should declare its own expected branch. -->
<!-- Example: Web terminal → master, Mobile terminal → Mobile -->

## Quality North Star

<!-- Define the quality identity of this project. Subagents read this section and apply it as a quality lens. -->
<!-- Choose one of the presets below or write your own 1–3 sentence persona, then remove the others. -->

<!-- PRESET: library (npm package, SDK, shared utility) -->
<!-- This is a published npm library. Every public API must be intuitive, well-documented, and backward-compatible. Type safety and zero-dependency design are non-negotiable. -->

<!-- PRESET: web-app (user-facing web application) -->
<!-- This is a user-facing web application. Every feature must be accessible, performant, and visually consistent. The user experience is the product. -->

<!-- PRESET: cli (developer CLI or command-line utility) -->
<!-- This is a developer CLI tool. Every command must be fast, predictable, and produce clear output. Error messages must explain what went wrong and how to fix it. -->

<!-- CUSTOM: replace this line with your own 1–3 sentence quality persona -->
{Quality persona — describe what "excellent" means for this project}

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
