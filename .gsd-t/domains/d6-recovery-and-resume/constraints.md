# Constraints: d6-recovery-and-resume

## Must Follow
- Zero external npm deps.
- Recovery is READ-ONLY on state.json during inspection. Only write state.json to update it, atomically (tmp + rename).
- Treat D4 JSONL as authoritative for "what work happened"; treat git as authoritative for "what work committed". Disagreements surface to the operator, never silently reconciled.
- Orchestrator may be restarted with different `--max-parallel` than the original run. Recovery honors the new value, not the original.

## Must Not
- Auto-resume without a deliberate user action. `/gsd-t-resume` never silently re-spawns the orchestrator.
- Re-run already-DONE tasks. D3's `assertCompletion` is the arbiter.
- Assume the orchestrator process that wrote state.json is still alive. Always check PID liveness (mirroring the M36 supervisor PID check pattern).
- Modify D1's state.json schema. If recovery needs a new field, propose a D1 change.

## Must Read Before Using
- `commands/gsd-t-resume.md` Step 0 — existing supervisor-detection block is the template.
- `.gsd-t/contracts/unattended-supervisor-contract.md` §9 "Resume Auto-Reattach Handshake" — pattern to mirror, not code to share.
- `.gsd-t/contracts/completion-signal-contract.md` (D3).

## Gate Semantics
- D6 does NOT execute until D1 completes. Recovery is meaningless without an orchestrator to recover.
- D6 does NOT need D4/D5 to ship (recovery works from JSONL even if UI is deferred).

## Dependencies
- Depends on: D1 (state.json producer), D3 (assertCompletion), D4 (JSONL durable backlog).
- Depended on by: `/gsd-t-resume` workflow.
