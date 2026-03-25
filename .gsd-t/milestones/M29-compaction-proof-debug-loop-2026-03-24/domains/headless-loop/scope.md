# Domain: headless-loop

## Responsibility
Implements the external debug-loop mode in the CLI: `gsd-t headless --debug-loop`. Manages the test-fix-retest iteration cycle as separate `claude -p` sessions, with escalation tiers, prompt preamble injection from the debug ledger, and max-iteration enforcement.

## Owned Files/Directories
- bin/gsd-t.js — EXTENDS: adds --debug-loop flag parsing, doHeadlessDebugLoop function, escalation tier logic, preamble generation call, ledger compaction trigger
- test/headless-debug-loop.test.js — unit tests for debug-loop functions

## NOT Owned (do not modify)
- bin/debug-ledger.js — owned by debug-state-protocol domain (USE via require)
- commands/*.md — owned by command-integration domain
- bin/metrics-collector.js, bin/rule-engine.js, bin/patch-lifecycle.js — prior milestone code
- Existing headless functions (doHeadlessExec, doHeadlessQuery, parseHeadlessFlags, etc.) — READ but do not restructure

## Extension Pattern
This domain EXTENDS bin/gsd-t.js by adding new functions and a new case in doHeadless(). It does NOT modify existing headless functions — it adds alongside them.
