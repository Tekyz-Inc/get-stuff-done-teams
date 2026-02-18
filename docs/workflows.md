# Workflows — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18

## User Workflows

### Install GSD-T
1. Run `npx @tekyzinc/gsd-t install`
2. CLI copies 43 commands to `~/.claude/commands/`
3. CLI sets up global CLAUDE.md if missing (appends with separator if exists)
4. CLI installs heartbeat script to `~/.claude/scripts/`
5. CLI configures 9 hooks in `~/.claude/settings.json`
6. CLI saves version to `~/.claude/.gsd-t-version`
7. User starts Claude Code in their project

**Entry point**: `npx @tekyzinc/gsd-t install`
**Success**: 43 commands available in Claude Code
**Failure**: CLI reports missing Node.js or permission errors

### Initialize a Project
1. User runs `/gsd-t-init [name]` in Claude Code (or `gsd-t init [name]` CLI)
2. Init creates `.gsd-t/` directory with progress.md, backlog.md, backlog-settings.md, contracts/, domains/
3. Init creates or updates CLAUDE.md (project-level) using template with token replacement
4. Init creates `docs/` living documents (requirements, architecture, workflows, infrastructure) if missing
5. Init auto-registers project in `~/.claude/.gsd-t-projects`
6. All file creation uses `{ flag: "wx" }` — never overwrites existing files

**Entry point**: `/gsd-t-init` slash command or `gsd-t init` CLI
**Success**: Project ready for milestone definition
**Failure**: Reports what couldn't be created (existing files preserved)

### Full Wave Cycle
1. User defines milestone via `/gsd-t-milestone`
2. **Partition**: Decompose into domains + contracts (file ownership, interfaces)
3. **Discuss**: Explore design decisions (always pauses, even Level 3) — SKIPPABLE if path is clear
4. **Plan**: Create atomic task lists per domain with dependencies
5. **Impact**: Analyze downstream effects (PROCEED / CAUTION / BLOCK verdicts)
6. **Execute**: Implement tasks (solo or team mode based on domain count)
7. **Test-Sync**: Align tests with code changes, verify coverage
8. **Integrate**: Wire domains at boundaries, verify contracts honored
9. **Verify**: Run 7 quality gate dimensions (functional, contracts, quality, tests, E2E, security, integration)
10. **Complete**: Archive to `.gsd-t/milestones/`, bump version, git tag

**Entry point**: `/gsd-t-wave` (auto-advances) or manual phase-by-phase
**Success**: Milestone completed, version bumped, git tagged
**Failure**: Wave pauses at failing phase; user can fix and resume

### Autonomy Levels
| Level | Behavior |
|-------|----------|
| Level 1 (Supervised) | Pause at each phase for confirmation |
| Level 2 (Standard) | Pause only at milestones |
| Level 3 (Full Auto) | Auto-advance; only stop for Destructive Guard, Impact BLOCK, errors after 2 attempts, Discuss |

### Error Recovery (2-Attempt Rule)
| Failure | Recovery | After 2 Failures |
|---------|----------|-------------------|
| Impact BLOCK | Add remediation tasks, re-run | STOP and report |
| Test failures | Fix and re-run | STOP and report |
| Verify failure | Remediate and re-verify | STOP and report |
| Gap analysis gaps | Auto-fix and re-analyze | STOP and report |

## Technical Workflows

### CLI Update Check
1. CLI reads cached version from `~/.claude/.gsd-t-update-check` (JSON: `{ latest, timestamp }`)
2. If cache is fresh (<1 hour): show notice if cached latest > installed
3. If no cache: synchronous fetch to npm registry (8s timeout), cache result
4. If cache stale (>1 hour): spawn detached background `scripts/npm-update-check.js`
5. Compare versions using `isNewerVersion()` semver comparison

**Trigger**: Every CLI invocation (except install/update/update-all)
**Also**: `/gsd-t-status` slash command checks independently

### Heartbeat Event Logging
1. Claude Code hook fires (9 events: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd)
2. `settings.json` hook calls `node ~/.claude/scripts/gsd-t-heartbeat.js`
3. Script reads JSON from stdin (capped at 1MB)
4. Validates session_id (alphanumeric regex), validates path is absolute and within `.gsd-t/`
5. Builds structured event with timestamp, type-specific data (tool summaries, file paths)
6. Appends JSONL to `.gsd-t/heartbeat-{session_id}.jsonl`
7. Runs cleanup: removes heartbeat files older than 7 days

**Trigger**: Claude Code hooks (9 event types)
**Frequency**: On every hooked event during a session

### Version Bump Rules
| Context | Change Type | Bump |
|---------|-------------|------|
| Complete-milestone | Breaking changes, major rework | Major |
| Complete-milestone | New features, feature milestones | Minor |
| Complete-milestone | Bug fixes, cleanup | Patch |
| Checkin | New features, new commands | Minor |
| Checkin | Bug fixes, docs, refactors | Patch (default) |
| Checkin | Breaking changes | Major |

Updated in: package.json, .gsd-t/progress.md, CHANGELOG.md, git tag

### Pre-Commit Gate
Every commit must pass applicable checks:
1. Branch guard (correct branch?)
2. Contract updates (API, schema, component)
3. Scope updates (new files → domain scope.md)
4. Documentation updates (requirements, architecture)
5. Decision Log entry (timestamped in progress.md)
6. Tech debt tracking (discovered/fixed?)
7. Test execution (affected tests pass?)

## Integration Workflows

### npm Publish
- **Trigger**: Manual `npm publish` after milestone completion
- **Flow**: Version bumped → CHANGELOG updated → git tagged → npm publish
- **Verification**: `npx @tekyzinc/gsd-t status` on fresh install

### Update All Projects
- **Trigger**: `gsd-t update-all` CLI command
- **Flow**: Global update → iterate registered projects → inject Destructive Action Guard → create CHANGELOG → health check (Playwright, Swagger)
- **Registry**: `~/.claude/.gsd-t-projects` (newline-separated absolute paths)
