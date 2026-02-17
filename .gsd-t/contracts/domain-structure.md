# Contract: Domain Structure

## Owner
GSD-T framework (created by gsd-t-partition, consumed by execution commands)

## Consumers
gsd-t-plan, gsd-t-execute, gsd-t-integrate, gsd-t-verify, gsd-t-complete-milestone, gsd-t-wave, gsd-t-status

## Directory Layout
```
.gsd-t/domains/{domain-name}/
├── scope.md        — what this domain owns
├── tasks.md        — atomic task list (populated during plan phase)
└── constraints.md  — patterns to follow, boundaries to respect
```

Domain names use kebab-case: `cli-hardening`, `data-layer`, `auth-system`.

---

## scope.md Format

```markdown
# Domain: {name}

## Responsibility
{1-2 sentences: what this domain is responsible for}

## Owned Files/Directories
- {path} — {description}
- {path} — {description}

## NOT Owned (do not modify)
- {path} — owned by {other domain}
```

### Rules
- Every source file must be owned by exactly one domain
- No domain scope overlaps with another
- Paths are relative to project root
- The NOT Owned section prevents accidental cross-domain writes

---

## tasks.md Format

```markdown
# Tasks: {domain-name}

## Summary
{1-2 sentences: what this domain delivers when all tasks complete}

## Tasks

### Task {N}: {descriptive name}
- **Files**: {files to create or modify}
- **Contract refs**: {which contracts this implements}
- **Dependencies**: NONE | BLOCKED by {domain} Task {N} | Requires Task {N} (within domain)
- **Acceptance criteria**:
  - {specific testable outcome}
  - {specific testable outcome}

## Execution Estimate
- Total tasks: {N}
- Independent tasks (no blockers): {N}
- Blocked tasks (waiting on other domains): {N}
- Estimated checkpoints: {N}
```

### Task Design Rules
1. **Atomic**: Each task produces a working, testable increment
2. **Self-contained**: A fresh agent with CLAUDE.md, scope, constraints, contracts, and task description can execute it
3. **File-scoped**: Lists exactly which files it touches
4. **Contract-bound**: Cross-domain tasks reference the specific contract they implement
5. **Ordered**: Tasks numbered in execution order within the domain
6. **No implicit knowledge**: Reference contracts and files explicitly

### Task Fields
| Field | Required | Notes |
|-------|----------|-------|
| Files | YES | Exact file paths |
| Contract refs | YES | `NONE` if no cross-domain interface |
| Dependencies | YES | `NONE`, `BLOCKED by {domain} Task {N}`, or `Requires Task {N}` |
| Description | Optional | Detailed implementation guidance |
| Acceptance criteria | YES | At least 1 testable criterion per task |

---

## constraints.md Format

```markdown
# Constraints: {domain-name}

## Must Follow
- {pattern or convention from CLAUDE.md}
- {specific technical constraint}

## Must Not
- Modify files outside owned scope
- {other boundaries}

## Dependencies
- Depends on: {other domain} for {what} | nothing
- Depended on by: {other domain} for {what} | nothing
```

### Rules
- Must Follow inherits from project CLAUDE.md plus domain-specific additions
- Must Not always includes "Modify files outside owned scope"
- Dependencies section documents cross-domain relationships

---

## Lifecycle
1. **Created by**: `gsd-t-partition` — creates directories, scope.md, constraints.md (tasks.md empty)
2. **Updated by**: `gsd-t-plan` — populates tasks.md with atomic task lists
3. **Consumed by**: `gsd-t-execute` — reads tasks.md to drive execution
4. **Archived by**: `gsd-t-complete-milestone` — moves to `.gsd-t/milestones/{name}/domains/`
5. **Cleared**: After archival, `.gsd-t/domains/` is emptied for next milestone
