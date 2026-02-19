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

## Step 2: Create Task Lists Per Domain

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
Before spawning: run `date +%s` via Bash → save as START
After subagent returns: run `date +%s` → compute `DURATION=$((END-START))`
Append to `.gsd-t/token-log.md` (create with header `| Date | Command | Step | Model | Duration(s) | Notes |` if missing):
`| {YYYY-MM-DD HH:MM} | gsd-t-plan | Step 7 | haiku | {DURATION}s | {PASS/FAIL}, iteration {N} |`
If validation FAIL, append each gap to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {YYYY-MM-DD HH:MM} | gsd-t-plan | Step 7 | haiku | {DURATION}s | medium | {gap description} |`

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
