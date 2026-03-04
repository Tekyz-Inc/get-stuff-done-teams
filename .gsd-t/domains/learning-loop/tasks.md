# Tasks: learning-loop

## Summary
Implements the Reflexion-pattern learning loop across three command files. `gsd-t-execute.md` and `gsd-t-debug.md` get pre-task experience retrieval (grep Decision Log for past failures before spawning subagents) and outcome-tagged Decision Log writes. `gsd-t-wave.md` gets phase transition event writes at every phase handoff.

## Tasks

### Task 1: Update `commands/gsd-t-execute.md` — outcome tagging + experience retrieval
- **Files**: `commands/gsd-t-execute.md` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (experience_retrieval and outcome_tagged event types)
- **Dependencies**: BLOCKED by event-stream Task 1 (need event schema contract + event-writer CLI path)
- **Acceptance criteria**:
  - Read the FULL `commands/gsd-t-execute.md` before modifying — understand all steps and step numbers
  - **Pre-task experience retrieval**: Add a step BEFORE each domain subagent is spawned (in Solo Mode Step 3 "For each domain" block) that:
    1. Greps `.gsd-t/progress.md` Decision Log for `[failure]` or `[learning]` entries containing the domain name
    2. If found: prepends a clearly delimited `## ⚠️ Past Failures (retrieve before acting)` block to the subagent prompt (max 5 matching lines)
    3. If nothing found: proceed normally (no warning, no delay)
    4. After retrieval: writes an `experience_retrieval` event via `node ~/.claude/scripts/gsd-t-event-writer.js --type experience_retrieval --reasoning "{N entries found}" --outcome null` (only if entries found)
  - **Outcome tagging**: In the domain subagent instructions (Step 3), update the Decision Log write instruction to prefix entries:
    - Task completed successfully → prefix `[success]`
    - Task completed after fix → prefix `[learning]`
    - Task deferred (deferred-items.md) → prefix `[deferred]`
    - Task failed after 3 attempts → prefix `[failure]`
  - All existing step numbers preserved — new content inserted within existing blocks, not as new top-level steps
  - No behavioral changes to any existing functionality

### Task 2: Update `commands/gsd-t-debug.md` — outcome tagging + experience retrieval
- **Files**: `commands/gsd-t-debug.md` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (experience_retrieval event type)
- **Dependencies**: BLOCKED by event-stream Task 1 (need event schema contract)
- **Acceptance criteria**:
  - Read the FULL `commands/gsd-t-debug.md` before modifying
  - **Pre-task experience retrieval**: Add to Step 1 (Load Context) or as Step 1.7 (after loop detection at 1.5):
    1. Grep `.gsd-t/progress.md` Decision Log for `[failure]` or `[learning]` entries matching the issue keywords (from $ARGUMENTS)
    2. If found: display a `## ⚠️ Relevant Past Failures` block showing matching entries (max 5) — include this in the context passed to the debug subagent
    3. Write an `experience_retrieval` event if entries found
  - **Outcome tagging**: When debug writes to Decision Log:
    - Debug session entry → prefix `[debug]`
    - Fix succeeded → prefix `[success]`
    - Fix failed → prefix `[failure]`
    - Issue deferred → prefix `[deferred]`
  - Step numbering: use 1.7 for new step (between 1.5 loop detection and 2 — consistent with existing 1.5 fractional convention for mandatory gates in this file)
  - No behavioral changes to existing debug functionality

### Task 3: Update `commands/gsd-t-wave.md` — phase transition event writes
- **Files**: `commands/gsd-t-wave.md` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (phase_transition event type)
- **Dependencies**: BLOCKED by event-stream Task 1 (need event-writer CLI + events/ schema)
- **Acceptance criteria**:
  - Read the FULL `commands/gsd-t-wave.md` before modifying — identify all phase handoff points
  - In the "Between Each Phase" section (currently runs spot-check), ADD after the spot-check passes:
    ```bash
    node ~/.claude/scripts/gsd-t-event-writer.js \
      --type phase_transition \
      --command gsd-t-wave \
      --phase {COMPLETED_PHASE} \
      --reasoning "Phase complete: {spot-check summary}" \
      --outcome success \
      --agent-id "${CLAUDE_SESSION_ID:-unknown}"
    ```
  - Also write a `phase_transition` event with `outcome: failure` when a spot-check fails and the phase is being re-spawned
  - Event write is best-effort — if event-writer is not installed (fresh install), the `node` command will fail silently (the || true fallback or try-catch in command text)
  - Add fallback: `node ~/.claude/scripts/gsd-t-event-writer.js ... || true` to prevent event write failure from blocking wave execution
  - All existing wave behavior unchanged — event writes are additive

## Execution Estimate
- Total tasks: 3
- Independent tasks: NONE (all 3 blocked by event-stream Task 1 schema contract)
- Blocked tasks: 3 (all blocked by event-stream Task 1)
- In practice: once event-stream Task 1 is committed, all 3 learning-loop tasks are independent of each other
- Estimated checkpoints: 1 (Checkpoint 2 from integration-points.md — after all learning-loop tasks complete)
