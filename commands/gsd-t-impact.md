# GSD-T: Impact — Downstream Effect Analysis

You are analyzing the downstream effects of planned changes before execution. Your job is to identify what might break, what needs updating, and what risks exist.

This command is:
- **Auto-invoked** between plan and execute phases in `/user:gsd-t-wave`
- **Standalone** when user wants to evaluate potential changes

## Step 1: Load Context

Read:
1. `CLAUDE.md` — project conventions
2. `.gsd-t/progress.md` — current state
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/domains/{current}/tasks.md` — planned changes

If run standalone, ask: "What changes are you considering?"

## Step 2: Identify Changed Files

From the plan or user description, list:
- Files to be created
- Files to be modified
- Files to be deleted
- Functions/classes/endpoints being changed

## Step 3: Trace Dependencies

For each changed file/function:

### A) Who Calls This?
```bash
# Find all imports/requires of this module
grep -r "import.*{module}" src/
grep -r "from.*{module}" src/
grep -r "require.*{module}" src/
```

### B) Who Does This Call?
- List dependencies this code relies on
- Note if any of those are also changing

### C) Contract Consumers
- Check `.gsd-t/contracts/api-contract.md` — does this change an endpoint?
- Check `.gsd-t/contracts/schema-contract.md` — does this change data shape?
- Check `.gsd-t/contracts/component-contract.md` — does this change props/interface?

### D) Test Coverage
- Which tests cover this code?
- Will they still pass after changes?
- Are there tests that assert current behavior that will become wrong?

## Step 4: Classify Impacts

Categorize each finding:

### 🔴 Breaking Changes
Changes that WILL break something if not addressed:
- API signature changes with existing consumers
- Database schema changes with existing queries
- Removed functions still being called
- Changed return types

### 🟡 Requires Updates
Changes that need coordinated updates:
- Tests asserting old behavior
- Documentation references
- Related UI components
- Dependent domain tasks

### 🟢 Safe Changes
Changes with no downstream impact:
- New files with no consumers yet
- Internal refactors with same interface
- Additive changes (new optional params)

### ⚪ Unknown
Can't determine impact — needs investigation:
- Dynamic imports
- Reflection-based code
- External integrations

## Step 5: Check Contract Compliance

For each contract:
- Will planned changes violate the contract?
- Does the contract need to be updated first?
- Are there consumers not yet updated for contract changes?

Flag: "Contract violation detected — {contract} specifies {X}, but plan changes to {Y}"

## Step 6: Produce Impact Report

Create/update `.gsd-t/impact-report.md`:

```markdown
# Impact Analysis — {date}

## Summary
- Breaking changes: {N}
- Requires updates: {N}
- Safe changes: {N}
- Unknown: {N}
- **Recommendation**: {PROCEED | PROCEED WITH CAUTION | BLOCK}

## Planned Changes
| File | Change Type | Description |
|------|-------------|-------------|
| {file} | {create/modify/delete} | {what} |

---

## 🔴 Breaking Changes

### IMP-001: {title}
- **Change**: {what's changing}
- **Affected**: {files/functions/consumers}
- **Impact**: {what will break}
- **Required Action**: {what must be done}
- **Blocking**: YES — cannot proceed without addressing

---

## 🟡 Requires Updates

### IMP-010: {title}
- **Change**: {what's changing}
- **Affected**: {files/tests/docs}
- **Action**: {update X to reflect Y}
- **Blocking**: NO — can be done during or after execution

---

## 🟢 Safe Changes

- {file}: {change} — no downstream impact
- {file}: {change} — additive only

---

## ⚪ Unknown Impact

### IMP-020: {title}
- **Change**: {what}
- **Uncertainty**: {why we can't determine impact}
- **Recommendation**: {manual review / test thoroughly / ask user}

---

## Contract Status

| Contract | Status | Notes |
|----------|--------|-------|
| api-contract.md | {OK / VIOLATION / UPDATE NEEDED} | {details} |
| schema-contract.md | {OK / VIOLATION / UPDATE NEEDED} | {details} |
| component-contract.md | {OK / VIOLATION / UPDATE NEEDED} | {details} |

---

## Test Impact

| Test File | Status | Action Needed |
|-----------|--------|---------------|
| {test} | {WILL PASS / WILL FAIL / NEEDS UPDATE} | {action} |

---

## Recommended Execution Order

1. {First, update X because...}
2. {Then, modify Y...}
3. {Finally, Z...}

## Generated Tasks

If breaking changes require pre-work, add to domain tasks:
- [ ] IMP-001: {remediation task}
- [ ] IMP-002: {remediation task}
```

## Step 6.5: Document Ripple

After producing the impact report, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Log the impact analysis in the Decision Log with date and key findings

### Check if affected:
2. **`docs/architecture.md`** — If the analysis revealed architectural concerns or proposed changes, document them
3. **`docs/requirements.md`** — If the analysis found requirements that would be affected by the planned changes, note the impact
4. **`.gsd-t/contracts/`** — If contract violations or needed updates were found, flag them clearly in the contracts (mark as "PENDING UPDATE")
5. **`.gsd-t/techdebt.md`** — If the analysis uncovered new debt or risk areas, add them

### Skip what's not affected.

## Step 6.6: Test Verification

Validate the test landscape before recommending proceed/block:

1. **Run existing tests**: Execute the full test suite to establish current state
2. **Verify passing**: Confirm what passes today — any pre-existing failures should be noted in the impact report
3. **Map test impact**: For each planned change in Step 2, identify which tests will need updating — include this in the "Test Impact" section of the report

## Step 7: Decision Gate

### If PROCEED:
"✅ Impact analysis complete. No blocking issues found. Ready for execution."
- Continue to execute phase (if auto-invoked)
- Or report and exit (if standalone)

### If PROCEED WITH CAUTION:
"⚠️ Impact analysis found {N} items requiring attention:"
- List the yellow items

**Level 3 (Full Auto)**: Log the caution items and auto-advance to execute. Do NOT wait for user input.

**Level 1–2**: "These can be addressed during execution. Proceed?" Wait for user confirmation. If user declines, pause for remediation.

### If BLOCK:
"🛑 Impact analysis found breaking changes that must be addressed first:"
- List the red items
- Generate remediation tasks
- Add tasks to current domain's task list
- "Run `/user:gsd-t-execute` to address these first, then re-run impact analysis."
- Do NOT proceed to execute phase

## Standalone Mode

When run independently (not as part of wave):

```
/user:gsd-t-impact "considering adding user roles to the auth system"
```

1. Ask clarifying questions about the change
2. Run full analysis
3. Produce report
4. Do NOT auto-proceed — just inform

$ARGUMENTS
