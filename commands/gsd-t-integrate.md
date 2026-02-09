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

## Step 3: Wire Integration Points

Work through each integration point in `integration-points.md`:

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

## Step 5: Document Ripple

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

## Step 5.5: Test Verification

After integration and doc ripple, verify everything works together:

1. **Update tests**: Add or update integration tests for newly wired domain boundaries
2. **Run all tests**: Execute the full test suite — integration often introduces cross-domain failures
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **Run E2E tests**: If an E2E framework exists, run the full E2E suite — integration is where end-to-end flows break
5. **Smoke test results**: Ensure the Step 4 smoke test results are still valid after any fixes

## Step 6: Handle Integration Issues

For each issue found:
1. Determine if it's a contract gap (missing specification) or implementation bug
2. **Contract gap**: Update the contract, create a follow-up task
3. **Implementation bug**: Fix it directly, document the fix
4. Log everything in progress.md

## Step 7: Update State

Update `.gsd-t/progress.md`:
- Set status to `INTEGRATED`
- Add contract audit results
- Add smoke test results
- List any new tasks created for gaps
- Recommend: proceed to verify phase

Commit: `[integration] Wire domains together — all contracts verified`

$ARGUMENTS
