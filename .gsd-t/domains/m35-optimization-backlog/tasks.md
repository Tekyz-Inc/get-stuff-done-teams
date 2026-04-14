# Tasks: m35-optimization-backlog

## Summary

Implement `bin/token-optimizer.js` with declarative detection rules that analyze token-telemetry data and append recommendations to `.gsd-t/optimization-backlog.md`. Create the apply and reject command files. Wire the optimizer into `complete-milestone`, extend `backlog-list` with a `--file` flag, and add a one-liner to `status`. Validate with a full integration test roundtrip.

## Contract References

- `.gsd-t/contracts/token-telemetry-contract.md` — v1.0.0 (read-only — JSONL schema read by optimizer)
- `.gsd-t/contracts/model-selection-contract.md` — v1.0.0 (read-only — phase tier assignments inform demotion/escalation candidates)

---

## Tasks

### Task 1: Implement `bin/token-optimizer.js` + detection rules

- **Files**:
  - `bin/token-optimizer.js` (create)
  - `.gsd-t/optimization-backlog.md` (create — format definition and first entry)
  - `test/token-optimizer.test.js` (create — unit tests)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (JSONL schema), `.gsd-t/contracts/model-selection-contract.md` v1.0.0 (phase tier assignments)
- **Dependencies**: BLOCKED BY m35-token-telemetry Task 2 (reads `token-metrics.jsonl` via `readAll()`); BLOCKED BY m35-model-selector-advisor Task 4 (needs model-selection-contract to know which phases are on which tier)
- **Acceptance criteria**:
  - Exports `detectRecommendations({projectDir, lookbackMilestones: 3})` → array of recommendation objects with fields: `{id, type, detected_at, evidence, projected_savings, proposed_change, risk, status: 'pending', rejection_cooldown: 0}`
  - Declarative detection rules (array of rule objects, not hardcoded if/else):
    - Rule 1 (demote): phases on opus with ≥ 90% success AND avg fix-cycle count < 1.0 across lookback milestones → `type: 'demote'`, proposed change is sonnet upgrade in `bin/model-selector.js`
    - Rule 2 (escalate): phases on sonnet with fix-cycle rate ≥ 30% across lookback milestones → `type: 'escalate'`, proposed change is opus escalation or `/advisor` hook
    - Rule 3 (runway-tune): runway estimator over-estimate: `projected_end_pct - actual_end_pct > 15` percentage points → `type: 'runway-tune'`, proposed change is constant adjustment in `bin/runway-estimator.js`
    - Rule 4 (outlier): per-phase p95 consumption > 2x median → `type: 'investigate'`, proposed change is investigation of that phase's context usage
  - Exports `appendToBacklog(recommendations, projectDir)`: writes to `.gsd-t/optimization-backlog.md` in the format from M35-definition.md Part E §E.4
  - Empty recommendations still append: `## Complete-milestone review — no recommendations (M{N})\n**Detected**: {date}`
  - Never blocks `complete-milestone` — optimizer failure is caught and logged, not re-thrown
  - Unit tests (~10): each detection rule triggers on fixture data, empty-recommendations marker line, appendToBacklog writes correct format, cooldown filter suppresses rejected entries within 5 milestones, multiple rules can fire from one dataset

### Task 2: Create `gsd-t-optimization-apply.md` and `gsd-t-optimization-reject.md` commands

- **Files**:
  - `commands/gsd-t-optimization-apply.md` (create)
  - `commands/gsd-t-optimization-reject.md` (create)
- **Contract refs**: None (standalone command files)
- **Dependencies**: Requires Task 1 (commands operate on `.gsd-t/optimization-backlog.md` format defined in T1)
- **Acceptance criteria**:
  - `commands/gsd-t-optimization-apply.md`:
    - Takes `$ARGUMENTS` as `{ID}` (e.g., `M35-OPT-001`)
    - Reads the entry from `.gsd-t/optimization-backlog.md`, confirms it exists and has `status: pending`
    - Offers to create a quick task via `/user:gsd-t-quick` or promote via `/user:gsd-t-backlog-promote`
    - Marks the entry `status: promoted` in the backlog file
    - Idempotent: re-applying a `promoted` entry shows "already promoted" and exits cleanly
    - Includes OBSERVABILITY LOGGING block (no subagent spawned directly, but log the operation to `.gsd-t/token-log.md`)
  - `commands/gsd-t-optimization-reject.md`:
    - Takes `$ARGUMENTS` as `{ID} [--reason "text"]`
    - Marks entry `status: rejected`, captures reason (or "no reason given"), sets `rejection_cooldown: 5`
    - Idempotent: re-rejecting shows "already rejected, cooldown: N milestones remaining"
    - Includes OBSERVABILITY LOGGING block
  - Both command files have clear help text at the top explaining usage

### Task 3: Wire optimizer into `complete-milestone` + extend `backlog-list` + `status` + `help`

- **Files**:
  - `commands/gsd-t-complete-milestone.md` (modify — add optimizer invocation at end)
  - `commands/gsd-t-backlog-list.md` (modify — add `--file` flag)
  - `commands/gsd-t-status.md` (modify — add pending-optimizations one-liner)
  - `commands/gsd-t-help.md` (modify — reference new commands)
- **Contract refs**: None
- **Dependencies**: Requires Tasks 1 and 2 (optimizer module and commands must exist); note `commands/gsd-t-status.md` is also modified by m35-headless-auto-spawn T4 (headless read-back banner) — these are additive changes to distinct sections; apply headless T4 first, then T3 here adds the optimization one-liner
- **BLOCKED BY**: m35-headless-auto-spawn Task 4 (both modify `commands/gsd-t-status.md` — headless T4 adds the banner first, then T3 here adds the optimization count)
- **Acceptance criteria**:
  - `commands/gsd-t-complete-milestone.md`: at the final step (after all quality gates pass), invoke `node -e "require('./bin/token-optimizer.js').detectRecommendations({projectDir:'.'}).then(r=>require('./bin/token-optimizer.js').appendToBacklog(r,'.')).catch(e=>console.error('optimizer error:',e.message))"` — failure is non-blocking
  - `commands/gsd-t-backlog-list.md`: new `--file {path}` flag that reads the specified file instead of the default `.gsd-t/backlog.md`; supports `gsd-t-backlog-list --file optimization-backlog.md [--status pending|rejected|promoted]`
  - `commands/gsd-t-status.md`: near the top of its output (after headless banner), include: "Optimization backlog: N pending recommendations" when `N > 0`, or omit the line entirely when `N === 0` (no noise when there's nothing to surface)
  - `commands/gsd-t-help.md`: new entries for `gsd-t-optimization-apply` and `gsd-t-optimization-reject` in the command reference table

### Task 4: Integration test roundtrip — fixture → optimizer → apply → reject

- **Files**:
  - `test/token-optimizer.test.js` (extend — add integration section)
- **Contract refs**: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (fixture schema)
- **Dependencies**: Requires Tasks 1, 2, 3 (full feature surface must exist for roundtrip to work)
- **Acceptance criteria**:
  - Integration test uses temp directory fixture (not the real `.gsd-t/`):
    1. Create synthetic `token-metrics.jsonl`: 10 records — one `{model: 'opus', command: 'gsd-t-execute', outcome: 'success'}` phase repeated with 100% success and fix_cycle_count = 0
    2. Run `detectRecommendations({projectDir: tmpDir, lookbackMilestones: 1})` → assert it returns exactly one demotion recommendation
    3. Run `appendToBacklog(recommendations, tmpDir)` → assert `optimization-backlog.md` created with the recommendation in the correct format
    4. Simulate `apply`: call the apply logic directly (not the command file), assert entry updates to `status: 'promoted'`
    5. Simulate `reject` on a different entry: assert `status: 'rejected'`, `rejection_cooldown: 5`
    6. Run `detectRecommendations` again with same fixture but rejected entry present → assert the rejected entry does NOT re-surface (cooldown respected)
  - All 6 assertions pass

---

## Execution Estimate

- Total tasks: 4
- Independent tasks (no blockers): 0 (all depend on Wave 2 outputs from token-telemetry and model-selector-advisor)
- Blocked tasks (waiting on other domains): 2 (T1 blocked by m35-token-telemetry T2 + model-selector-advisor T4; T3 blocked by m35-headless-auto-spawn T4)
- Estimated checkpoints: 1 (all 4 tasks complete before Wave 5 docs-and-tests)

## Wave Assignment

- **Wave 4**: Tasks 1, 2, 3, 4 (all Wave 4 — sequential within domain: T1→T2→T3→T4)
