# Constraints: headless-loop

## Must Follow
- Zero external dependencies — Node.js built-ins only (fs, path, child_process)
- Functions under 30 lines, total additions under 200 lines
- Follow existing bin/gsd-t.js patterns: ANSI colors, log/success/warn/error/info/heading helpers
- The loop controller must be pure Node.js — zero AI context accumulation
- Each iteration spawns a separate `claude -p` process — never reuse a session
- Escalation tiers: iterations 1-5 sonnet, 6-15 opus, 16-20 STOP with diagnostic output
- --max-iterations N flag (default 20) — enforced by the external process, not by AI

## Must Not
- Modify existing headless functions (doHeadlessExec, doHeadlessQuery, parseHeadlessFlags, buildHeadlessCmd, mapHeadlessExitCode)
- Add external npm dependencies
- Run AI logic inside the loop controller — it only spawns claude -p and reads results
- Allow iteration count to exceed --max-iterations under any circumstance

## Must Read Before Using
- bin/gsd-t.js lines 1844-2000 — existing headless implementation (parseHeadlessFlags, doHeadlessExec, mapHeadlessExitCode, headlessLogPath patterns)
- bin/debug-ledger.js — the ledger API this domain imports (readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats)
- .gsd-t/contracts/headless-contract.md — existing headless contract (exit codes, JSON envelope, flags)
- .gsd-t/contracts/debug-loop-contract.md — the new contract defining ledger schema and loop protocol

## Dependencies
- Depends on: debug-state-protocol (imports bin/debug-ledger.js for ledger operations)
- Depended on by: command-integration (command files reference `gsd-t headless --debug-loop` invocation)
