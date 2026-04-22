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

See `/gsd-t-help` for the complete command list.


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

- Version is set during `gsd-t-init`:
  - **New project** (no existing manifest version): starts at `0.1.00` — first `complete-milestone` resets patch to `0.1.10`
  - **Existing repo** (has `package.json`, `pyproject.toml`, `Cargo.toml`, etc. with a version): use that version as the starting point
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
     Run: /gsd-t-version-update-all
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

**Exception — Auto-Route signal**: When `[GSD-T AUTO-ROUTE]` appears in your context (injected by the UserPromptSubmit hook), the user's plain text message should be treated as a `/gsd {message}` invocation. Execute the `/gsd` smart router with the user's full message as the argument instead of replying conversationally. The hook only fires in GSD-T projects (directories containing `.gsd-t/progress.md`) — it silently passes through in all other directories.

## Auto-Init Guard

Before executing any GSD-T workflow command, check if **any** of these files are missing in the current project:
- `.gsd-t/progress.md`, `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
- `.gsd-t/contracts/`, `.gsd-t/domains/`
- `CLAUDE.md`, `README.md`
- `docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`

If any are missing:
1. Run `gsd-t-init` automatically (it skips files that already exist)
2. Then continue with the originally requested command

**Exempt commands** (do not trigger auto-init): `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`.

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

### E2E Enforcement Rule (MANDATORY)

**Running only unit tests when E2E tests exist is a test failure.** This is non-negotiable.

```
BEFORE reporting "tests pass" for ANY task:
  ├── Does playwright.config.* or cypress.config.* exist?
  │     YES → You MUST run the full E2E suite. Unit-only results are INCOMPLETE.
  │     NO  → Unit/integration tests are sufficient.
  ├── Did you run every detected test runner?
  │     NO → Run it now. Do not commit until ALL suites pass.
  └── Report format MUST include all suites:
        "Unit: X/Y pass | E2E: X/Y pass" (or "E2E: N/A — no config")
```

The conditional "if UI/routes/flows changed" in command files applies to **writing new E2E specs**, not to **running existing ones**. You always run existing E2E specs. Always.

### E2E Test Quality Standard (MANDATORY)

**E2E tests must be FUNCTIONAL tests, not LAYOUT tests.** This is non-negotiable.

A layout test checks that elements exist (`isVisible`, `toBeAttached`, `toBeEnabled`, `toHaveCount`). A functional test checks that features work — actions produce correct outcomes.

```
LAYOUT TEST (WRONG — passes even if every feature is broken):
  await expect(page.locator('#tab-sessions')).toBeVisible();
  await page.click('#tab-sessions');
  // ← No assertion that the tab's content actually loaded

FUNCTIONAL TEST (RIGHT — fails if the feature is broken):
  await page.click('#tab-sessions');
  await expect(page.locator('.session-list')).toContainText('Session 1');
  // ← Proves clicking the tab loaded the session data
```

Every Playwright assertion must verify one of:
- **State changed**: After click/type/submit, the app state is different (new content, updated data, changed status)
- **Data flowed**: User input → API call → response rendered (use `page.waitForResponse` or assert on rendered data)
- **Content loaded**: Navigation/tab switch → destination content appeared (assert on text/data unique to destination)
- **Widget responded**: Terminal accepted keystrokes and produced output, editor saved changes, form submitted and data persisted

**If a test would pass on an empty HTML page with the correct element IDs and no JavaScript, it is not a functional test.** Rewrite it.

## QA Agent (Mandatory)

Every code-producing/validating phase MUST run QA. QA writes ZERO feature code — it generates, runs, and gap-reports tests. Failure (or any shallow E2E test) blocks phase completion.
Protocol: `templates/prompts/qa-subagent.md`. Contract: `.gsd-t/contracts/qa-agent-contract.md`.

## Design Verification Agent (Mandatory when design contract exists)

When `.gsd-t/contracts/design-contract.md` or `.gsd-t/contracts/design/` exists, a dedicated agent opens a browser, compares the build against the design, and writes a structured element-by-element MATCH/DEVIATION table. Writes ZERO feature code. Deviations (or missing verification artifact) block phase completion.
Protocol: `templates/prompts/design-verify-subagent.md`.

## Red Team — Adversarial QA (Mandatory)

After QA + Design Verification pass, every code-producing command spawns an adversarial subagent whose success is measured by bugs found, not tests passed. VERDICT is `FAIL` (bugs — blocks completion) or `GRUDGING PASS` (exhaustive search, nothing found). CRITICAL/HIGH bugs get up to 2 fix cycles before deferral.
Protocol: `templates/prompts/red-team-subagent.md`.

## Model Display (MANDATORY)

**Before every subagent spawn, display the model being used to the user:**
`⚙ [{model}] {command} → {brief description}` (e.g., `⚙ [sonnet] gsd-t-execute → domain: auth-service`, `⚙ [haiku] gsd-t-execute → QA validation`)

This gives the user real-time visibility into which model is handling each operation.

**Model assignments:**
- `model: haiku` — strictly mechanical tasks: run test suites and report counts, check file existence, validate JSON structure, branch guard checks
- `model: sonnet` — mid-tier reasoning: routine code changes, standard refactors, test writing, QA evaluation, straightforward synthesis
- `model: opus` — high-stakes reasoning: architecture decisions, security analysis, complex debugging, cross-module refactors, Red Team adversarial QA, quality judgment on critical paths

**Context Meter (M34/M38, v3.12.10+)** — The real context-window measurement feeding the headless-default spawn decision. A PostToolUse hook (`scripts/gsd-t-context-meter.js`) runs after every tool call, uses local token estimation to write the current input-token count into `.gsd-t/.context-meter-state.json`. `getSessionStatus()` reads that state file (fresh window = 5 minutes) with a historical heuristic fallback when the file is missing or stale. Command files consume the signal via a small bash shim (`CTX_PCT=$(node -e "…tb.getSessionStatus('.').pct")`). **Single-band model** (context-meter-contract v1.3.0): there's one threshold (default 85%) and one action — hand off to a detached headless spawn. No three-band routing, no silent downgrades, no MANDATORY STOP prose. The meter exists to inform spawn-time routing, not to pause work in-flight.

## Observability Logging (MANDATORY)

Every command that spawns a Task subagent, invokes `claude -p`, or calls `spawn('claude', ...)` MUST route the spawn through `bin/gsd-t-token-capture.cjs` so the real token-usage envelope is parsed and recorded. This is the M41 canonical pattern — the pre-M41 bash block that wrote `| N/A |` is retired.

### Pattern A — wrap a spawn callable with `captureSpawn`

Preferred for new spawn sites. The wrapper owns the before/after timing, model banner, envelope parse, row write, and JSONL record.

```
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
(async () => {
  await captureSpawn({
    command: 'gsd-t-execute',
    step: 'Step 4',
    model: 'sonnet',
    description: 'domain: auth-service',
    projectDir: '.',
    domain: 'auth-service',
    task: 'T-3',
    spawnFn: async () => { /* actual Task(...) or spawn('claude', ...) call */ },
  });
})();
"
```

### Pattern B — record after the result envelope is already in hand

For command files where the Task subagent already ran and the caller has the result object. Identical row format, no timing wrap.

```
node -e "
const { recordSpawnRow } = require('./bin/gsd-t-token-capture.cjs');
recordSpawnRow({
  projectDir: '.',
  command: 'gsd-t-verify',
  step: 'Step 4',
  model: 'haiku',
  startedAt: '2026-04-21 10:00',
  endedAt:   '2026-04-21 10:02',
  usage: result.usage, // may be undefined — wrapper handles with '—'
  domain: '-', task: '-',
  ctxPct: 42,
  notes: 'test audit + contract review',
});
"
```

### Canonical `.gsd-t/token-log.md` header

```
| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |
```

The wrapper detects old headers (no `Tokens` column) and upgrades in place, preserving existing rows. The **Tokens** cell renders as `in=N out=N cr=N cc=N $X.XX` when usage is present, or `—` when absent. Never `0`. Never `N/A`. A zero is a measurement; a dash is an acknowledged gap.

For QA/validation subagents, append findings to `.gsd-t/qa-issues.md`:
```
| Date | Command | Step | Model | Duration(s) | Severity | Finding |
```

## Token Capture Rule (MANDATORY)

Every `Task(...)` subagent spawn, every `claude -p` child process, and every `spawn('claude', ...)` call MUST flow through `bin/gsd-t-token-capture.cjs`. Either wrap with `captureSpawn({..., spawnFn})` or record explicitly with `recordSpawnRow({...})` after the call returns.

No command file ships a bare `Task(...)` or `claude -p` line outside of a wrapper call. `gsd-t capture-lint` (D5) enforces this mechanically; violations fail the opt-in pre-commit hook.

Rationale: the pre-M41 convention silently wrote `N/A` tokens because no caller parsed the `usage` envelope. The wrapper is the single place that parses it. Bypassing the wrapper re-introduces blind spots.

## Always-Headless Spawn (M43 D4, v3.16.x+) — Channel Separation

Every GSD-T command spawns detached, unconditionally. There is no `--watch`, no `--in-session`, no `--headless` opt-in, no context-meter threshold that reroutes, no low-water-mark bypass. The dialog channel is reserved for human↔Claude conversation; everything else is a detached headless child. Interactive session shows a launch banner + live-transcript URL + event-stream path, then exits. Results surface via the read-back banner on the user's next message.

The only in-session surface is the `/gsd` router (`commands/gsd.md`), and only for dialog-only exploratory turns. The moment Step 2.5 classifies a turn as `workflow`, the router hands off to a detached spawn.

Legacy `watch` / `inSession` params are accepted-and-ignored with a one-shot stderr deprecation warning (scheduled removal in v3.0.0 of the contract). `shouldSpawnHeadless` is a constant `() => true`.

Contract: `.gsd-t/contracts/headless-default-contract.md` v2.0.0 (see also `unattended-event-stream-contract.md`, `unattended-supervisor-contract.md`).

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
1. Unrecoverable errors after 2 fix attempts (delegate to `gsd-t headless --debug-loop` first — only stop if exit code 4)
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

## Document Ripple Completion Gate (MANDATORY)

**NEVER report a task as "done" or present a summary until ALL downstream documents are updated.** This is not optional.

When a change affects multiple files (e.g., a new standard that applies across command files, a renamed API, a new convention), you MUST:

1. **Identify the full blast radius BEFORE starting**: List every file that needs the change
2. **Complete ALL updates in one pass**: Do not update 3 of 8 files and then present a summary
3. **Run the Pre-Commit Gate on the COMPLETE changeset**: Not on a partial subset
4. **Only THEN report completion**

```
BEFORE reporting "done" or presenting a summary:
  ├── Did this change establish a new standard, rule, or convention?
  │     YES → Grep for every file that should enforce it. Update ALL of them.
  ├── Did this change modify a pattern used in multiple command files?
  │     YES → Find and update EVERY command file that uses that pattern.
  ├── Did this change affect a template (CLAUDE-global, CLAUDE-project, etc.)?
  │     YES → The template AND the live equivalent (~/.claude/CLAUDE.md) must match.
  ├── Did this change add a new requirement?
  │     YES → Add to docs/requirements.md in the same pass.
  ├── Have I checked EVERY file in the blast radius?
  │     NO → Keep going. Do not present partial work.
  └── Am I about to say "want me to also update X?" or "should I check Y?"
        YES → STOP. Just update X and check Y. Then report done.
```

**The test for this gate**: If the user asks "did you update all the documents?" and the answer would be "no, I missed some" — you failed this gate. The user should never need to ask.

## Execution Behavior
- ALWAYS check docs/architecture.md before adding or modifying components.
- ALWAYS check docs/workflows.md before changing any multi-step process.
- ALWAYS update docs as part of completing work — not as an afterthought.
- ALWAYS self-verify work by running tests and verification commands.
- NEVER re-research how something works if you built it — it should be documented.
- NEVER pause to show verification steps — execute them.
- NEVER ask "should I continue?" — just continue.
- NEVER summarize what you're "about to do" — just do it.
- IF a test fails, fix it immediately (up to 2 attempts) before reporting. If both attempts fail, delegate to `gsd-t headless --debug-loop` before stopping.

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

`/gsd-t-{command}`

───────────────────────────────────────────────────────────────
```

If there are alternative commands that also make sense, add them:

```
**Also available:**
- `/gsd-t-{alt-1}` — {description}
- `/gsd-t-{alt-2}` — {description}
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
| `verify` | *(auto-invokes complete-milestone)* | |
| `complete-milestone` | `status` | |
| `scan` | `promote-debt` | `milestone` |
| `init` | `scan` | `milestone` |
| `init-scan-setup` | `milestone` | |
| `gap-analysis` | `milestone` | `feature` |
| `populate` | `status` | |
| `setup` | `status` | |
| `design-decompose` | `design-build` | `partition` (if domains needed first) |

Commands with no successor (standalone): `quick`, `debug`, `brainstorm`, `status`, `help`, `resume`, `prompt`, `log`, `health`, `pause`, backlog commands.

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

## Markdown Tables

Markdown table emoji-padding rules live in `templates/stacks/_markdown.md` (auto-injected via Stack Rules Engine).


## Stack Rules Engine

GSD-T auto-detects project tech stack at subagent spawn time and injects mandatory best-practice rules into the subagent prompt.

**Detection sources**: `package.json` (React, TypeScript, Node API), `requirements.txt`/`pyproject.toml` (Python), `go.mod` (Go), `Cargo.toml` (Rust).

**Universal rules**: Templates prefixed with `_` (e.g., `_security.md`) are **always** injected, regardless of stack.

**Stack-specific rules**: Injected only when the matching stack is detected (e.g., `react.md` when `"react"` is in `package.json`).

**Design-to-code**: Activated when `.gsd-t/contracts/design-contract.md` (flat), `.gsd-t/contracts/design/` (hierarchical element/widget/page contracts — bootstrap via `/gsd-t-design-decompose`), `design-tokens.json`, `design-tokens/`, `.figmarc`, or `figma.config.json` exists, OR when Figma MCP is configured in `~/.claude/settings.json`. Auto-bootstrapped during partition when Figma URLs or design references are detected in requirements. Enforces pixel-perfect frontend implementation from designs with: Figma MCP auto-detection, design token extraction protocol, stack capability evaluation (recommends alternatives if stack can't achieve the design), component decomposition, responsive breakpoint strategy, and a mandatory visual verification loop — every implemented screen must be rendered in a real browser, screenshotted at mobile/tablet/desktop breakpoints, and compared pixel-by-pixel against the Figma design. Visual deviations block task completion.

**Enforcement**: Stack rule violations have the same weight as contract violations — they are task failures, not warnings.

**Extensible**: Drop a `.md` file into `templates/stacks/` in the GSD-T package to add rules for a new stack. If the directory is missing, detection skips silently.

**Commands that inject stack rules**: `gsd-t-execute`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-wave`, `gsd-t-debug`.


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
