# Constraints: command-extensions

## Must Follow
- Command files are pure markdown — no frontmatter, step-numbered workflow
- All changes are additive — append new steps, do not modify existing step logic
- Cross-project data is accessed via `node -e "..."` inline calls to global-sync-manager.js, or via direct JSONL file reads from `~/.claude/metrics/`
- New steps must include `$ARGUMENTS` handling for `--cross-project` flag (metrics command)
- Global ELO display in status gracefully handles case where `~/.claude/metrics/` does not exist (show "No global metrics yet")
- Pre-Commit Gate: any command interface change must update GSD-T-README.md, README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md

## Must Not
- Modify existing step numbers or logic in command files
- Remove or reorder existing workflow steps
- Add external dependencies to command files
- Create new command files (only extend existing ones)

## Dependencies
- Depends on: global-metrics domain for `global-sync-manager.js` module (must be complete before commands can reference its API)
- Depends on: cross-project-sync domain for understanding the sync protocol (commands describe what sync does)
- Depended on by: none (command extensions are the final consumer layer)

## Must Read Before Using
- `commands/gsd-t-metrics.md` — current full content, understand step numbering and $ARGUMENTS handling
- `commands/gsd-t-status.md` — current full content, understand report format
- `commands/gsd-t-complete-milestone.md` — current full content, understand distillation step structure
- `bin/global-sync-manager.js` — API for reading global metrics (created by global-metrics domain)
- `.gsd-t/contracts/cross-project-sync-contract.md` — global schemas and protocol
