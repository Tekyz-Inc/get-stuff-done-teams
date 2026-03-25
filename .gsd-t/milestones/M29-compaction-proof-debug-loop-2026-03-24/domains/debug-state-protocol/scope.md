# Domain: debug-state-protocol

## Responsibility
Defines and implements the structured debug ledger (JSONL) that persists hypothesis/fix/learning history across fresh Claude sessions. Provides read/write/compact functions and anti-repetition summary generation.

## Owned Files/Directories
- bin/debug-ledger.js — ledger API: readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats
- test/debug-ledger.test.js — unit tests for all exported functions
- .gsd-t/contracts/debug-loop-contract.md — ledger schema, entry format, compaction protocol, preamble format

## NOT Owned (do not modify)
- bin/gsd-t.js — owned by headless-loop domain
- commands/*.md — owned by command-integration domain
- bin/metrics-collector.js, bin/rule-engine.js, bin/patch-lifecycle.js — prior milestone code
