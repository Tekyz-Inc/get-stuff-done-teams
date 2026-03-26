# GSD-T: Integrate — Wire Domains Together

You are the lead agent performing integration work. This phase is ALWAYS single-session — one agent with full context across all domains to handle the seams.

## Step 1: Load Full State

Read everything:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all contracts (this is your source of truth)
4. `.gsd-t/contracts/integration-points.md` — all connection points
5. `.gsd-t/domains/*/scope.md` — understand boundaries
6. All source code produced during execution

## Step 1.5: Graph-Enhanced Integration Validation

If `.gsd-t/graph/meta.json` exists (graph index is available):
1. Query `getDomainBoundaryViolations` to validate that cross-domain wiring matches contracts — flag any code that crosses boundaries without a contract
2. Query `getCallers` and `getCallees` across domain boundaries to verify all integration points are accounted for in `integration-points.md`
3. Add any unregistered cross-domain calls to the audit findings in Step 2

If graph is not available, skip this step.

## Step 2: Contract Compliance Audit

Before wiring anything together, verify each domain honored its contracts:

For each contract file:
1. Read the contract specification
2. Find the implementing code
3. Verify exact compliance:
   - Types/shapes match?
   - Endpoint signatures match?
   - Error responses match?
   - Schema matches?
4. Log findings:

```markdown
## Contract Audit — {date}

### api-contract.md
- POST /api/auth/login: ✅ matches
- GET /api/users/:id: ⚠️ response missing `role` field
  - Fix: Update auth/userController.js to include role

### schema-contract.md  
- Users table: ✅ matches
- Sessions table: ✅ matches
```

Fix any mismatches BEFORE proceeding to integration.

## Step 2.5: Worktree Merge Status Check

Before wiring integration points, check whether team mode execution left any domains with rolled-back worktree merges:

1. Read `.gsd-t/progress.md` — look for `[rollback]` entries in the Decision Log from the execute phase
2. If any domains were rolled back: list them and their failure reasons before proceeding
3. Integration point wiring should only proceed for domains whose worktree merges PASSED — rolled-back domains are not yet in the main working tree

If rolled-back domains exist, report them to the user (or if Level 3: log to `.gsd-t/deferred-items.md` as `[integration-gap] {domain}: not yet merged — worktree rollback during execute`). Do NOT attempt to re-merge rolled-back domains here; that requires re-running execute for the affected domain.

## Step 3: Wire Integration Points

**Stack Rules Detection (before spawning subagent):**
Run via Bash to detect project stack and collect matching rules:
`GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t; STACKS_DIR="$GSD_T_DIR/templates/stacks"; STACK_RULES=""; if [ -d "$STACKS_DIR" ]; then for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(cat "$f")"$'\n\n'; done; if [ -f "package.json" ]; then grep -q '"react"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react.md")"$'\n\n'; (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/typescript.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/node-api.md")"$'\n\n'; fi; [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/python.md")"$'\n\n'; [ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/go.md")"$'\n\n'; [ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rust.md")"$'\n\n'; fi`

If STACK_RULES is non-empty, append to the subagent prompt:
```
## Stack Rules (MANDATORY — violations fail this task)

{STACK_RULES}

These standards have the same enforcement weight as contract compliance.
Violations are task failures, not warnings.
```

If STACK_RULES is empty (no templates/stacks/ dir or no matches), skip silently.

Work through each integration point in `integration-points.md`. If integration work spans multiple domains with independent tasks, use the **task-level dispatch pattern** (per fresh-dispatch-contract.md): spawn one Task subagent per integration task, passing only the relevant contracts, the specific integration point to wire, and summaries from prior integration tasks (max 5, 10-20 lines each). This prevents context accumulation across integration tasks.

**Multi-domain integration merging**: If integration work itself requires merging domain outputs that weren't merged during execute (e.g., domains executed in separate waves and integration needs to combine them), use the Sequential Merge Protocol from `.gsd-t/contracts/worktree-isolation-contract.md`:
1. Sort domains by dependency order (from integration-points.md)
2. Merge domain A's branch → run tests → merge domain B's branch → run tests
3. If tests fail after a merge, roll back that domain's merge and log the failure
4. Contract validation runs between merges
5. All temporary branches cleaned up after integration completes

For each connection:
1. Identify the producing domain (provides the interface)
2. Identify the consuming domain (calls the interface)
3. Write or verify the glue code:
   - Import statements
   - Configuration (env vars, connection strings)
   - Middleware chains
   - Route registration
   - Dependency injection
4. Ensure error handling flows across the boundary correctly

### Common integration tasks:
- **API → UI**: Verify fetch calls match endpoint signatures
- **Auth → Routes**: Wire middleware into route definitions
- **Data layer → Services**: Connect repositories/models to service layer
- **Config**: Ensure shared config (env vars, constants) is consistent

## Step 4: End-to-End Smoke Test

Run through the primary user flows:
1. Identify the 3-5 most critical paths from requirements
2. Trace each path through all domain boundaries
3. Run or manually verify each path works
4. Document results:

```markdown
## Smoke Test Results

### Flow: User Login
1. UI → POST /api/auth/login ✅
2. Auth → Users table lookup ✅
3. Auth → JWT generation ✅
4. Auth → Response to UI ✅
5. UI → Store token, redirect ✅
Result: PASS

### Flow: Protected Resource Access
1. UI → GET /api/data with token ✅
2. Auth middleware → verify token ✅
3. Data layer → query ⚠️ — missing pagination
Result: PARTIAL — needs pagination contract addition
```

## Step 5: Contract Compliance Testing

Spawn a QA subagent via the Task tool to verify contract compliance at all domain boundaries:

```
Task subagent (general-purpose, model: haiku):
"Run contract compliance tests for this integration. Read .gsd-t/contracts/ for all contract definitions.
Test every domain boundary: verify that producers and consumers match their contract shapes.
Run ALL configured test suites — detect and run every one:
a. Unit tests (vitest/jest/mocha): run the full suite
b. E2E tests: check for playwright.config.* or cypress.config.* — if found, run the FULL E2E suite
c. NEVER skip E2E when a config file exists. Running only unit tests is a QA FAILURE.
d. AUDIT E2E test quality: Review each Playwright spec — if any test only checks element existence
   (isVisible, toBeAttached, toBeEnabled) without verifying functional behavior (state changes,
   data loaded, content updated after actions), flag it as 'SHALLOW TEST — needs functional assertions'.
Report: 'Unit: X/Y pass | E2E: X/Y pass (or N/A if no config) | Boundary: pass/fail by contract | Shallow tests: N'"
```

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`
After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Compute context utilization — run via Bash:
`if [ "${CLAUDE_CONTEXT_TOKENS_MAX:-0}" -gt 0 ]; then CTX_PCT=$(echo "scale=1; ${CLAUDE_CONTEXT_TOKENS_USED:-0} * 100 / ${CLAUDE_CONTEXT_TOKENS_MAX}" | bc); else CTX_PCT="N/A"; fi`
Alert on context thresholds (display to user inline):
- If CTX_PCT >= 85: `echo "🔴 CRITICAL: Context at ${CTX_PCT}% — compaction likely. Task MUST be split."`
- If CTX_PCT >= 70: `echo "⚠️ WARNING: Context at ${CTX_PCT}% — approaching compaction threshold. Consider splitting in plan."`
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-integrate | Step 5 | haiku | {DURATION}s | {pass/fail}, {N} boundaries tested | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`
If QA found issues, append each to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {DT_START} | gsd-t-integrate | Step 5 | haiku | {DURATION}s | {severity} | {finding} |`

QA failure blocks integration completion.

## Step 6: Document Ripple

Integration is where the real system takes shape. Verify documentation matches reality:

### Always update:
1. **`.gsd-t/progress.md`** — Log integration results, contract audit findings, smoke test outcomes

### Check if affected:
2. **`docs/architecture.md`** — Now that domains are wired together, does the documented architecture match the actual data flow, component relationships, and integration patterns? Update it
3. **`docs/requirements.md`** — Did integration reveal missing requirements or invalidate existing ones? Update it
4. **`docs/schema.md`** — Does the documented schema match the actual database state? Update it
5. **`CLAUDE.md`** — Did integration establish new conventions (error handling patterns, middleware chains, configuration approaches) that future work should follow? Add them
6. **`.gsd-t/techdebt.md`** — Did integration reveal new debt (workarounds, temporary glue code, known shortcuts)? Add TD items

### Skip what's not affected.

## Step 7: Test Verification

After integration and doc ripple, verify everything works together:

1. **Update tests**: Add or update integration tests for newly wired domain boundaries
2. **Run ALL configured test suites** — detect and run every one:
   a. Unit/integration tests (vitest/jest/mocha)
   b. If `playwright.config.*` exists → run `npx playwright test` (full suite, not just affected specs)
   c. Unit tests alone are NEVER sufficient when E2E exists
   d. Report: "Unit: X/Y pass | E2E: X/Y pass"
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **Functional test quality**: Spot-check E2E specs — every assertion must verify functional behavior (state changed, data loaded, content updated after action), not just element existence. Shallow tests that would pass on an empty HTML page are not acceptable.
5. **Smoke test results**: Ensure the Step 4 smoke test results are still valid after any fixes

## Step 7.5: Red Team — Adversarial QA (MANDATORY)

After integration tests pass, spawn an adversarial Red Team agent. This agent's sole purpose is to BREAK the integrated system. Its success is measured by bugs found, not tests passed.

⚙ [{model}] Red Team → adversarial validation of integrated system

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: sonnet):
"You are a Red Team QA adversary. Your job is to BREAK the integrated system.

Your value is measured by REAL bugs found. More bugs = more value.
If you find zero bugs, you must prove you were thorough — list every
attack vector you tried and why it didn't break. A short list means
you didn't try hard enough.

Rules:
- False positives DESTROY your credibility. If you report something
  as a bug and it's actually correct behavior, that's worse than
  missing a real bug. Never report something you haven't reproduced.
- Style opinions are not bugs. Theoretical concerns are not bugs.
  A bug is: 'I did X, expected Y, got Z.' With proof.
- You are done ONLY when you have exhausted every category below
  and either found a bug or documented exactly what you tried.

## Attack Categories (exhaust ALL of these)

1. **Contract Violations**: Read .gsd-t/contracts/. Does the code EXACTLY
   match every contract? Test each endpoint/interface/schema shape.
2. **Boundary Inputs**: Empty strings, null, undefined, huge payloads,
   special characters, SQL injection attempts, XSS payloads, path traversal.
3. **State Transitions**: What happens when actions are performed out of
   order? Double-submit? Concurrent access? Refresh mid-flow?
4. **Error Paths**: Remove env vars. Kill the database. Send malformed
   requests. Does the code handle failures gracefully or crash?
5. **Missing Flows**: Read docs/requirements.md. Are there user flows that
   exist in requirements but have NO test coverage? Write tests for them.
6. **Regression**: Run the FULL test suite. Did any existing tests break?
7. **E2E Functional Gaps**: Review ALL Playwright specs. Do they test actual
   behavior (state changes, data loaded, navigation works) or just check
   that elements exist? Flag and rewrite any shallow/layout tests.
8. **Cross-Domain Boundaries**: Test data flow across EVERY domain boundary.
   Does data arriving from domain A get validated by domain B? What happens
   when domain A sends malformed data that passed A's own validation?

## Report Format

For each bug found:
- **BUG-{N}**: {severity: CRITICAL/HIGH/MEDIUM/LOW}
  - **Reproduction**: {exact steps to reproduce}
  - **Expected**: {what should happen}
  - **Actual**: {what actually happens}
  - **Proof**: {test file or command that demonstrates the bug}

Summary:
- BUGS FOUND: {count} (with severity breakdown)
- COVERAGE GAPS: {untested flows from requirements}
- SHALLOW TESTS REWRITTEN: {count}
- CONTRACTS VERIFIED: {N}/{total}
- ATTACK VECTORS TRIED: {list every category attempted and results}
- VERDICT: FAIL ({N} bugs found) | GRUDGING PASS (exhaustive search, nothing found)

Write all findings to .gsd-t/red-team-report.md.
If bugs found, also append to .gsd-t/qa-issues.md."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-integrate | Red Team | sonnet | {DURATION}s | {VERDICT} — {N} bugs found | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`

**If Red Team VERDICT is FAIL:**
1. Fix all CRITICAL and HIGH bugs immediately (up to 2 fix attempts per bug)
2. Re-run Red Team after fixes
3. If bugs persist after 2 fix cycles, log to `.gsd-t/deferred-items.md` and present to user

**If Red Team VERDICT is GRUDGING PASS:** Proceed to doc-ripple.

## Step 8: Doc-Ripple (Automated)

After all integration work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent:

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: integrate
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline

## Step 9: Handle Integration Issues

For each issue found:
1. Determine if it's a contract gap (missing specification) or implementation bug
2. **Contract gap**: Update the contract, create a follow-up task
3. **Implementation bug**: Fix it directly, document the fix
4. Log everything in progress.md

## Step 10: Update State

Update `.gsd-t/progress.md`:
- Set status to `INTEGRATED`
- Add contract audit results
- Add smoke test results
- List any new tasks created for gaps

Commit: `[integration] Wire domains together — all contracts verified`

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Integrate complete — all domain boundaries wired, {N} contracts verified") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report integration results and recommend proceeding to verify phase. Wait for confirmation.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
