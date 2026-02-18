# Constraints: contract-test-gen

## Must Follow
- Test skeletons must be valid, runnable Playwright/test framework code (not pseudocode)
- Must handle all 3 contract types: API, schema, component
- Test files live alongside contracts or in the project's test directory
- Skeletons include: happy path, error cases, shape validation
- Generated tests must be clearly marked as contract tests (distinct from implementation tests)

## Must Not
- Change the contract markdown format itself
- Generate implementation code — only test code
- Assume a specific test framework beyond Playwright (detect from project)

## Dependencies
- Depends on: nothing (can be developed independently)
- Depended on by: qa-agent-spec (incorporates this logic into the agent's instructions)
