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

## Context Meter (M34/M38, v3.12.10+)
<!-- The Context Meter is a PostToolUse hook that uses local token estimation -->
<!-- and writes the current context % to .gsd-t/.context-meter-state.json. -->
<!-- bin/token-budget.cjs reads that file as the spawn-time routing signal. -->
<!-- Single-band model (context-meter-contract v1.3.0): one threshold (default 85%), -->
<!-- one action — hand off to a detached headless spawn via the unattended supervisor. -->
<!-- No three-band routing, no silent model downgrades. The meter informs spawn-time -->
<!-- decisions, not in-flight pauses. -->
<!-- Config: .gsd-t/context-meter-config.json — modelWindowSize, thresholdPct, checkFrequency. -->
<!-- Verify: `npx @tekyzinc/gsd-t doctor`. -->

## Headless-by-Default Spawn (M38, v3.12.10+)
<!-- Long-running workflow commands (execute, wave, integrate, debug repair loops) -->
<!-- route through the unattended supervisor from the start. Interactive session -->
<!-- invokes, sees a launch banner and event-stream log location, and exits. -->
<!-- Pass --watch to keep a live status block in the session (270s ScheduleWakeup ticks). -->
<!-- Event stream: .gsd-t/events/YYYY-MM-DD.jsonl (JSONL, phase boundaries). -->
<!-- Contracts: headless-default-contract.md v1.0.0, unattended-event-stream-contract.md v1.0.0, -->
<!-- unattended-supervisor-contract.md v1.1.0. -->

## Model Selection
<!-- Model choice is made surgically per-phase via bin/model-selector.js (model-selection-contract.md v1.0.0): -->
<!--   - haiku  — mechanical: test runners, file-existence checks, JSON validation, branch guards -->
<!--   - sonnet — routine: execute, test-sync, doc-ripple wiring, quick, integrate, debug fix-apply -->
<!--   - opus   — high-stakes: partition, Red Team, verify judgment, debug root-cause, contracts -->

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
