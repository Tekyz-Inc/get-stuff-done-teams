# Contract: progress.md File Format

## Owner
GSD-T framework (consumed by all workflow commands)

## Consumers
gsd-t-partition, gsd-t-plan, gsd-t-execute, gsd-t-integrate, gsd-t-verify, gsd-t-complete-milestone, gsd-t-wave, gsd-t-status, gsd-t-resume, gsd-t-quick, gsd-t-log, gsd-t-debug

## File Location
`.gsd-t/progress.md`

## Required Sections

### Header Block
```markdown
# GSD-T Progress

## Project: {project name}
## Version: {Major.Minor.Patch}
## Status: {valid status}
## Date: {YYYY-MM-DD}
```

**Version**: Semantic versioning. Starts at `0.1.0` on init. Bumped by `gsd-t-complete-milestone`.
- Major: breaking changes, major rework, v1 launch
- Minor: new features, completed feature milestones
- Patch: bug fixes, minor improvements, cleanup milestones

**Valid Status Values** (lifecycle order):
| Status | Set By |
|--------|--------|
| READY | gsd-t-init, gsd-t-complete-milestone |
| INITIALIZED | gsd-t-milestone |
| DEFINED | gsd-t-milestone |
| PARTITIONED | gsd-t-partition |
| DISCUSSED | gsd-t-discuss |
| PLANNED | gsd-t-plan |
| IMPACT_ANALYZED | gsd-t-impact |
| EXECUTING | gsd-t-execute (start) |
| EXECUTED | gsd-t-execute (complete) |
| TESTS_SYNCED | gsd-t-test-sync |
| INTEGRATED | gsd-t-integrate |
| VERIFIED | gsd-t-verify |
| VERIFY_FAILED | gsd-t-verify (on failure) |
| COMPLETED | gsd-t-complete-milestone |

### Current Milestone
```markdown
## Current Milestone
{milestone name} | None — ready for next milestone
```

When active, contains the milestone name. When idle, contains `None — ready for next milestone`.

### Completed Milestones Table
```markdown
## Completed Milestones
| Milestone | Version | Completed | Tag |
|-----------|---------|-----------|-----|
| {name} | {version} | {YYYY-MM-DD} | v{version} |
```

Rows are appended by `gsd-t-complete-milestone`. Ordered chronologically (oldest first).

### Domains Table (active milestone only)
```markdown
## Domains
| Domain | Status | Tasks | Completed |
|--------|--------|-------|-----------|
| {name} | {domain status} | {N} | {N} |
```

**Valid Domain Status**: partitioned, planned, executing, executed, integrated, verified

Present during active milestone. Cleared to `(populated during partition phase)` when milestone completes.

### Contracts Section
```markdown
## Contracts
- [ ] {contract-filename.md}
- [x] {contract-filename.md}
```

Checklist of contract files. Checked when verified. Cleared to `(populated during partition phase)` when milestone completes.

### Integration Checkpoints
```markdown
## Integration Checkpoints
- [ ] {checkpoint description} — blocks {domain} task {N}
- [x] {checkpoint description} — PASSED
```

Cleared to `(populated during plan phase)` when milestone completes.

### Blockers
```markdown
## Blockers
### {Blocker description}
- **Found**: {YYYY-MM-DD}
- **Attempted**: {what was tried}
- **Status**: investigating | waiting | resolved
```

HTML comment when empty. Active blockers use the heading format above.

### Decision Log
```markdown
## Decision Log
- {YYYY-MM-DD HH:MM}: {what was done} — {brief context or result}
```

Append-only. Every file-modifying activity adds an entry. Never cleared — persists across milestones. Format is always `- YYYY-MM-DD HH:MM: description`.

### Session Log
```markdown
## Session Log
| Date | Session | What was accomplished |
|------|---------|----------------------|
| {YYYY-MM-DD} | {N} | {summary} |
```

Append-only. One row per working session. Never cleared.

## Initialization
Created by `gsd-t-init` from `templates/progress.md`. Token replacement: `{Project Name}` and `{Date}`.

## State Transitions
Status changes are always forward (READY → INITIALIZED → ... → COMPLETED), except:
- VERIFY_FAILED can revert to EXECUTING for remediation
- COMPLETED resets to READY for next milestone
