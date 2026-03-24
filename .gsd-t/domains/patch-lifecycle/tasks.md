# Tasks: patch-lifecycle

## Summary
Delivers the patch lifecycle manager (`bin/patch-lifecycle.js`) that creates candidate patches from rule matches, applies them to target files, records measurements across milestones, and manages the promotion/graduation/deprecation flow. When complete, patches can progress through all 5 lifecycle stages with measurable improvement gates.

## Tasks

### Task 1: Create patch-lifecycle.js — candidate creation and patch application ✅ COMPLETE
- **Files**: `bin/patch-lifecycle.js` (NEW)
- **Contract refs**: rule-engine-contract.md — Patch Status File schema, Patch Lifecycle API (`createCandidate`, `applyPatch`), edit types (append, prepend, insert_after, replace)
- **Dependencies**: BLOCKED by rule-engine Task 1 (needs rule evaluation results and template loader)
- **Acceptance criteria**:
  - `createCandidate(ruleId, templateId, metricBefore)` creates a patch-{id}.json file in `.gsd-t/metrics/patches/` with `status: 'candidate'` and all required fields per contract
  - `applyPatch(patchId)` reads the patch template, executes the edit (append/prepend/insert_after/replace) on the target file, and transitions status to `applied`
  - Patch ID generation uses incrementing counter (reads existing patches to determine next ID)
  - Creates `.gsd-t/metrics/patches/` directory on first write if it does not exist
  - Zero external npm dependencies — Node.js built-ins only
  - JSDoc type hints on all exported functions
  - File under 200 lines

### Task 2: Add measurement, promotion gate, and promotion/deprecation ✅ COMPLETE
- **Files**: `bin/patch-lifecycle.js` (MODIFY)
- **Contract refs**: rule-engine-contract.md — Patch Lifecycle API (`recordMeasurement`, `checkPromotionGate`, `promote`, `deprecate`), Promotion Gate (>55% over 2+ milestones)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - `recordMeasurement(patchId, milestoneId, metricAfter)` updates `measured_milestones`, `metric_after`, `improvement_pct`, sets status to `measured`
  - `checkPromotionGate(patchId)` returns `{ passes, improvement_pct, reason }` — requires `measured_milestones.length >= 2` and `improvement_pct > 55`
  - `promote(patchId)` sets `status: 'promoted'` and `promoted_at`
  - `deprecate(patchId, reason)` sets `status: 'deprecated'`, `deprecated_at`, `deprecation_reason`
  - `getPatchesByStatus(status)` returns all patches matching the given lifecycle status
  - File stays under 200 lines

### Task 3: Add graduation logic ✅ COMPLETE
- **Files**: `bin/patch-lifecycle.js` (MODIFY)
- **Contract refs**: rule-engine-contract.md — Patch Lifecycle API (`graduate`), Graduation Criteria (promoted for 3+ milestones, sustained improvement)
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - `graduate(patchId)` checks: status is 'promoted', promoted for 3+ additional milestones with sustained improvement
  - On graduation: writes patch content to permanent target (constraints.md or verify checks), sets `status: 'graduated'`, `graduated_at`, `graduation_target`
  - On graduation: signals rule-engine to mark the originating rule for removal from rules.jsonl (via exported helper)
  - Returns `{ target, content }` describing what was written where
  - Graduation targets that are in CLAUDE.md require user confirmation per Destructive Action Guard (function returns proposal, does not auto-write)
  - File stays under 200 lines (split to helper if needed)

### Task 4: Create patch-lifecycle tests ✅ COMPLETE
- **Files**: `test/patch-lifecycle.test.js` (NEW)
- **Contract refs**: rule-engine-contract.md — all Patch Lifecycle API functions, lifecycle state machine
- **Dependencies**: Requires Task 3 (all API functions must exist); BLOCKED by rule-engine Task 4 (needs seed rules/templates for integration tests)
- **Acceptance criteria**:
  - Tests for createCandidate (creates file, correct schema, incrementing IDs)
  - Tests for applyPatch (each edit type: append, prepend, insert_after, replace)
  - Tests for recordMeasurement (updates fields, calculates improvement_pct)
  - Tests for checkPromotionGate (pass case >55% + 2 milestones, fail cases)
  - Tests for promote and deprecate (status transitions, timestamp fields)
  - Tests for graduate (writes to target, returns what was written, marks rule)
  - Tests for getPatchesByStatus (filters correctly)
  - All tests pass with `npm test`

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by rule-engine Task 1)
- Estimated checkpoints: 1 (rule-engine checkpoint before Wave 2)
