# Domain: d6-recovery-and-resume

## Responsibility
Orchestrator crash recovery and `/gsd-t-resume` integration. On orchestrator restart, reconstruct run state from durable sources (D4's JSONL + D1's state.json + progress.md) and continue from the last known-good wave boundary.

## Owned Files/Directories
- `bin/gsd-t-orchestrator-recover.cjs` — reconstruct state from disk; decide "resume wave N task M" or "start fresh"
- `commands/gsd-t-resume.md` — **modify** Step 0 block (existing) to detect an orchestrator run in progress and hand off to the orchestrator rather than falling through to interactive resume
- `test/m40-recovery.test.js` — unit tests: crash scenarios (mid-wave, between waves, mid-task), state reconstruction correctness

## NOT Owned (do not modify)
- `bin/gsd-t-orchestrator.js` (D1 — D6 reads its state.json, doesn't rewrite orchestration)
- `scripts/gsd-t-stream-feed-server.js` (D4 — D6 reads JSONL, doesn't modify server)
- `.gsd-t/contracts/completion-signal-contract.md` (D3 — D6 calls its helper)

## Recovery Algorithm
1. On `gsd-t orchestrate` start, check for `.gsd-t/orchestrator/state.json`.
2. If present AND not-terminal (status ∈ {running, paused}): enter RECOVERY mode.
3. For each task marked "in-flight" in state.json: call D3's `assertCompletion`. If DONE → mark done. If FAILED → mark failed. If ambiguous (commit exists but no progress.md entry) → tag for operator triage.
4. Resume from the first incomplete wave. Tasks within that wave whose previous attempt failed go back into the queue (honoring D3's retry policy — second failure halts).
5. If state.json is terminal (done/failed/stopped): archive it, start fresh.

## /gsd-t-resume Integration
- `commands/gsd-t-resume.md` Step 0 currently checks for `.gsd-t/.unattended/supervisor.pid`. D6 adds a parallel check for `.gsd-t/orchestrator/state.json` (non-terminal). If found, instruct the user to run `gsd-t orchestrate --resume` rather than falling through to interactive resume.
- Do NOT auto-spawn the orchestrator from within `/gsd-t-resume`. Resume is a planning step; spawning the orchestrator is an explicit user action.
