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

## Step 2: Full Test Audit (Inline)

Run the full test audit directly:

1. Run the full test suite: `npm test` (or project equivalent) — record pass/fail counts
2. Read all contracts in `.gsd-t/contracts/` — verify each has at least one test validating it
3. Check acceptance criteria from domain task lists — verify each is tested
4. Run E2E suite if `playwright.config.*` exists
5. Report: comprehensive test results with pass/fail counts and coverage gaps

Verification cannot complete if any test fails or critical contract gaps remain.

## Step 2.5: High-Risk Domain Gate (MANDATORY — Categories 2 and 7)

Before running standard verification dimensions, check whether this milestone involves any high-risk domain:

**High-risk domains**: audio capture/playback, GPU/WebGPU/WebGL, ML/inference/model loading, background workers, native APIs (camera, bluetooth, filesystem), IPC, WebAssembly, real-time data streams.

**If any high-risk domain is present:**

### Category 2 — Technology Reliability Gate
Initialization success does not prove runtime correctness. These technologies can initialize cleanly and fail silently at runtime (compute shader errors, audio context state loss, worker message drops, inference failures).

For each high-risk domain:
1. A **smoke test script** must exist that exercises actual runtime behavior — not just initialization
2. The smoke test must have been run and passed
3. "It initialized without throwing" is NOT a passing smoke test
4. If no smoke test exists → create one now before proceeding with any other verification dimension
5. Smoke test failure → verification FAIL (not WARN)

### Category 7 — Manual QA as Test Gate
"The user will manually test it" is not a test artifact. Scan the milestone's domains for any feature whose acceptance criteria relies solely on manual user testing.

For each such feature:
1. A smoke test script must exist that automates as much of the verification as possible
2. Any remaining manual steps must be explicitly documented in `.gsd-t/smoke-tests/{feature}.md` with exact steps and expected outcomes
3. The documented manual steps must have been executed and passed (noted in the file)
4. If neither automated smoke test nor documented manual procedure exists → verification FAIL

> These gates exist because the pre-commit checklist "did you run the affected tests?" is meaningless when the only test is "user presses Ctrl+Space." That is not a test. It is hope.

---

## Step 3: Define Verification Dimensions

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
8. **Requirements Traceability Close-Out**: Mark verified requirements as complete and report orphans:
   - Read `docs/requirements.md` traceability table (added by plan phase)
   - For each REQ-ID that is fully implemented and tested: update Status to `complete` in the traceability table
   - **Orphan report**: List any REQ-IDs with no task mapping (planning gap) and any tasks with no REQ-ID (potential scope creep)
   - Orphaned requirements = WARN (not blocking unless critical)
   - Update `docs/requirements.md` with the close-out results

## Step 4: Execute Verification

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

Lead: After receiving teammate reports:
**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`
Spawn a Task subagent to run the full test suite and contract audit.
After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-verify | Step 4 | haiku | {DURATION}s | test audit + contract review | {TOKENS} | {COMPACTED} |`
Collect all reports, synthesize, create remediation plan.
```

## Step 5: Compile Verification Report

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

## Step 6: Handle Remediation

If there are CRITICAL findings:
1. Create remediation tasks in the affected domain's `tasks.md`
2. Execute fixes (solo — don't spawn teams for remediation)
3. Re-verify the specific findings
4. Update the verification report

## Step 7: Update State

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

## Document Ripple

### Always update:
1. **`.gsd-t/progress.md`** — Set status to VERIFIED/VERIFY-FAILED, log verification summary
2. **`.gsd-t/verify-report.md`** — Created with full verification results (Step 4)

### Check if affected:
3. **`.gsd-t/domains/{domain}/tasks.md`** — If remediation tasks were created (Step 5)
4. **`.gsd-t/techdebt.md`** — If verification found new quality or security issues, add as debt
5. **`docs/requirements.md`** — If verification revealed unmet requirements, update status

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
