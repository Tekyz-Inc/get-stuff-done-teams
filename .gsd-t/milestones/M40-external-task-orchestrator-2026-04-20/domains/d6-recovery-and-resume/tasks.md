# Tasks: d6-recovery-and-resume

## Summary
Orchestrator crash recovery + `/gsd-t-resume` integration. Reconstructs run state from D1's state.json + D4's JSONL + progress.md. Operator-initiated resume, never auto-restart.

## Tasks

### Task 1: Recovery algorithm
- **Files**: `bin/gsd-t-orchestrator-recover.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`, `.gsd-t/contracts/completion-signal-contract.md`
- **Dependencies**: BLOCKED BY d1-orchestrator-core Task 6 (needs stable state.json schema), BLOCKED BY d4-stream-feed-server Task 2 (needs durable JSONL format)
- **Wave**: 4
- **Acceptance criteria**:
  - Exports `recoverRunState({ projectDir })` → `{ mode: "fresh"|"resume"|"terminal", currentWave, tasks, state }`
  - Reads `.gsd-t/orchestrator/state.json`; if missing → `{ mode: "fresh" }`
  - If `state.status ∈ {done, failed, stopped}` → `{ mode: "terminal" }`; caller archives state and starts fresh
  - For every task marked `in-flight`: calls `assertCompletion` (D3) to reconcile; updates status to DONE or FAILED based on artifacts
  - Handles ambiguous cases: commit exists but no progress.md entry → tag for operator triage, DO NOT silently claim done
  - PID liveness check: if state.json names a pid, `kill -0 pid` (or process.kill with signal 0); log if stale
  - Returns current wave as "first wave with any incomplete task"

### Task 2: Orchestrator `--resume` CLI flag
- **Files**: `bin/gsd-t-orchestrator.js` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 4
- **Acceptance criteria**:
  - `gsd-t orchestrate --resume` calls `recoverRunState`; if `mode: "fresh"` → error with clear message ("no run to resume")
  - If `mode: "terminal"` → archives state.json to `.gsd-t/orchestrator/archive/{ts}/state.json`, starts fresh (unless user passes `--no-archive`)
  - If `mode: "resume"` → continues from `currentWave`; retries ambiguous tasks (D3 retry policy still applies — max 2 attempts total including pre-crash)
  - Supports new `--max-parallel` at resume time (honors new value, not the original)
  - Integration-tested: crash simulation (kill orchestrator mid-wave), restart with `--resume`, assert correct wave continuation

### Task 3: `/gsd-t-resume` Step 0 integration
- **Files**: `commands/gsd-t-resume.md` (MODIFY — Step 0 block only)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 2
- **Wave**: 4
- **Acceptance criteria**:
  - New sub-step "Step 0.3: Orchestrator Auto-Detect" inserted between existing Step 0 (supervisor reattach) and Step 0.1 (detect resume mode)
  - Checks for `.gsd-t/orchestrator/state.json` with non-terminal status
  - If found: prints `⚠ M40 orchestrator run in progress (wave {N}, {X}/{Y} tasks done). To resume: gsd-t orchestrate --resume` — does NOT auto-spawn
  - If absent or terminal: falls through to existing flow
  - No regressions: all existing Step 0 sub-steps still work (tested with no orchestrator state present)

### Task 4: Recovery unit tests
- **Files**: `test/m40-recovery.test.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`, `.gsd-t/contracts/completion-signal-contract.md`
- **Dependencies**: Requires Tasks 1 & 2
- **Wave**: 4
- **Acceptance criteria**:
  - Scenario: crash mid-wave (3 tasks running, orchestrator killed) — recovery sees 3 in-flight, assertCompletion decides per-task
  - Scenario: crash between waves (wave N done, wave N+1 not started) — recovery resumes at wave N+1
  - Scenario: crash mid-task-retry (task failed once, second attempt running) — recovery counts retries correctly (D3 halt-on-second-fail still honored)
  - Scenario: ambiguous task (commit but no progress entry) — recovery flags for triage, does NOT proceed
  - Scenario: terminal state — recovery archives and starts fresh
  - All tests pass under `node --test`

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0 (gated on Wave 3 complete)
- Blocked tasks (waiting on other domains): 1 (Task 1 on D1 Task 6 + D4 Task 2)
- Blocked tasks (within domain): 3
- Estimated checkpoints: 1 (Wave 3 complete)
