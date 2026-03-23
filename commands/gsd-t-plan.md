# GSD-T: Plan — Create Domain Task Lists with Dependencies

You are the lead agent creating atomic execution plans for each domain. This phase is ALWAYS single-session — one agent with full context across all domains to ensure consistency.

## Step 1: Load Full Context

Read ALL of these:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — every contract file
4. `.gsd-t/domains/*/scope.md` — every domain scope
5. `.gsd-t/domains/*/constraints.md` — every domain constraint
6. `docs/` — requirements, architecture, schema, design
7. Existing source code (if any) — understand current state
8. `.gsd-t/CONTEXT.md` (if exists — from discuss phase) — **MANDATORY READ if present**

**If CONTEXT.md exists:** Every Locked Decision listed in it MUST be mapped to at least one task in Step 2. Do NOT proceed to execute if any Locked Decision is unmapped.

## Step 1.5: Graph-Enhanced Dependency Detection

If `.gsd-t/graph/meta.json` exists (graph index is available):
1. Query `findDuplicates` to detect when planned tasks would create duplicate functions across domains — flag for SharedCore extraction or deduplication
2. Query `getImporters` for key modules to identify implicit task dependencies that might not be obvious from contracts alone
3. Feed these findings into the Cross-Domain Duplicate Operation Scan and dependency mapping in Steps 2–3

If graph is not available, skip this step.

## Step 1.7: Pre-Mortem — Historical Failure Analysis

Before creating task lists, check historical task-metrics for domain-level failure patterns from previous milestones:

1. Run via Bash:
   `node -e "const c = require('./bin/metrics-collector.js'); const domains = [/* list domain names from scope files */]; domains.forEach(d => { const w = c.getPreFlightWarnings(d); if(w.length) w.forEach(x => console.log('⚠️ ' + x)); });" 2>/dev/null || true`

2. If any domain has `first_pass_rate < 0.6` historically:
   - Display warning inline: `⚠️ Domain {name} has historically low first-pass rate ({rate}%). Consider: smaller tasks, more explicit acceptance criteria, or additional contract detail.`
   - This is **non-blocking** — it informs task design, does not prevent planning.

3. If `.gsd-t/metrics/task-metrics.jsonl` does not exist: skip this step silently (first milestone, no historical data).

## Step 2: Create Task Lists Per Domain

### SharedCore-First Pre-Check

Before writing any domain task lists:
1. Does `.gsd-t/contracts/shared-services-contract.md` exist?
   - **YES**: A `shared-core` domain has been identified. Plan its tasks first. All client-surface domains that consume SharedCore operations are BLOCKED BY shared-core until its tasks complete. Use `BLOCKED BY shared-core Task {N}` in the relevant client domain task lists.
   - **NO**: Proceed. The Cross-Domain Duplicate Operation Scan (below) will catch any shared operations missed during partition.

For each domain, write `.gsd-t/domains/{domain-name}/tasks.md`:

```markdown
# Tasks: {domain-name}

## Summary
{1-2 sentence description of what this domain delivers when all tasks complete}

## Tasks

### Task 1: {descriptive name}
- **Files**: {files to create or modify}
- **Contract refs**: {which contracts this implements}
- **Dependencies**: NONE | BLOCKED by {domain} Task {N}
- **Acceptance criteria**:
  - {specific testable outcome}
  - {specific testable outcome}

### Task 2: {descriptive name}
- **Files**: {files to create or modify}
- **Contract refs**: {which contracts this implements}
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - {specific testable outcome}
```

### Task Design Rules:
1. **Atomic**: Each task produces a working, testable increment
2. **Self-contained context**: A fresh agent with only CLAUDE.md, the domain's scope/constraints, the relevant contracts, and the task description should be able to execute it
3. **File-scoped**: Each task lists exactly which files it touches — no surprises
4. **Contract-bound**: Every task that crosses a domain boundary must reference the specific contract it implements
5. **Ordered**: Tasks within a domain are numbered in execution order
6. **No implicit knowledge**: Don't assume the executing agent remembers previous tasks — reference contracts and files explicitly
7. **Context-window fit**: Each task MUST be executable within a single context window. Apply the scope validation heuristics below.

### Task Scope Validation

After writing each task, apply this heuristic check before finalizing:

**Splitting candidates — flag if ANY of these are true:**
- Task lists **more than 5 files** to modify or create
- Task has **more than 3 complex dependencies** (other tasks, contracts, or external systems it must read and understand)
- Task description spans multiple distinct concerns (e.g., "implement X and also refactor Y and update Z docs")

**Warning threshold:** If a task is flagged, emit:
> ⚠️ **Task scope warning — {domain} Task {N}**: Estimated context load is high ({N} files, {N} dependencies). This task may approach the 70% context window threshold. Consider splitting into:
> - Task {N}a: {first concern}
> - Task {N}b: {second concern}

**Auto-split rule (Level 3 Full Auto):** If a task has >5 files AND >3 dependencies, split it automatically. Renumber subsequent tasks. Document the split rationale in the task's Dependencies field.

**Guidance for estimating context size:**
- Each file to read ≈ 1–5% of context window (varies by file size)
- CLAUDE.md + scope.md + constraints.md + contracts ≈ 15–25% baseline overhead
- Tasks with >5 files or >3 cross-domain contracts commonly exceed 70% total context

This rule implements the "task must fit in one context window" constraint — a task that compacts its subagent is a task that produces incomplete or corrupt output.

### Cross-Domain Duplicate Operation Scan

After creating all domain task lists, scan for operations that appear in more than one domain.

**Check for duplicate task descriptions, function names, or operation verbs** across all `tasks.md` files:

```
For each operation in each domain's task list:
  Does this operation appear (by name or clear equivalent) in another domain's task list?
  → YES → flag as duplicate candidate
```

**If duplicates found:**

> ⚠️ **Duplicate operations detected** — the following operations appear in multiple domains:
> - `{operation}` — found in: {domain-A} Task {N}, {domain-B} Task {N}
> - `{operation}` — found in: {domain-A} Task {N}, {domain-C} Task {N}
>
> **Options:**
> 1. If a `shared-core` domain exists → reassign these tasks to shared-core
> 2. If no shared-core → extract to a new `shared-core` domain (go back to partition and add it)
> 3. If the operations are truly surface-specific variants → document the distinction explicitly in each domain's constraints.md to prevent future confusion

**Level 3 (Full Auto)**: If shared-core exists, move the duplicates there automatically. If not, add a task to the first affected domain's list: "Extract `{operation}` to shared-core — coordinate with {domain-B} before implementing".

**If no duplicates found:**

> ✅ No duplicate operations detected across domains.

### SharedCore Contract Compliance Check

If `.gsd-t/contracts/shared-services-contract.md` exists, run a second pass:

For each client-surface domain's task list, compare task operations against the SharedCore contract's "Shared Operations" table. Flag any task that implements an operation already owned by SharedCore:

> ⚠️ **SharedCore contract violation** — the following tasks reimplement operations owned by SharedCore:
> - {domain} Task {N}: implements `{operation}` — already owned by SharedCore per shared-services-contract.md
>
> Fix: Change these tasks to CALL the SharedCore function rather than implementing it independently.

If no violations: `✅ All client domains reference SharedCore correctly.`

---

### REQ Traceability

After creating task lists, append a traceability table to `docs/requirements.md`:

```markdown
## Requirements Traceability (updated by plan phase)
| REQ-ID | Requirement Summary | Domain | Task(s) | Status |
|--------|---------------------|--------|---------|--------|
| REQ-001 | {summary} | {domain} | Task 1, Task 3 | pending |
| REQ-002 | {summary} | {domain} | Task 2 | pending |
```

- Every REQ-ID must map to at least one domain/task — orphaned requirements are a planning gap
- Every task group should trace back to at least one REQ-ID — tasks with no REQ reference may be scope creep
- Report: orphaned requirements (no task) and unanchored tasks (no REQ)

## Step 3: Map Cross-Domain Dependencies

Update `.gsd-t/contracts/integration-points.md` with the full dependency graph **and wave groupings**:

```markdown
# Integration Points

## Dependency Graph

### Independent (can start immediately)
- data-layer: Tasks 1-3
- auth: Tasks 1-2
- ui: Tasks 1-2

### First Checkpoint
- GATE: data-layer Task 3 (schema migrations) must complete
- UNLOCKS: auth Task 3 (user lookup), ui Task 3 (data fetching)
- VERIFY: Lead confirms schema matches schema-contract.md

### Second Checkpoint
- GATE: auth Task 4 (auth middleware) must complete
- UNLOCKS: ui Task 5 (protected routes)
- VERIFY: Lead confirms auth endpoints match api-contract.md

## Wave Execution Groups

Waves allow parallel execution within a wave and sequential execution between waves.
Each wave contains domains/tasks that can safely run in parallel (no shared files, no cross-domain dependencies within the wave).

### Wave 1 — Independent (parallel)
- data-layer: Tasks 1-3
- auth: Tasks 1-2
- **Shared files**: NONE — safe to run in parallel
- **Completes when**: All listed tasks done

### Wave 2 — After Wave 1 Checkpoint (parallel)
- CHECKPOINT: Lead verifies schema-contract.md before Wave 2 starts
- auth: Tasks 3-4
- ui: Tasks 1-2
- **Shared files**: NONE — safe to run in parallel
- **Completes when**: All listed tasks done

### Wave 3 — After Wave 2 Checkpoint (sequential)
- CHECKPOINT: Lead verifies api-contract.md before Wave 3 starts
- ui: Tasks 3-5
- **Note**: Sequential — each task depends on the previous

### Integration
- INTEGRATION: Wire all domains together

## Execution Order (for solo mode)
1. data-layer Tasks 1-3
2. auth Tasks 1-2 (parallel-safe with data-layer)
3. CHECKPOINT: verify schema contract
4. auth Tasks 3-4
5. ui Tasks 1-2 (parallel-safe with auth 3-4)
6. CHECKPOINT: verify api contract
7. ui Tasks 3-5
8. INTEGRATION: wire everything together
```

### Wave Grouping Rules:
1. **Same wave** = no shared files, no dependency between them
2. **Different wave** = one depends on the other's output, OR they modify the same file
3. **CHECKPOINT between waves** = lead verifies contract compliance before unlocking next wave
4. Always check domain `scope.md` files for file ownership — overlapping files → different waves

## Step 4: Estimate Scope

Add to each domain's `tasks.md`:
```markdown
## Execution Estimate
- Total tasks: {N}
- Independent tasks (no blockers): {N}
- Blocked tasks (waiting on other domains): {N}
- Estimated checkpoints: {N}
```

## Step 5: Document Ripple

After creating task lists and mapping dependencies, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Updated in Step 5, but verify Decision Log includes planning decisions and rationale

### Check if affected:
2. **`docs/requirements.md`** — If planning revealed missing, ambiguous, or conflicting requirements, update them
3. **`docs/architecture.md`** — If the task breakdown reveals new components or clarifies data flow, update it
4. **`.gsd-t/contracts/`** — If planning revealed contract gaps or needed additional detail, update them
5. **Domain `constraints.md`** — If planning revealed new constraints (task ordering, shared resources), add them

### Skip what's not affected.

## Step 6: Test Verification

Before finalizing the plan:

1. **Run existing tests**: Execute the full test suite to confirm codebase state before execution begins
2. **Verify passing**: Document any pre-existing failures — assign them to appropriate domain tasks
3. **Include test tasks**: Ensure each domain's task list includes test creation/update tasks where acceptance criteria require verification

## Step 7: Plan Validation

Spawn a Task subagent to validate the plan before proceeding:

```
Task subagent (general-purpose, model: haiku):
"Validate this GSD-T plan. Read:
- .gsd-t/domains/*/tasks.md (all task lists)
- .gsd-t/contracts/ (all contracts)
- docs/requirements.md (including traceability table)
- .gsd-t/CONTEXT.md (if exists)

Check:
1. REQ coverage: every REQ-ID in requirements.md maps to at least one task
2. Locked Decisions (from CONTEXT.md if present): every Locked Decision maps to at least one task
3. Task completeness: every task has files, contract refs, and acceptance criteria
4. Cross-domain dependencies: all BLOCKED-BY references point to real tasks
5. Contract existence: every task referencing a contract has that contract file present

Report: PASS (all checks pass) or FAIL with specific gaps listed."
```

**OBSERVABILITY LOGGING (MANDATORY):**
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
- If CTX_PCT >= 85: `echo "🔴 CRITICAL: Context at ${CTX_PCT}% — compaction likely. Task MUST be split."`
- If CTX_PCT >= 70: `echo "⚠️ WARNING: Context at ${CTX_PCT}% — approaching compaction threshold. Consider splitting in plan."`
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-plan | Step 7 | haiku | {DURATION}s | {PASS/FAIL}, iteration {N} | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`
If validation FAIL, append each gap to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {DT_START} | gsd-t-plan | Step 7 | haiku | {DURATION}s | medium | {gap description} |`

**If FAIL**: Fix the identified gaps (up to 3 iterations). If still failing after 3 iterations, STOP and report to user with the specific gaps. Plan cannot proceed until validation PASSES.

## Step 8: Update Progress

Update `.gsd-t/progress.md`:
- Set status to `PLANNED`
- Update domain table with task counts
- Record any planning decisions in the Decision Log

## Step 9: Report

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Plan complete — {N} tasks across {N} domains, {execution mode}") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Present to the user:
1. Task count per domain
2. Dependency graph (which domains block which)
3. Recommended execution mode:
   - **Solo sequential**: < 8 total tasks or heavily interdependent
   - **Solo interleaved**: 8-15 tasks with some independence
   - **Team parallel**: 15+ tasks with 3+ independent starting points
4. Any ambiguities found during planning that need user input

Wait for confirmation before proceeding.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
