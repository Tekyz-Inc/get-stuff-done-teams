# Domain: m34-docs-and-tests

## Responsibility

Update all user-facing documentation to describe the Context Meter (not the task counter) and add integration-level tests that exercise the full context-meter flow end-to-end. Serializes after the three implementation domains so docs describe actually-shipped behavior.

## Owned Files/Directories

- `README.md` — add Context Meter section, API key setup instructions, how to adjust threshold, link to Anthropic console for free key
- `GSD-T-README.md` — detailed command reference updates (status, doctor, install sections); replace task-counter mentions
- `templates/CLAUDE-global.md` — replace "Task-Count Gate" section (currently under Observability Logging) with "Context Meter" section; update historical note
- `templates/CLAUDE-project.md` — same section replacement
- `docs/methodology.md` — update the context-awareness narrative
- `docs/requirements.md` — mark M34 requirements as complete, add new REQ entries if any
- `docs/architecture.md` — document the PostToolUse hook → count_tokens API → state file → token-budget pipeline
- `docs/infrastructure.md` — document the API key env var and how to set it for CI / shell profiles
- `tests/integration/context-meter.test.js` (new) — integration test: fake transcript file, stub count_tokens endpoint with a local HTTP server, run the hook, assert state file written and additionalContext returned when threshold exceeded
- `tests/integration/token-budget-real-source.test.js` (new) — integration test: write a fake state file, call `token-budget.getSessionStatus()`, assert correct threshold reported
- `tests/integration/installer-meter.test.js` (new) — integration test: run `doInit` in a tempdir, assert hook script copied, config template copied, settings.json merged, migration marker handled

## NOT Owned (do not modify)

- `scripts/gsd-t-context-meter.js` — context-meter-hook
- `bin/context-meter-config.cjs`, `.gsd-t/context-meter-config.json`, `templates/context-meter-config.json`, `.gsd-t/contracts/context-meter-contract.md` — context-meter-config
- `bin/gsd-t.js` — installer-integration
- `bin/token-budget.js`, `bin/orchestrator.js`, `commands/*.md`, `.gsd-t/contracts/token-budget-contract.md`, `.gsd-t/contracts/context-observability-contract.md` — token-budget-replacement
- Unit tests under `bin/*.test.js` / `scripts/*.test.js` — owned by their respective domains
