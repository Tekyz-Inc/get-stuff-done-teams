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

## Step 5: Bump Version

GSD-T tracks project version in `.gsd-t/progress.md` using semantic versioning: `Major.Minor.Patch`

- **Major** (X.0.0): Breaking changes, major rework, v1 launch
- **Minor** (0.X.0): New features, completed feature milestones
- **Patch** (0.0.X): Bug fixes, minor improvements, cleanup milestones

Determine the version bump based on the milestone:
1. Read current version from `.gsd-t/progress.md`
2. Assess milestone scope:
   - Was this a major/breaking milestone? → bump **major**, reset minor and patch to 0
   - Was this a feature milestone? → bump **minor**, reset patch to 0
   - Was this a bugfix/cleanup/debt milestone? → bump **patch**
3. Update version in `.gsd-t/progress.md`
4. If a package manifest exists (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.), update its version to match
5. Update `README.md` version badge or version reference if present
6. Include version in the milestone summary and git tag

## Step 6: Clean Working State

Reset `.gsd-t/` for next milestone:

1. Archive current domains → `.gsd-t/milestones/{name}/domains/`
2. Clear `.gsd-t/domains/` (empty, ready for next partition)
3. Archive current reports → milestone folder
4. Clear `.gsd-t/impact-report.md`, `.gsd-t/test-coverage.md`
5. Update `.gsd-t/progress.md`:

```markdown
# GSD-T Progress

## Version: {new version}
## Current Milestone
None — ready for next milestone

## Completed Milestones
| Milestone | Version | Completed | Tag |
|-----------|---------|-----------|-----|
| {name} | {version} | {date} | v{version} |
| {previous} | {version} | {date} | v{version} |

## Decision Log
{Keep the decision log — it's valuable context}
```

## Step 7: Update README.md

If `README.md` exists, update it to reflect the completed milestone:
- Add or update a **Features** / **What's Included** section with capabilities delivered
- Update version number if displayed in README
- Update setup instructions if infrastructure changed
- Update tech stack if new dependencies were added
- Keep existing user content — merge, don't overwrite

If `README.md` doesn't exist, create one with project name, description, version, tech stack, setup instructions, and link to `docs/`.

## Step 7.5: Document Ripple

Before creating the git tag, verify all documentation is up to date:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 6, verify it's complete with version and milestone state
2. **`README.md`** — Already updated in Step 7, verify it reflects all delivered capabilities

### Check if affected:
3. **`docs/requirements.md`** — Verify all requirements delivered in this milestone are marked as complete
4. **`docs/architecture.md`** — Verify the architecture doc matches the current system state after all milestone work
5. **`docs/workflows.md`** — Verify any workflows added or changed during the milestone are documented
6. **`docs/infrastructure.md`** — If infrastructure changed during the milestone (new services, new deployment steps), verify it's documented
7. **`CLAUDE.md`** — Verify any conventions established during the milestone are captured
8. **`.gsd-t/techdebt.md`** — Verify any debt resolved during the milestone is marked done, and any new debt discovered is logged

### This is the LAST GATE before tagging — nothing should be undocumented.

## Step 7.6: Test Verification

Before creating the git tag, verify the milestone is truly complete:

1. **Run the full test suite**: Execute ALL tests — unit, integration, and E2E if available
2. **Verify all pass**: Every test must pass. If any fail, fix before tagging (up to 2 attempts)
3. **Compare to baseline**: If a test baseline was recorded at milestone start, verify coverage has improved or at minimum not regressed
4. **Log test results**: Include test pass/fail counts in the milestone summary (Step 4)

## Step 8: Create Git Tag

```bash
# Stage any remaining .gsd-t changes
git add .gsd-t/

# Commit the archive
git commit -m "milestone({milestone-name}): complete and archive v{version}"

# Create annotated tag with version
git tag -a "v{version}" -m "v{version} — Milestone: {name}

{Brief description from summary}

Domains: {list}
Verified: {date}"
```

## Step 9: Report Completion

```
✅ Milestone "{name}" completed — v{version}

📁 Archived to: .gsd-t/milestones/{name}-{date}/
🏷️  Tagged as: v{version}

Summary:
- Version: {previous version} → {new version}
- Domains completed: {N}
- Tasks completed: {N}
- Contracts: {N} defined/updated
- Tests: {N} added/updated

Next steps:
- Push tags: git push origin v{version}
- Start next milestone: /user:gsd-t-milestone "{next name}"
- Or view roadmap: /user:gsd-t-status
```

## Step 10: Update Roadmap (if exists)

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
