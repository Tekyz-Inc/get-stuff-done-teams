# Tasks: cross-project-sync

## Summary
Extends `bin/gsd-t.js` `doUpdateAll()` with a global rule sync step that propagates proven rules across all registered GSD-T projects. Implements the npm distribution pipeline for universal rules that have been validated across 5+ projects.

## Tasks

### Task 1: Extend doUpdateAll with global rule sync
- **Files**: `bin/gsd-t.js` (modify — add new helper functions and call in doUpdateAll)
- **Contract refs**: cross-project-sync-contract.md (Propagation Protocol — On Update-All)
- **Dependencies**: BLOCKED by global-metrics Task 4 (global-sync-manager.js must exist and be tested)
- **Acceptance criteria**:
  - New helper function `syncGlobalRulesToProject(projectDir)` added to gsd-t.js
  - Reads `~/.claude/metrics/global-rules.jsonl` via `require('./global-sync-manager.js').readGlobalRules()`
  - Filters rules where `is_universal === true` OR `promotion_count >= 2`
  - For each qualifying rule, checks if project already has it (match trigger fingerprint in local rules.jsonl via `require('./rule-engine.js').getActiveRules(projectDir)`)
  - Missing rules injected as candidates with `status: 'candidate'`, `activation_count: 0`
  - New helper function `syncGlobalRules()` iterates all registered projects and calls `syncGlobalRulesToProject()` for each
  - `doUpdateAll()` calls `syncGlobalRules()` after existing project updates
  - ANSI color logging: "Synced {N} global rules to {project_name}" for each project
  - Graceful fallback: if `~/.claude/metrics/global-rules.jsonl` does not exist, skip silently with dim log
  - Zero external dependencies maintained
  - Existing doUpdateAll behavior unmodified (only additive call at end)

### Task 2: NPM distribution pipeline for universal rules
- **Files**: `bin/gsd-t.js` (modify — add helper), `examples/rules/` (create directory + universal-rules.jsonl)
- **Contract refs**: cross-project-sync-contract.md (Propagation Protocol — On NPM Publish, Universal Rule Promotion Thresholds)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - New helper function `exportUniversalRulesForNpm()` added to gsd-t.js
  - Reads `~/.claude/metrics/global-rules.jsonl`, filters rules where `is_npm_candidate === true`
  - Writes qualifying rules to `examples/rules/universal-rules.jsonl` in the package source
  - Sets `shipped_in_version` on each exported rule to current package.json version
  - `examples/rules/` directory created if it does not exist
  - On install/update, universal rules are copied to new projects as candidates (extends `doInit` or `doInstall` to check `examples/rules/`)
  - Graceful handling when no rules qualify (skip silently)

### Task 3: Unit tests for global rule sync integration
- **Files**: `test/global-rule-sync.test.js` (create)
- **Contract refs**: cross-project-sync-contract.md (Propagation Protocol, Universal Rule Promotion Thresholds)
- **Dependencies**: Requires Tasks 1-2 (within domain), BLOCKED by global-metrics Task 4
- **Acceptance criteria**:
  - Tests cover `syncGlobalRulesToProject()`: rule injection, dedup (skip existing), candidate status
  - Tests cover `syncGlobalRules()`: iterates registered projects correctly
  - Tests cover `exportUniversalRulesForNpm()`: filters npm candidates, writes to examples/rules/
  - Tests verify graceful fallback when global-rules.jsonl does not exist
  - Tests verify injected rules have `status: 'candidate'` and `activation_count: 0`
  - Uses tmp directory for test isolation
  - All tests pass with `npm test`

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 3 (all blocked by global-metrics Task 4)
- Estimated checkpoints: 1 (after Task 3 — validates sync pipeline before command-extensions references it)
