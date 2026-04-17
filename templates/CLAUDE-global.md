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
| `/user:gsd-t-prd` | Generate a GSD-T-optimized Product Requirements Document |
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
| `/user:gsd-t-plan` | Create atomic task lists per domain (tasks auto-split to fit one context window) |
| `/user:gsd-t-impact` | Analyze downstream effects before execution |
| `/user:gsd-t-execute` | Run tasks — task-level fresh dispatch, worktree isolation, adaptive replanning, active rule injection |
| `/user:gsd-t-test-sync` | Keep tests aligned with code changes |
| `/user:gsd-t-qa` | QA agent — test generation, execution, gap reporting |
| `/user:gsd-t-doc-ripple` | Automated document ripple — update downstream docs after code changes |
| `/user:gsd-t-integrate` | Wire domains together |
| `/user:gsd-t-verify` | Run quality gates + goal-backward behavior verification |
| `/user:gsd-t-complete-milestone` | Archive milestone + git tag (goal-backward gate, rule engine distillation) |
| `/user:gsd-t-wave` | Full cycle (auto-advances all phases) |
| `/user:gsd-t-status` | Cross-domain progress view with token breakdown, global ELO and cross-project rankings |
| `/user:gsd-t-debug` | Systematic debugging |
| `/user:gsd-t-quick` | Fast task, respects contracts |
| `/user:gsd-t-visualize` | Launch browser dashboard |
| `/user:gsd-t-metrics` | View task telemetry, process ELO, domain health, and cross-project comparison (`--cross-project`) |
| `/user:gsd-t-health` | Validate .gsd-t/ structure, optionally repair |
| `/user:gsd-t-pause` | Save exact position for reliable resume |
| `/user:gsd-t-populate` | Auto-populate docs from existing codebase |
| `/user:gsd-t-design-decompose` | Decompose design into element/widget/page contracts |
| `/user:gsd-t-log` | Sync progress Decision Log with recent git activity |
| `/user:gsd-t-resume` | Restore context, continue |
| `/user:gsd-t-version-update` | Update GSD-T to latest version |
| `/user:gsd-t-version-update-all` | Update GSD-T + all registered projects |
| `/user:gsd-t-unattended` | Launch detached supervisor — runs active milestone to completion with zero human intervention |
| `/user:gsd-t-unattended-watch` | Watch tick — fires every 270s via ScheduleWakeup, reports supervisor status |
| `/user:gsd-t-unattended-stop` | Touch stop sentinel — supervisor halts after current worker finishes |
| `/user:gsd-t-triage-and-merge` | Auto-review, merge, and publish GitHub branches |
| `/user:gsd-t-design-audit` | Compare built screen against Figma design — structured deviation report |
| `/user:gsd-t-design-build` | Build from design contracts with two-terminal review |
| `/user:gsd-t-design-review` | Independent review agent for design build (Term 2) |
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
| `/global-change` | Apply file changes across all registered GSD-T projects |


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

**Exception — Auto-Route signal**: When `[GSD-T AUTO-ROUTE]` appears in your context (injected by the UserPromptSubmit hook), the user's plain text message should be treated as a `/user:gsd {message}` invocation. Execute the `/gsd` smart router with the user's full message as the argument instead of replying conversationally. The hook only fires in GSD-T projects (directories containing `.gsd-t/progress.md`) — it silently passes through in all other directories.

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
"Run ALL configured test suites — detect and run every one:
a. Unit tests (vitest/jest/mocha): run the full suite
b. E2E tests: check for playwright.config.* or cypress.config.* — if found, run the FULL E2E suite
c. NEVER skip E2E when a config file exists. Running only unit tests is a QA FAILURE.
d. Read .gsd-t/contracts/ for contract definitions. Check contract compliance.
e. AUDIT E2E test quality: Review each Playwright spec — if any test only checks element
   existence (isVisible, toBeAttached, toBeEnabled) without verifying functional behavior
   (state changes, data loaded, content updated after user actions), flag it as
   'SHALLOW TEST — needs functional assertions'. A passing test suite that doesn't catch
   broken features is a QA FAILURE.
Report format: 'Unit: X/Y pass | E2E: X/Y pass (or N/A if no config) | Contract: compliant/violations | Shallow tests: N'"
```

**QA failure OR shallow tests found blocks phase completion.** Lead cannot proceed until QA reports PASS with zero shallow tests, or user explicitly overrides.

## Design Verification Agent (Mandatory when design contract exists)

After QA passes, if `.gsd-t/contracts/design-contract.md` exists, a **dedicated Design Verification Agent** is spawned. This agent's ONLY job is to open a browser, compare the built frontend against the original design, and produce a structured element-by-element comparison table. It writes ZERO feature code.

**Why a dedicated agent?** Coding agents consistently skip visual verification — even with detailed instructions — because their incentive is to finish building, not to audit. Separating the verifier from the builder ensures the verification actually happens.

**Design Verification method by command:**
- `execute` → spawns Design Verification Agent after QA passes (Step 5.25)
- `quick` → spawns Design Verification Agent after tests pass (Step 5.25)
- `integrate`, `wave` → Design Verification runs within the execute phase per the rules above
- Commands without UI work → skipped automatically (no design contract = no verification)

**Key rules:**
- **FAIL-BY-DEFAULT**: Every visual element starts as UNVERIFIED. Must prove each matches.
- **Structured comparison table**: 30+ rows minimum for a full page. Each element gets specific design values vs. specific implementation values and a MATCH or DEVIATION verdict.
- **No vague verdicts**: "Looks close" and "appears to match" are not valid. Only �� MATCH or ❌ DEVIATION with specific values.
- **Side-by-side browser sessions**: Opens both the built frontend AND the original design (Figma page, design image, or MCP screenshot) for direct visual comparison.
- **Artifact gate**: Orchestrator checks that `design-contract.md` contains a `## Verification Status` section with a populated comparison table. Missing artifact = re-spawn (1 retry).
- **Fix cycle**: Deviations are fixed (up to 2 cycles) and re-verified before proceeding.

**Design Verification FAIL blocks phase completion.** Deviations must be fixed or logged to `.gsd-t/deferred-items.md`.

## Red Team — Adversarial QA (Mandatory)

After QA and Design Verification pass, every code-producing command spawns a **Red Team agent** — an adversarial subagent whose success is measured by bugs found, not tests passed. This inverts the incentive structure: the Red Team's drive toward "task complete" means digging deeper and finding more bugs, not rubber-stamping.

**Red Team method by command:**
- `execute` → spawns Red Team after Design Verification passes (Step 5.5)
- `integrate` → spawns Red Team after integration tests pass (Step 7.5)
- `quick` → spawns Red Team after Design Verification passes (Step 5.5)
- `debug` → spawns Red Team after fix verification passes (Step 5.3)
- `wave` → each phase agent handles Red Team per the rules above

**Key Red Team rules:**
- **Inverted incentive**: More bugs found = more value. Zero bugs requires exhaustive proof of thoroughness.
- **False positive penalty**: Reporting non-bugs destroys credibility. Every bug must be reproduced with proof.
- **Exhaustive categories**: Contract violations, boundary inputs, state transitions, error paths, missing flows, regression, E2E functional gaps, design fidelity (when design contract exists: render in browser, screenshot, build element inventory, produce structured comparison table with per-element MATCH/DEVIATION verdicts — never "looks close") — all must be attempted.
- **VERDICT**: `FAIL` (bugs found — blocks completion) or `GRUDGING PASS` (exhaustive search, nothing found).
- **Report**: Written to `.gsd-t/red-team-report.md`; bugs also appended to `.gsd-t/qa-issues.md`.

**Red Team FAIL blocks phase completion.** CRITICAL/HIGH bugs must be fixed (up to 2 fix cycles). If bugs persist, they are logged to `.gsd-t/deferred-items.md` and presented to the user.

## Model Display (MANDATORY)

**Before every subagent spawn, display the model being used to the user:**
`⚙ [{model}] {command} → {brief description}` (e.g., `⚙ [sonnet] gsd-t-execute → domain: auth-service`, `⚙ [haiku] gsd-t-execute → QA validation`)

This gives the user real-time visibility into which model is handling each operation.

**Model assignments:**
- `model: haiku` — strictly mechanical tasks: run test suites and report counts, check file existence, validate JSON structure, branch guard checks
- `model: sonnet` — mid-tier reasoning: routine code changes, standard refactors, test writing, QA evaluation, straightforward synthesis
- `model: opus` — high-stakes reasoning: architecture decisions, security analysis, complex debugging, cross-module refactors, Red Team adversarial QA, quality judgment on critical paths

**Context Meter (M34/M38, v3.12.10+)** — The real context-window measurement feeding the headless-default spawn decision. A PostToolUse hook (`scripts/gsd-t-context-meter.js`) runs after every tool call, uses local token estimation to write the current input-token count into `.gsd-t/.context-meter-state.json`. `getSessionStatus()` reads that state file (fresh window = 5 minutes) with a historical heuristic fallback when the file is missing or stale. Command files consume the signal via a small bash shim (`CTX_PCT=$(node -e "…tb.getSessionStatus('.').pct")`). **Single-band model** (context-meter-contract v1.3.0): there's one threshold (default 85%) and one action — hand off to a detached headless spawn. No three-band routing, no silent downgrades, no MANDATORY STOP prose. The meter exists to inform spawn-time routing, not to pause work in-flight.

## Headless-by-Default Spawn (M38, v3.12.10+)

**Architectural shift**: long-running work spawns detached by default, not interactively. Commands that previously invited mid-session context exhaustion (execute, wave, integrate, debug's repair loops) now route through the unattended supervisor from the start. The interactive session invokes, sees a banner, and hands off — no `/clear`, no pause/resume dance, no drift into the 95% `/compact` wall.

- **Invocation**: any workflow command can accept `--watch` to keep a live status block in the interactive session (ScheduleWakeup-driven, 270s ticks). Without `--watch`, the caller gets a launch banner, an event-stream log location, and exits.
- **Event stream**: the supervisor emits JSONL to `.gsd-t/events/YYYY-MM-DD.jsonl` at every phase boundary (task_start, task_complete, error, retry). The watch-tick command and dashboard consume the same stream.
- **Router mode**: when the user describes what they want in plain language via `/user:gsd` and the request is exploratory/conversational (brainstorm, "help me think through", "what are the trade-offs"), the router answers inline — no command spawn. See `commands/gsd.md` Step 2.5.
- **Contracts**: `.gsd-t/contracts/headless-default-contract.md` v1.0.0, `unattended-event-stream-contract.md` v1.0.0, `unattended-supervisor-contract.md` v1.1.0.

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

## Unattended Execution (M36, v3.10.10+)

`/user:gsd-t-unattended` launches a detached OS-process supervisor that drives the active milestone to completion over hours or days via a `claude -p` worker relay — each worker in a fresh context window. The interactive Claude session receives a 270-second ScheduleWakeup watch loop (`/user:gsd-t-unattended-watch`) that ticks and prints progress until the supervisor reaches a terminal state.

- **Resume re-attach**: `/user:gsd-t-resume` checks for a live `supervisor.pid`; if the supervisor is still running, it skips normal resume and re-starts the watch loop automatically.
- **Stop**: `/user:gsd-t-unattended-stop` touches `.gsd-t/.unattended/stop`; supervisor halts after the current worker finishes.
- **Contract**: `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 — authoritative for state schema, exit codes, CLI flags, and platform matrix.
- **Platform**: macOS and Linux fully supported. Windows supported except sleep-prevention (see `docs/unattended-windows-caveats.md`).

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

Emoji display as 2 characters wide in terminal/monospace but count as 1 in string length. This causes misaligned columns. **Always add one extra space after emoji in table cells** to compensate:

```
WRONG — misaligned in terminal:
| Channel  | Support |
|----------|---------|
| Discord  | ✅ |
| LINE     | ❌ |

RIGHT — one extra space after emoji:
| Channel  | Support |
|----------|---------|
| Discord  | ✅  |
| LINE     | ❌  |
```

This extra space is invisible in rendered HTML (GitHub, VS Code preview) but restores alignment in terminal views. Apply to all GSD-T-generated docs that use emoji in tables.

Also pad all cell values in a column to the width of the widest value:
```
| iMessage (BlueBubbles) | ✅  |
| Discord                | ✅  |
| QQ                     | ❌  |
```


## Stack Rules Engine

GSD-T auto-detects project tech stack at subagent spawn time and injects mandatory best-practice rules into the subagent prompt.

**Detection sources**: `package.json` (React, TypeScript, Node API), `requirements.txt`/`pyproject.toml` (Python), `go.mod` (Go), `Cargo.toml` (Rust).

**Universal rules**: Templates prefixed with `_` (e.g., `_security.md`) are **always** injected, regardless of stack.

**Stack-specific rules**: Injected only when the matching stack is detected (e.g., `react.md` when `"react"` is in `package.json`).

**Design-to-code**: Activated when `.gsd-t/contracts/design-contract.md` (flat), `.gsd-t/contracts/design/` (hierarchical element/widget/page contracts — bootstrap via `/user:gsd-t-design-decompose`), `design-tokens.json`, `design-tokens/`, `.figmarc`, or `figma.config.json` exists, OR when Figma MCP is configured in `~/.claude/settings.json`. Auto-bootstrapped during partition when Figma URLs or design references are detected in requirements. Enforces pixel-perfect frontend implementation from designs with: Figma MCP auto-detection, design token extraction protocol, stack capability evaluation (recommends alternatives if stack can't achieve the design), component decomposition, responsive breakpoint strategy, and a mandatory visual verification loop — every implemented screen must be rendered in a real browser, screenshotted at mobile/tablet/desktop breakpoints, and compared pixel-by-pixel against the Figma design. Visual deviations block task completion.

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
