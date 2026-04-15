# GSD-T: Integrate — Wire Domains Together

You are the lead agent performing integration work. This phase is ALWAYS single-session — one agent with full context across all domains to handle the seams.

## Model Assignment

Per `.gsd-t/contracts/model-selection-contract.md` v1.0.0.

- **Default**: `sonnet` (`selectModel({phase: "integrate"})`) — integration wiring is routine coordination.
- **Mechanical subroutines** (demote to `haiku`): integration test runners.
- **Red Team**: `opus` — adversarial QA at integration seams always runs at top tier.
- **Escalation**: `/advisor` convention-based fallback from `bin/advisor-integration.js` when a seam reveals a contract gap or security boundary. Never silently downgrade the model or skip Red Team / doc-ripple under context pressure — M35 removed that behavior.

## Per-Spawn Token Bracket (MANDATORY — wrap EVERY Task subagent spawn)

Per `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0. Every Task subagent spawn below **MUST** be wrapped in this token bracket so `.gsd-t/token-metrics.jsonl` gets one record per spawn. This is additive — the existing OBSERVABILITY LOGGING blocks in each spawn site are preserved unmodified alongside this bracket.

**Before each spawn — read starting context tokens:**

```bash
T0_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T0_PCT=$(node -e "try{const tb=require('./bin/token-budget.js');process.stdout.write(String(tb.getSessionStatus('.').pct||0))}catch(_){process.stdout.write('0')}")
```

**After each spawn — record the bracket:**

```bash
T1_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T1_PCT=$(node -e "try{const tb=require('./bin/token-budget.js');process.stdout.write(String(tb.getSessionStatus('.').pct||0))}catch(_){process.stdout.write('0')}")
node -e "require('./bin/token-telemetry.js').recordSpawn({timestamp:new Date().toISOString(),milestone:process.env.GSD_T_MILESTONE||'',command:'gsd-t-integrate',phase:'integrate',step:'${STEP:-}',domain:'${DOMAIN:-}',domain_type:'${DOMAIN_TYPE:-}',task:'${TASK:-}',model:'${MODEL:-sonnet}',duration_s:${DURATION:-0},input_tokens_before:${T0_TOKENS},input_tokens_after:${T1_TOKENS},tokens_consumed:${T1_TOKENS}-${T0_TOKENS},context_window_pct_before:${T0_PCT},context_window_pct_after:${T1_PCT},outcome:'${OUTCOME:-success}',halt_type:${HALT_TYPE:-null},escalated_via_advisor:${ESCALATED_VIA_ADVISOR:-false}})" 2>/dev/null || true
```

The bracket is additive to the existing `.gsd-t/token-log.md` OBSERVABILITY LOGGING rows. Both sinks coexist.

## Step 0: Runway Check (MANDATORY — before any other work in a fresh session)

Count the integration wiring seams in `.gsd-t/contracts/integration-points.md` as `remaining_tasks` (conservative estimate = integration-points section count). Then run via Bash:

```bash
node -e "
const r = require('./bin/runway-estimator.js').estimateRunway({
  command: 'gsd-t-integrate',
  domain_type: '',
  remaining_tasks: {N},
  projectDir: '.'
});
console.log(JSON.stringify(r, null, 2));
if (!r.can_start) {
  console.log('⛔ Insufficient runway — projected ' + r.projected_end_pct + '% (current ' + r.current_pct + '%, ' + r.pct_per_task + '%/task, ' + r.confidence + ' confidence, ' + r.confidence_basis + ' records)');
  console.log('Auto-spawning headless to continue in a fresh context.');
  const s = require('./bin/headless-auto-spawn.js').autoSpawnHeadless({
    command: 'gsd-t-integrate', args: [], continue_from: '.'
  });
  console.log('Session ID: ' + s.id);
  console.log('Status: tail ' + s.logPath);
  console.log('');
  console.log('Your interactive session remains idle — you can use it for other work.');
  console.log('You will be notified when the headless run completes.');
  process.exit(0);
}
"
```

If `can_start === false`, the headless continuation has been spawned and the interactive session must stop here. Do NOT proceed to Step 1.

**Contract**: `.gsd-t/contracts/runway-estimator-contract.md` v1.0.0; stop threshold (85%) mirrors `.gsd-t/contracts/token-budget-contract.md` v3.0.0.

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
`GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t; STACKS_DIR="$GSD_T_DIR/templates/stacks"; STACK_RULES=""; if [ -d "$STACKS_DIR" ]; then for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(cat "$f")"$'\n\n'; done; if [ -f "package.json" ]; then grep -q '"react"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react.md")"$'\n\n'; (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/typescript.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/node-api.md")"$'\n\n'; fi; [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/python.md")"$'\n\n'; [ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/go.md")"$'\n\n'; [ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rust.md")"$'\n\n'; ([ -f ".gsd-t/contracts/design-contract.md" ] || [ -f "design-tokens.json" ] || [ -d "design-tokens" ] || [ -f ".figmarc" ] || [ -f "figma.config.json" ] || grep -q '"figma"' ~/.claude/settings.json 2>/dev/null) && [ -f "$STACKS_DIR/design-to-code.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/design-to-code.md")"$'\n\n'; fi`

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

**QA Calibration Injection** — Before spawning QA, check for known weak spots:

Run via Bash:
`node -e "const qc = require('./bin/qa-calibrator.js'); const inj = qc.generateQAInjection('.'); if(inj) process.stdout.write(inj);" 2>/dev/null`

If the command produces output (non-empty), store it as `QA_INJECTION` and prepend it to the QA subagent prompt below. If the file doesn't exist or produces no output, skip silently.

Spawn a QA subagent via the Task tool to verify contract compliance at all domain boundaries:

```
Task subagent (general-purpose, model: sonnet):
"{QA_INJECTION — if non-empty, insert here as a preamble section before the instructions below}
Run contract compliance tests for this integration. Read .gsd-t/contracts/ for all contract definitions.
Test every domain boundary: verify that producers and consumers match their contract shapes.
Run ALL configured test suites — detect and run every one:
a. Unit tests (vitest/jest/mocha): run the full suite
b. E2E tests: check for playwright.config.* or cypress.config.* — if found, run the FULL E2E suite
c. NEVER skip E2E when a config file exists. Running only unit tests is a QA FAILURE.
d. AUDIT E2E test quality: Review each Playwright spec — if any test only checks element existence
   (isVisible, toBeAttached, toBeEnabled) without verifying functional behavior (state changes,
   data loaded, content updated after actions), flag it as 'SHALLOW TEST — needs functional assertions'.
Report: 'Unit: X/Y pass | E2E: X/Y pass (or N/A if no config) | Boundary: pass/fail by contract | Shallow tests: N'

## Exploratory Testing (if Playwright MCP available)

After all scripted tests pass:
1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
2. If available: spend 3 minutes on interactive exploration using Playwright MCP
   - Try variations of happy paths with unexpected inputs
   - Probe for race conditions, double-submits, empty states
   - Test accessibility (keyboard navigation, screen reader flow)
3. Tag all findings [EXPLORATORY] in your report and append to .gsd-t/qa-issues.md with [EXPLORATORY] prefix
4. If Playwright MCP is not available: skip this section silently
Note: Exploratory findings do NOT count against the scripted test pass/fail ratio."
```

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`
After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-integrate | Step 5 | haiku | {DURATION}s | {pass/fail}, {N} boundaries tested | | | {CTX_PCT} |`
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

After integration tests pass, spawn an adversarial Red Team agent on the integrated system. Success is measured by bugs found, not tests passed.

⚙ [opus] Red Team → adversarial validation of integrated system

Resolve the templated prompt path via Bash:
```
RT_PROMPT="$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t/templates/prompts/red-team-subagent.md"
[ -f "$RT_PROMPT" ] || RT_PROMPT="templates/prompts/red-team-subagent.md"
T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")
```

Spawn Task subagent (general-purpose, model: opus):
> "Read `$RT_PROMPT` and follow it. Context: cross-domain integration run. **Additional category for this run: Cross-Domain Boundaries** — test data flow across every domain boundary; does data arriving from domain A get validated by domain B; what happens when A sends malformed data that passed A's own validation. Write findings to `.gsd-t/red-team-report.md`."

After subagent returns — run via Bash:
```
T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))
CTX_PCT=$(node -e "try{const tb=require('./bin/token-budget.js'); process.stdout.write(String(tb.getSessionStatus('.').pct))}catch(_){process.stdout.write('N/A')}")
```
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-integrate | Red Team | opus | {DURATION}s | {VERDICT} — {N} bugs found | | | {CTX_PCT} |`

**If FAIL:** fix CRITICAL/HIGH bugs (≤2 cycles) → re-run. Persistent bugs → `.gsd-t/deferred-items.md`.
**If GRUDGING PASS:** proceed to doc-ripple.

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
