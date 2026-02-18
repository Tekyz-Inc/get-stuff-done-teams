# Domain: Contract Test Generation

## Responsibility
Define how contract markdown (API contracts, schema contracts, component contracts) gets translated into executable test skeletons. Establish the mapping rules, test file conventions, and skeleton templates.

## Owned Files/Directories
- Section within `commands/gsd-t-qa.md` — test generation logic
- `.gsd-t/contracts/` conventions — where test files live relative to contracts
- Example test skeletons in `examples/`

## NOT Owned (do not modify)
- Existing contract markdown format (preserve as-is)
- Individual command files (owned by command-integration)
- QA agent spawn/communication protocol (owned by qa-agent-spec)
