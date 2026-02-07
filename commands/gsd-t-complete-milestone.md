# GSD-T: Complete Milestone — Archive and Tag Release

You are finalizing a completed milestone. Your job is to archive the milestone documentation, create a git tag, and prepare for the next milestone.

This command is:
- **Auto-invoked** at the end of `/user:gsd-t-wave` after verify passes
- **Standalone** when user wants to manually close a milestone

## Step 1: Verify Completion

Read:
1. `.gsd-t/progress.md` — confirm status is VERIFIED
2. `.gsd-t/verify-report.md` — confirm all checks passed

If status is not VERIFIED:
"⚠️ Milestone not yet verified. Run `/user:gsd-t-verify` first, or use `--force` to complete anyway."

If `--force` flag provided, proceed with warning in archive.

## Step 2: Gather Milestone Artifacts

Collect all files related to this milestone:
- `.gsd-t/progress.md` (current state)
- `.gsd-t/verify-report.md`
- `.gsd-t/impact-report.md` (if exists)
- `.gsd-t/test-coverage.md` (if exists)
- `.gsd-t/domains/*/` (all domain folders)
- `.gsd-t/contracts/` (snapshot)

## Step 3: Create Archive

Create milestone archive directory:

```
.gsd-t/milestones/{milestone-name}-{date}/
├── progress.md           # Final state
├── verify-report.md      # Verification results
├── impact-report.md      # Impact analysis (if any)
├── test-coverage.md      # Test sync report (if any)
├── summary.md            # Generated summary (see below)
├── contracts/            # Contract snapshot at completion
│   └── ...
└── domains/              # Domain artifacts
    └── ...
```

## Step 4: Generate Summary

Create `summary.md`:

```markdown
# Milestone Complete: {name}

**Completed**: {date}
**Duration**: {start date} → {end date}
**Status**: {VERIFIED | FORCED}

## What Was Built
{Extract from progress.md and domain scopes}

## Domains
| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| {name} | {N} | {summary} |

## Contracts Defined/Updated
- {contract}: {new | updated | unchanged}

## Key Decisions
{Extract from Decision Log in progress.md}

## Issues Encountered
{Extract any remediation tasks or blocked items}

## Test Coverage
- Tests added: {N}
- Tests updated: {N}
- Coverage: {if known}

## Git Tag
`{tag-name}`

## Files Changed
{Summary of files created/modified/deleted}
```

## Step 5: Clean Working State

Reset `.gsd-t/` for next milestone:

1. Archive current domains → `.gsd-t/milestones/{name}/domains/`
2. Clear `.gsd-t/domains/` (empty, ready for next partition)
3. Archive current reports → milestone folder
4. Clear `.gsd-t/impact-report.md`, `.gsd-t/test-coverage.md`
5. Update `.gsd-t/progress.md`:

```markdown
# GSD-T Progress

## Current Milestone
None — ready for next milestone

## Completed Milestones
| Milestone | Completed | Tag |
|-----------|-----------|-----|
| {name} | {date} | {tag} |
| {previous} | {date} | {tag} |

## Decision Log
{Keep the decision log — it's valuable context}
```

## Step 6: Create Git Tag

```bash
# Stage any remaining .gsd-t changes
git add .gsd-t/

# Commit the archive
git commit -m "milestone({milestone-name}): complete and archive"

# Create annotated tag
git tag -a "milestone/{milestone-name}" -m "Milestone: {name}

{Brief description from summary}

Domains: {list}
Verified: {date}"
```

## Step 7: Report Completion

```
✅ Milestone "{name}" completed!

📁 Archived to: .gsd-t/milestones/{name}-{date}/
🏷️  Tagged as: milestone/{name}

Summary:
- Domains completed: {N}
- Tasks completed: {N}
- Contracts: {N} defined/updated
- Tests: {N} added/updated

Next steps:
- Push tags: git push origin milestone/{name}
- Start next milestone: /user:gsd-t-milestone "{next name}"
- Or view roadmap: /user:gsd-t-status
```

## Step 8: Update Roadmap (if exists)

If `.gsd-t/roadmap.md` exists:
- Mark this milestone as complete
- Update any dependent milestones
- Highlight next recommended milestone

## Error Handling

### If verify failed:
"Cannot complete — verification found issues. Address them first or use `--force`."

### If no milestone active:
"No active milestone to complete. Run `/user:gsd-t-status` to see state."

### If git operations fail:
- Still create archive
- Report git error
- Provide manual tag command

$ARGUMENTS
