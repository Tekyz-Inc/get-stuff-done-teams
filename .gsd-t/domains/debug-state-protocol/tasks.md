# Tasks: debug-state-protocol

## Summary
Delivers the debug ledger API (bin/debug-ledger.js) — a JSONL-based persistence layer that stores hypothesis/fix/learning entries across debug sessions, with compaction and anti-repetition preamble generation.

## Tasks

### Task 1: Create bin/debug-ledger.js with core read/write/stats functions
- **Files**: bin/debug-ledger.js (CREATE)
- **Contract refs**: debug-loop-contract.md — "Ledger API" section (readLedger, appendEntry, getLedgerStats, clearLedger signatures), "Debug Ledger Schema" section (required fields)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - bin/debug-ledger.js exists and exports: readLedger, appendEntry, getLedgerStats, clearLedger
  - readLedger returns array of parsed JSON objects from .gsd-t/debug-state.jsonl
  - readLedger returns empty array when file doesn't exist
  - appendEntry appends one JSON line to .gsd-t/debug-state.jsonl, creates file if missing
  - appendEntry validates required fields (iteration, timestamp, test, error, hypothesis, fix, fixFiles, result, learning, model, duration)
  - getLedgerStats returns { entryCount, sizeBytes, needsCompaction, failedHypotheses, passCount, failCount }
  - needsCompaction is true when sizeBytes > 51200 (50KB)
  - clearLedger deletes the ledger file
  - Zero external dependencies — Node.js built-ins only (fs, path)
  - All functions have JSDoc comments
  - File under 200 lines

### Task 2: Add compactLedger and generateAntiRepetitionPreamble functions
- **Files**: bin/debug-ledger.js (MODIFY)
- **Contract refs**: debug-loop-contract.md — "Ledger Compaction Protocol" section, "Anti-Repetition Preamble Format" section
- **Dependencies**: Requires Task 1 (builds on existing module)
- **Acceptance criteria**:
  - compactLedger(projectDir, summary) replaces all entries except last 5 with a single compacted entry
  - Compacted entry has { compacted: true, learning: summary, iteration: 0, timestamp, test: "compacted", error: "see summary", hypothesis: "compacted", fix: "compacted", fixFiles: [], result: "compacted", model: "haiku", duration: 0 }
  - Last 5 raw entries are preserved unchanged after compaction
  - generateAntiRepetitionPreamble returns formatted string matching contract's preamble format
  - Preamble lists all STILL_FAILS entries as "Failed Hypotheses (DO NOT retry these)"
  - Preamble shows last learning entry as "Current Narrowing Direction"
  - Preamble lists tests still failing
  - Returns empty string when ledger is empty or doesn't exist
  - Module still exports all 6 functions
  - File still under 200 lines

### Task 3: Write unit tests for debug-ledger.js
- **Files**: test/debug-ledger.test.js (CREATE)
- **Contract refs**: debug-loop-contract.md — all sections (test every export against contract spec)
- **Dependencies**: Requires Task 2 (all functions must exist)
- **Acceptance criteria**:
  - Tests cover all 6 exports: readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats, clearLedger
  - Tests for readLedger: empty file, missing file, valid entries, malformed lines (skip gracefully)
  - Tests for appendEntry: creates file, appends to existing, validates required fields
  - Tests for compactLedger: preserves last 5, replaces older entries with compacted summary
  - Tests for generateAntiRepetitionPreamble: empty ledger, single entry, multiple failures, mixed pass/fail
  - Tests for getLedgerStats: correct counts, needsCompaction threshold at 51200 bytes
  - Tests for clearLedger: removes file, no-op when file doesn't exist
  - All tests pass: `node --test test/debug-ledger.test.js`
  - Full suite still passes: 537+ tests, 0 regressions

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 1 (after Task 3 — gate for Wave 2)
