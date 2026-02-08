# Prime Directives

1. SIMPLICITY ABOVE ALL. Every change should be minimal and impact as little code as possible. No massive refactors.
2. ALWAYS check for unwanted downstream effects before writing any new code or changing existing code.
3. ALWAYS check for completeness that any code creation/change/deletion is implemented thoroughly in every relevant file.
4. ALWAYS work autonomously. ONLY ask for user input when truly blocked.


# GSD-T: Contract-Driven Development

## Work Hierarchy

```
PROJECT or FEATURE or SCAN
  └── MILESTONE (major deliverable)
      └── PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

- **Project**: Full greenfield project → decomposed into milestones
- **Feature**: Major new feature for existing codebase → impact analysis → milestones
- **Scan**: Deep codebase analysis → techdebt.md → promotable to milestones
- **Milestone**: A significant deliverable (e.g., "User Authentication Complete")
- **Domain**: An independent area of responsibility within a milestone, with its own scope, tasks, and file boundaries
- **Contract**: The documented interface between domains — API shapes, schemas, component props

## Commands Reference

| Command | Purpose |
|---------|---------|
| `/user:gsd-t-help` | List all commands or get detailed help |
| `/user:gsd-t-prompt` | Help formulate your idea before committing |
| `/user:gsd-t-brainstorm` | Creative exploration and idea generation |
| `/user:gsd-t-project` | Full project → milestone roadmap |
| `/user:gsd-t-feature` | Major feature → impact analysis + milestones |
| `/user:gsd-t-scan` | Deep codebase analysis → techdebt.md |
| `/user:gsd-t-promote-debt` | Convert debt items to milestones |
| `/user:gsd-t-init` | Initialize project structure |
| `/user:gsd-t-milestone` | Define new milestone |
| `/user:gsd-t-partition` | Decompose into domains + contracts |
| `/user:gsd-t-discuss` | Multi-perspective design exploration |
| `/user:gsd-t-plan` | Create atomic task lists per domain |
| `/user:gsd-t-impact` | Analyze downstream effects before execution |
| `/user:gsd-t-execute` | Run tasks (solo or team) |
| `/user:gsd-t-test-sync` | Keep tests aligned with code changes |
| `/user:gsd-t-integrate` | Wire domains together |
| `/user:gsd-t-verify` | Run quality gates |
| `/user:gsd-t-complete-milestone` | Archive milestone + git tag |
| `/user:gsd-t-wave` | Full cycle (auto-advances all phases) |
| `/user:gsd-t-status` | Cross-domain progress view |
| `/user:gsd-t-debug` | Systematic debugging |
| `/user:gsd-t-quick` | Fast task, respects contracts |
| `/user:gsd-t-populate` | Auto-populate docs from existing codebase |
| `/user:gsd-t-resume` | Restore context, continue |
| `/user:branch` | Create and switch to a new git branch |
| `/user:checkin` | Stage, commit, and push all changes |
| `/user:Claude-md` | Reload and apply CLAUDE.md directives |


# Living Documents

These documents MUST be maintained and referenced throughout development:

| Document | Location | Purpose |
|----------|----------|---------|
| **Requirements** | `docs/requirements.md` | Functional and technical requirements |
| **Architecture** | `docs/architecture.md` | System design, components, data flow, decisions |
| **Workflows** | `docs/workflows.md` | User journeys and technical process flows |
| **Infrastructure** | `docs/infrastructure.md` | Commands, DB setup, server access, creds |
| **README** | `README.md` | Project overview, setup, features |
| **Progress** | `.gsd-t/progress.md` | Current milestone/phase state + version |
| **Contracts** | `.gsd-t/contracts/` | Interfaces between domains |
| **Tech Debt** | `.gsd-t/techdebt.md` | Debt register from scans |

## The "No Re-Research" Rule

**BEFORE researching how something works, CHECK THE DOCS FIRST.**

```
NEED TO UNDERSTAND SOMETHING?
  ├── Is it about system structure/components? → Read docs/architecture.md
  ├── Is it about how a process flows? → Read docs/workflows.md
  ├── Is it about what to build? → Read docs/requirements.md
  ├── Is it about how to deploy/operate? → Read docs/infrastructure.md
  ├── Is it about domain interfaces? → Read .gsd-t/contracts/
  └── Not documented? → Research, then DOCUMENT IT
```


# Versioning

GSD-T tracks project version in `.gsd-t/progress.md` using semantic versioning: `Major.Minor.Patch`

| Segment | Bumped When | Example |
|---------|-------------|---------|
| **Major** | Breaking changes, major rework, v1 launch | 1.0.0 → 2.0.0 |
| **Minor** | New features, completed feature milestones | 1.1.0 → 1.2.0 |
| **Patch** | Bug fixes, minor improvements, cleanup | 1.1.1 → 1.1.2 |

- Version is set during `gsd-t-init` (starts at `0.1.0`)
- Version is bumped during `gsd-t-complete-milestone` based on milestone scope
- Version is reflected in: `progress.md`, `README.md`, package manifest (if any), and git tags (`v{version}`)


# Autonomous Execution Rules

## Prime Rule
KEEP GOING. Only stop for:
1. Unrecoverable errors after 2 fix attempts
2. Ambiguity that fundamentally changes project direction
3. Milestone completion (checkpoint for user review)

## Pre-Commit Gate (MANDATORY)

NEVER commit code without running this checklist. This is not optional.

```
BEFORE EVERY COMMIT:
  ├── Did I change an API endpoint or response shape?
  │     YES → Update .gsd-t/contracts/api-contract.md
  ├── Did I change the database schema?
  │     YES → Update .gsd-t/contracts/schema-contract.md AND docs/schema.md
  ├── Did I add/change a UI component interface?
  │     YES → Update .gsd-t/contracts/component-contract.md
  ├── Did I add new files or directories?
  │     YES → Update the owning domain's scope.md
  ├── Did I implement or change a requirement?
  │     YES → Update docs/requirements.md (mark complete or revise)
  ├── Did I add/change/remove a component or change data flow?
  │     YES → Update docs/architecture.md
  ├── Did I make an architectural or design decision?
  │     YES → Add to .gsd-t/progress.md Decision Log
  ├── Did I discover or fix tech debt?
  │     YES → Update .gsd-t/techdebt.md
  ├── Did I establish a pattern future work should follow?
  │     YES → Update CLAUDE.md or domain constraints.md
  └── Did I add/change tests?
        YES → Verify test names and paths are referenced in requirements
```

If ANY answer is YES and the doc is NOT updated, update it BEFORE committing. No exceptions.

## Execution Behavior
- ALWAYS check docs/architecture.md before adding or modifying components.
- ALWAYS check docs/workflows.md before changing any multi-step process.
- ALWAYS update docs as part of completing work — not as an afterthought.
- ALWAYS self-verify work by running tests and verification commands.
- NEVER re-research how something works if you built it — it should be documented.
- NEVER pause to show verification steps — execute them.
- NEVER ask "should I continue?" — just continue.
- NEVER summarize what you're "about to do" — just do it.
- IF a test fails, fix it immediately (up to 2 attempts) before reporting.

## Autonomy Levels

Projects can specify an autonomy level in their project CLAUDE.md:

| Level | Behavior |
|-------|----------|
| **Level 1: Supervised** | Pause at each phase for confirmation |
| **Level 2: Standard** | Pause only at milestones (default) |
| **Level 3: Full Auto** | Only pause for blockers or project completion |

If not specified, use Level 2.


# Don't Do These Things

- NEVER commit code without running the Pre-Commit Gate checklist. EVERY commit.
- NEVER batch doc updates for later — update docs as part of the same commit as the code change.
- NEVER start a phase without reading contracts and relevant docs first.
- NEVER complete a phase without running document ripple on affected docs.
- NEVER re-research how a component works — read architecture.md and contracts.
- NEVER let code and contract disagree — fix one or the other immediately.
- NEVER make changes that touch more than 3 files without pausing to confirm approach.


# Code Standards (Defaults — override in project CLAUDE.md)

## Patterns
- Type hints required on all function signatures
- Dataclasses/interfaces for data models, not raw dicts
- Functions under 30 lines — split if longer
- Files under 200 lines — create new modules if needed
- Enums for state management and fixed option sets

## Naming
```
files:      snake_case        (user_service.py)
classes:    PascalCase        (UserService)
functions:  snake_case        (get_user)
constants:  UPPER_SNAKE_CASE  (MAX_RETRIES)
private:    _underscore       (_internal_method)
```


# Recovery After Interruption

When resuming work (new session or after /clear):
1. Read `.gsd-t/progress.md` for current state
2. Read `docs/requirements.md` for what's left to build
3. Read `docs/architecture.md` for how the system is structured
4. Read `.gsd-t/contracts/` for domain interfaces
5. Verify last task's work is intact (files exist, tests pass)
6. Continue from current task — don't restart the phase

**CRITICAL: Do NOT research how the system works. The docs tell you. Read them.**
