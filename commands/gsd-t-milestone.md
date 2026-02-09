# GSD-T: New Milestone — Define and Optionally Partition

You are defining a new milestone for the project. A milestone is a significant deliverable (e.g., "User Authentication", "MVP Launch", "Payment Integration").

## Step 1: Load Context

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md` — check if GSD-T is initialized
3. `docs/` — existing documentation

If `.gsd-t/` doesn't exist, run the init workflow first.

## Step 2: Define the Milestone

Based on $ARGUMENTS and available documentation:

1. **Name**: Clear, descriptive milestone name
2. **Goal**: 1-2 sentence description of what "done" looks like
3. **Scope**: What's included and what's explicitly NOT included
4. **Success criteria**: 3-5 measurable outcomes

Update `.gsd-t/progress.md` milestones table:
```markdown
| # | Milestone | Status | Domains |
|---|-----------|--------|---------|
| {N} | {name} | DEFINED | TBD |
```

## Step 3: Clear Previous Milestone State (if applicable)

If there's a completed previous milestone:
1. Archive domain task files (they contain valuable context)
2. Keep contracts that are still valid
3. Clean domain task lists for new work
4. Reset integration checkpoints

If previous milestone is NOT complete:
Ask user: "Milestone {N-1} is still {status}. Archive it and start new? Or complete it first?"

## Step 4: Pre-Partition Assessment

Before formal partitioning, do a quick assessment:

- **Complexity estimate**: Simple (1-2 domains), Medium (3-4), Complex (5+)
- **Recommended approach**:
  - Simple: Consider using /user:gsd-t-quick for each piece
  - Medium: Standard partition → plan → execute flow
  - Complex: Partition → discuss → plan → execute → integrate → verify

Present the assessment and ask: "Ready to partition into domains now, or want to discuss first?"

## Step 4.5: Document Ripple

After defining the milestone, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 2, but verify the Decision Log includes the milestone definition with rationale

### Check if affected:
2. **`docs/requirements.md`** — If the milestone scope implies new or changed requirements, add or update them
3. **`docs/architecture.md`** — If the milestone will introduce new components or change system structure, note planned changes
4. **`.gsd-t/roadmap.md`** — If it exists, add the new milestone in the proper sequence
5. **`CLAUDE.md`** — If the milestone establishes new scope boundaries or conventions, add them

### Skip what's not affected.

## Step 4.6: Test Verification

Before proceeding to partition:

1. **Run existing tests**: Execute the full test suite to confirm the codebase is clean before starting the milestone
2. **Verify passing**: If any tests fail, flag them as pre-existing — they should be addressed as part of this milestone or logged as tech debt
3. **Baseline**: Record test state so the milestone has a clear starting point for quality measurement

## Step 5: Auto-Partition (if user confirms)

If the user wants to proceed immediately, execute the partition workflow (same as gsd-t-partition) for this milestone.

Otherwise, set status to DEFINED and remind them:
"Run /user:gsd-t-partition to decompose into domains, or /user:gsd-t-discuss to explore approaches first."

$ARGUMENTS
