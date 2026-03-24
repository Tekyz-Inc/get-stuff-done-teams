# Tasks: rule-engine

## Summary
Delivers the declarative rule engine module (`bin/rule-engine.js`) that loads, evaluates, and manages JSONL-based detection rules and patch templates against task-metrics data. When complete, other domains can query active rules, evaluate them against metrics, and retrieve patch templates.

## Tasks

### Task 1: Create rule-engine.js — JSONL loaders and rule evaluator
- **Files**: `bin/rule-engine.js` (NEW)
- **Contract refs**: rule-engine-contract.md — rules.jsonl schema, trigger operators, Rule Engine API (`getActiveRules`, `evaluateRules`)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `getActiveRules()` reads `.gsd-t/metrics/rules.jsonl` and returns only rules with `status === 'active'`
  - `evaluateRules(domain, options)` loads task-metrics.jsonl via `bin/metrics-collector.js` readTaskMetrics, filters by domain/milestone/window, and evaluates each active rule's trigger against the filtered records
  - All 8 trigger operators implemented: gt, gte, lt, lte, eq, neq, in, pattern_count
  - Returns array of `{ rule, matchedRecords, severity }` for each firing rule
  - Zero external npm dependencies — Node.js built-ins only
  - JSDoc type hints on all exported functions
  - File under 200 lines

### Task 2: Add patch-templates loader and pre-mortem query
- **Files**: `bin/rule-engine.js` (MODIFY)
- **Contract refs**: rule-engine-contract.md — patch-templates.jsonl schema, `getPreMortemRules` API
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - `getPreMortemRules(domainType)` returns rules that have historically fired for similar domain names (matches domain substring or exact match in activation history)
  - Patch template loader reads `.gsd-t/metrics/patch-templates.jsonl` and validates each template's `rule_id` references an existing rule
  - Exported function to get template by ID for use by patch-lifecycle domain
  - File stays under 200 lines (split to helper if needed)

### Task 3: Add activation tracking, deprecation flagging, and consolidation
- **Files**: `bin/rule-engine.js` (MODIFY)
- **Contract refs**: rule-engine-contract.md — `recordActivation`, `flagInactiveRules`, `consolidateRules` APIs, Activation Count Deprecation, Periodic Consolidation
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - `recordActivation(ruleId)` increments `activation_count` and sets `last_activated` in rules.jsonl (rewrite file)
  - `flagInactiveRules(threshold)` returns rules with 0 activations after threshold milestones since creation
  - `consolidateRules(ruleIds, consolidated)` marks originals as `status: 'consolidated'` and appends the merged rule
  - All writes are atomic (write to temp file, rename)
  - File stays under 200 lines (split to helper module if needed)

### Task 4: Create seed rules and patch templates
- **Files**: `.gsd-t/metrics/rules.jsonl` (NEW), `.gsd-t/metrics/patch-templates.jsonl` (NEW)
- **Contract refs**: rule-engine-contract.md — rules.jsonl schema, patch-templates.jsonl schema
- **Dependencies**: Requires Task 1 (within domain, for schema validation)
- **Acceptance criteria**:
  - rules.jsonl contains 3-5 seed rules covering key patterns: fix-cycle spike (fix_cycles gt 2), low first-pass rate (first_pass_rate lt 0.6), debug-invoked frequency (signal_type pattern_count in window)
  - patch-templates.jsonl contains matching templates for each `action: 'patch'` rule
  - All records validate against the contract schemas
  - Files are valid JSONL (one JSON object per line)

### Task 5: Create rule-engine tests
- **Files**: `test/rule-engine.test.js` (NEW)
- **Contract refs**: rule-engine-contract.md — all API functions
- **Dependencies**: Requires Task 3 (all API functions must exist)
- **Acceptance criteria**:
  - Tests for getActiveRules (filters by status, handles missing file)
  - Tests for evaluateRules (each operator type, window filtering, empty metrics)
  - Tests for recordActivation (increments count, sets timestamp)
  - Tests for flagInactiveRules (threshold logic)
  - Tests for consolidateRules (marks originals, appends new)
  - Tests for getPreMortemRules (domain matching)
  - All tests pass with `npm test`

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0
