# Constraints: command-integration

## Must Follow
- Reference the QA agent spec from qa-agent-spec domain — do not duplicate agent instructions
- Keep changes additive — preserve all existing command functionality
- QA teammate must always be spawned — no solo fallback (Playwright Readiness Guard ensures framework exists)
- Use consistent spawn language across all commands

## Must Not
- Change the QA agent's behavior definition (qa-agent-spec owns that)
- Remove or modify existing test-related steps (only add QA spawn alongside them)
- Change the phase execution order

## Dependencies
- Depends on: qa-agent-spec (must be defined before commands can reference it)
- Depended on by: none (this is the final integration layer)
