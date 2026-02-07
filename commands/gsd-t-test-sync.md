# GSD-T: Test Sync — Keep Tests Aligned with Code

You are maintaining test coverage as code changes. Your job is to identify stale tests, coverage gaps, and dead tests, then generate tasks to address them.

This command is:
- **Auto-invoked** during execute phase (after each task) and verify phase
- **Standalone** when user wants to audit test health

## Step 1: Load Context

Read:
1. `CLAUDE.md` — testing conventions, test locations
2. `.gsd-t/progress.md` — what just changed
3. `.gsd-t/test-coverage.md` — previous coverage state (if exists)
4. `.gsd-t/domains/{current}/tasks.md` — recent completed tasks

Identify:
- Test framework (pytest, jest, vitest, etc.)
- Test directory structure
- Naming conventions

## Step 2: Map Code to Tests

For each file changed in recent tasks:

### A) Find Existing Tests
```bash
# Common patterns
find tests/ -name "*{module_name}*"
find __tests__/ -name "*{module_name}*"
find . -name "*.test.*" | xargs grep -l "{function_name}"
find . -name "*.spec.*" | xargs grep -l "{class_name}"
```

### B) Build Coverage Map
```
| Source File | Test File(s) | Coverage Status |
|-------------|--------------|-----------------|
| src/auth/login.py | tests/test_login.py | COVERED |
| src/auth/roles.py | (none) | GAP |
| src/api/users.py | tests/test_users.py | PARTIAL |
```

## Step 3: Detect Test Issues

### A) Stale Tests
Tests that reference old behavior:
- Function signatures that changed
- Removed functions still being tested
- Old API shapes in assertions
- Mocked data that no longer matches schema

Check:
```bash
# Find tests importing changed modules
grep -r "from {changed_module}" tests/
# Check if test assertions match new behavior
```

### B) Coverage Gaps
New or changed code without tests:
- New functions with no test
- New branches with no coverage
- Changed behavior with no updated assertions
- New error cases with no error tests

### C) Dead Tests
Tests for deleted functionality:
- Tests importing deleted modules
- Tests for removed features
- Skipped tests that should be removed

### D) Flaky Tests (if test history available)
Tests that sometimes fail:
- Check recent CI runs
- Note any intermittent failures

## Step 4: Run Affected Tests

Execute tests that cover changed code:

```bash
# Example for pytest
pytest tests/test_{module}.py -v

# Example for jest
npm test -- --testPathPattern="{module}"
```

Capture results:
- PASS: Test still valid
- FAIL: Test needs update or code has bug
- ERROR: Test broken (import error, etc.)

## Step 5: Produce Test Coverage Report

Create/update `.gsd-t/test-coverage.md`:

```markdown
# Test Coverage Report — {date}

## Summary
- Source files analyzed: {N}
- Test files found: {N}
- Coverage gaps: {N}
- Stale tests: {N}
- Dead tests: {N}
- Tests passing: {N}/{total}

## Coverage Status

### ✅ Well Covered
| Source | Test | Last Verified |
|--------|------|---------------|
| {file} | {test} | {date} |

### ⚠️ Partial Coverage
| Source | Test | Gap |
|--------|------|-----|
| {file} | {test} | {missing: error cases, edge cases, etc.} |

### ❌ No Coverage
| Source | Risk Level | Reason |
|--------|------------|--------|
| {file} | {HIGH/MED/LOW} | {new file, complex logic, etc.} |

---

## Issues Found

### Stale Tests
| Test | Issue | Action |
|------|-------|--------|
| {test} | {function signature changed} | Update assertions |
| {test} | {mock data outdated} | Update mock |

### Dead Tests
| Test | Reason | Action |
|------|--------|--------|
| {test} | {tests deleted feature} | Remove |
| {test} | {imports removed module} | Remove |

### Failing Tests
| Test | Error | Likely Cause |
|------|-------|--------------|
| {test} | {error message} | {code bug or test needs update} |

---

## Test Health Metrics

- Test-to-code ratio: {N tests / N source files}
- Average assertions per test: {N}
- Critical paths covered: {list}
- Critical paths uncovered: {list}

---

## Generated Tasks

### High Priority (blocking)
- [ ] TEST-001: Fix failing test {test} — {reason}
- [ ] TEST-002: Update stale test {test} — {what changed}

### Medium Priority (should do)
- [ ] TEST-010: Add tests for {file} — {N} functions uncovered
- [ ] TEST-011: Add error case tests for {function}

### Low Priority (nice to have)
- [ ] TEST-020: Remove dead test {test}
- [ ] TEST-021: Add edge case tests for {function}

---

## Recommendations

{Based on findings, what should be prioritized}
```

## Step 6: Generate Test Tasks

If issues found, add to current domain's tasks:

```markdown
## Auto-Generated Test Tasks

### From Test Sync — {date}

- [ ] TEST-001: Fix failing test `test_login.py::test_valid_credentials`
  - Error: AssertionError — expected 200, got 201
  - Cause: API return code changed
  - Action: Update assertion to expect 201

- [ ] TEST-002: Add tests for `src/auth/roles.py`
  - Functions: check_permission, assign_role, revoke_role
  - Priority: HIGH — authorization logic
  
- [ ] TEST-003: Update mock data in `test_users.py`
  - Schema changed: added `last_login` field
  - Action: Update all user fixtures
```

## Step 7: Integration with Workflow

### During Execute Phase (auto-invoked):
After each task completes:
1. Quick scan of changed files
2. Run affected tests
3. If failures: pause and report
4. If gaps: note for end-of-phase sync
5. Continue execution

### During Verify Phase (auto-invoked):
Full sync:
1. Complete coverage analysis
2. Run all tests
3. Generate full report
4. Block verification if critical tests failing

### Standalone Mode:
```
/user:gsd-t-test-sync
```
1. Full analysis of entire codebase
2. Comprehensive report
3. Generate all test tasks
4. Do not auto-add to domains — present for review

## Step 8: Report to User

### Quick Mode (during execute):
```
🧪 Test sync: 3 tests affected, 3 passing
   1 coverage gap noted → will address in verify phase
```

### Full Mode (during verify or standalone):
```
🧪 Test Sync Complete

Results:
- Tests run: 45
- Passing: 43
- Failing: 2
- Coverage gaps: 3
- Stale tests: 1
- Dead tests: 0

Action Required:
- 2 failing tests must be fixed before verify passes
- See .gsd-t/test-coverage.md for details

Generated 4 test tasks → added to current domain
```

$ARGUMENTS
