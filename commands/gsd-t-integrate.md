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
Run the full test suite.
Report: boundary-by-boundary test results with pass/fail counts."
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
2. **Run all tests**: Execute the full test suite — integration often introduces cross-domain failures
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **Run E2E tests**: If an E2E framework exists, run the full E2E suite — integration is where end-to-end flows break
5. **Smoke test results**: Ensure the Step 4 smoke test results are still valid after any fixes

## Step 8: Handle Integration Issues

For each issue found:
1. Determine if it's a contract gap (missing specification) or implementation bug
2. **Contract gap**: Update the contract, create a follow-up task
3. **Implementation bug**: Fix it directly, document the fix
4. Log everything in progress.md

## Step 9: Update State

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
