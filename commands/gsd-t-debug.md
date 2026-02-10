# GSD-T: Debug — Systematic Debugging with Contract Awareness

You are debugging an issue in a contract-driven project. Your approach should identify whether the bug is within a domain or at a contract boundary.

## Step 1: Load Context

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/domains/*/scope.md` — domain boundaries

## Step 2: Classify the Bug

Based on the user's description ($ARGUMENTS), determine:

### A) Within-Domain Bug
The issue is entirely inside one domain's scope. Symptoms:
- Error occurs in files owned by a single domain
- No cross-domain data flow involved
- Logic error, typo, missing validation within one area

→ Debug within that domain's files. Fix and verify against domain's acceptance criteria.

### B) Contract Boundary Bug
The issue occurs where domains interact. Symptoms:
- Data shape mismatch between producer and consumer
- API returns unexpected format
- UI sends wrong payload to backend
- Auth middleware doesn't integrate correctly with routes

→ Check the relevant contract first. Is the contract correct? Does the implementation match?

### C) Contract Gap
The contract didn't specify something it should have. Symptoms:
- Edge case not covered in contract
- Error handling not specified
- Race condition at boundary
- Missing contract entirely

→ Update the contract, then fix implementations on both sides.

## Step 3: Debug (Solo or Team)

### Solo Mode
1. Reproduce the issue
2. Trace through the relevant domain(s)
3. Check contract compliance at each boundary
4. Identify root cause
5. **Destructive Action Guard**: If the fix requires destructive or structural changes (dropping tables, removing columns, changing schema, replacing architecture patterns, removing working modules) → STOP and present the change to the user with what exists, what will change, what will break, and a safe migration path. Wait for explicit approval.
6. Fix and test — **adapt the fix to existing structures**, not the other way around
7. Update contracts if needed

### Team Mode (for complex cross-domain bugs)
```
Create an agent team to debug:
- Teammate 1: Investigate in {domain-1} — check implementation 
  against contracts, trace data flow
- Teammate 2: Investigate in {domain-2} — check implementation 
  against contracts, trace data flow
- Teammate 3: Check all contracts for gaps or ambiguities 
  related to the failing scenario

First to find root cause: message the lead with findings.
```

## Step 4: Document Ripple

After fixing, assess what documentation was affected by the change and update ALL relevant files:

### Always check:
1. **`.gsd-t/progress.md`** — Add to Decision Log: what broke, why, and the fix
2. **`.gsd-t/contracts/`** — Update any contract if the fix changed an interface, schema, or API shape
3. **Domain `constraints.md`** — Add a "must not" rule if the bug was caused by a pattern that should be avoided

### Check if affected:
4. **`docs/requirements.md`** — Did the fix reveal a missing or incorrect requirement? Update it
5. **`docs/architecture.md`** — Did the fix change architectural patterns, data flow, or component relationships? Update it
6. **`docs/schema.md`** — Did the fix modify the database schema? Update it
7. **`.gsd-t/techdebt.md`** — Did the fix reveal related debt? Add a new TD item. Did it resolve an existing one? Mark it complete
8. **Domain `scope.md`** — Did the fix add new files or change ownership? Update it
9. **Domain `tasks.md`** — If the bug was in an active milestone, update task status or add a remediation task
10. **`CLAUDE.md`** — Did the fix establish a new convention or pattern that future work should follow? Add it

### Skip what's not affected — don't update docs for the sake of updating them.

## Step 5: Test Verification

Before committing, ensure the fix is solid:

1. **Update tests**: If the bug reveals a missing test case, add one that would have caught it
2. **Run affected tests**: Execute all tests related to the changed files and domain
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **Run E2E tests**: If the fix changed UI, routes, or user flows and an E2E framework exists, run affected specs
5. **Regression check**: Confirm the fix doesn't break any adjacent functionality

Commit: `[debug] Fix {description} — root cause: {explanation}`

$ARGUMENTS
