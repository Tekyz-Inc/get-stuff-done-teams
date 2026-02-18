# Constraints: cli-quality

## Must Follow
- All functions under 30 lines after refactoring
- Zero external dependencies — Node.js built-ins only
- module.exports + require.main === module guard preserved
- All existing tests must continue to pass
- Extracted sub-functions must be testable (exported)
- Silent failure pattern maintained in hook scripts

## Must Not
- Modify command files or templates
- Change any public API (function signatures used by tests)
- Add npm dependencies
- Change observable CLI behavior (output format, exit codes)
- Break the heartbeat hook event processing pipeline

## Dependencies
- No cross-domain dependencies (single domain milestone)
