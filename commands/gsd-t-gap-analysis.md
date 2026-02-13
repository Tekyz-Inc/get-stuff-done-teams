# GSD-T: Gap Analysis — Requirements vs. Existing Code

You are performing a gap analysis between a provided specification and the existing codebase. The user pastes requirements or a spec, and you systematically identify what's done, what's partial, what's wrong, and what's missing.

## Step 1: Load Context

Read (if they exist):
1. `CLAUDE.md` — project context
2. `.gsd-t/progress.md` — current state
3. `docs/requirements.md` — existing requirements
4. `docs/architecture.md` — system structure

## Step 2: Parse Requirements

Break the provided spec into numbered discrete requirements. Each requirement should be:
- **Atomic** — one testable behavior or capability per item
- **Clear** — unambiguous language
- **Categorized** — group related items under section headers

Present the breakdown:

```
## Parsed Requirements

### {Section 1}
R1. {Discrete requirement}
R2. {Discrete requirement}

### {Section 2}
R3. {Discrete requirement}
...
```

For large specs, show progress: "Analyzing section {N} of {total}: {section name}..."

## Step 3: Clarification Check

Review each requirement for ambiguity. If any are unclear:

- At **Level 3 (Full Auto)**: Proceed with reasonable assumptions. Flag each assumption in the gap analysis with `[ASSUMED: {assumption}]`
- At **Level 1 or 2**: Present the ambiguous items and ask for clarification before proceeding

```
⚠ {N} requirements need clarification:
  R{X}: "{requirement}" — {what's unclear}
  R{Y}: "{requirement}" — {what's unclear}

Discuss now or proceed with assumptions?
```

## Step 4: System Scan

Scan the existing codebase to understand current state. Read:
- Source files relevant to each requirement
- Test files for coverage evidence
- Configuration and schema files
- Existing contracts in `.gsd-t/contracts/`
- Documentation in `docs/`

Build an understanding of what exists before classifying.

## Step 5: Gap Classification

For each requirement, classify with evidence:

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| **Implemented** | Code exists and fully matches the requirement | None — verify with tests |
| **Partial** | Some code exists but incomplete | Finish implementation |
| **Incorrect** | Code exists but doesn't match the requirement | Fix implementation |
| **Not Implemented** | No code exists for this requirement | Build from scratch |

Assign severity to gaps:

| Severity | Criteria |
|----------|----------|
| **Critical** | Incorrect implementation — existing code actively contradicts the requirement |
| **High** | Partial implementation — core functionality exists but key pieces are missing |
| **Medium** | Not implemented — required but no code exists yet |
| **Low** | Not implemented — nice-to-have or can be deferred |

## Step 6: Generate Gap Analysis Document

Create `.gsd-t/gap-analysis.md`:

```markdown
# Gap Analysis

## Project: {project name}
## Date: {date}
## Spec Source: {brief description of the provided spec}

## Requirements Breakdown

### {Section 1}
| ID | Requirement | Status | Severity | Evidence |
|----|-------------|--------|----------|----------|
| R1 | {requirement} | Implemented | — | `src/auth/login.ts:45` handles email login |
| R2 | {requirement} | Partial | High | `src/auth/login.ts` has login but no password reset flow |
| R3 | {requirement} | Incorrect | Critical | `src/auth/session.ts:20` uses localStorage instead of httpOnly cookies |
| R4 | {requirement} | Not Implemented | Medium | No code found for this feature |

### {Section 2}
| ID | Requirement | Status | Severity | Evidence |
|----|-------------|--------|----------|----------|
...

## Summary

| Status | Count | % |
|--------|-------|---|
| Implemented | {n} | {%} |
| Partial | {n} | {%} |
| Incorrect | {n} | {%} |
| Not Implemented | {n} | {%} |
| **Total** | **{n}** | **100%** |

## Assumptions Made
- R{X}: {assumption made during analysis}
- R{Y}: {assumption made during analysis}

## Recommended Actions

### Milestone: {recommended name}
- R{X}: {brief description} (Severity: {level})
- R{Y}: {brief description} (Severity: {level})

### Feature: {recommended name}
- R{X}: {brief description} (Severity: {level})

### Quick Fixes
- R{X}: {brief description} (Severity: {level})
```

## Step 7: Merge to Requirements (Optional)

After generating the gap analysis, offer:

```
Gap analysis complete: {implemented}/{total} requirements met ({%}%).
{critical} critical, {high} high, {medium} medium, {low} low severity gaps.

Merge parsed requirements into docs/requirements.md? (Y/N)
```

If yes, merge the discrete requirements into `docs/requirements.md`, marking each with its current status.

## Step 8: Present Promotion Options

Show the recommended groupings and offer promotion paths:

```
## Recommended Next Steps

1. {Milestone name} — {N} gaps ({critical} critical, {high} high)
   → /user:gsd-t-milestone "{name}"

2. {Feature name} — {N} gaps
   → /user:gsd-t-feature "{name}"

3. Quick fixes — {N} items
   → /user:gsd-t-quick "{description}"

Promote any of these now, or review the gap analysis first?
```

At **Level 3**: Present the recommendations and wait for user direction. Do NOT auto-promote — the user decides which gaps to act on.

## Step 9: Re-run Support

If `.gsd-t/gap-analysis.md` already exists from a previous run:

1. Read the previous gap analysis
2. After generating the new one, produce a diff summary:

```
## Changes Since Last Analysis ({previous date})

### Resolved (were gaps, now implemented)
- R{X}: {requirement}

### New Gaps (not in previous analysis)
- R{X}: {requirement} — {status}

### Changed Status
- R{X}: {status before} → {status now}

### Unchanged Gaps
- {N} gaps remain from previous analysis
```

## Document Ripple

After generating the gap analysis, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Log the gap analysis in the Decision Log with date and summary stats

### Check if affected:
2. **`docs/requirements.md`** — If user approved merge in Step 7
3. **`.gsd-t/techdebt.md`** — If incorrect implementations were found, add them as tech debt items

$ARGUMENTS
