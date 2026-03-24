# Tasks: command-extensions

## Summary
Extends three existing GSD-T commands with cross-project capabilities: `gsd-t-metrics` gains `--cross-project` comparison mode, `gsd-t-status` gains global ELO and project ranking display, and `gsd-t-complete-milestone` gains a global rule promotion step. Updates all reference documentation to reflect the new capabilities.

## Tasks

### Task 1: Extend gsd-t-metrics with --cross-project mode ✅
- **Files**: `commands/gsd-t-metrics.md` (modify — append new step)
- **Contract refs**: cross-project-sync-contract.md (global-signal-distributions.jsonl schema, global-rollup.jsonl schema)
- **Dependencies**: BLOCKED by global-metrics Task 4 (global-sync-manager.js API must exist)
- **Acceptance criteria**:
  - New step appended after existing metrics display (does not modify existing step numbers or logic)
  - Detects `--cross-project` in `$ARGUMENTS`
  - When `--cross-project` present: calls `node -e "const g = require('./bin/global-sync-manager.js'); ..."` to invoke `compareSignalDistributions()` and `getDomainTypeComparison()`
  - Displays signal-type distribution comparison table across all registered projects
  - Displays domain-type comparison when domain argument provided (e.g., `--cross-project --domain auth`)
  - Graceful fallback: if `~/.claude/metrics/` does not exist, displays "No global metrics yet — complete milestones in multiple projects to enable cross-project comparison"
  - When `--cross-project` not present: no change to existing behavior

### Task 2: Extend gsd-t-status with global ELO display ✅
- **Files**: `commands/gsd-t-status.md` (modify — append new step)
- **Contract refs**: cross-project-sync-contract.md (Global ELO Computation)
- **Dependencies**: BLOCKED by global-metrics Task 4 (global-sync-manager.js API must exist)
- **Acceptance criteria**:
  - New step appended after existing status display (does not modify existing steps)
  - Calls `node -e "const g = require('./bin/global-sync-manager.js'); ..."` to invoke `getGlobalELO()` and `getProjectRankings()`
  - Displays: "Global ELO: {score} (rank #{N} of {total} projects)" when global metrics exist
  - Displays top 5 project rankings table when 2+ projects have global rollup data
  - Graceful fallback: if `~/.claude/metrics/` does not exist, displays "No global metrics yet"
  - Does not require `--global` flag — auto-displays when global data exists (consistent with existing auto-display patterns)

### Task 3: Extend gsd-t-complete-milestone with global rule promotion ✅
- **Files**: `commands/gsd-t-complete-milestone.md` (modify — append new step after local promotion)
- **Contract refs**: cross-project-sync-contract.md (Propagation Protocol — On Local Rule Promotion)
- **Dependencies**: BLOCKED by global-metrics Task 4 AND cross-project-sync Task 3 (both APIs must exist and be tested)
- **Acceptance criteria**:
  - New step appended after existing distillation/local promotion step
  - After local rule promotion completes, checks for newly promoted rules via `require('./bin/patch-lifecycle.js').getPatchesByStatus('promoted')`
  - For each promoted rule: calls `node -e "const g = require('./bin/global-sync-manager.js'); g.writeGlobalRule({...})"` to copy to global-rules.jsonl
  - Calls `checkUniversalPromotion()` for each written rule to auto-set universal/npm flags
  - Writes global rollup entry via `writeGlobalRollup()` with current milestone stats
  - Writes global signal distribution entry via `writeGlobalSignalDistribution()` with cumulative signal data
  - Logs: "Promoted {N} rules to global metrics" and "Updated global rollup for {project}"
  - Graceful fallback: if no rules promoted this milestone, skip silently

### Task 4: Reference documentation update ✅
- **Files**: `GSD-T-README.md` (modify), `README.md` (modify), `templates/CLAUDE-global.md` (modify), `commands/gsd-t-help.md` (modify)
- **Contract refs**: Pre-Commit Gate (command interface changes require 4-file update)
- **Dependencies**: Requires Tasks 1-3 (within domain)
- **Acceptance criteria**:
  - `GSD-T-README.md`: updated gsd-t-metrics description to mention `--cross-project` flag, updated gsd-t-status description to mention global ELO, added M27 feature description
  - `README.md`: updated features section to include cross-project learning capabilities
  - `templates/CLAUDE-global.md`: updated gsd-t-metrics and gsd-t-status command descriptions in commands table
  - `commands/gsd-t-help.md`: updated gsd-t-metrics and gsd-t-status descriptions to mention new capabilities
  - All 4 files consistent with each other

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 4 (Tasks 1-2 blocked by global-metrics; Task 3 blocked by global-metrics + cross-project-sync; Task 4 requires Tasks 1-3)
- Estimated checkpoints: 1 (after Task 4 — final verification before integration)
