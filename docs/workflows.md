# Workflows — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18

## User Workflows

### Install GSD-T
1. Run `npx @tekyzinc/gsd-t install`
2. CLI copies commands to `~/.claude/commands/`
3. CLI sets up global CLAUDE.md if missing
4. CLI installs heartbeat hooks
5. User starts Claude Code in their project

**Entry point**: `npx @tekyzinc/gsd-t install`
**Success**: 41 commands available in Claude Code
**Failure**: CLI reports missing Node.js or permission errors

### Initialize a Project
1. User runs `/gsd-t-init` in Claude Code
2. Init creates `.gsd-t/` directory structure
3. Init creates or updates CLAUDE.md
4. Init creates `docs/` living documents if missing
5. Init scans existing codebase if code exists

**Entry point**: `/gsd-t-init` slash command
**Success**: Project ready for milestone definition
**Failure**: Reports what couldn't be created

### Full Wave Cycle
1. User defines milestone via `/gsd-t-milestone`
2. Partition decomposes into domains + contracts
3. Plan creates task lists per domain
4. Execute implements tasks (solo or team)
5. Test-sync aligns tests with code changes
6. Integrate wires domains together
7. Verify runs quality gates
8. Complete-milestone archives and tags

**Entry point**: `/gsd-t-wave` or manual phase-by-phase
**Success**: Milestone completed, version bumped, git tagged
**Failure**: Wave pauses at failing phase, user can fix and resume

## Technical Workflows

### CLI Update Check
1. CLI reads cached version from `~/.claude/.gsd-t-update-cache`
2. If cache is older than 1 hour, query npm registry
3. Compare installed vs. latest using semver
4. Display update notice if newer version available

**Trigger**: Every CLI invocation and `/gsd-t-status`
**Frequency**: Cached, actual fetch at most once per hour

### Heartbeat Event Logging
1. Claude Code hook fires on tool call or notification
2. `gsd-t-heartbeat.js` appends JSONL event to `.gsd-t/heartbeat-{session}.jsonl`
3. Events include timestamp, type, and context

**Trigger**: Claude Code hooks (9 event types)
**Frequency**: On every hooked event during a session

## Integration Workflows

### npm Publish
- **Trigger**: Manual `npm publish` after milestone completion
- **Flow**: Version bumped → CHANGELOG updated → git tagged → npm publish
- **Verification**: `npx @tekyzinc/gsd-t status` on fresh install
