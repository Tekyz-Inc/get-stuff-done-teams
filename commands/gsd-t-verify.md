# GSD-T: Verify — Quality Gates (Solo or Parallel)

You are the lead agent coordinating verification of the completed work. Each verification dimension should be thorough and independent.

## Step 1: Load State

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md` — confirm status is INTEGRATED
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/domains/*/tasks.md` — all acceptance criteria
5. `docs/requirements.md` — original requirements
6. All source code

## Step 2: Define Verification Dimensions

Standard dimensions (adjust based on project):

1. **Functional Correctness**: Does it work per requirements?
2. **Contract Compliance**: Does every domain honor its contracts?
3. **Code Quality**: Conventions, patterns, error handling, readability
4. **Test Coverage Completeness**: Every new or changed code path MUST have tests. Check:
   - Do all new functions have unit tests (happy path + edge cases + error cases)?
   - Do all new features/modes/flows have Playwright E2E specs?
   - Do all new UI components have interaction tests?
   - **Zero test coverage on new functionality = FAIL** (not WARN, not "nice to have" — FAIL)
5. **E2E Tests**: Run the FULL Playwright suite — all specs must pass. If new features lack specs, create them before proceeding.
6. **Security**: Auth flows, input validation, data exposure, dependencies
7. **Integration Integrity**: Do the seams between domains hold under stress?

## Step 3: Execute Verification

### Solo Mode (default)
Work through each dimension sequentially. For each:
1. Define what you're checking
2. Check it systematically
3. Record findings as PASS / WARN / FAIL with specifics
4. If FAIL, create a remediation task

**Mandatory test execution:**
1. Run ALL unit/integration tests — every test must pass
2. Detect Playwright (check for `playwright.config.*`, Playwright deps in package.json)
3. Run the FULL Playwright E2E suite — every spec must pass
4. **Coverage audit**: For every new feature, mode, page, or flow added in this milestone:
   - Confirm Playwright specs exist that specifically test it
   - Confirm specs cover: happy path, error states, edge cases, all modes/flags
   - If specs are missing or incomplete → invoke `gsd-t-test-sync` to create them, then re-run
   - **Missing E2E coverage on new functionality = verification FAIL**
5. Tests are NOT optional — verification cannot pass without running them and confirming comprehensive coverage

### Team Mode (when agent teams are enabled)
```
Create an agent team for verification:

ALL TEAMMATES read first:
1. CLAUDE.md
2. .gsd-t/contracts/ — all contracts
3. .gsd-t/domains/*/tasks.md — acceptance criteria
4. docs/requirements.md

Teammate assignments:
- Teammate "functional": 
  Verify every acceptance criterion in every domain's tasks.md.
  Test each user flow end-to-end.
  Report: list of criteria with PASS/FAIL status.

- Teammate "contracts":
  For each contract in .gsd-t/contracts/:
  Verify the implementing code matches exactly.
  Check types, shapes, error handling, edge cases.
  Report: contract-by-contract compliance status.

- Teammate "quality":
  Review all source code for:
  - Consistency with CLAUDE.md conventions
  - Error handling completeness
  - Code duplication
  - Naming consistency
  - Dead code or TODOs
  Report: file-by-file findings.

- Teammate "security":
  Review for:
  - Auth bypass possibilities
  - Input validation gaps
  - Data exposure in API responses
  - Dependency vulnerabilities (run audit if applicable)
  - Secret/credential handling
  Report: severity-ranked findings.

Lead: Collect all reports, synthesize, create remediation plan.
```

## Step 4: Compile Verification Report

Create or update `.gsd-t/verify-report.md`:

```markdown
# Verification Report — {date}

## Milestone: {name}

## Summary
- Functional: {PASS/WARN/FAIL} — {X}/{Y} criteria met
- Contracts: {PASS/WARN/FAIL} — {X}/{Y} contracts compliant
- Code Quality: {PASS/WARN/FAIL} — {N} issues found
- Unit Tests: {PASS/WARN/FAIL} — {N}/{total} passing
- E2E Tests: {PASS/WARN/FAIL} — {N}/{total} specs passing
- Security: {PASS/WARN/FAIL} — {N} findings
- Integration: {PASS/WARN/FAIL}

## Overall: {PASS / CONDITIONAL PASS / FAIL}

## Findings

### Critical (must fix before milestone complete)
1. {finding} — {domain} — {remediation}

### Warnings (should fix, not blocking)
1. {finding} — {domain} — {remediation}

### Notes (informational)
1. {observation}

## Remediation Tasks
| # | Domain | Description | Priority |
|---|--------|-------------|----------|
| 1 | auth | Fix missing role in user response | CRITICAL |
| 2 | ui | Add loading states for async calls | WARN |
```

## Step 5: Handle Remediation

If there are CRITICAL findings:
1. Create remediation tasks in the affected domain's `tasks.md`
2. Execute fixes (solo — don't spawn teams for remediation)
3. Re-verify the specific findings
4. Update the verification report

## Step 6: Update State

Update `.gsd-t/progress.md`:
- If all PASS: Set status to `VERIFIED`
- If CONDITIONAL PASS: Set status to `VERIFIED-WITH-WARNINGS`, list warnings
- If FAIL: Set status to `VERIFY-FAILED`, list required remediations
- Record verification date and summary

### Autonomy Behavior

**Level 3 (Full Auto)**:
- VERIFIED → Log "✅ Verify complete — all quality gates passed" and auto-advance to complete-milestone. Do NOT wait for user input.
- CONDITIONAL PASS → Log warnings, treat as VERIFIED, and auto-advance. Do NOT wait for user input.
- FAIL → Auto-execute remediation tasks (up to 2 fix attempts). If still failing after 2 attempts, STOP and report to user.

**Level 1–2**:
- VERIFIED → Milestone complete, proceed to next milestone or ship
- CONDITIONAL PASS → User decides if warnings are acceptable
- FAIL → Return to execute phase for remediation tasks

$ARGUMENTS
