# GSD-T: Impact — Downstream Effect Analysis

You are analyzing the downstream effects of planned changes before execution. Your job is to identify what might break, what needs updating, and what risks exist.

This command is:
- **Auto-invoked** between plan and execute phases in `/gsd-t-wave`
- **Standalone** when user wants to evaluate potential changes

## Step 1: Load Context

Read:
1. `CLAUDE.md` — project conventions
2. `.gsd-t/progress.md` — current state
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/domains/{current}/tasks.md` — planned changes

If run standalone, ask: "What changes are you considering?"

<!-- M56-D3: brief wire-in -->
**M56 Context-Brief (surfaces git diff + integration-points excerpt without re-walking the repo):**

```bash
SPAWN_ID="impact-${MILESTONE:-default}-$(date -u +%Y%m%dT%H%M%SZ)"
gsd-t brief --kind impact --spawn-id "${SPAWN_ID}" --out ".gsd-t/briefs/${SPAWN_ID}.json" || true
export BRIEF_PATH=".gsd-t/briefs/${SPAWN_ID}.json"
```

The `impact` brief includes `gitDiffSummary`, `changedFiles[]`, and the milestone's `integrationPointsExcerpt` so downstream workers can scan blast radius without re-reading the contract dir.
<!-- /M56-D3: brief wire-in -->

## Step 2: Identify Changed Files

From the plan or user description, list:
- Files to be created
- Files to be modified
- Files to be deleted
- Functions/classes/endpoints being changed

## Step 2.5: Graph-Enhanced Analysis (if available)

Check if a graph index exists: read `.gsd-t/graph/meta.json`. If it exists:

```
For each changed file/function, query the graph:
1. query('getCallers', { entity: '{function_name}' })         → all direct callers
2. query('getTransitiveCallers', { entity: '{name}', depth: 5 }) → full caller chain
3. query('getDomainOwner', { entity: '{name}' })               → which domain owns this
4. query('getContractFor', { entity: '{name}' })               → which contract it implements
5. query('getSurfaceConsumers', { entity: '{name}' })          → which surfaces consume it
6. query('getDomainBoundaryViolations', {})                    → cross-domain access issues
```

Use graph results to build a **complete blast radius** that includes transitive callers, contract violations, and cross-surface impact. This replaces the grep-based search in Step 3A when available but grep remains the fallback when no graph exists.

## Step 3: Trace Dependencies

For each changed file/function:

### A) Who Calls This?

**If graph available** (Step 2.5): use graph results — they include transitive callers that grep misses.

**If no graph** (fallback):
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

### D) New Consumer Analysis

**Trigger**: Run this section when the planned change adds a new client surface (web app, mobile app, CLI, external API, admin panel, etc.) that will consume the existing backend.

If no new consumer surface is being added, skip this section.

**Step 1 — List what the new consumer needs:**
```
Operations the new consumer requires:
- {operation-name}: {brief description}
- {operation-name}: {brief description}
```

**Step 2 — Compare against existing backend operations:**
```bash
# Search for existing implementations of each needed operation
grep -r "{operation-name}" src/
grep -r "{operation-name}" commands/
```

**Step 3 — Classify each needed operation:**

| Operation | Classification | Action |
|-----------|---------------|--------|
| {op} | REUSE — identical operation exists | Call existing endpoint/function |
| {op} | EXTEND — similar operation exists, needs a variant | Add param or thin adapter |
| {op} | DUPLICATE — new endpoint would replicate existing logic | 🔴 Must route through shared layer |
| {op} | NEW — no equivalent exists | Build new, consider SharedCore placement |

**DUPLICATE items become 🔴 Breaking Changes** in Step 4 — they block execution until the shared layer is designed. Add them to the impact report under "Breaking Changes" with:
- Required Action: "Extract `{operation}` to shared-core domain; {new-consumer} and {existing-consumer} both call it from there."

### E) Test Coverage
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

## Step 7: Document Ripple

After producing the impact report, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Log the impact analysis in the Decision Log with date and key findings

### Check if affected:
2. **`docs/architecture.md`** — If the analysis revealed architectural concerns or proposed changes, document them
3. **`docs/requirements.md`** — If the analysis found requirements that would be affected by the planned changes, note the impact
4. **`.gsd-t/contracts/`** — If contract violations or needed updates were found, flag them clearly in the contracts (mark as "PENDING UPDATE")
5. **`.gsd-t/techdebt.md`** — If the analysis uncovered new debt or risk areas, add them

### Skip what's not affected.

## Step 8: Test Verification

Validate the test landscape before recommending proceed/block:

1. **Run existing tests**: Execute the full test suite to establish current state
2. **Verify passing**: Confirm what passes today — any pre-existing failures should be noted in the impact report
3. **Map test impact**: For each planned change in Step 2, identify which tests will need updating — include this in the "Test Impact" section of the report

## Step 9: Decision Gate

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
- "Run `/gsd-t-execute` to address these first, then re-run impact analysis."
- Do NOT proceed to execute phase

## Standalone Mode

When run independently (not as part of wave):

```
/gsd-t-impact "considering adding user roles to the auth system"
```

1. Ask clarifying questions about the change
2. Run full analysis
3. Produce report
4. Do NOT auto-proceed — just inform

### Autonomy Behavior

**Level 3 (Full Auto)**: If PROCEED or PROCEED WITH CAUTION, log findings and auto-advance to execute phase. If BLOCK, stop and report breaking changes to user — do NOT auto-advance. When run standalone, always report and exit without auto-proceeding.

**Level 1–2**: Present the full impact report. Wait for user confirmation before proceeding (PROCEED) or pause for remediation (BLOCK). For PROCEED WITH CAUTION, ask "These can be addressed during execution. Proceed?"

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
