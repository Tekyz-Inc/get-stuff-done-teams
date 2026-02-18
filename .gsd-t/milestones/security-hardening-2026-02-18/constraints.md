# Constraints: security

## Must Follow
- Zero external dependencies — Node.js built-ins only
- Functions under 30 lines
- All existing 64 tests must continue passing
- Symlink checks use lstatSync (not statSync)
- Silent failure pattern in hooks — never interfere with Claude Code
- ANSI color constants already defined in bin/gsd-t.js — reuse them

## Must Not
- Modify files outside owned scope
- Change any public API or CLI interface
- Add npm dependencies
- Break backward compatibility of heartbeat event format
- Alter the wave phase sequence or orchestration logic (only add documentation)

## Dependencies
- Depends on: none (single domain, no cross-domain contracts)
- Depended on by: none
