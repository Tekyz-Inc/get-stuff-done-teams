# Tasks: headless-loop

## Summary
Delivers the `gsd-t headless --debug-loop` CLI mode — an external loop controller that runs test-fix-retest cycles as separate `claude -p` sessions, with escalation tiers, anti-repetition preamble injection, and hard iteration limits.

## Tasks

### Task 1: Add --debug-loop flag parsing and doHeadlessDebugLoop skeleton to bin/gsd-t.js
- **Files**: bin/gsd-t.js (MODIFY — add new functions, extend doHeadless)
- **Contract refs**: debug-loop-contract.md — "Headless Debug-Loop CLI Interface" section (flags, exit codes), headless-contract.md — existing patterns
- **Dependencies**: BLOCKED by debug-state-protocol Task 3 (ledger API must exist and be tested)
- **Acceptance criteria**:
  - parseDebugLoopFlags extracts --max-iterations (default 20), --test-cmd, --fix-scope, --json, --log
  - doHeadless() routes "--debug-loop" to doHeadlessDebugLoop (new function)
  - doHeadlessDebugLoop skeleton: validates flags, checks claude CLI availability, prints heading, returns placeholder exit code
  - getEscalationModel(iteration) returns "sonnet" for 1-5, "opus" for 6-15, null for 16-20
  - showHeadlessHelp() updated with --debug-loop section
  - Existing headless functions unchanged
  - `gsd-t headless --debug-loop --help` produces valid output
  - New functions exported in module.exports for testability

### Task 2: Implement full iteration cycle in doHeadlessDebugLoop
- **Files**: bin/gsd-t.js (MODIFY — fill in doHeadlessDebugLoop body)
- **Contract refs**: debug-loop-contract.md — "Iteration Cycle" section (10-step cycle), "Escalation Tiers" section, "Ledger Compaction Protocol" section
- **Dependencies**: Requires Task 1 (skeleton must exist)
- **Acceptance criteria**:
  - Each iteration: reads ledger, checks compaction, generates preamble, selects model, builds prompt, spawns `claude -p`, parses output, appends entry
  - Prompt includes anti-repetition preamble from generateAntiRepetitionPreamble()
  - Model selection follows escalation tiers: sonnet (1-5), opus (6-15), STOP (16-20)
  - At STOP tier (16-20): writes full diagnostic summary, exits with code 4
  - Compaction triggered when getLedgerStats().needsCompaction is true — spawns haiku session for summarization
  - Exit code 0 when all tests pass (clearLedger called)
  - Exit code 1 when max iterations reached
  - Exit code 3 on process errors
  - Exit code 4 on escalation stop
  - --json flag outputs JSON envelope per iteration
  - --log flag writes per-iteration log files
  - --max-iterations enforced by loop counter, not by AI
  - Total new code under 200 lines

### Task 3: Write unit tests for headless debug-loop functions
- **Files**: test/headless-debug-loop.test.js (CREATE)
- **Contract refs**: debug-loop-contract.md — all headless sections
- **Dependencies**: Requires Task 2 (all functions must exist)
- **Acceptance criteria**:
  - Tests cover: parseDebugLoopFlags, getEscalationModel, doHeadlessDebugLoop (mocked claude -p)
  - parseDebugLoopFlags: default values, custom --max-iterations, --test-cmd, --fix-scope, combined flags
  - getEscalationModel: returns "sonnet" for 1-5, "opus" for 6-15, null for 16-20, respects boundary values (5, 6, 15, 16)
  - doHeadlessDebugLoop: mock execFileSync to simulate claude -p output, verify iteration counting, verify exit codes (0 on pass, 1 on max, 4 on stop tier)
  - Verify ledger integration: appendEntry called with correct fields after each iteration
  - Verify compaction trigger: when needsCompaction is true, compaction runs before next iteration
  - All tests pass: `node --test test/headless-debug-loop.test.js`
  - Full suite still passes: 537+ tests, 0 regressions

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0 (all blocked by Wave 1)
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by debug-state-protocol)
- Estimated checkpoints: 1 (after Task 3 — gate for Wave 3)
