# Milestone Complete: M32 — Quality Culture & Design

**Completed**: 2026-04-01
**Duration**: 2026-04-01 → 2026-04-01
**Status**: VERIFIED
**Version**: 2.52.11 → 2.53.10

## What Was Built

Three quality culture and design enhancements for the GSD-T framework:

1. **Quality North Star Persona System (REQ-060)** — Every new or existing GSD-T project can now define a `## Quality North Star` section in its CLAUDE.md (1-3 sentences) that gives subagents a quality lens at execute time. Three presets: library, web-app, cli. Auto-detected from package.json signals at init time. Configurable via setup for existing projects. Silent skip when absent (backward compatible).

2. **Design Brief Artifact (REQ-061)** — During the partition phase, UI/frontend projects automatically get a `.gsd-t/contracts/design-brief.md` with color palette, typography, spacing system, component patterns, layout principles, interaction patterns, and tone/voice. Triggered by React/Vue/Svelte/Flutter/CSS/Tailwind signals. Non-UI projects skip silently. Existing briefs are preserved (user-authoritative). Integrated into plan and setup as well.

3. **Exploratory Testing Blocks (REQ-062)** — After scripted tests pass, if Playwright MCP is registered in Claude Code settings, QA agents get 3 minutes and Red Team gets 5 minutes of interactive exploration. All findings tagged `[EXPLORATORY]` and fed into M31 QA calibration as a separate category. Silent skip when Playwright MCP absent. Wired into execute, quick, integrate, and debug.

## Domains

| Domain                  | Tasks Completed | Key Deliverables                                                              |
|-------------------------|-----------------|-------------------------------------------------------------------------------|
| quality-persona         | 1               | CLAUDE-project template section, gsd-t-init Step 6.5, gsd-t-setup Step 5.5   |
| design-brief            | 1               | gsd-t-partition Step 3.5, gsd-t-plan Task Design Rule 0, gsd-t-setup Step 5.6 |
| evaluator-interactivity | 1               | Exploratory blocks in execute, quick, integrate, debug (QA + Red Team)        |

## Contracts Defined/Updated

- `quality-persona-contract.md` — new (storage format, preset IDs, injection protocol, backward compat)
- `design-brief-contract.md` — new (trigger conditions, file format, source priority, preservation rule)
- `exploratory-testing-contract.md` — new (Playwright MCP activation, time budgets, finding format, prompt block template)

## Key Decisions

- Quality North Star injection is contract-driven via CLAUDE.md reading, not via new JS code — no execute/quick/integrate/debug modification needed for the persona itself
- Design brief generation scoped to partition phase only; gsd-t-execute inject is deferred to post-M32 per contract
- Exploratory blocks are additive (scripted tests must pass first) — never a substitute for scripted tests
- QA blocks: 3-minute budget; Red Team blocks: 5-minute budget — matches contract spec exactly
- All M32 changes are markdown-only; no new JS modules, no new npm dependencies

## Issues Encountered

None. All 3 domains completed in Wave 1 with 0 fix cycles. All acceptance criteria met on first pass.

## Test Coverage

- Tests added: 0 (M32 changes are markdown command files — no JS to unit-test)
- Tests updated: 0
- Pre-existing baseline: 1008/1014 passing (6 pre-existing failures unrelated to M32)
- E2E: N/A (meta-project, no playwright config)

## Process Metrics

- Distillation: no repeating failure patterns found
- Rule engine: no rules fired for M32 domains
- Rollup: no task-metrics data recorded (all changes were markdown edits)

## Git Tag

`v2.53.10`

## Files Changed

**Modified**:
- `templates/CLAUDE-project.md` — added `## Quality North Star` section with 3 preset examples
- `commands/gsd-t-init.md` — added Step 6.5 persona detection/selection
- `commands/gsd-t-setup.md` — added Step 5.5 persona config + Step 5.6 design brief option
- `commands/gsd-t-partition.md` — added Step 3.5 design brief detection and generation
- `commands/gsd-t-plan.md` — added Task Design Rule 0 referencing design-brief.md
- `commands/gsd-t-execute.md` — added exploratory testing blocks in QA and Red Team prompts
- `commands/gsd-t-quick.md` — added exploratory testing blocks
- `commands/gsd-t-integrate.md` — added exploratory testing blocks
- `commands/gsd-t-debug.md` — added exploratory testing blocks
- `docs/requirements.md` — REQ-060/061/062 marked complete, traceability table updated

**New**:
- `.gsd-t/contracts/quality-persona-contract.md`
- `.gsd-t/contracts/design-brief-contract.md`
- `.gsd-t/contracts/exploratory-testing-contract.md`
