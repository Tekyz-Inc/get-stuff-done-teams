# Tasks: metrics-commands

## Summary
Create the new gsd-t-metrics.md command (50th command), update gsd-t-status.md with ELO display, update CLI command count, and update all 4 reference files to register the new command.

## Tasks

### Task 1: Create gsd-t-metrics.md command file
- **Files**: `commands/gsd-t-metrics.md`
- **Contract refs**: metrics-schema-contract.md (task-metrics.jsonl + rollup.jsonl schemas)
- **Dependencies**: BLOCKED by metrics-collection Task 2 (reads task-metrics.jsonl), BLOCKED by metrics-rollup Task 1 (reads rollup.jsonl)
- **Acceptance criteria**:
  - Standard step-numbered command format with $ARGUMENTS terminator
  - Reads .gsd-t/metrics/task-metrics.jsonl and rollup.jsonl directly (no module import)
  - Displays: current milestone metrics summary (task count, first_pass_rate, avg_duration, fix_cycles)
  - Displays: process ELO (current score, trend arrow, delta from previous)
  - Displays: signal distribution (count per signal_type)
  - Displays: domain breakdown table (per-domain first_pass_rate, avg_duration)
  - Displays: trend comparison to previous milestone (if exists)
  - Displays: heuristic anomaly warnings (if any flagged)
  - Graceful fallback: if JSONL files don't exist, displays "No metrics data yet" message
  - Accepts optional argument: milestone ID filter (default: current milestone)

### Task 2: Update gsd-t-status.md with ELO and metrics summary
- **Files**: `commands/gsd-t-status.md`
- **Contract refs**: metrics-schema-contract.md (rollup.jsonl schema — ELO fields)
- **Dependencies**: BLOCKED by metrics-rollup Task 1 (reads rollup.jsonl for ELO)
- **Acceptance criteria**:
  - New section added to status output: "Process Health" or "Metrics"
  - Displays: current process ELO score (from latest rollup.jsonl entry)
  - Displays: quality budget summary (first_pass_rate for current milestone if available)
  - Graceful fallback: if no rollup data exists, section shows "No metrics data yet"
  - Existing status sections not removed or reordered — only ADD new section

### Task 3: Update bin/gsd-t.js command count for 50th command
- **Files**: `bin/gsd-t.js`
- **Contract refs**: none (internal CLI logic)
- **Dependencies**: Requires Task 1 (gsd-t-metrics.md must exist)
- **Acceptance criteria**:
  - Command count logic updated to reflect 50 commands (was 49)
  - `gsd-t status` output shows correct command count
  - No other changes to bin/gsd-t.js beyond command count update

### Task 4: Update all 4 reference files with gsd-t-metrics command
- **Files**: `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`
- **Contract refs**: none (documentation updates)
- **Dependencies**: Requires Task 1 (command definition must be finalized)
- **Acceptance criteria**:
  - README.md: gsd-t-metrics added to commands table with description
  - GSD-T-README.md: gsd-t-metrics added to detailed command reference with usage and output format
  - templates/CLAUDE-global.md: gsd-t-metrics added to commands table
  - commands/gsd-t-help.md: gsd-t-metrics added to help summaries with one-line description
  - All 4 files use consistent command description
  - Command count references updated from 49 to 50 where mentioned

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 2 (Task 1 and Task 2 — blocked by metrics-collection + metrics-rollup)
- Estimated checkpoints: 1 (after Task 1 — verify command output format before updating reference files)
