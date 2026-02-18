# Constraints: qa-agent-spec

## Must Follow
- QA agent must be defined as a teammate spec (not a standalone command that runs in the main context)
- Agent must have a focused, minimal context: contracts + test files + test results only
- Agent must communicate results via standard teammate messaging
- Agent must never write feature code — tests and test infrastructure only

## Must Not
- Modify any existing command files (command-integration domain handles that)
- Change the contract markdown format
- Add external dependencies to the CLI

## Dependencies
- Depends on: contract-test-gen for the test skeleton generation logic
- Depended on by: command-integration (they reference this spec when spawning)
