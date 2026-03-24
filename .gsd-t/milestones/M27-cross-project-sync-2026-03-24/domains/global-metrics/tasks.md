# Tasks: global-metrics

## Summary
Implements `bin/global-sync-manager.js` — the core module that reads local project metrics and writes global aggregated files to `~/.claude/metrics/`. Provides APIs for global rollup aggregation, global rule storage, signal distribution comparison, and universal rule promotion logic.

## Tasks

### Task 1: Core JSONL read/write + global rule management ✅
- **Files**: `bin/global-sync-manager.js` (create)
- **Contract refs**: cross-project-sync-contract.md (global-rules.jsonl schema, File Locations, Propagation Protocol — On Local Rule Promotion)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Module exports: `readGlobalRules()`, `writeGlobalRule(rule)`, `readGlobalRollups()`, `writeGlobalRollup(entry)`, `readGlobalSignalDistributions()`, `writeGlobalSignalDistribution(entry)`
  - `~/.claude/metrics/` directory created on first write if absent
  - All read functions return `[]` if file does not exist (graceful fallback)
  - JSONL format: one JSON object per line, consistent with existing metrics-collector.js pattern
  - `writeGlobalRule()` implements dedup via trigger fingerprint (`JSON.stringify(rule.trigger)`) per propagation protocol
  - `writeGlobalRule()` auto-increments `promotion_count` and updates `propagated_to` if rule already exists
  - Zero external dependencies — Node.js built-ins only (fs, path, os)
  - Module exports pattern matches rule-engine.js and patch-lifecycle.js
  - Source project identified from `package.json` name field or directory basename

### Task 2: Signal distribution comparison and domain-type matching ✅
- **Files**: `bin/global-sync-manager.js` (modify — add exports)
- **Contract refs**: cross-project-sync-contract.md (global-signal-distributions.jsonl schema, signal_rates normalization)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - New exports: `compareSignalDistributions(projectName)`, `getDomainTypeComparison(domainType)`
  - `compareSignalDistributions()` reads `global-signal-distributions.jsonl`, returns all projects' signal rates sorted by `pass-through` rate descending, with the queried project highlighted
  - `getDomainTypeComparison()` reads `global-signal-distributions.jsonl`, filters `domain_type_signals` entries matching the given domain type across all projects, returns comparison table
  - Signal rates are normalized (sum = 1.0) per contract
  - Graceful handling when fewer than 2 projects exist (returns data with `insufficient_data: true` flag)

### Task 3: Universal rule promotion logic and global ELO ✅
- **Files**: `bin/global-sync-manager.js` (modify — add exports)
- **Contract refs**: cross-project-sync-contract.md (Universal Rule Promotion Thresholds, Global ELO Computation)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - New exports: `checkUniversalPromotion(globalRuleId)`, `getGlobalELO(projectName)`, `getProjectRankings()`
  - `checkUniversalPromotion()` reads global-rules.jsonl, sets `is_universal: true` when `promotion_count >= 3`, sets `is_npm_candidate: true` when `promotion_count >= 5`, writes updated rule back
  - `getGlobalELO()` reads global-rollup.jsonl, filters entries for given project, returns latest `elo_after` value
  - `getProjectRankings()` reads global-rollup.jsonl, extracts latest `elo_after` per project, returns sorted descending
  - ELO algorithm consistent with metrics-rollup.js (K=32, starting at 1000)
  - Returns `null` when no global rollup data exists for a project

### Task 4: Unit tests for global-sync-manager ✅
- **Files**: `test/global-sync-manager.test.js` (create)
- **Contract refs**: cross-project-sync-contract.md (all schemas)
- **Dependencies**: Requires Tasks 1-3 (within domain)
- **Acceptance criteria**:
  - Tests cover all exported functions: readGlobalRules, writeGlobalRule, readGlobalRollups, writeGlobalRollup, readGlobalSignalDistributions, writeGlobalSignalDistribution, compareSignalDistributions, getDomainTypeComparison, checkUniversalPromotion, getGlobalELO, getProjectRankings
  - Test dedup logic: writing same rule twice increments promotion_count instead of creating duplicate
  - Test universal promotion thresholds: promotion_count 1 (not universal), 3 (universal), 5 (npm candidate)
  - Test graceful fallback: reading from nonexistent files returns empty array
  - Test global directory creation on first write
  - Uses tmp directory for test isolation (not real `~/.claude/metrics/`)
  - All tests pass with `npm test`

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 1
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 1 (after Task 4 — validates full API before downstream domains)
