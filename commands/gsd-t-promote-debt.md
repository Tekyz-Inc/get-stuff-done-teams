# GSD-T: Promote Debt — Convert Tech Debt Items to Milestones

You are converting selected tech debt items into formal milestones on the project roadmap.

## Step 1: Load Context

Read:
1. `.gsd-t/techdebt.md` — the debt register
2. `.gsd-t/roadmap.md` — current milestone plan
3. `.gsd-t/progress.md` — what's in progress

## Step 2: Identify Items to Promote

From $ARGUMENTS, determine which items to promote:
- Specific IDs: "TD-001, TD-003" → promote those exact items
- Category: "security" → promote all security items marked as milestone candidates
- Severity: "critical" → promote all critical items
- Suggested group: "Security Hardening" → use the suggested grouping from the scan
- "all" → promote all items marked `Milestone candidate: YES`

If $ARGUMENTS is empty or vague, show the user all promotable items:
```
Promotable tech debt items:

  TD-001: [CRITICAL] SQL injection in user search — effort: small
  TD-003: [CRITICAL] Hardcoded API key in config — effort: small  
  TD-010: [HIGH] N+1 queries on dashboard — effort: medium
  TD-012: [HIGH] No rate limiting on auth endpoints — effort: small

Suggested groupings:
  1. "Security Hardening" — TD-001, TD-003, TD-012
  2. "Performance" — TD-010

Which items or groups should I promote to milestones?
```

## Step 3: Create Milestones

For each group of promoted items, create a milestone entry.

Determine placement in the roadmap:
- **CRITICAL items**: Insert BEFORE the next unstarted feature milestone
- **HIGH items**: Insert AFTER current in-progress milestone
- **MEDIUM/LOW items**: Append to end of roadmap

Append to `.gsd-t/roadmap.md`:

```markdown
---

## Milestone {N}: {name} — Tech Debt
**Source**: Promoted from tech debt scan ({date})
**Items**: {TD-001, TD-003, TD-012}
**Goal**: {what "done" looks like}
**Scope**:
- {remediation 1 from techdebt.md}
- {remediation 2 from techdebt.md}
**Success criteria**:
- [ ] {each debt item resolved and verified}
- [ ] No regression in existing functionality
- [ ] {item-specific criteria from techdebt.md}
**Estimated effort**: {combined effort assessment}
**Priority**: {CRITICAL — before next feature | HIGH — soon | MEDIUM — planned}
```

## Step 4: Update Tech Debt Register

In `.gsd-t/techdebt.md`, mark promoted items:
```markdown
- **Promoted**: [x] — Milestone {N}: {milestone name}
```

## Step 5: Update Progress

In `.gsd-t/progress.md`:
- Add new milestones to the table
- Log promotion in Decision Log: "{date}: Promoted {N} tech debt items to Milestone {N}: {name}"
- Reorder milestones if critical items were inserted

## Step 5.5: Document Ripple

After promoting debt items to milestones, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 5, verify Decision Log includes promotion rationale

### Check if affected:
2. **`docs/requirements.md`** — If promoted debt items imply new or changed requirements (e.g., security requirements from a security hardening milestone), add them
3. **`docs/architecture.md`** — If promoted debt involves architectural changes, note planned modifications
4. **`CLAUDE.md`** — If promotion changes the project's priority order or introduces new constraints, add them
5. **`README.md`** — If the roadmap change affects what's documented in README (e.g., known issues section), update it

### Skip what's not affected.

## Step 5.6: Test Verification

Before reporting:

1. **Run existing tests**: Execute the full test suite to confirm current state — promoted debt milestones should not change code yet
2. **Verify passing**: Document any pre-existing failures that relate to the promoted debt items — these validate the promotion was warranted
3. **Note test requirements**: For each promoted milestone, note what tests will need to be added or updated during execution

## Step 6: Report

Present:
1. Milestones created (with item list)
2. Updated roadmap order
3. Any impact on in-progress work
4. Recommended next action

$ARGUMENTS
