<!-- GSD-T:START — Do not remove this marker. Content between START/END is managed by gsd-t update. -->
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
| `/user:gsd` | Smart router — describe what you need, auto-routes to the right command |
| `/user:gsd-t-help` | List all commands or get detailed help |
| `/user:gsd-t-prompt` | Help formulate your idea before committing |
| `/user:gsd-t-brainstorm` | Creative exploration and idea generation |
| `/user:gsd-t-project` | Full project → milestone roadmap |
| `/user:gsd-t-feature` | Major feature → impact analysis + milestones |
| `/user:gsd-t-scan` | Deep codebase analysis → techdebt.md |
| `/user:gsd-t-gap-analysis` | Requirements gap analysis — spec vs. existing code |
| `/user:gsd-t-promote-debt` | Convert debt items to milestones |
| `/user:gsd-t-setup` | Generate or restructure project CLAUDE.md |
| `/user:gsd-t-init` | Initialize project structure |
| `/user:gsd-t-init-scan-setup` | Full onboarding: git + init + scan + setup in one |
| `/user:gsd-t-milestone` | Define new milestone |
| `/user:gsd-t-partition` | Decompose into domains + contracts |
| `/user:gsd-t-discuss` | Multi-perspective design exploration |
| `/user:gsd-t-plan` | Create atomic task lists per domain |
| `/user:gsd-t-impact` | Analyze downstream effects before execution |
| `/user:gsd-t-execute` | Run tasks (solo or team) |
| `/user:gsd-t-test-sync` | Keep tests aligned with code changes |
| `/user:gsd-t-qa` | QA agent — test generation, execution, gap reporting |
| `/user:gsd-t-integrate` | Wire domains together |
| `/user:gsd-t-verify` | Run quality gates |
| `/user:gsd-t-complete-milestone` | Archive milestone + git tag |
| `/user:gsd-t-wave` | Full cycle (auto-advances all phases) |
| `/user:gsd-t-status` | Cross-domain progress view |
| `/user:gsd-t-debug` | Systematic debugging |
| `/user:gsd-t-quick` | Fast task, respects contracts |
| `/user:gsd-t-populate` | Auto-populate docs from existing codebase |
| `/user:gsd-t-log` | Sync progress Decision Log with recent git activity |
| `/user:gsd-t-resume` | Restore context, continue |
| `/user:gsd-t-version-update` | Update GSD-T to latest version |
| `/user:gsd-t-version-update-all` | Update GSD-T + all registered projects |
| `/user:gsd-t-triage-and-merge` | Auto-review, merge, and publish GitHub branches |
| `/user:gsd-t-backlog-add` | Capture item, auto-categorize, append to backlog |
| `/user:gsd-t-backlog-list` | Filtered, ordered view of backlog items |
| `/user:gsd-t-backlog-move` | Reorder items by position (priority) |
| `/user:gsd-t-backlog-edit` | Modify backlog entry fields |
| `/user:gsd-t-backlog-remove` | Drop item with optional reason |
| `/user:gsd-t-backlog-promote` | Refine, classify, launch GSD-T workflow |
| `/user:gsd-t-backlog-settings` | Manage types, apps, categories, defaults |
| `/user:branch` | Create and switch to a new git branch |
| `/user:checkin` | Auto-bump version, stage, commit, and push |
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
| **Major** | Breaking changes, major rework, v1 launch | 1.0.10 → 2.0.10 |
| **Minor** | New features, completed feature milestones | 1.10.10 → 1.11.10 |
| **Patch** | Bug fixes, minor improvements, cleanup | 1.1.10 → 1.1.11 |

**Patch convention**: Patch numbers are always 2 digits (≥10). When resetting after a minor or major bump, start at **10** (not 0). This keeps patches always 2 characters without leading zeros, so semver stays valid.

- Version is set during `gsd-t-init` (starts at `0.1.10`)
- Version is bumped during `gsd-t-complete-milestone` based on milestone scope
- Version is reflected in: `progress.md`, `README.md`, package manifest (if any), and git tags (`v{version}`)


# Destructive Action Guard (MANDATORY)

**NEVER perform destructive or structural changes without explicit user approval.** This applies at ALL autonomy levels, including Level 3.

```
BEFORE any of these actions, STOP and ask the user:
  ├── DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE
  ├── Renaming or removing database tables or columns
  ├── Schema migrations that lose data or break existing queries
  ├── Replacing an existing architecture pattern (e.g., normalized → denormalized)
  ├── Removing or replacing existing files/modules that contain working functionality
  ├── Changing ORM models in ways that conflict with the existing database schema
  ├── Removing API endpoints or changing response shapes that existing clients depend on
  ├── Replacing a dependency or framework with a different one
  └── Any change that would require other parts of the system to be rewritten
```

### How to handle schema/architecture mismatches:
1. **READ the existing schema/code first** — understand what exists before proposing changes
2. **Adapt new code to match existing structures** — not the other way around
3. **If restructuring is truly needed**, present the case to the user with:
   - What exists today and why it might have been designed that way
   - What you want to change and why
   - What will break if you make the change
   - What data or functionality will be lost
   - A migration path that preserves existing data
4. **Wait for explicit approval** before proceeding

### Why this matters:
Even in development, the user may have:
- Working functionality they've tested and rely on
- Data they've carefully set up (seed data, test accounts, configuration)
- Other code that depends on the current structure
- Design decisions made for reasons not documented

**"Adapt to what exists" is always safer than "replace what exists."**


# Autonomous Execution Rules

## Update Notices

On session start, a version check hook auto-updates GSD-T and outputs a status message. Show the result to the user at the **beginning** of your first response:

- If `[GSD-T AUTO-UPDATE]` appears → GSD-T was just auto-updated. Show:
  ```
  ✅ GSD-T auto-updated: v{old} → v{new}
     Changelog: https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md
  ```

- If `[GSD-T UPDATE]` appears → update available but auto-update failed. Show:
  ```
  ⬆️  GSD-T update available: v{installed} → v{latest} (auto-update failed)
     Run: /user:gsd-t-version-update-all
     Changelog: https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md
  ```
  Also repeat at the **end** of your first response.

- If `[GSD-T]` appears → up to date. Show:
  ```
  GSD-T v{version} — up to date
  Changelog: https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md
  ```

## Conversation vs. Work

Only execute GSD-T workflow behavior when a `/gsd-t-*` command is invoked or when actively mid-phase (resumed via `/gsd-t-resume`). **Plain text messages — especially questions — should be answered conversationally.** Do not launch into workflow execution, file reading, or phase advancement from a question or comment. If the user wants work done, they will invoke a command.

## Auto-Init Guard

Before executing any GSD-T workflow command, check if **any** of these files are missing in the current project:
- `.gsd-t/progress.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
- `.gsd-t/contracts/`, `.gsd-t/domains/`
- `.claude/settings.local.json` (if `~/.claude/settings.local` exists)
- `CLAUDE.md`, `README.md`
- `docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`

If any are missing:
1. Run `gsd-t-init` automatically (it skips files that already exist)
2. Then continue with the originally requested command

**Exempt commands** (do not trigger auto-init): `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`.

## Playwright Readiness Guard

Before any command that involves testing (`gsd-t-execute`, `gsd-t-test-sync`, `gsd-t-verify`, `gsd-t-quick`, `gsd-t-wave`, `gsd-t-milestone`, `gsd-t-complete-milestone`, `gsd-t-debug`), check if `playwright.config.*` exists in the project. If it does not:
1. Detect the package manager and install Playwright (`@playwright/test` + chromium)
2. Create a basic `playwright.config.ts` with sensible defaults
3. Create the E2E test directory with a placeholder spec
4. Then continue with the original command

Playwright must always be ready before any testing occurs. Do not skip this check. Do not defer setup to "later."

### Playwright Cleanup

After Playwright tests finish (pass or fail), **kill any app/server processes that were started for the tests**. Playwright often launches a dev server (via `webServer` config or manually). These processes must not be left running:
1. Check for any dev server processes spawned during the test run
2. Kill them (e.g., `npx kill-port`, or terminate the process directly)
3. Verify the port is free before proceeding

This applies everywhere Playwright tests are executed: execute, test-sync, verify, quick, wave, debug, complete-milestone, and integrate.

## QA Agent (Mandatory)

Any GSD-T phase that produces or validates code **MUST run QA**. The QA agent's sole job is test generation, execution, and gap reporting. It never writes feature code.

**QA method by command:**
- `execute`, `integrate` → spawn QA via **Task subagent** (lightweight, no TeamCreate)
- `test-sync`, `verify`, `complete-milestone` → perform contract testing and gap analysis **inline**
- `quick`, `debug` → run the full test suite **inline** as part of the command's Test & Verify step
- `wave` → each phase agent handles QA per the rules above
- `partition`, `plan` → no QA spawn needed (no code produced yet)

**Task subagent spawn instruction (execute/integrate):**
```
Task subagent (general-purpose):
"Run the full test suite and contract compliance tests.
Read .gsd-t/contracts/ for contract definitions.
Report: pass/fail counts and any coverage gaps."
```

**QA failure blocks phase completion.** Lead cannot proceed until QA reports PASS or user explicitly overrides.

## API Documentation Guard (Swagger/OpenAPI)

**Every API endpoint MUST be documented in a Swagger/OpenAPI spec. No exceptions.**

When any GSD-T command creates or modifies an API endpoint:
1. **If no Swagger/OpenAPI spec exists**: Set one up immediately
   - Detect the framework (Express, Fastify, Hono, Django, FastAPI, etc.)
   - Install the appropriate Swagger integration (e.g., `swagger-jsdoc` + `swagger-ui-express`, `@fastify/swagger`, FastAPI's built-in OpenAPI)
   - Create the OpenAPI spec file or configure auto-generation from code
   - Add a `/docs` or `/api-docs` route serving the Swagger UI
2. **Update the spec**: Every new or changed endpoint must be reflected in the Swagger/OpenAPI spec — routes, request/response schemas, auth requirements, error responses
3. **Publish the Swagger URL**: The Swagger/API docs URL MUST appear in:
   - `CLAUDE.md` — under Documentation or Infrastructure section
   - `README.md` — under API section or Getting Started
   - `docs/infrastructure.md` — under API documentation
4. **Verify**: After any API change, confirm the Swagger UI loads and reflects the current endpoints

This applies during: `gsd-t-execute`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-wave`, and any command that touches API code.

## Prime Rule
KEEP GOING. Only stop for:
1. Unrecoverable errors after 2 fix attempts
2. Ambiguity that fundamentally changes project direction
3. Milestone completion (checkpoint for user review)
4. Destructive actions (see Destructive Action Guard above — ALWAYS stop)

## Pre-Commit Gate (MANDATORY)

NEVER commit code without running this checklist. This is not optional.

```
BEFORE EVERY COMMIT:
  ├── Am I on the correct branch?
  │     CHECK → Run `git branch --show-current`
  │     Compare against "Expected branch" in project CLAUDE.md
  │     WRONG BRANCH → STOP. Do NOT commit. Switch to the correct branch first.
  │     No guard set → Proceed (but warn user to set one)
  ├── Did I create or change an API endpoint or response shape?
  │     YES → Update .gsd-t/contracts/api-contract.md
  │     YES → Update Swagger/OpenAPI spec (see API Documentation Guard below)
  │     YES → Verify Swagger URL is in CLAUDE.md and README.md
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
  ├── Did I modify any document, script, or code file?
  │     YES → Add timestamped entry to .gsd-t/progress.md Decision Log
  │     Format: `- YYYY-MM-DD HH:MM: {what was done} — {brief context or result}`
  │     This includes ALL file-modifying activities:
  │       project, feature, scan, gap-analysis, milestone, partition, discuss,
  │       plan, impact, execute, test-sync, integrate, verify, complete-milestone,
  │       wave, quick, debug, promote-debt, populate, setup, init, init-scan-setup,
  │       backlog-add/edit/move/remove/promote/settings, and any manual code changes
  ├── Did I make an architectural or design decision?
  │     YES → Also include decision rationale in the progress.md entry
  ├── Did I discover or fix tech debt?
  │     YES → Update .gsd-t/techdebt.md
  ├── Did I establish a pattern future work should follow?
  │     YES → Update CLAUDE.md or domain constraints.md
  ├── Did I add/change tests?
  │     YES → Verify test names and paths are referenced in requirements
  ├── Did I change UI, routes, or user flows?
  │     YES → Update affected E2E test specs (Playwright/Cypress)
  └── Did I run the affected tests?
        YES → Verify they pass. NO → Run them now.
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
| **Level 2: Standard** | Pause only at milestones |
| **Level 3: Full Auto** | Only pause for blockers or project completion (default) |

If not specified, use Level 3.

## Workflow Preferences (Defaults — override in project CLAUDE.md)

### Research Policy
Before planning a phase, evaluate whether research is needed:

**Run research when:**
- Phase involves unfamiliar libraries, APIs, or services
- Architectural decisions are required
- Integrating external systems
- Phase scope is ambiguous or complex

**Skip research when:**
- Patterns are already established from earlier phases
- Straightforward CRUD, UI, or config work
- Domain is well understood
- Phase builds directly on existing code patterns

If in doubt, skip research and proceed — research if execution reveals gaps.

### Phase Flow
- Upon completing a phase, automatically proceed to the next phase
- ONLY run Discussion phase if truly required (clear path → skip to Plan)
- ALWAYS self-verify work by running verification commands
- NEVER pause to show verification steps — execute them

### Next Command Hint

When a GSD-T command completes (and does NOT auto-advance to the next phase), display a "Next Up" block at the very end of your response. This format is designed to trigger Claude Code's prompt suggestion engine — making the next command appear as ghost text in the user's input field.

**MANDATORY format** — use this exact structure:

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{Phase Name}** — {one-line description of what happens next}

`/user:gsd-t-{command}`

───────────────────────────────────────────────────────────────
```

If there are alternative commands that also make sense, add them:

```
**Also available:**
- `/user:gsd-t-{alt-1}` — {description}
- `/user:gsd-t-{alt-2}` — {description}
```

Successor mapping:
| Completed | Next | Also available |
|-----------|------|----------------|
| `project` | `milestone` | |
| `feature` | `milestone` | |
| `milestone` | `partition` | |
| `partition` | `plan` | `discuss` (if complex) |
| `discuss` | `plan` | |
| `plan` | `execute` | `impact` (if risky) |
| `impact` | `execute` | |
| `execute` | `test-sync` | |
| `test-sync` | `verify` | `integrate` (if multi-domain) |
| `integrate` | `verify` | |
| `verify` | `complete-milestone` | |
| `complete-milestone` | `status` | |
| `scan` | `promote-debt` | `milestone` |
| `init` | `scan` | `milestone` |
| `init-scan-setup` | `milestone` | |
| `gap-analysis` | `milestone` | `feature` |
| `populate` | `status` | |
| `setup` | `status` | |

Commands with no successor (standalone): `quick`, `debug`, `brainstorm`, `status`, `help`, `resume`, `prompt`, `log`, backlog commands.

Skip the hint if auto-advancing (Level 3 mid-wave) — only show when the user needs to manually invoke the next step.


# Don't Do These Things

- NEVER perform destructive or structural changes without explicit user approval (see Destructive Action Guard above).
- NEVER drop database tables, remove columns, or run destructive SQL on an existing database — adapt new code to the existing schema.
- NEVER replace existing architecture patterns (e.g., normalized → denormalized) without user approval — even if you think the new way is better.
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
<!-- GSD-T:END — Do not remove this marker. -->
