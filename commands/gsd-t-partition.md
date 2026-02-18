# GSD-T: Partition Work into Domains

You are the lead agent in a contract-driven development workflow. Your job is to decompose the current milestone into independent domains with explicit boundaries and contracts.

## Step 1: Understand the Project

Read these files in order:
1. `CLAUDE.md` — project conventions and context
2. `.gsd-t/progress.md` — current state (if exists)
3. `docs/` — all available documentation (requirements, architecture, schema, design)

If `.gsd-t/` doesn't exist, create the full directory structure:
```
.gsd-t/
├── contracts/
├── domains/
└── progress.md
```

## Step 2: Identify Domains

Decompose the milestone into 2-5 independent domains. Each domain should:
- Own a distinct area of functionality
- Have minimal overlap with other domains
- Map to a clear set of files/directories it will own
- Be executable by a single agent without needing another domain's internals

For each domain, create `.gsd-t/domains/{domain-name}/`:
```
.gsd-t/domains/{domain-name}/
├── scope.md        — what this domain owns (files, directories, responsibilities)
├── tasks.md        — (empty for now, filled during plan phase)
└── constraints.md  — patterns to follow, files NOT to touch, conventions
```

### scope.md format:
```markdown
# Domain: {name}

## Responsibility
{What this domain is responsible for}

## Owned Files/Directories
- src/{path}/ — {description}
- src/{path}/ — {description}

## NOT Owned (do not modify)
- {files owned by other domains}
```

### constraints.md format:
```markdown
# Constraints: {domain-name}

## Must Follow
- {pattern or convention from CLAUDE.md}
- {specific technical constraint}

## Must Not
- Modify files outside owned scope
- Create new database tables (data-layer domain owns schema)
- {other boundaries}

## Dependencies
- Depends on: {other domain} for {what}
- Depended on by: {other domain} for {what}
```

## Step 3: Write Contracts

Contracts define HOW domains interact. Create files in `.gsd-t/contracts/`:

For each boundary between domains, write a contract:

### API contracts (`api-contract.md`):
```markdown
# API Contract

## POST /api/auth/login
Request: { email: string, password: string }
Response: { token: string, user: { id: string, email: string, role: string } }
Errors: 401 { error: "invalid_credentials" }
Owner: auth domain
Consumers: ui domain

## GET /api/users/:id
...
```

### Schema contracts (`schema-contract.md`):
```markdown
# Schema Contract

## Users Table
| Column | Type | Constraints |
|--------|------|------------|
| id | uuid | PK, auto |
| email | varchar(255) | unique, not null |
...

Owner: data-layer domain
Consumers: auth domain, ui domain
```

### Component contracts (`component-contract.md`):
```markdown
# Component Contract

## LoginForm
Props: { onSuccess: (user: User) => void, onError: (msg: string) => void }
Events: Calls POST /api/auth/login per api-contract
Owner: ui domain
```

### Integration points (`integration-points.md`):
```markdown
# Integration Points

## Auth → Data Layer
- Auth domain reads Users table (schema-contract.md)
- Auth domain calls data-layer's user lookup function
- Checkpoint: data-layer must complete Task 2 before auth starts Task 3

## UI → Auth
- UI calls auth endpoints per api-contract.md
- Checkpoint: auth must complete Task 2 before UI starts Task 4
```

## Step 4: Initialize Progress

Write `.gsd-t/progress.md`:
```markdown
# GSD-T Progress

## Milestone: {name}
## Status: PARTITIONED
## Date: {today}

## Domains
| Domain | Status | Tasks | Completed |
|--------|--------|-------|-----------|
| {name} | partitioned | 0 | 0 |

## Contracts
- [ ] api-contract.md
- [ ] schema-contract.md
- [x] {any completed ones}

## Integration Checkpoints
- [ ] {checkpoint description} — blocks {domain} task {N}

## Decision Log
- {date}: {decision and rationale}
```

## Step 4.5: Document Ripple

After creating domains and contracts, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 4, but verify Decision Log includes partition rationale

### Check if affected:
2. **`docs/architecture.md`** — If the partition defines new component boundaries or clarifies the system structure, update it
3. **`docs/requirements.md`** — If partitioning revealed that requirements need clarification or splitting by domain, update them
4. **`CLAUDE.md`** — If the partition establishes new file ownership conventions or domain-specific patterns, add them

### Skip what's not affected.

## Step 4.6: Test Verification

Before finalizing the partition:

1. **Run existing tests**: Execute the full test suite to confirm codebase is clean before domain work begins
2. **Verify passing**: If any tests fail, assign them to the appropriate domain as pre-existing issues
3. **Map tests to domains**: Note which test files belong to which domain — this informs task planning

## Step 4.7: Spawn QA Agent

After contracts are written, spawn the QA teammate to generate contract test skeletons:

```
Teammate "qa": Read commands/gsd-t-qa.md for your full instructions.
  Phase context: partition. Read .gsd-t/contracts/ for contract definitions.
  Generate contract test skeleton files for every contract.
  Report: number of test files generated and total test cases.
```

Wait for QA agent to complete before proceeding. QA failure blocks partition completion.

## Step 5: Validate

Before finishing, verify:
- [ ] Every file in `src/` is owned by exactly one domain
- [ ] No domain scope overlaps with another
- [ ] Every dependency between domains has a contract
- [ ] Every contract has an owner and at least one consumer
- [ ] Integration checkpoints are identified for all cross-domain dependencies

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Partition complete — {N} domains defined, {N} contracts written") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report the partition to the user with a summary of domains, contracts, and any decisions that need input. Wait for confirmation before proceeding.

$ARGUMENTS
