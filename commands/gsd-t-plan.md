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

## Step 3: Map Cross-Domain Dependencies

Update `.gsd-t/contracts/integration-points.md` with the full dependency graph:

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

## Step 4: Estimate Scope

Add to each domain's `tasks.md`:
```markdown
## Execution Estimate
- Total tasks: {N}
- Independent tasks (no blockers): {N}
- Blocked tasks (waiting on other domains): {N}
- Estimated checkpoints: {N}
```

## Step 5: Update Progress

Update `.gsd-t/progress.md`:
- Set status to `PLANNED`
- Update domain table with task counts
- Record any planning decisions in the Decision Log

## Step 6: Report

Present to the user:
1. Task count per domain
2. Dependency graph (which domains block which)
3. Recommended execution mode:
   - **Solo sequential**: < 8 total tasks or heavily interdependent
   - **Solo interleaved**: 8-15 tasks with some independence
   - **Team parallel**: 15+ tasks with 3+ independent starting points
4. Any ambiguities found during planning that need user input

$ARGUMENTS
