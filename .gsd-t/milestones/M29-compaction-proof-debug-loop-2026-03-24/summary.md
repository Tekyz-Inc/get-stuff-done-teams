# Milestone Complete: M29 — Compaction-Proof Debug Loop

**Completed**: 2026-03-24
**Duration**: 2026-03-24 → 2026-03-24
**Status**: VERIFIED

## What Was Built

Eliminated context compaction during debug-fix-retest cycles by moving the retry loop to an external process with a cumulative debug ledger. The debug ledger persists all hypothesis/fix/learning history across fresh sessions as a JSONL file. An external loop controller (`gsd-t headless --debug-loop`) runs test-fix-retest as separate `claude -p` sessions — each session starts fresh with zero accumulated context. Anti-repetition preamble injection prevents retrying already-failed hypotheses. Escalation tiers and ledger compaction prevent runaway iteration or ledger bloat.

## Domains

| Domain               | Tasks Completed | Key Deliverables                                                       |
|----------------------|-----------------|------------------------------------------------------------------------|
| debug-state-protocol | 3/3             | bin/debug-ledger.js (6 exports), test/debug-ledger.test.js (46 tests) |
| headless-loop        | 3/3             | bin/gsd-t.js extended (doHeadlessDebugLoop, escalation tiers), test/headless-debug-loop.test.js (37 tests) |
| command-integration  | 3/3             | 5 commands updated (execute, wave, test-sync, verify, debug), 4 reference docs updated |

## Contracts Defined/Updated

- debug-loop-contract.md: new — ledger schema (11 required fields), API signatures (6 functions), anti-repetition preamble format, compaction protocol (50KB threshold, last 5 preserved), CLI interface (5 flags, 5 exit codes), escalation tiers, iteration cycle, command integration pattern
- integration-points.md: updated — M29 dependency graph, 3 waves, 2 checkpoints

## Key Decisions

- Ledger uses JSONL format (one JSON object per line) — consistent with existing task-metrics.jsonl and rules.jsonl patterns
- Compaction threshold set at 50KB (51200 bytes) — triggers haiku summarizer session, preserves last 5 raw entries to maintain immediate context while condensing historical data
- Escalation tiers (sonnet 1-5, opus 6-15, STOP 16-20) mirror AlphaZero-style tiered resource allocation — cheap models for early iterations, expensive models for deep debugging, hard ceiling to prevent runaway cost
- External loop controller is pure Node.js (zero AI context) — the loop management state never accumulates in the AI context window
- Anti-repetition preamble lists all STILL_FAILS hypotheses prominently — prevents the most common compaction failure mode (retrying the same fix after context reset)

## Issues Encountered

None — all tasks completed without remediation cycles.

## Test Coverage

- Tests added: 83 (46 debug-ledger + 37 headless-debug-loop)
- Tests updated: 0
- Full suite: 671/671 passing
- Regressions: 0

## Git Tag

`v2.49.10`

## Files Changed

**Created:**
- bin/debug-ledger.js — 193 lines, 6 exported functions (readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats, clearLedger)
- test/debug-ledger.test.js — 46 unit tests
- test/headless-debug-loop.test.js — 37 unit tests

**Modified:**
- bin/gsd-t.js — added doHeadlessDebugLoop, parseDebugLoopFlags, getEscalationModel, extended doHeadless() routing, extended showHeadlessHelp()
- commands/gsd-t-execute.md — delegates fix-retest loops to headless debug-loop after 2 in-context attempts
- commands/gsd-t-wave.md — delegates fix-retest loops to headless debug-loop
- commands/gsd-t-test-sync.md — delegates fix-retest loops to headless debug-loop
- commands/gsd-t-verify.md — delegates fix-retest loops to headless debug-loop
- commands/gsd-t-debug.md — delegates fix-retest loops to headless debug-loop
- README.md — added Compaction-Proof Debug Loop to features
- GSD-T-README.md — documented headless --debug-loop mode
- templates/CLAUDE-global.md — added debug loop documentation
- commands/gsd-t-help.md — updated command descriptions

**Unchanged:**
- Existing headless functions (doHeadlessExec, doHeadlessQuery, parseHeadlessFlags) — untouched per domain constraint
