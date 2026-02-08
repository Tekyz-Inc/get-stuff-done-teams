# GSD-T: Execute — Run Domain Tasks (Solo or Parallel)

You are the lead agent coordinating task execution across domains. Choose solo or team mode based on the plan.

## Step 1: Load State

Read:
1. `CLAUDE.md` — check for **Branch Guard** (`Expected branch` field)
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/contracts/integration-points.md` — dependency graph
5. `.gsd-t/domains/*/tasks.md` — all task lists

**Branch check (before any work):**
Run `git branch --show-current`. If CLAUDE.md declares an expected branch and you're on a different branch, STOP and warn the user. Do NOT execute tasks on the wrong branch.

Identify:
- Which tasks are already complete (check progress.md)
- Which tasks are unblocked (no pending dependencies)
- Which tasks are blocked (waiting on checkpoints)

## Step 2: Choose Execution Mode

### Solo Mode (default)
Execute tasks yourself following the execution order in `integration-points.md`.

For each task:
1. Read the task description, files list, and contract refs
2. Read the relevant contract(s) — implement EXACTLY what they specify
3. Read the domain's constraints.md — follow all patterns
4. Implement the task
5. Verify acceptance criteria are met
6. Run affected unit tests — fix any failures before proceeding
7. If E2E framework exists and task changed UI/routes/flows: run affected E2E specs, update specs if needed
8. Run the Pre-Commit Gate checklist from CLAUDE.md — update ALL affected docs BEFORE committing
9. Commit with a descriptive message: `[{domain}] Task {N}: {description}`
10. Update `.gsd-t/progress.md` — mark task complete
11. If you've reached a CHECKPOINT in integration-points.md, pause and verify the contract before continuing

### Team Mode (when agent teams are enabled)
Spawn teammates for independent domains:

```
Create an agent team for execution:

ALL TEAMMATES must read before starting:
1. CLAUDE.md — project conventions (CRITICAL)
2. Your domain's scope.md — what you own
3. Your domain's constraints.md — what you must/must not do
4. ALL files in .gsd-t/contracts/ — your interfaces
5. Your domain's tasks.md — your work

RULES FOR ALL TEAMMATES:
- Only modify files listed in your domain's scope.md
- Implement interfaces EXACTLY as specified in contracts
- If a task is marked BLOCKED, message the lead and wait
- Run the Pre-Commit Gate checklist from CLAUDE.md BEFORE every commit — update all affected docs
- After completing each task, message the lead with:
  "DONE: {domain} Task {N} - {summary of what was created/modified}"
- If you need to deviate from a contract, STOP and message the lead
- Commit after each task: [{domain}] Task {N}: {description}

Teammate assignments:
- Teammate "{domain-1}": Execute .gsd-t/domains/{domain-1}/tasks.md
- Teammate "{domain-2}": Execute .gsd-t/domains/{domain-2}/tasks.md
- Teammate "{domain-3}": Execute .gsd-t/domains/{domain-3}/tasks.md

Lead responsibilities:
- Use delegate mode (Shift+Tab)
- Track completions from teammate messages
- When a CHECKPOINT is reached:
  1. Pause blocked teammates
  2. Verify the gate condition (check contract compliance)
  3. Unblock waiting teammates
- Update .gsd-t/progress.md after each completion
- Resolve any contract conflicts immediately
```

## Step 3: Checkpoint Handling

When a checkpoint is reached (solo or team):

1. **Stop** execution of blocked tasks
2. **Read** the relevant contract
3. **Verify** the implemented code matches the contract:
   - API response shapes match?
   - Schema matches?
   - Component interfaces match?
   - Error handling matches?
4. **If mismatch**: Fix the implementation to match the contract, OR update the contract and notify affected domains
5. **Log** in progress.md: `CHECKPOINT {name}: PASSED/FAILED — {details}`
6. **Unblock** downstream tasks

## Step 4: Error Handling

### Contract Violation
A teammate implements something that doesn't match a contract:
1. Stop the teammate
2. Identify the deviation
3. Decide: fix implementation or update contract?
4. If updating contract, message ALL affected teammates with the change
5. Log the decision

### Merge Conflict / File Conflict
Two teammates modified the same file (shouldn't happen with good partitioning):
1. Stop both teammates
2. Identify which domain owns the file (check scope.md)
3. Non-owner reverts their changes
4. Determine if the contract needs updating to prevent recurrence
5. Log the incident

### Blocked Teammate Idle
A teammate finishes independent tasks and is waiting on a checkpoint:
1. Check if checkpoint can be expedited
2. If not, have the teammate work on documentation, tests, or code cleanup within their domain
3. Or shut down the teammate and respawn when unblocked

## Step 5: Completion

When all tasks in all domains are complete:
1. Update `.gsd-t/progress.md` — all tasks marked complete
2. Set status to `EXECUTED`
3. List any contract deviations or decisions made during execution
4. Recommend: proceed to integrate phase

$ARGUMENTS
