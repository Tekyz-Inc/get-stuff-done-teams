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

## Step 2: QA Setup

After completing each task, spawn a QA subagent via the Task tool to run tests:

```
Task subagent (general-purpose, model: haiku):
"Run the full test suite for this project and report pass/fail counts.
Read .gsd-t/contracts/ for contract definitions.
Write edge case tests for any new code paths in this task: {task description}.
Report: test pass/fail status and any coverage gaps found."
```

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning: run `date +%s` via Bash → save as START
After subagent returns: run `date +%s` → compute `DURATION=$((END-START))`
Append to `.gsd-t/token-log.md` (create with header `| Date | Command | Step | Model | Duration(s) | Notes |` if missing):
`| {YYYY-MM-DD HH:MM} | gsd-t-execute | Step 2 | haiku | {DURATION}s | task: {task-name}, {pass/fail} |`
If QA found issues, append each to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {YYYY-MM-DD HH:MM} | gsd-t-execute | Step 2 | haiku | {DURATION}s | {severity} | {finding} |`

QA failure on any task blocks proceeding to the next task.

## Step 3: Choose Execution Mode

### Wave Scheduling (read first)

Before choosing solo or team mode, read the `## Wave Execution Groups` section in `.gsd-t/contracts/integration-points.md` (added by the plan phase).

**If wave groups are present**:
- Execute wave-by-wave: complete all tasks in Wave 1 before starting Wave 2
- Within each wave, tasks marked as parallel-safe can run concurrently (team mode) or be interleaved (solo mode)
- At each wave boundary: run the CHECKPOINT — verify contract compliance — before proceeding
- File conflict detection: if two tasks in the same wave list the same file in their `scope.md` ownership, move one to the next wave

**If no wave groups are defined** (older plans): fall back to the `Execution Order` list.

### Solo Mode (default)
Execute tasks yourself following the wave groups (or execution order) in `integration-points.md`.

### Deviation Rules (MANDATORY for every task)

When you encounter unexpected situations during a task:

1. **Bug in existing code blocking progress** → Fix it immediately, up to 3 attempts. If still blocked after 3 attempts, add to `.gsd-t/deferred-items.md` and move to the next task.
2. **Missing functionality that the task clearly requires** → Add the minimum required code to unblock the task. Do not gold-plate. Document in commit message.
3. **Blocker (missing file, wrong API, broken dependency)** → Fix the blocker and continue. Add a note to `.gsd-t/deferred-items.md` if the fix was more than trivial.
4. **Architectural change required** → STOP immediately. Do NOT proceed. Apply the Destructive Action Guard: explain what exists, what needs to change, what breaks, and a migration path. Wait for explicit user approval.

**3-attempt limit**: If any fix attempt fails 3 times, move on — don't loop. Log to `.gsd-t/deferred-items.md`.

For each task:
1. Read the task description, files list, and contract refs
2. Read the relevant contract(s) — implement EXACTLY what they specify
3. Read the domain's constraints.md — follow all patterns
4. **Destructive Action Guard**: Before implementing, check if the task involves any destructive or structural changes (DROP TABLE, schema changes that lose data, removing existing modules, replacing architecture patterns). If YES → STOP and present the change to the user with what exists, what will change, what will break, and a safe migration path. Wait for explicit approval before proceeding.
5. Implement the task
6. Verify acceptance criteria are met
7. **Write comprehensive tests for every new or changed code path** (MANDATORY — no exceptions):
   a. **Unit/integration tests**: Cover the happy path, common edge cases, error cases, and boundary conditions for every new or modified function
   b. **Playwright E2E tests** (if UI/routes/flows/modes changed): Detect `playwright.config.*` or Playwright in dependencies. If present:
      - Create NEW specs for new features, pages, modes, or flows — not just update existing ones
      - Cover: happy path, form validation errors, empty states, loading states, error states, responsive breakpoints
      - Cover: all feature modes/flags (e.g., if `--component` mode was added, test `--component` mode specifically)
      - Cover: common edge cases (network errors, invalid input, rapid clicking, back/forward navigation)
      - Use descriptive test names that explain the scenario being tested
   c. If no test framework exists: set one up as part of the task (at minimum, Playwright for E2E)
   d. **"No feature code without test code"** — implementation and tests are ONE deliverable, not two separate steps
8. **Run ALL tests** — unit, integration, and full Playwright suite. Fix any failures before proceeding (up to 2 attempts)
9. Run the Pre-Commit Gate checklist from CLAUDE.md — update ALL affected docs BEFORE committing
10. **Commit immediately** after each task: `feat({domain}/task-{N}): {description}` — do NOT batch commits at phase end
11. Update `.gsd-t/progress.md` — mark task complete
12. If you've reached a CHECKPOINT in integration-points.md, pause and verify the contract before continuing

### Team Mode (when agent teams are enabled)
Spawn teammates for domains within the same wave. Only domains in the same wave can run in parallel — do not spawn teammates for domains in different waves simultaneously:

```
Create an agent team for execution:

ALL TEAMMATES must read before starting:
1. CLAUDE.md — project conventions (CRITICAL)
2. Your domain's scope.md — what you own
3. Your domain's constraints.md — what you must/must not do
4. ALL files in .gsd-t/contracts/ — your interfaces
5. Your domain's tasks.md — your work

RULES FOR ALL TEAMMATES:
- **Destructive Action Guard**: NEVER drop tables, remove columns, delete data, replace architecture patterns, or remove working modules without messaging the lead first. The lead must get user approval before any destructive action proceeds.
- Only modify files listed in your domain's scope.md
- Implement interfaces EXACTLY as specified in contracts
- **Write comprehensive tests with every task** — no feature code without test code:
  - Unit/integration tests: happy path + edge cases + error cases for every new/changed function
  - Playwright E2E specs (if UI/routes/flows/modes changed): new specs for new features, cover all modes/flags, form validation, empty/loading/error states, common edge cases
  - Tests are part of the deliverable, not a follow-up
- If a task is marked BLOCKED, message the lead and wait
- Run the Pre-Commit Gate checklist from CLAUDE.md BEFORE every commit — update all affected docs
- After completing each task, message the lead with:
  "DONE: {domain} Task {N} - {summary of what was created/modified}"
- If you need to deviate from a contract, STOP and message the lead
- **Commit immediately after each task**: `feat({domain}/task-{N}): {description}` — do NOT batch commits
- **Deviation Rules**: (1) Bug blocking progress → fix, 3 attempts max; (2) Missing dependency → add minimum needed; (3) Blocker → fix and log to deferred-items.md; (4) Architectural change → STOP, message lead, never self-approve

Teammate assignments:
- Teammate "{domain-1}": Execute .gsd-t/domains/{domain-1}/tasks.md
- Teammate "{domain-2}": Execute .gsd-t/domains/{domain-2}/tasks.md
- Teammate "{domain-3}": Execute .gsd-t/domains/{domain-3}/tasks.md
Lead responsibilities (QA is handled via Task subagent — spawn one after each domain checkpoint):
- Use delegate mode (Shift+Tab)
- Track completions from teammate messages
- When a CHECKPOINT is reached:
  1. Pause blocked teammates
  2. Verify the gate condition (check contract compliance)
  3. Unblock waiting teammates
- Update .gsd-t/progress.md after each completion
- Resolve any contract conflicts immediately
```

## Step 4: Checkpoint Handling

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

## Step 5: Error Handling

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

## Step 6: Completion

When all tasks in all domains are complete:
1. Update `.gsd-t/progress.md` — all tasks marked complete
2. Set status to `EXECUTED`
3. List any contract deviations or decisions made during execution

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Execute complete — {N}/{N} tasks done") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report completion summary and recommend proceeding to integrate phase. Wait for confirmation.

## Document Ripple

Execute modifies source code, so the Pre-Commit Gate (referenced in Step 9) covers document updates. For clarity, the key documents affected by execution:

### Always update:
1. **`.gsd-t/progress.md`** — Mark tasks complete, update domain status, log execution summary

### Check if affected (per task):
2. **`.gsd-t/contracts/`** — Did a task change an API endpoint, schema, or component interface? Update the contract
3. **`docs/requirements.md`** — Did a task implement or change a requirement? Mark it complete or revise
4. **`docs/architecture.md`** — Did a task add/change a component or data flow? Update it
5. **`.gsd-t/techdebt.md`** — Did a task resolve a debt item? Mark it done. Did it reveal new debt? Add it

$ARGUMENTS
