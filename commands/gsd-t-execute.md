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

## Step 1.5: Graph-Enhanced Domain Isolation Check (if available)

If `.gsd-t/graph/meta.json` exists, run graph queries before execution begins:

1. **Reindex** (if stale): `query('reindex', { force: false })` — ensure graph reflects current code
2. **Domain boundary check**: For each domain about to execute, `query('getEntitiesByDomain', { domain })` — verify the domain's entities match its scope.md
3. **Pre-execution snapshot**: Record entity counts per domain — after execution, compare to detect scope creep (domain agent modified entities outside its domain)
4. **Cross-domain dependencies**: `query('getDomainBoundaryViolations', {})` — flag existing violations before work begins so they aren't confused with new violations introduced during execution

After each domain completes, re-run `getDomainBoundaryViolations` and diff against pre-execution snapshot. If new violations appear, flag them immediately before proceeding to the next domain.

## Step 2: QA Subagent

In solo mode, QA runs inside each domain subagent (see Step 3). In team mode, the lead spawns QA subagents at each domain checkpoint using the pattern below.

**QA subagent prompt:**
```
Task subagent (general-purpose, model: haiku):
"Run the full test suite for this project and report pass/fail counts.
Read .gsd-t/contracts/ for contract definitions.
Write edge case tests for any new code paths in this task: {task description}.
Report: test pass/fail status and any coverage gaps found."
```

If QA found issues, append each to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {DT_START} | gsd-t-execute | Step 2 | haiku | {DURATION}s | {severity} | {finding} |`

## Step 3: Choose Execution Mode

### Wave Scheduling (read first)

Before choosing solo or team mode, read the `## Wave Execution Groups` section in `.gsd-t/contracts/integration-points.md` (added by the plan phase).

**If wave groups are present**:
- Execute wave-by-wave: complete all tasks in Wave 1 before starting Wave 2
- Within each wave, tasks marked as parallel-safe can run concurrently (team mode) or be interleaved (solo mode)
- At each wave boundary: run the CHECKPOINT — verify contract compliance — before proceeding
- File conflict detection: if two tasks in the same wave list the same file in their `scope.md` ownership, move one to the next wave

**If no wave groups are defined** (older plans): fall back to the `Execution Order` list.

### Solo Mode (default) — Domain Task-Dispatcher Pattern

Each domain's work runs via a lightweight domain task-dispatcher. The dispatcher spawns one Task subagent PER TASK within that domain, giving each task a completely fresh context window with only the minimum required context. The orchestrator (this agent) stays lightweight — it only spawns dispatchers, collects summaries, verifies checkpoints, and updates progress.

**Context provided to each task subagent (fresh-dispatch-contract.md payload):**
- `scope.md` for the domain
- Relevant contracts (only those referenced by the task)
- The single task from `tasks.md`
- Graph context for the task's files (if available)
- Up to 5 prior task summaries (10-20 lines each, most recent first)
- Past failure/learning entries for this domain (max 5 lines)

**OBSERVABILITY LOGGING (MANDATORY) — repeat for every task subagent spawn:**

Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`

Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END

Compute context utilization — run via Bash:
`if [ "${CLAUDE_CONTEXT_TOKENS_MAX:-0}" -gt 0 ]; then CTX_PCT=$(echo "scale=1; ${CLAUDE_CONTEXT_TOKENS_USED:-0} * 100 / ${CLAUDE_CONTEXT_TOKENS_MAX}" | bc); else CTX_PCT="N/A"; fi`

Alert on context thresholds (display to user inline):
- If CTX_PCT is a number and >= 85: `echo "🔴 CRITICAL: Context at ${CTX_PCT}% — compaction likely. Task MUST be split."`
- If CTX_PCT is a number and >= 70: `echo "⚠️ WARNING: Context at ${CTX_PCT}% — approaching compaction threshold. Consider splitting in plan."`

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-execute | task:{task-id} | sonnet | {DURATION}s | {pass/fail} | {TOKENS} | {COMPACTED} | {domain-name} | task-{task-id} | {CTX_PCT} |`

**For each domain (in wave order), run the domain task-dispatcher:**

**Pre-dispatch experience retrieval (before dispatching each domain's tasks):**
Run via Bash:
`grep -i "\[failure\]\|\[learning\]" .gsd-t/progress.md | grep -i "{domain-name}" | tail -5`

If results found:
- Store as `PAST_FAILURES` — prepend to each task subagent prompt (max 5 lines)
- Write event via Bash: `node ~/.claude/scripts/gsd-t-event-writer.js --type experience_retrieval --command gsd-t-execute --reasoning "{N past failures found for {domain-name}}" --outcome null || true`

If no results found: proceed normally (no warning block, no event write).

**Domain task-dispatcher (lightweight — sequences tasks, passes summaries):**

For each task in `.gsd-t/domains/{domain-name}/tasks.md` (in order, skip completed):

1. Load prior summaries: Read up to 5 most recent `.gsd-t/domains/{domain-name}/task-*-summary.md` files (10-20 lines each)
2. Load graph context (if `.gsd-t/graph/meta.json` exists): query task's files for relevant graph context
3. Display: `⚙ [sonnet] gsd-t-execute → domain: {domain-name}, task-{task-id}`
4. Run observability Bash (T_START / DT_START / TOK_START / TOK_MAX)
5. Spawn task subagent:

```
Task subagent (general-purpose, model: sonnet, mode: bypassPermissions):
"You are executing a single task for the {domain-name} domain.

{PAST_FAILURES block if any — ## ⚠️ Past Failures (read before acting)\n{lines}}

## Your Task
{full task block from tasks.md — id, description, files, contract refs, dependencies, acceptance criteria}

## Domain Scope
{contents of .gsd-t/domains/{domain-name}/scope.md}

## Relevant Contracts
{contents of each contract file referenced by this task}

## Graph Context (if available)
{graph query results for this task's files — omit section if unavailable}

## Prior Task Summaries (most recent first, max 5)
{contents of task-{N}-summary.md files — 10-20 lines each}

## Instructions

Execute the task above:
1. Read the task description, files list, and contract refs carefully
2. Read relevant contracts — implement EXACTLY what they specify
3. Destructive Action Guard: if the task involves DROP TABLE, schema changes that lose
   data, removing working modules, or replacing architecture patterns → write a
   NEEDS-APPROVAL entry to .gsd-t/deferred-items.md, skip the task, stop here
4. Implement the task
5. Verify acceptance criteria are met
6. Write comprehensive tests (MANDATORY — no feature code without test code):
   - Unit/integration: happy path + edge cases + error cases for every new/changed function
   - Playwright E2E (if UI/routes/flows changed): new specs for new features, cover
     all modes, form validation, empty/loading/error states, common edge cases
   - If no test framework exists: set one up as part of this task
7. Run ALL tests — unit, integration, Playwright. Fix failures (up to 2 attempts)
8. Run Pre-Commit Gate checklist from CLAUDE.md — update all affected docs BEFORE committing
9. Commit immediately: feat({domain-name}/task-{task-id}): {description}
10. Update .gsd-t/progress.md — mark this task complete; prefix the Decision Log entry:
    - Completed successfully on first attempt → prefix `[success]`
    - Completed after a fix → prefix `[learning]`
    - Deferred to .gsd-t/deferred-items.md → prefix `[deferred]`
    - Failed after 3 attempts → prefix `[failure]`
11. Spawn QA subagent (model: haiku) after completing the task:
    'Run the full test suite. Read .gsd-t/contracts/ for definitions.
     Report: pass/fail counts and coverage gaps.'
    If QA fails, fix before proceeding. Append issues to .gsd-t/qa-issues.md.
12. Write task summary to .gsd-t/domains/{domain-name}/task-{task-id}-summary.md:
    ## Task {task-id} Summary — {domain-name}
    - **Status**: PASS | FAIL
    - **Files modified**: {list}
    - **Constraints discovered**: {any new constraints or surprises}
    - **Tests**: {pass/fail count}
    - **Notes**: {10-20 lines max — key decisions, patterns, warnings}

Deviation rules:
- Bug blocking progress → fix, max 3 attempts; if still blocked, log to
  .gsd-t/deferred-items.md and stop (report FAIL in summary)
- Missing dependency → add minimum needed, document in commit message
- Non-trivial blocker → log to .gsd-t/deferred-items.md
- Architectural change required → write NEEDS-APPROVAL to .gsd-t/deferred-items.md,
  skip the task, stop here — never self-approve structural changes

Report back:
- Task: {task-id}
- Status: PASS | FAIL
- Files modified: {list}
- Tests: {pass/fail count}
- Commit: {hash}
- Deferred items (if any)"
```

6. After task subagent returns:
   - Run observability Bash (T_END / TOK_END / DURATION / CTX_PCT)
   - Append to token-log.md (per-task row)
   - Alert on CTX_PCT thresholds (display to user inline)
   - Check `.gsd-t/deferred-items.md` for `NEEDS-APPROVAL` — if found, STOP and present to user before proceeding to the next task
   - Read the task summary from `.gsd-t/domains/{domain-name}/task-{task-id}-summary.md` to use as prior summary for the next task

**After all tasks in a domain complete (orchestrator responsibilities):**
1. Check `.gsd-t/deferred-items.md` for any `NEEDS-APPROVAL` entries — if found, STOP and present to user before spawning the next domain
2. If a CHECKPOINT is reached per `integration-points.md`, verify contract compliance (see Step 4) before proceeding to the next wave/domain
3. Update `.gsd-t/progress.md` with domain completion status

### Team Mode (when agent teams are enabled)
Spawn teammates for domains within the same wave. Only domains in the same wave can run in parallel — do not spawn teammates for domains in different waves simultaneously. Each teammate uses the **domain task-dispatcher pattern** — one subagent per task within their domain (same as solo mode).

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
- **Commit immediately after each task**: `feat({domain}/task-{N}): {description}` — do NOT batch commits
- **Deviation Rules**: (1) Bug blocking progress → fix, 3 attempts max; (2) Missing dependency → add minimum needed; (3) Blocker → fix and log to deferred-items.md; (4) Architectural change → STOP, message lead, never self-approve

**Task-dispatcher pattern per teammate:**
For each task in your domain's tasks.md (in order, skip completed):
1. Load prior summaries: read up to 5 most recent `.gsd-t/domains/{your-domain}/task-*-summary.md` files
2. Load graph context for task's files (if .gsd-t/graph/meta.json exists)
3. Spawn one Task subagent (model: sonnet) with ONLY:
   - scope.md, relevant contracts, the single task, graph context, prior summaries
   - Instruction to write task summary to `.gsd-t/domains/{domain}/task-{id}-summary.md`
     (format per fresh-dispatch-contract.md Task Summary Format)
4. After task subagent returns, read the summary and pass it as prior context to the next task
5. After completing each task, message the lead with:
   "DONE: {domain} Task {N} - {summary of what was created/modified}"
6. If you need to deviate from a contract, STOP and message the lead

Teammate assignments:
- Teammate "{domain-1}": Execute .gsd-t/domains/{domain-1}/tasks.md (task-dispatcher pattern, isolated worktree)
- Teammate "{domain-2}": Execute .gsd-t/domains/{domain-2}/tasks.md (task-dispatcher pattern, isolated worktree)
- Teammate "{domain-3}": Execute .gsd-t/domains/{domain-3}/tasks.md (task-dispatcher pattern, isolated worktree)

**Worktree isolation (per domain teammate):**
Each domain teammate MUST be spawned with `isolation: "worktree"` on the Agent tool:
```
Agent({
  prompt: "{domain execution prompt — include: 'You are working in an isolated git worktree. All your changes are isolated to this worktree branch. Do not push; the lead will merge your branch after all domains complete.'}",
  isolation: "worktree"
})
```
Each teammate works in its own isolated copy of the repository. Changes from one domain do not affect another domain's working tree. This is required for parallel safety — see `.gsd-t/contracts/worktree-isolation-contract.md`.

Lead responsibilities (QA is handled via Task subagent — spawn one after each domain checkpoint):
- Use delegate mode (Shift+Tab)
- Track completions from teammate messages
- When a CHECKPOINT is reached:
  1. Pause blocked teammates
  2. Verify the gate condition (check contract compliance)
  3. Unblock waiting teammates
- Update .gsd-t/progress.md after each completion
- Resolve any contract conflicts immediately

**Sequential Merge Protocol (lead runs after ALL domain agents complete):**

Once all domain teammates report completion, the lead performs sequential atomic merges. This is the critical integration step — see `.gsd-t/contracts/worktree-isolation-contract.md` for the full merge protocol.

1. **Determine merge order**: Read `.gsd-t/contracts/integration-points.md` — use the dependency graph to sort domains. Domains with no upstream dependencies merge first. Example: if domain-A has no deps and domain-B depends on domain-A's output, merge order is [domain-A, domain-B].

2. **For each domain (in dependency order)**:

   a. **File ownership validation (pre-merge)**: Check files the domain agent modified against the domain's `.gsd-t/domains/{domain}/scope.md`:
      - If `.gsd-t/graph/meta.json` exists: run `query('getDomainBoundaryViolations', { domain })` — flag any files modified outside the domain's declared ownership
      - If graph unavailable: list files changed in the worktree branch via `git diff --name-only` and compare against scope.md manually
      - If violations found: log them in `.gsd-t/progress.md` as `[violation] {domain}: modified {file} outside scope`, but do NOT block merge — flag for immediate review after merge

   b. **Merge the domain's worktree branch**:
      ```bash
      # The worktree branch name is returned by the Agent tool when isolation: "worktree" is used
      git merge --no-ff {domain-worktree-branch} -m "integrate({domain}): merge worktree branch"
      ```

   c. **Contract validation (post-merge)**: Read each contract in `.gsd-t/contracts/` — verify the merged code still satisfies all contract shapes (API shapes, schemas, interfaces). If a contract is violated, log it immediately.

   d. **Run integration tests**:
      ```bash
      node --test test/
      # or project's test command from package.json
      ```

   e. **If tests PASS**: Continue to the next domain in merge order.

   f. **If tests FAIL**: Roll back this domain's merge:
      ```bash
      git reset --hard HEAD~1
      # or: git revert HEAD --no-edit
      ```
      Log failure: `[rollback] {domain}: merge rolled back — integration tests failed after merge`
      Record in `.gsd-t/progress.md` Decision Log.
      Continue with remaining domains (other domains' merges are not affected).

3. **Post-merge ownership report**: After all merges complete (successful or rolled back), log a summary in `.gsd-t/progress.md`:
   ```
   ## Worktree Merge Summary — {date}
   - {domain-1}: MERGED | tests: PASS | violations: {N}
   - {domain-2}: ROLLED BACK | reason: integration tests failed
   - {domain-3}: MERGED | tests: PASS | violations: 0
   ```

**Worktree Cleanup (MANDATORY — run after merge protocol, success or failure):**

After all merges complete (whether all passed, some rolled back, or errors occurred):

1. List all worktree branches created during this execution run:
   ```bash
   git worktree list
   git branch --list "gsd-t-worktree-*"
   ```

2. Remove each domain worktree:
   ```bash
   git worktree remove --force {worktree-path}
   git branch -D {worktree-branch}
   ```

3. **Orphaned worktree detection**: If any worktrees remain after cleanup (can happen if an agent crashed):
   ```bash
   git worktree prune
   ```
   Log: `[cleanup] Pruned {N} orphaned worktrees via git worktree prune`

4. Verify no worktrees remain except the main working tree:
   ```bash
   git worktree list
   # should show only: {main-path} {commit} [branch]
   ```

Cleanup is not optional — orphaned worktrees waste disk space and can confuse subsequent executions. Always run cleanup, even if earlier steps failed.
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

### Scan Doc Micro-Update (if `.gsd-t/scan/` exists):
After all tasks complete, patch structural metadata in scan docs so they stay fresh between full scans. This is near-zero cost — no LLM re-analysis, just updating counts and lists from code.

For each scan doc that exists, apply only the relevant patches:
- **`.gsd-t/scan/architecture.md`** — Update file/directory counts, add new files/modules created during execution
- **`.gsd-t/scan/quality.md`** — Mark resolved TODOs/FIXMEs, update test counts (run `grep -rc "test\|it\|describe" tests/` or equivalent), append new files to Consumer Surfaces table if applicable
- **`.gsd-t/scan/security.md`** — If a security finding was fixed during execution, mark it `[RESOLVED]`
- **`.gsd-t/scan/business-rules.md`** — Append any new validation/auth/workflow rules added during execution
- **`.gsd-t/scan/contract-drift.md`** — If contracts were updated, mark resolved drift items

Skip any scan doc that wasn't affected by the executed tasks. Skip analytical sections (assessments, recommendations) — those require a full scan to update.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
